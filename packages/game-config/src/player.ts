/**
 * Player physics constants used by both client prediction and server simulation.
 * Keeping these in the shared config ensures client prediction matches server.
 */

export const PLAYER_SPEED = 6.5; // meters/second
export const PLAYER_AIM_SPEED_FACTOR = 0.65; // speed multiplier while aiming down sights
export const PLAYER_ACCELERATION = 30;
export const PLAYER_FRICTION = 8;
export const PLAYER_JUMP_VELOCITY = 4.8;
export const GRAVITY = -14.0;

/** Player capsule dimensions in meters. */
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_RADIUS = 0.4;
export const EYE_HEIGHT = 1.6;

/** Max pitch up/down in radians. */
export const PITCH_LIMIT = Math.PI / 2 - 0.01;

/** Player max health. */
export const PLAYER_MAX_HEALTH = 100;

/** Respawn delay in seconds. */
export const RESPAWN_DELAY = 3;
