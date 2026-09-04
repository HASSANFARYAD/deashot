/** Clamp a value between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Linear interpolation with clamping. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Length of a 3D vector. */
export function length3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/**
 * Normalize angles to [-PI, PI].
 *
 * Uses a single modulo rather than subtract-in-a-loop: the loop form runs
 * forever on a non-finite input, and this function is reachable from
 * unvalidated network yaw. Non-finite input normalizes to 0.
 */
export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const twoPi = Math.PI * 2;
  const wrapped = angle % twoPi;
  if (wrapped > Math.PI) return wrapped - twoPi;
  if (wrapped < -Math.PI) return wrapped + twoPi;
  return wrapped;
}

/**
 * Unit look vector from yaw/pitch, in the project's camera convention:
 * forward at yaw=0, pitch=0 is -Z, matching `THREE.Euler(pitch, yaw, 0, "YXZ")`
 * applied to a camera and the `(-sin(yaw), -cos(yaw))` horizontal forward used
 * by `FPSCamera.getForwardXZ` and the server's movement integration.
 *
 * Returns [x, y, z].
 */
export function lookVectorFromYawPitch(
  yaw: number,
  pitch: number
): [number, number, number] {
  const cosPitch = Math.cos(pitch);
  return [
    -Math.sin(yaw) * cosPitch,
    Math.sin(pitch),
    -Math.cos(yaw) * cosPitch,
  ];
}
