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
  /** Winning team, or null while the match is ongoing or tied. */
  winner: Team | null;
  players: Record<string, PlayerState>;
}
