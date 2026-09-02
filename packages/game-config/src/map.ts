/**
 * Map & spawn configuration.
 * This is the single source of truth consumed by BOTH the game server and
 * the client, so world bounds and spawn points always match.
 */

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
}

/** Symmetric arena bounds (half-width / half-depth), matching the outer walls. */
export const MAP_BOUNDS = {
  /** Outer wall wall thickness. */
  wallThickness: 1,
  /** Distance from origin to each outer wall center. */
  halfExtent: 48,
  /** Wall height in meters. */
  wallHeight: 4,
  /** Ground plane size (full width/depth of the floor). */
  groundSize: 100,
} as const;

export const MAP_SPAWNS: Record<"blue" | "red", SpawnPoint[]> = {
  blue: [
    { x: -20, y: 0, z: 0 },
    { x: -20, y: 0, z: 5 },
    { x: -20, y: 0, z: -5 },
    { x: -20, y: 0, z: 10 },
  ],
  red: [
    { x: 20, y: 0, z: 0 },
    { x: 20, y: 0, z: 5 },
    { x: 20, y: 0, z: -5 },
    { x: 20, y: 0, z: 10 },
  ],
};
