import * as THREE from "three";
import { MAP_BOUNDS } from "@deashot/game-config";

interface AABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * Simple AABB collision world for MVP.
 * The ground is y=0. Colliders are axis-aligned boxes.
 */
export class CollisionWorld {
  private colliders: AABB[] = [];

  addBox(x: number, y: number, z: number, w: number, h: number, d: number) {
    const halfW = w / 2;
    const halfH = h / 2;
    const halfD = d / 2;
    this.colliders.push({
      minX: x - halfW,
      minY: y - halfH,
      minZ: z - halfD,
      maxX: x + halfW,
      maxY: y + halfH,
      maxZ: z + halfD,
    });
  }

  /**
   * Resolve player capsule (simplified as AABB) against the world.
   * Returns the corrected position.
   */
  resolve(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number
  ): { x: number; y: number; z: number } {
    // Ground constraint.
    if (y < 0) y = 0;

    // Test each collider.
    for (const box of this.colliders) {
      // AABB overlap test between player AABB and box.
      const playerMinX = x - radius;
      const playerMaxX = x + radius;
      const playerMinY = y;
      const playerMaxY = y + height;
      const playerMinZ = z - radius;
      const playerMaxZ = z + radius;

      const overlapX = playerMaxX > box.minX && playerMinX < box.maxX;
      const overlapY = playerMaxY > box.minY && playerMinY < box.maxY;
      const overlapZ = playerMaxZ > box.minZ && playerMinZ < box.maxZ;

      if (overlapX && overlapY && overlapZ) {
        // Compute penetration on each axis.
        const penX =
          Math.min(playerMaxX - box.minX, box.maxX - playerMinX);
        const penY =
          Math.min(playerMaxY - box.minY, box.maxY - playerMinY);
        const penZ =
          Math.min(playerMaxZ - box.minZ, box.maxZ - playerMinZ);

        // Push out on smallest penetration axis.
        if (penX <= penY && penX <= penZ) {
          if (x < (box.minX + box.maxX) / 2) x -= penX;
          else x += penX;
        } else if (penY <= penX && penY <= penZ) {
          if (y < (box.minY + box.maxY) / 2) y -= penY;
          else y += penY;
        } else {
          if (z < (box.minZ + box.maxZ) / 2) z -= penZ;
          else z += penZ;
        }
      }
    }

    // Clamp to map bounds.
    const MAP_HALF = MAP_BOUNDS.halfExtent;
    x = Math.max(-MAP_HALF, Math.min(MAP_HALF, x));
    z = Math.max(-MAP_HALF, Math.min(MAP_HALF, z));

    return { x, y, z };
  }

  /** Get all collider meshes for debug rendering. */
  getDebugMeshes(): THREE.Mesh[] {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x666666,
      transparent: true,
      opacity: 0.5,
    });
    return this.colliders.map((b) => {
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      const d = b.maxZ - b.minZ;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(w, h, d);
      mesh.position.set(
        (b.minX + b.maxX) / 2,
        (b.minY + b.maxY) / 2,
        (b.minZ + b.maxZ) / 2
      );
      return mesh;
    });
  }
}
