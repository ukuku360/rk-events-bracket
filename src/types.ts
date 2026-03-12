export interface PlayerRecord {
  id?: string;
  name: string;
  aura: string;
  weak: string;
  createdAt?: unknown;
  empty?: boolean;
  isBye?: boolean;
}

export type RosterEntry = string | PlayerRecord | null;

export type MatchWinners = Record<string, number>;

export interface PersistedEventState {
  players: PlayerRecord[];
  waitingPlayers: PlayerRecord[];
  rosterOrder: RosterEntry[];
  isRosterFinalized: boolean;
  matchWinners: MatchWinners;
  updatedAt: number;
}

export interface ProfileCardData {
  key: string;
  name: string;
  aura: string;
  weak: string;
  metaLabel: string;
}

export interface BracketResolution {
  state: 'empty' | 'pending' | 'resolved';
  participantIndexes: number[];
  winnerIndex?: number;
  decidedBy?: 'manual' | 'bye';
}

export type ViewMode = 'warriors' | 'admin';

export interface SelectionResult {
  kind: 'winner' | 'champion' | 'noop';
  championName?: string;
}

export type TournamentPlayer = PlayerRecord;
export type LocalEventState = PersistedEventState;
