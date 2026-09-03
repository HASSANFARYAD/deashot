import * as THREE from "three";
import { MAP_BOUNDS, MAP_SPAWNS } from "@deashot/game-config";
import type { CollisionWorld } from "../systems/CollisionWorld";

/**
 * Build the MVP arena map.
 * Simple 3-lane layout: spawn A (top), spawn B (bottom), central cover.
 * Spawn points and wall bounds come from the shared game-config so the
 * client world always matches the authoritative server world.
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

  // Walls material.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x7a7a7a });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x888888 });

  // Outer walls.
  const H = MAP_BOUNDS.halfExtent;
  const T = MAP_BOUNDS.wallThickness;
  const wallPositions = [
    { x: 0, z: -H, w: H * 2 + T, d: T }, // north
    { x: 0, z: H, w: H * 2 + T, d: T },  // south
    { x: -H, z: 0, w: T, d: H * 2 + T }, // west
    { x: H, z: 0, w: T, d: H * 2 + T },  // east
  ];

  for (const wp of wallPositions) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(wp.w, MAP_BOUNDS.wallHeight, wp.d),
      wallMat
    );
    wall.position.set(wp.x, MAP_BOUNDS.wallHeight / 2, wp.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    collision.addBox(wp.x, MAP_BOUNDS.wallHeight / 2, wp.z, wp.w, MAP_BOUNDS.wallHeight, wp.d);
  }

  // Central cover blocks.
  const coverPositions = [
    { x: 0, z: 0, w: 4, h: 2, d: 4 },
    { x: 0, z: 8, w: 3, h: 1.5, d: 3 },
    { x: 0, z: -8, w: 3, h: 1.5, d: 3 },
    // Side lanes.
    { x: 15, z: 0, w: 3, h: 2, d: 3 },
    { x: -15, z: 0, w: 3, h: 2, d: 3 },
    // Pillars.
    { x: 10, z: 15, w: 2, h: 3, d: 2 },
    { x: -10, z: 15, w: 2, h: 3, d: 2 },
    { x: 10, z: -15, w: 2, h: 3, d: 2 },
    { x: -10, z: -15, w: 2, h: 3, d: 2 },
    // Walls for lane cover.
    { x: 10, z: 0, w: 1, h: 2.5, d: 8 },
    { x: -10, z: 0, w: 1, h: 2.5, d: 8 },
  ];

  for (const cp of coverPositions) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(cp.w, cp.h, cp.d),
      cp.h > 2 ? wallMat : floorMat
    );
    block.position.set(cp.x, cp.h / 2, cp.z);
    block.castShadow = true;
    block.receiveShadow = true;
    scene.add(block);
    collision.addBox(cp.x, cp.h / 2, cp.z, cp.w, cp.h, cp.d);
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
