import * as THREE from "three";
import { MAP_BOUNDS, MAP_SPAWNS, MAP_COLLIDERS } from "@deashot/game-config";
import type { CollisionWorld } from "../systems/CollisionWorld";

/**
 * Build the MVP arena map.
 *
 * All collider geometry comes from the shared `MAP_COLLIDERS` array in
 * `@deashot/game-config`. This ensures the client scene, the client
 * collision world, and the server all see the same world geometry.
 */
export function buildMap(
  scene: THREE.Scene,
  collision: CollisionWorld
): { spawnA: THREE.Vector3; spawnB: THREE.Vector3 } {
  // Ground plane.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_BOUNDS.groundSize, MAP_BOUNDS.groundSize),
    groundMat
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Materials for walls vs cover.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x7a7a7a });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x888888 });

  // Build all colliders from the shared data.
  // The first 4 entries are outer walls; the rest are cover blocks.
  for (let i = 0; i < MAP_COLLIDERS.length; i++) {
    const c = MAP_COLLIDERS[i];
    const w = c.hw * 2;
    const h = c.hh * 2;
    const d = c.hd * 2;
    const mat = i < 4 ? wallMat : (h > 2 ? wallMat : floorMat);
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    box.position.set(c.cx, c.cy, c.cz);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
    collision.addBox(c.cx, c.cy, c.cz, w, h, d);
  }

  // Spawn platforms (slightly elevated).
  const spawnMat = new THREE.MeshStandardMaterial({ color: 0x3366cc });
  for (const [x, z] of [
    [MAP_SPAWNS.blue[0].x, MAP_SPAWNS.blue[0].z],
    [MAP_SPAWNS.red[0].x, MAP_SPAWNS.red[0].z],
  ] as const) {
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.2, 6),
      spawnMat
    );
    platform.position.set(x, 0.1, z);
    platform.receiveShadow = true;
    scene.add(platform);
  }

  // Spawn A (blue, left side). Spawn B (red, right side).
  const spawnA = new THREE.Vector3(
    MAP_SPAWNS.blue[0].x,
    MAP_SPAWNS.blue[0].y,
    MAP_SPAWNS.blue[0].z
  );
  const spawnB = new THREE.Vector3(
    MAP_SPAWNS.red[0].x,
    MAP_SPAWNS.red[0].y,
    MAP_SPAWNS.red[0].z
  );

  // Grid helper for orientation.
  const grid = new THREE.GridHelper(100, 50, 0x000000, 0x222222);
  grid.position.y = 0.01;
  scene.add(grid);

  return { spawnA, spawnB };
}
