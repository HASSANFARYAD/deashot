/**
 * Shared network protocol types.
 * These define the contract between client and server.
 */

/** Player input sent from client to server every tick. */
export interface PlayerInput {
  /** Monotonically increasing sequence number from client. */
  sequence: number;
  /** Server tick this input is intended for. */
  tick: number;
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Horizontal rotation in radians. */
  yaw: number;
  /** Vertical rotation in radians, clamped. */
  pitch: number;
  shoot: boolean;
  reload: boolean;
}

/** Shoot event sent from client to server when firing. */
export interface ShootEvent {
  /** Muzzle origin (world space). */
  ox: number;
  oy: number;
  oz: number;
  /** Shot direction (normalized, world space). */
  dx: number;
  dy: number;
  dz: number;
}

/** Hit event broadcast from server to all clients. */
export interface HitEvent {
  attackerId: string;
  victimId: string;
  damage: number;
  headshot: boolean;
  newHealth: number;
}

/** Kill event broadcast from server to all clients. */
export interface KillEvent {
  killerId: string;
  killerName: string;
  killerTeam: string;
  victimId: string;
  victimName: string;
  victimTeam: string;
  headshot: boolean;
  weaponId: string;
}

/** Damage indicator broadcast from server to the damaged client. */
export interface DamageEvent {
  targetId: string;
  attackerId: string;
  attackerName: string;
  amount: number;
  headshot: boolean;
  newHealth: number;
}
