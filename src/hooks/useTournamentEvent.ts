import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  child,
  get,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
  type DataSnapshot,
  type DatabaseReference,
} from 'firebase/database';
import {
  DEFAULT_EVENT_ID,
  EVENT_ID_STORAGE_KEY,
  EVENT_STATE_STORAGE_PREFIX,
  FIREBASE_MAX_RETRIES,
  FIREBASE_RETRY_BASE_DELAY_MS,
  MAX_PLAYERS,
  THIRD_PLACE_KEY,
} from '../constants';
import { getFirebaseDatabase, isFirebaseConfigured } from '../lib/firebase';
import type {
  MatchWinners,
  PersistedEventState,
  PlayerRecord,
  RosterEntry,
  SelectionResult,
} from '../types';
import {
  buildPromotedParticipantState,
  buildRosterEntryForPlayer,
  clearDependentWinners,
  computeParticipantRemovalState,
  createEmptyBracketEntrant,
  findRosterSlotIndexForPlayer,
  getBracketEntrants,
  getResolvedMatchWinner,
  getThirdPlaceEntrantIndexes,
  pruneMatchWinnersForSlot,
  shuffleList,
} from '../utils/bracket';

interface SubmitPlayerInput {
  name: string;
  aura: string;
  weak: string;
}

function copyToClipboard(value: string) {
  if (!navigator.clipboard || !window.isSecureContext) {
    return Promise.resolve(false);
  }

  return navigator.clipboard.writeText(value).then(() => true);
}

function getOrCreateEventId() {
  const params = new URLSearchParams(window.location.search);
  const queryEventId = params.get('event');

  if (queryEventId?.trim()) {
    return queryEventId.trim();
  }

  const savedEventId = localStorage.getItem(EVENT_ID_STORAGE_KEY);

  if (savedEventId && savedEventId !== DEFAULT_EVENT_ID) {
    localStorage.removeItem(`${EVENT_STATE_STORAGE_PREFIX}${savedEventId}`);
  }

  localStorage.setItem(EVENT_ID_STORAGE_KEY, DEFAULT_EVENT_ID);
  return DEFAULT_EVENT_ID;
}

function normalizeEventUrl(eventId: string) {
  const nextUrl = new URL(window.location.href);

  if (!nextUrl.searchParams.get('event') || nextUrl.searchParams.get('event') !== eventId) {
    nextUrl.searchParams.set('event', eventId);
    window.history.replaceState({}, '', nextUrl);
  }

  return nextUrl.toString();
}

function snapshotToPlayerRecords(snapshot: DataSnapshot | null) {
  const records: PlayerRecord[] = [];

  if (!snapshot?.exists()) {
    return records;
  }

  snapshot.forEach((docItem) => {
    records.push({
      id: docItem.key ?? undefined,
      ...(docItem.val() as Omit<PlayerRecord, 'id'>),
    });
  });

  return records;
}

function getSnapshotChildCount(snapshot: DataSnapshot | null) {
  if (!snapshot?.exists()) {
    return 0;
  }

  if (typeof snapshot.size === 'number') {
    return snapshot.size;
  }

  let childCount = 0;
  snapshot.forEach(() => {
    childCount += 1;
  });

  return childCount;
}

function isLegacyTestPlayer(player: PlayerRecord | null | undefined) {
  if (!player) {
    return false;
  }

  return /^Test Player \d+$/.test(player.name || '')
    && (player.aura || '') === 'Test aura'
    && (player.weak || '') === 'Test weak';
}

function sanitizePersistedState(state: PersistedEventState): PersistedEventState {
  const nextPlayers = state.players.filter((player) => !isLegacyTestPlayer(player));
  const nextWaitingPlayers = state.waitingPlayers.filter((player) => !isLegacyTestPlayer(player));

  if (
    nextPlayers.length === state.players.length &&
    nextWaitingPlayers.length === state.waitingPlayers.length
  ) {
    return state;
  }

  return {
    ...state,
    players: nextPlayers,
    waitingPlayers: nextWaitingPlayers,
    rosterOrder: [],
    isRosterFinalized: false,
    matchWinners: {},
  };
}

function shouldQueueNewSignup(isRosterFinalized: boolean, playerCount: number) {
  return isRosterFinalized || playerCount >= MAX_PLAYERS;
}

async function ensureEventDocument(eventRef: DatabaseReference) {
  const snapshot = await get(eventRef);

  if (snapshot.exists()) {
    return;
  }

  await set(eventRef, {
    title: 'Swanston Table Tennis Tournament',
    maxPlayers: MAX_PLAYERS,
    isRosterFinalized: false,
    rosterOrder: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function purgeLegacyTestDataRemotelyIfNeeded(
  eventRef: DatabaseReference,
  participantsRef: DatabaseReference,
  waitlistRef: DatabaseReference,
) {
  const [participantsSnapshot, waitlistSnapshot] = await Promise.all([
    get(participantsRef),
    get(waitlistRef),
  ]);

  const participantRecords = snapshotToPlayerRecords(participantsSnapshot);
  const waitlistRecords = snapshotToPlayerRecords(waitlistSnapshot);
  const hasLegacyData = participantRecords.length > 0 || waitlistRecords.length > 0;

  if (!hasLegacyData) {
    return;
  }

  const participantsAreLegacyOnly = participantRecords.every((player) => isLegacyTestPlayer(player));
  const waitlistIsLegacyOnly = waitlistRecords.every((player) => isLegacyTestPlayer(player));

  if (!participantsAreLegacyOnly || !waitlistIsLegacyOnly) {
    return;
  }

  await update(eventRef, {
    participants: null,
    waitlist: null,
    rosterOrder: null,
    isRosterFinalized: false,
    matchWinners: null,
    updatedAt: serverTimestamp(),
  });
}

export function useTournamentEvent() {
  const [eventId] = useState(getOrCreateEventId);
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [waitingPlayers, setWaitingPlayers] = useState<PlayerRecord[]>([]);
  const [rosterOrder, setRosterOrder] = useState<RosterEntry[]>([]);
  const [isRosterFinalized, setIsRosterFinalized] = useState(false);
  const [matchWinners, setMatchWinners] = useState<MatchWinners>({});
  const [isFirebaseAvailable, setIsFirebaseAvailable] = useState(true);
  const [shareStatus, setShareStatus] = useState('');
  const [isShufflingRoster, setIsShufflingRoster] = useState(false);

  const participantsRef = useRef<DatabaseReference | null>(null);
  const waitlistRef = useRef<DatabaseReference | null>(null);
  const eventRef = useRef<DatabaseReference | null>(null);
  const didRestoreLocalState = useRef(false);
  const retryTimeoutRef = useRef<number | null>(null);
  const shuffleTimeoutRef = useRef<number | null>(null);
  const firebaseRetryCountRef = useRef(0);

  useEffect(() => {
    normalizeEventUrl(eventId);

    const rawState = localStorage.getItem(`${EVENT_STATE_STORAGE_PREFIX}${eventId}`);
    if (!rawState) {
      didRestoreLocalState.current = true;
      return;
    }

    try {
      const parsedState = JSON.parse(rawState) as PersistedEventState;
      const state = sanitizePersistedState(parsedState);

      setPlayers(Array.isArray(state.players) ? state.players : []);
      setWaitingPlayers(Array.isArray(state.waitingPlayers) ? state.waitingPlayers : []);
      setRosterOrder(Array.isArray(state.rosterOrder) ? state.rosterOrder : []);
      setIsRosterFinalized(Boolean(state.isRosterFinalized));
      setMatchWinners(
        state.matchWinners && typeof state.matchWinners === 'object'
          ? state.matchWinners
          : {},
      );
    } catch (error) {
      console.error(error);
    } finally {
      didRestoreLocalState.current = true;
    }
  }, [eventId]);

  useEffect(() => {
    if (!didRestoreLocalState.current) {
      return;
    }

    const persistedState: PersistedEventState = {
      players,
      waitingPlayers,
      rosterOrder,
      isRosterFinalized,
      matchWinners,
      updatedAt: Date.now(),
    };

    localStorage.setItem(
      `${EVENT_STATE_STORAGE_PREFIX}${eventId}`,
      JSON.stringify(persistedState),
    );
  }, [eventId, isRosterFinalized, matchWinners, players, rosterOrder, waitingPlayers]);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setIsFirebaseAvailable(false);
      setShareStatus('Firebase is not configured. Running in local-only mode.');
      return;
    }

    let isActive = true;
    const unsubscribers: Array<() => void> = [];

    const connect = async () => {
      try {
        const db = getFirebaseDatabase();
        participantsRef.current = ref(db, `events/${eventId}/participants`);
        waitlistRef.current = ref(db, `events/${eventId}/waitlist`);
        eventRef.current = ref(db, `events/${eventId}`);

        if (!participantsRef.current || !waitlistRef.current || !eventRef.current) {
          return;
        }

        await ensureEventDocument(eventRef.current);
        await purgeLegacyTestDataRemotelyIfNeeded(
          eventRef.current,
          participantsRef.current,
          waitlistRef.current,
        );

        if (!isActive) {
          return;
        }

        setIsFirebaseAvailable(true);
        setShareStatus('Live sync enabled. Share this page to collect registrations.');
        firebaseRetryCountRef.current = 0;

        unsubscribers.push(
          onValue(
            query(participantsRef.current, orderByChild('createdAt')),
            (snapshot) => {
              if (!isActive) {
                return;
              }

              setPlayers(snapshotToPlayerRecords(snapshot));
            },
            (error) => {
              console.error('[RK Events] Participants listener error:', error);
              setShareStatus('Realtime sync error. Refreshing list from local input.');
            },
          ),
        );

        unsubscribers.push(
          onValue(
            query(waitlistRef.current, orderByChild('createdAt')),
            (snapshot) => {
              if (!isActive) {
                return;
              }

              setWaitingPlayers(snapshotToPlayerRecords(snapshot));
            },
            (error) => {
              console.error('[RK Events] Waitlist listener error:', error);
              setShareStatus('Realtime waitlist sync error. Refreshing list from local input.');
            },
          ),
        );

        unsubscribers.push(
          onValue(
            eventRef.current,
            (snapshot) => {
              if (!isActive || !snapshot.exists()) {
                return;
              }

              const data = snapshot.val() as {
                rosterOrder?: RosterEntry[];
                isRosterFinalized?: boolean;
                matchWinners?: MatchWinners;
              };

              setRosterOrder(Array.isArray(data?.rosterOrder) ? data.rosterOrder : []);
              setIsRosterFinalized(Boolean(data?.isRosterFinalized));
              setMatchWinners(
                data?.matchWinners && typeof data.matchWinners === 'object'
                  ? data.matchWinners
                  : {},
              );
            },
            (error) => {
              console.error('[RK Events] Event listener error:', error);
              setShareStatus('Failed to sync bracket state.');
            },
          ),
        );
      } catch (error) {
        console.error('[RK Events] Firebase initialization error:', error);

        if (!isActive) {
          return;
        }

        setIsFirebaseAvailable(false);

        if (firebaseRetryCountRef.current >= FIREBASE_MAX_RETRIES) {
          setShareStatus('Firebase unavailable. Refresh to try again.');
          return;
        }

        setShareStatus('Unable to connect to Firebase. Retrying...');
        firebaseRetryCountRef.current += 1;
        const retryDelay =
          FIREBASE_RETRY_BASE_DELAY_MS * Math.pow(2, firebaseRetryCountRef.current - 1);

        retryTimeoutRef.current = window.setTimeout(connect, retryDelay);
      }
    };

    void connect();

    return () => {
      isActive = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());

      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [eventId]);

  useEffect(() => {
    return () => {
      if (shuffleTimeoutRef.current) {
        window.clearTimeout(shuffleTimeoutRef.current);
      }
    };
  }, []);

  const submitParticipant = useCallback(
    async ({ name, aura, weak }: SubmitPlayerInput) => {
      if (isShufflingRoster) {
        return false;
      }

      const player = {
        name: name.trim(),
        aura: aura.trim(),
        weak: weak.trim(),
      };

      if (!player.name || !player.aura || !player.weak) {
        return false;
      }

      const shouldQueue = shouldQueueNewSignup(isRosterFinalized, players.length);

      if (!isFirebaseAvailable || !participantsRef.current) {
        if (shouldQueue) {
          setWaitingPlayers((current) => [...current, player]);
        } else {
          setPlayers((current) => [...current, player]);
        }

        return true;
      }

      let addToWaitlist = shouldQueue;

      if (!addToWaitlist) {
        try {
          const snapshot = await get(participantsRef.current);
          addToWaitlist = getSnapshotChildCount(snapshot) >= MAX_PLAYERS;
        } catch (error) {
          console.error('[RK Events] Failed to inspect participant count before signup:', error);
          addToWaitlist = players.length >= MAX_PLAYERS;
        }
      }

      const targetRef = addToWaitlist ? waitlistRef.current : participantsRef.current;

      if (!targetRef) {
        return false;
      }

      try {
        await set(push(targetRef), {
          ...player,
          createdAt: serverTimestamp(),
        });
        return true;
      } catch (error) {
        console.error(error);
        setShareStatus('Unable to save participant. Please verify your Firebase permissions.');
        return false;
      }
    },
    [isFirebaseAvailable, isRosterFinalized, isShufflingRoster, players.length],
  );

  const shareEvent = useCallback(async () => {
    const eventUrl = normalizeEventUrl(eventId);
    const shareData = {
      title: 'Swanston Table Tennis Tournament',
      text: 'Reserve your spot for the 16-player knockout bracket at RoomingKos Swanston.',
      url: eventUrl,
    };

    setShareStatus('Preparing share link...');

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareStatus('Share successful.');
        return;
      }

      const copied = await copyToClipboard(eventUrl);
      setShareStatus(copied ? 'Link copied to clipboard.' : `Share link: ${eventUrl}`);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setShareStatus('');
        return;
      }

      const copied = await copyToClipboard(eventUrl);

      if (copied) {
        setShareStatus('Link copied to clipboard.');
      } else if (error instanceof Error && error.name === 'NotAllowedError') {
        setShareStatus('Please allow clipboard permission and try again.');
      } else {
        setShareStatus('Unable to share automatically. Copy the URL from your browser bar.');
      }
    }
  }, [eventId]);

  const drawRoster = useCallback(() => {
    if (isShufflingRoster || players.length < 2) {
      return;
    }

    if (shuffleTimeoutRef.current) {
      window.clearTimeout(shuffleTimeoutRef.current);
    }

    setIsShufflingRoster(true);
    const finalizedIds = shuffleList(players).map((player) => player.id || player);

    shuffleTimeoutRef.current = window.setTimeout(() => {
      setRosterOrder(finalizedIds);
      setIsRosterFinalized(true);
      setMatchWinners({});
      setIsShufflingRoster(false);

      if (isFirebaseAvailable && eventRef.current) {
        void update(eventRef.current, {
          isRosterFinalized: true,
          rosterOrder: finalizedIds,
          matchWinners: {},
          maxPlayers: MAX_PLAYERS,
          updatedAt: serverTimestamp(),
        }).catch((error) => {
          console.error(error);
          setShareStatus('Failed to lock roster. Please try again.');
        });
      }
    }, 1600);
  }, [isFirebaseAvailable, isShufflingRoster, players]);

  const deleteParticipant = useCallback(
    async (index: number) => {
      if (index < 0 || index >= players.length) {
        return;
      }

      const player = players[index];
      const waitingPlayer = waitingPlayers[0] || null;

      if (!isFirebaseAvailable || !participantsRef.current || !eventRef.current || !player.id) {
        const promotedPlayer = buildPromotedParticipantState(waitingPlayer, player);
        const nextState = computeParticipantRemovalState({
          players,
          waitingPlayers,
          rosterOrder,
          isRosterFinalized,
          matchWinners,
          removedPlayer: player,
          replacementPlayer: promotedPlayer,
          preferredIndex: index,
        });

        setPlayers(nextState.players);
        setWaitingPlayers(nextState.waitingPlayers);
        setRosterOrder(nextState.rosterOrder);
        setMatchWinners(nextState.matchWinners);
        return;
      }

      try {
        const updates: Record<string, unknown> = {
          [`participants/${player.id}`]: null,
          updatedAt: serverTimestamp(),
        };

        let promotedPlayer: PlayerRecord | null = null;

        if (waitingPlayer?.id) {
          promotedPlayer = buildPromotedParticipantState(waitingPlayer, player, waitingPlayer.id);

          if (promotedPlayer) {
            const { id: promotedId, ...payload } = promotedPlayer;
            updates[`participants/${promotedId}`] = payload;
            updates[`waitlist/${waitingPlayer.id}`] = null;
          }
        }

        if (isRosterFinalized && rosterOrder.length) {
          const slotIndex = findRosterSlotIndexForPlayer(player, rosterOrder);

          if (slotIndex !== -1) {
            const nextOrder = [...rosterOrder];
            nextOrder[slotIndex] = promotedPlayer
              ? buildRosterEntryForPlayer(promotedPlayer, nextOrder)
              : null;

            updates.rosterOrder = nextOrder;
            updates.matchWinners = pruneMatchWinnersForSlot(slotIndex, matchWinners);
          }
        }

        await update(eventRef.current, updates);

        const nextState = computeParticipantRemovalState({
          players,
          waitingPlayers,
          rosterOrder,
          isRosterFinalized,
          matchWinners,
          removedPlayer: player,
          replacementPlayer: promotedPlayer,
          preferredIndex: index,
        });

        setPlayers(nextState.players);
        setWaitingPlayers(nextState.waitingPlayers);
        setRosterOrder(nextState.rosterOrder);
        setMatchWinners(nextState.matchWinners);
      } catch (error) {
        console.error(error);
        setShareStatus('Unable to delete participant. Please verify your Firebase permissions.');
      }
    },
    [isFirebaseAvailable, isRosterFinalized, matchWinners, players, rosterOrder, waitingPlayers],
  );

  const deleteWaitingParticipant = useCallback(
    async (index: number) => {
      if (index < 0 || index >= waitingPlayers.length) {
        return;
      }

      const player = waitingPlayers[index];

      if (!isFirebaseAvailable || !waitlistRef.current || !player.id) {
        setWaitingPlayers((current) => current.filter((_, currentIndex) => currentIndex !== index));
        return;
      }

      try {
        await remove(child(waitlistRef.current, player.id));
      } catch (error) {
        console.error(error);
        setShareStatus('Unable to delete waitlist participant. Please verify your Firebase permissions.');
      }
    },
    [isFirebaseAvailable, waitingPlayers],
  );

  const resetEvent = useCallback(async () => {
    setRosterOrder([]);
    setIsRosterFinalized(false);
    setMatchWinners({});
    setIsShufflingRoster(false);

    if (!isFirebaseAvailable || !eventRef.current) {
      return;
    }

    try {
      await update(eventRef.current, {
        rosterOrder: [],
        isRosterFinalized: false,
        matchWinners: {},
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
      setShareStatus('Failed to reset tournament data.');
    }
  }, [isFirebaseAvailable]);

  const selectWinner = useCallback(
    (
      childLevel: number,
      childMatchIndex: number,
      winnerEntrantIndex: number,
    ): SelectionResult => {
      if (!isRosterFinalized) {
        return { kind: 'noop' };
      }

      const parentLevel = childLevel + 1;
      const parentMatchIndex = Math.floor(childMatchIndex / 2);

      if (parentLevel > 4) {
        return { kind: 'noop' };
      }

      const key = `${parentLevel}-${parentMatchIndex}`;
      const previousWinner = matchWinners[key];

      if (previousWinner === winnerEntrantIndex) {
        return { kind: 'noop' };
      }

      let nextWinners = { ...matchWinners };

      if (previousWinner !== undefined) {
        const grandparentLevel = parentLevel + 1;
        const grandparentMatchIndex = Math.floor(parentMatchIndex / 2);

        if (grandparentLevel <= 4) {
          nextWinners = clearDependentWinners(nextWinners, grandparentLevel, grandparentMatchIndex);
        }
      }

      nextWinners[key] = winnerEntrantIndex;

      if (parentLevel === 3) {
        delete nextWinners[THIRD_PLACE_KEY];
      }

      setMatchWinners(nextWinners);

      if (isFirebaseAvailable && eventRef.current) {
        void update(eventRef.current, {
          matchWinners: nextWinners,
          updatedAt: serverTimestamp(),
        }).catch((error) => {
          console.error(error);
          setShareStatus('Failed to sync bracket state.');
        });
      }

      if (parentLevel !== 4) {
        return { kind: 'winner' };
      }

      const entrants = getBracketEntrants(players, rosterOrder, isRosterFinalized);
      while (entrants.length < MAX_PLAYERS) {
        entrants.push(createEmptyBracketEntrant());
      }

      const champion = entrants[winnerEntrantIndex];

      return {
        kind: 'champion',
        championName: champion && !champion.empty ? champion.name : 'Champion',
      };
    },
    [isFirebaseAvailable, isRosterFinalized, matchWinners, players, rosterOrder],
  );

  const selectThirdPlaceWinner = useCallback(
    (winnerEntrantIndex: number): SelectionResult => {
      if (!isRosterFinalized) {
        return { kind: 'noop' };
      }

      const entrants = getBracketEntrants(players, rosterOrder, isRosterFinalized);
      while (entrants.length < MAX_PLAYERS) {
        entrants.push(createEmptyBracketEntrant());
      }

      const thirdPlaceEntrants = getThirdPlaceEntrantIndexes(entrants, matchWinners);
      const playoffReady = thirdPlaceEntrants.every((entrantIndex) => entrantIndex !== undefined);

      if (!playoffReady || !thirdPlaceEntrants.includes(winnerEntrantIndex)) {
        return { kind: 'noop' };
      }

      if (matchWinners[THIRD_PLACE_KEY] === winnerEntrantIndex) {
        return { kind: 'noop' };
      }

      const nextWinners = {
        ...matchWinners,
        [THIRD_PLACE_KEY]: winnerEntrantIndex,
      };

      setMatchWinners(nextWinners);

      if (isFirebaseAvailable && eventRef.current) {
        void update(eventRef.current, {
          matchWinners: nextWinners,
          updatedAt: serverTimestamp(),
        }).catch((error) => {
          console.error(error);
          setShareStatus('Failed to sync bracket state.');
        });
      }

      return { kind: 'winner' };
    },
    [isFirebaseAvailable, isRosterFinalized, matchWinners, players, rosterOrder],
  );

  const isRosterFull = useMemo(() => players.length >= MAX_PLAYERS, [players.length]);
  const shouldQueueSignup = useMemo(
    () => shouldQueueNewSignup(isRosterFinalized, players.length),
    [isRosterFinalized, players.length],
  );

  const championIndex = useMemo(() => {
    const entrants = getBracketEntrants(players, rosterOrder, isRosterFinalized);
    return getResolvedMatchWinner(4, 0, entrants, matchWinners);
  }, [isRosterFinalized, matchWinners, players, rosterOrder]);

  return {
    eventId,
    players,
    waitingPlayers,
    rosterOrder,
    isRosterFinalized,
    matchWinners,
    isFirebaseAvailable,
    isShufflingRoster,
    isRosterFull,
    shouldQueueSignup,
    shareStatus,
    championIndex,
    setShareStatus,
    submitParticipant,
    shareEvent,
    drawRoster,
    deleteParticipant,
    deleteWaitingParticipant,
    resetEvent,
    selectWinner,
    selectThirdPlaceWinner,
  };
}
