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
