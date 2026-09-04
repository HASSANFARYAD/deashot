/**
 * Server-side combat validation tuning.
 *
 * These bound how far a client's claimed shot may diverge from the state the
 * server already holds for that player. They are deliberately generous: the
 * job is to make impossible shots impossible, not to police normal latency.
 */

/**
 * Maximum angle, in radians, between the direction a client claims it fired
 * and the look vector implied by the yaw/pitch the server last accepted from
 * that same client.
 *
 * Sized for one input interval of head movement: inputs arrive at
 * `CLIENT_INPUT_RATE` (30 Hz), and a fast flick covers roughly 0.2 rad in that
 * window. 0.35 rad (~20 degrees) clears that with margin while still rejecting
 * a shot aimed at someone the player is not looking at.
 */
export const SHOT_AIM_TOLERANCE = 0.35;

/**
 * Distance, in metres, the client's reported muzzle origin may sit from the
 * server's reconstructed eye position before the shot is treated as
 * suspicious.
 *
 * The reported origin is never used for hit detection — the server always
 * raycasts from its own reconstruction — so this only feeds telemetry. It
 * allows for the weapon's muzzle offset plus one tick of movement.
 */
export const SHOT_ORIGIN_TOLERANCE = 1.5;
