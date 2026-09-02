/**
 * Shared state types describing players and match state.
 */

export type Team = "blue" | "red";

export interface PlayerState {
  id: string;
  /** Guest username. */
  name: string;
  team: Team;
  x: number;
  y: number;
  z: number;
  /** Horizontal rotation in radians. */
  yaw: number;
  /** Vertical rotation in radians. */
  pitch: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  kills: number;
  deaths: number;
}

export type MatchPhase = "waiting" | "warmup" | "in-progress" | "ended";

export interface MatchState {
  id: string;
  mode: "tdm";
  map: string;
  phase: MatchPhase;
  /** Seconds remaining, or duration when in warmup. */
  timeRemaining: number;
  /** Team score: kills per team. */
  scores: Record<Team, number>;
  /** Kill target to win (when score limit reached). */
  killLimit: number;
  players: Record<string, PlayerState>;
}

export interface KillEvent {
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  weaponId: string;
  headshot: boolean;
  timestamp: number;
}

export interface DamageEvent {
  targetId: string;
  /** Normalized direction from victim to attacker, for damage indicator. */
  directionX: number;
  directionY: number;
  directionZ: number;
  amount: number;
  newHealth: number;
  killerId?: string;
}
