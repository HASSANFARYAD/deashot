/**
 * Shared collision primitives consumed by both the game server and client.
 *
 * Pure functions with no Three.js dependency — safe for server-side CJS.
 * The ground plane is always y = 0.
 */

import type { AABBCollider } from "./map";
import { MAP_BOUNDS } from "./map";

/** Result of a ray-vs-AABB intersection test. */
export interface RaycastHit {
  /** Distance along the ray (t parameter). */
  t: number;
  /** World-space hit point. */
  x: number;
  y: number;
  z: number;
  /** Outward-facing surface normal at the hit point. */
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Test a ray against a single axis-aligned bounding box.
 *
 * Uses the slab method: for each axis the ray defines an interval (slab) where
 * it is inside the box. The intersection of all three intervals gives the hit.
 *
 * @returns Hit info or `null` if the ray misses.
 */
export function raycastAABB(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  box: AABBCollider
): RaycastHit | null {
  const minX = box.cx - box.hw;
  const maxX = box.cx + box.hw;
  const minY = box.cy - box.hh;
  const maxY = box.cy + box.hh;
  const minZ = box.cz - box.hd;
  const maxZ = box.cz + box.hd;

  let tmin = -Infinity;
  let tmax = Infinity;

  // X slab
  if (Math.abs(dx) < 1e-12) {
    if (ox < minX || ox > maxX) return null;
  } else {
    const inv = 1 / dx;
    const t0 = (minX - ox) * inv;
    const t1 = (maxX - ox) * inv;
    tmin = Math.max(tmin, Math.min(t0, t1));
    tmax = Math.min(tmax, Math.max(t0, t1));
    if (tmin > tmax) return null;
  }

  // Y slab
  if (Math.abs(dy) < 1e-12) {
    if (oy < minY || oy > maxY) return null;
  } else {
    const inv = 1 / dy;
    const t0 = (minY - oy) * inv;
    const t1 = (maxY - oy) * inv;
    tmin = Math.max(tmin, Math.min(t0, t1));
    tmax = Math.min(tmax, Math.max(t0, t1));
    if (tmin > tmax) return null;
  }

  // Z slab
  if (Math.abs(dz) < 1e-12) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    const inv = 1 / dz;
    const t0 = (minZ - oz) * inv;
    const t1 = (maxZ - oz) * inv;
    tmin = Math.max(tmin, Math.min(t0, t1));
    tmax = Math.min(tmax, Math.max(t0, t1));
    if (tmin > tmax) return null;
  }

  // Use the entering intersection (tmin). If tmin < 0 the ray starts inside
  // the box — treat as a miss for hitscan purposes.
  if (tmin < 0) return null;

  // Compute the hit point and surface normal analytically.
  const hx = ox + dx * tmin;
  const hy = oy + dy * tmin;
  const hz = oz + dz * tmin;

  // Distance from centre on each axis (normalised by half-extent).
  const dxNorm = (hx - box.cx) / box.hw;
  const dyNorm = (hy - box.cy) / box.hh;
  const dzNorm = (hz - box.cz) / box.hd;

  let nx = 0, ny = 0, nz = 0;
  const adx = Math.abs(dxNorm);
  const ady = Math.abs(dyNorm);
  const adz = Math.abs(dzNorm);

  if (adx >= ady && adx >= adz) {
    nx = dxNorm > 0 ? 1 : -1;
  } else if (ady >= adz) {
    ny = dyNorm > 0 ? 1 : -1;
  } else {
    nz = dzNorm > 0 ? 1 : -1;
  }

  return { t: tmin, x: hx, y: hy, z: hz, nx, ny, nz };
}

/**
 * Resolve player capsule (simplified as AABB) against a set of colliders.
 *
 * Returns the corrected position after pushing the player out of any overlap
 * and clamping to map bounds.  The ground plane (y = 0) is always enforced.
 *
 * @param x Player centre X.
 * @param y Player feet Y.
 * @param z Player centre Z.
 * @param radius Player capsule horizontal radius.
 * @param height Player capsule height.
 * @param colliders World geometry to test against.
 * @returns Corrected { x, y, z }.
 */
export function resolveAABB(
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  colliders: readonly AABBCollider[]
): { x: number; y: number; z: number } {
  // Ground constraint.
  if (y < 0) y = 0;

  // Test each collider.
  for (const box of colliders) {
    const bMinX = box.cx - box.hw;
    const bMaxX = box.cx + box.hw;
    const bMinY = box.cy - box.hh;
    const bMaxY = box.cy + box.hh;
    const bMinZ = box.cz - box.hd;
    const bMaxZ = box.cz + box.hd;

    // Player AABB.
    const pMinX = x - radius;
    const pMaxX = x + radius;
    const pMinY = y;
    const pMaxY = y + height;
    const pMinZ = z - radius;
    const pMaxZ = z + radius;

    // Overlap test on all three axes.
    if (pMaxX > bMinX && pMinX < bMaxX &&
        pMaxY > bMinY && pMinY < bMaxY &&
        pMaxZ > bMinZ && pMinZ < bMaxZ) {
      // Penetration depth on each axis.
      const penX = Math.min(pMaxX - bMinX, bMaxX - pMinX);
      const penY = Math.min(pMaxY - bMinY, bMaxY - pMinY);
      const penZ = Math.min(pMaxZ - bMinZ, bMaxZ - pMinZ);

      // Push out on the smallest penetration axis.
      if (penX <= penY && penX <= penZ) {
        x += x < box.cx ? -penX : penX;
      } else if (penY <= penX && penY <= penZ) {
        y += y < box.cy ? -penY : penY;
      } else {
        z += z < box.cz ? -penZ : penZ;
      }
    }
  }

  // Clamp to map bounds.
  const half = MAP_BOUNDS.halfExtent;
  x = Math.max(-half, Math.min(half, x));
  z = Math.max(-half, Math.min(half, z));

  return { x, y, z };
}
