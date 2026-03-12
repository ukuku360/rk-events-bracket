import {
  MAX_PLAYERS,
  THIRD_PLACE_KEY,
} from '../constants';
import type {
  BracketResolution,
  MatchWinners,
  PlayerRecord,
  RosterEntry,
} from '../types';

export function shuffleList<T>(values: T[]): T[] {
  const next = [...values];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

export function createEmptyBracketEntrant(): PlayerRecord {
  return {
    name: 'BYE',
    aura: '',
    weak: '',
    empty: true,
    isBye: true,
  };
}

export function clonePlayerRecord(
  player: PlayerRecord | null | undefined,
  overrides: Partial<PlayerRecord> = {},
): PlayerRecord | null {
  if (!player) {
    return null;
  }

  return {
    ...player,
    ...overrides,
  };
}

export function getPlayerSelectionKey(player: PlayerRecord | null | undefined): string {
  if (!player) {
    return '';
  }

  return player.id || `${player.name}|${player.aura}|${player.weak}`;
}

export function rosterOrderUsesIds(order: RosterEntry[]): boolean {
  return Array.isArray(order) && order.some((entry) => typeof entry === 'string');
}

export function rosterEntryMatchesPlayer(
  entry: RosterEntry | undefined,
  player: PlayerRecord | null | undefined,
): boolean {
  if (!entry || !player) {
    return false;
  }

  if (typeof entry === 'string') {
    return Boolean(player.id) && entry === player.id;
  }

  if (entry.id && player.id && entry.id === player.id) {
    return true;
  }

  const entryKey = getPlayerSelectionKey(entry);
  const playerKey = getPlayerSelectionKey(player);

  if (!entryKey || !playerKey || entryKey !== playerKey) {
    return false;
  }

  const entryCreatedAt = entry.createdAt ?? '';
  const playerCreatedAt = player.createdAt ?? '';

  return entryCreatedAt === playerCreatedAt || !entryCreatedAt || !playerCreatedAt;
}

export function findPlayerIndexInList(
  player: PlayerRecord | null | undefined,
  list: PlayerRecord[],
): number {
  if (!player) {
    return -1;
  }

  return list.findIndex((candidate) => rosterEntryMatchesPlayer(candidate, player));
}

export function findRosterSlotIndexForPlayer(
  player: PlayerRecord | null | undefined,
  order: RosterEntry[],
): number {
  if (!player) {
    return -1;
  }

  return order.findIndex((entry) => rosterEntryMatchesPlayer(entry, player));
}

export function buildRosterEntryForPlayer(
  player: PlayerRecord | null | undefined,
  order: RosterEntry[],
): RosterEntry {
  if (!player) {
    return null;
  }

  if (rosterOrderUsesIds(order)) {
    return player.id || null;
  }

  return clonePlayerRecord(player);
}

export function getWinnerKey(level: number, matchIndex: number): string {
  return `${level}-${matchIndex}`;
}

export function pruneMatchWinnersForSlot(
  slotIndex: number,
  winners: MatchWinners,
): MatchWinners {
  const nextWinners = { ...winners };

  if (!Number.isInteger(slotIndex) || slotIndex < 0) {
    return nextWinners;
  }

  let level = 1;
  let matchIndex = Math.floor(slotIndex / 2);

  while (level <= 4) {
    delete nextWinners[getWinnerKey(level, matchIndex)];
    matchIndex = Math.floor(matchIndex / 2);
    level += 1;
  }

  delete nextWinners[THIRD_PLACE_KEY];
  return nextWinners;
}

function isActiveEntrantIndex(
  entrants: PlayerRecord[],
  entrantIndex: number,
): boolean {
  if (!Number.isInteger(entrantIndex) || entrantIndex < 0) {
    return false;
  }

  const entrant = entrants[entrantIndex];
  return Boolean(entrant && !entrant.empty);
}

export function getBracketEntrants(
  players: PlayerRecord[],
  rosterOrder: RosterEntry[],
  isRosterFinalized: boolean,
): PlayerRecord[] {
  if (!isRosterFinalized || !rosterOrder.length) {
    return [...players];
  }

  const playersById = new Map(
    players
      .filter((player) => player.id)
      .map((player) => [player.id as string, player]),
  );

  const ordered: PlayerRecord[] = [];

  if (rosterOrderUsesIds(rosterOrder)) {
    for (const entry of rosterOrder) {
      if (typeof entry !== 'string') {
        ordered.push(createEmptyBracketEntrant());
        continue;
      }

      ordered.push(playersById.get(entry) || createEmptyBracketEntrant());
    }

    return ordered;
  }

  for (const player of rosterOrder) {
    if (!player || typeof player === 'string') {
      ordered.push(createEmptyBracketEntrant());
      continue;
    }

    ordered.push(clonePlayerRecord(player) || createEmptyBracketEntrant());
  }

  return ordered;
}

export function getMatchResolution(
  level: number,
  matchIndex: number,
  entrants: PlayerRecord[],
  matchWinners: MatchWinners,
): BracketResolution {
  if (level < 1 || level > 4) {
    return { state: 'empty', participantIndexes: [] };
  }

  const key = getWinnerKey(level, matchIndex);
  const manualWinner = matchWinners[key];

  if (level === 1) {
    const participantIndexes = [matchIndex * 2, matchIndex * 2 + 1]
      .filter((entrantIndex) => isActiveEntrantIndex(entrants, entrantIndex));

    if (manualWinner !== undefined && participantIndexes.includes(manualWinner)) {
      return {
        state: 'resolved',
        participantIndexes,
        winnerIndex: manualWinner,
        decidedBy: 'manual',
      };
    }

    if (participantIndexes.length === 2) {
      return {
        state: 'pending',
        participantIndexes,
      };
    }

    if (participantIndexes.length === 1) {
      return {
        state: 'resolved',
        participantIndexes,
        winnerIndex: participantIndexes[0],
        decidedBy: 'bye',
      };
    }

    return { state: 'empty', participantIndexes: [] };
  }

  const leftResolution = getMatchResolution(level - 1, matchIndex * 2, entrants, matchWinners);
  const rightResolution = getMatchResolution(level - 1, matchIndex * 2 + 1, entrants, matchWinners);
  const participantIndexes: number[] = [];

  if (leftResolution.state === 'resolved' && leftResolution.winnerIndex !== undefined) {
    participantIndexes.push(leftResolution.winnerIndex);
  }

  if (rightResolution.state === 'resolved' && rightResolution.winnerIndex !== undefined) {
    participantIndexes.push(rightResolution.winnerIndex);
  }

  if (manualWinner !== undefined && participantIndexes.includes(manualWinner)) {
    return {
      state: 'resolved',
      participantIndexes,
      winnerIndex: manualWinner,
      decidedBy: 'manual',
    };
  }

  const leftEmpty = leftResolution.state === 'empty';
  const rightEmpty = rightResolution.state === 'empty';
  const leftResolved = leftResolution.state === 'resolved' && leftResolution.winnerIndex !== undefined;
  const rightResolved = rightResolution.state === 'resolved' && rightResolution.winnerIndex !== undefined;

  if (leftResolved && rightResolved) {
    return {
      state: 'pending',
      participantIndexes,
    };
  }

  if (leftResolved && rightEmpty) {
    return {
      state: 'resolved',
      participantIndexes,
      winnerIndex: leftResolution.winnerIndex,
      decidedBy: 'bye',
    };
  }

  if (rightResolved && leftEmpty) {
    return {
      state: 'resolved',
      participantIndexes,
      winnerIndex: rightResolution.winnerIndex,
      decidedBy: 'bye',
    };
  }

  if (leftEmpty && rightEmpty) {
    return { state: 'empty', participantIndexes: [] };
  }

  return {
    state: 'pending',
    participantIndexes,
  };
}

export function getResolvedMatchWinner(
  level: number,
  matchIndex: number,
  entrants: PlayerRecord[],
  matchWinners: MatchWinners,
): number | undefined {
  const resolution = getMatchResolution(level, matchIndex, entrants, matchWinners);
  return resolution.state === 'resolved' ? resolution.winnerIndex : undefined;
}

export function getMatchParticipantIndexes(
  level: number,
  matchIndex: number,
  entrants: PlayerRecord[],
  matchWinners: MatchWinners,
): number[] {
  if (level < 1 || level > 4) {
    return [];
  }

  if (level === 1) {
    return [matchIndex * 2, matchIndex * 2 + 1]
      .filter((entrantIndex) => isActiveEntrantIndex(entrants, entrantIndex));
  }

  const leftWinner = getResolvedMatchWinner(level - 1, matchIndex * 2, entrants, matchWinners);
  const rightWinner = getResolvedMatchWinner(level - 1, matchIndex * 2 + 1, entrants, matchWinners);

  return [leftWinner, rightWinner].filter((entrantIndex): entrantIndex is number => entrantIndex !== undefined);
}

export function getMatchLoserIndex(
  level: number,
  matchIndex: number,
  entrants: PlayerRecord[],
  matchWinners: MatchWinners,
): number | undefined {
  const participants = getMatchParticipantIndexes(level, matchIndex, entrants, matchWinners);
  const winnerIndex = getResolvedMatchWinner(level, matchIndex, entrants, matchWinners);

  if (participants.length < 2 || winnerIndex === undefined) {
    return undefined;
  }

  return participants.find((entrantIndex) => entrantIndex !== winnerIndex);
}

export function getThirdPlaceEntrantIndexes(
  entrants: PlayerRecord[],
  matchWinners: MatchWinners,
): Array<number | undefined> {
  return [
    getMatchLoserIndex(3, 0, entrants, matchWinners),
    getMatchLoserIndex(3, 1, entrants, matchWinners),
  ];
}

export function getFourthPlaceIndex(
  thirdPlaceWinner: number | undefined,
  entrants: PlayerRecord[],
  matchWinners: MatchWinners,
): number | undefined {
  if (thirdPlaceWinner === undefined) {
    return undefined;
  }

  const thirdPlaceEntrants = getThirdPlaceEntrantIndexes(entrants, matchWinners);
  return thirdPlaceEntrants.find(
    (entrantIndex) => entrantIndex !== undefined && entrantIndex !== thirdPlaceWinner,
  );
}

export function clearDependentWinners(
  winners: MatchWinners,
  level: number,
  matchIndex: number,
): MatchWinners {
  const nextWinners = { ...winners };

  function walk(currentLevel: number, currentMatchIndex: number) {
    const key = getWinnerKey(currentLevel, currentMatchIndex);

    if (nextWinners[key] === undefined) {
      return;
    }

    delete nextWinners[key];

    if (currentLevel <= 3) {
      delete nextWinners[THIRD_PLACE_KEY];
    }

    const parentLevel = currentLevel + 1;
    if (parentLevel <= 4) {
      walk(parentLevel, Math.floor(currentMatchIndex / 2));
    }
  }

  walk(level, matchIndex);
  return nextWinners;
}

export function buildPromotedParticipantState(
  waitingPlayer: PlayerRecord | null | undefined,
  displacedPlayer: PlayerRecord | null | undefined,
  overrideId = waitingPlayer?.id,
): PlayerRecord | null {
  if (!waitingPlayer) {
    return null;
  }

  return clonePlayerRecord(waitingPlayer, {
    id: overrideId || waitingPlayer.id,
    createdAt: displacedPlayer?.createdAt ?? waitingPlayer.createdAt ?? Date.now(),
  });
}

interface ParticipantRemovalStateInput {
  players: PlayerRecord[];
  waitingPlayers: PlayerRecord[];
  rosterOrder: RosterEntry[];
  isRosterFinalized: boolean;
  matchWinners: MatchWinners;
  removedPlayer: PlayerRecord;
  replacementPlayer?: PlayerRecord | null;
  preferredIndex?: number;
}

export function computeParticipantRemovalState({
  players,
  waitingPlayers,
  rosterOrder,
  isRosterFinalized,
  matchWinners,
  removedPlayer,
  replacementPlayer = null,
  preferredIndex = -1,
}: ParticipantRemovalStateInput) {
  const nextPlayers = [...players];
  const nextWaitingPlayers = [...waitingPlayers];
  let nextRosterOrder = [...rosterOrder];
  let nextMatchWinners = { ...matchWinners };

  const removalIndex =
    Number.isInteger(preferredIndex) &&
    preferredIndex >= 0 &&
    preferredIndex < nextPlayers.length &&
    rosterEntryMatchesPlayer(nextPlayers[preferredIndex], removedPlayer)
      ? preferredIndex
      : findPlayerIndexInList(removedPlayer, nextPlayers);

  if (replacementPlayer) {
    const waitlistIndex = findPlayerIndexInList(replacementPlayer, nextWaitingPlayers);
    if (waitlistIndex !== -1) {
      nextWaitingPlayers.splice(waitlistIndex, 1);
    }
  }

  if (removalIndex !== -1) {
    nextPlayers.splice(removalIndex, 1);

    if (replacementPlayer) {
      nextPlayers.splice(Math.min(removalIndex, nextPlayers.length), 0, replacementPlayer);
    }
  }

  if (isRosterFinalized && nextRosterOrder.length) {
    const slotIndex = findRosterSlotIndexForPlayer(removedPlayer, nextRosterOrder);

    if (slotIndex !== -1) {
      nextRosterOrder[slotIndex] = replacementPlayer
        ? buildRosterEntryForPlayer(replacementPlayer, nextRosterOrder)
        : null;
      nextMatchWinners = pruneMatchWinnersForSlot(slotIndex, nextMatchWinners);
    }
  }

  return {
    players: nextPlayers.slice(0, MAX_PLAYERS + nextWaitingPlayers.length),
    waitingPlayers: nextWaitingPlayers,
    rosterOrder: nextRosterOrder,
    matchWinners: nextMatchWinners,
  };
}
