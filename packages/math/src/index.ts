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

/** Normalize angles to [-PI, PI]. */
export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/** Direction vector from yaw/pitch. Returns [x, y, z]. */
export function directionFromYawPitch(yaw: number, pitch: number): [number, number, number] {
  return [
    Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.cos(yaw),
  ];
}
