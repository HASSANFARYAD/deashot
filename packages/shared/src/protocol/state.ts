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

export type MatchPhase = "waiting" | "in-progress" | "ended";

export interface MatchState {
  id: string;
  mode: "tdm";
  map: string;
  phase: MatchPhase;
  /** Seconds remaining. */
  timeRemaining: number;
  /** Blue team total kills. */
  blueScore: number;
  /** Red team total kills. */
  redScore: number;
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
