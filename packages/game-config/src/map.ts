/**
 * Map, spawn, and collider configuration.
 * This is the single source of truth consumed by BOTH the game server and
 * the client, so world bounds, spawn points, and collision geometry always
 * match.
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

/**
 * Axis-aligned bounding box stored as centre + half-extents.
 * Consumed by the shared collision module (`raycastAABB` / `resolveAABB`)
 * and by the client renderer to build the scene geometry.
 */
export interface AABBCollider {
  /** Centre X. */
  cx: number;
  /** Centre Y. */
  cy: number;
  /** Centre Z. */
  cz: number;
  /** Half-width (X axis). */
  hw: number;
  /** Half-height (Y axis). */
  hh: number;
  /** Half-depth (Z axis). */
  hd: number;
}

/**
 * All solid geometry in the arena — 4 outer walls + 11 cover blocks.
 *
 * This is the single source of truth for collision on both client and server.
 * The client renders these as Three.js boxes; the server uses them for
 * hitscan wall-occlusion (P0-2) and movement collision (P0-3).
 */
export const MAP_COLLIDERS: AABBCollider[] = (() => {
  const H = MAP_BOUNDS.halfExtent;
  const T = MAP_BOUNDS.wallThickness;
  const WH = MAP_BOUNDS.wallHeight;

  const walls: AABBCollider[] = [
    { cx: 0,  cy: WH / 2, cz: -H,  hw: H + T / 2, hh: WH / 2, hd: T / 2 },
    { cx: 0,  cy: WH / 2, cz: H,   hw: H + T / 2, hh: WH / 2, hd: T / 2 },
    { cx: -H, cy: WH / 2, cz: 0,   hw: T / 2,     hh: WH / 2, hd: H + T / 2 },
    { cx: H,  cy: WH / 2, cz: 0,   hw: T / 2,     hh: WH / 2, hd: H + T / 2 },
  ];

  const cover: AABBCollider[] = [
    // Central block
    { cx: 0,  cy: 1,   cz: 0,   hw: 2,   hh: 1,   hd: 2 },
    // North/south of centre
    { cx: 0,  cy: 0.75, cz: 8,  hw: 1.5, hh: 0.75, hd: 1.5 },
    { cx: 0,  cy: 0.75, cz: -8, hw: 1.5, hh: 0.75, hd: 1.5 },
    // Side lanes
    { cx: 15, cy: 1,   cz: 0,   hw: 1.5, hh: 1,   hd: 1.5 },
    { cx: -15, cy: 1,  cz: 0,   hw: 1.5, hh: 1,   hd: 1.5 },
    // Pillars
    { cx: 10,  cy: 1.5, cz: 15,  hw: 1, hh: 1.5, hd: 1 },
    { cx: -10, cy: 1.5, cz: 15,  hw: 1, hh: 1.5, hd: 1 },
    { cx: 10,  cy: 1.5, cz: -15, hw: 1, hh: 1.5, hd: 1 },
    { cx: -10, cy: 1.5, cz: -15, hw: 1, hh: 1.5, hd: 1 },
    // Lane walls
    { cx: 10,  cy: 1.25, cz: 0,  hw: 0.5, hh: 1.25, hd: 4 },
    { cx: -10, cy: 1.25, cz: 0,  hw: 0.5, hh: 1.25, hd: 4 },
  ];

  return [...walls, ...cover];
})();
