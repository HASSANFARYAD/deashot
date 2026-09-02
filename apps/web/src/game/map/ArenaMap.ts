import * as THREE from "three";
import type { CollisionWorld } from "../systems/CollisionWorld";

/**
 * Build the MVP arena map.
 * Simple 3-lane layout: spawn A (top), spawn B (bottom), central cover.
 */
export function buildMap(
  scene: THREE.Scene,
  collision: CollisionWorld
): { spawnA: THREE.Vector3; spawnB: THREE.Vector3 } {
  // Ground plane.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Walls material.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x7a7a7a });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x888888 });

  // Outer walls.
  const wallPositions = [
    { x: 0, z: -48, w: 96, d: 1 },  // north
    { x: 0, z: 48, w: 96, d: 1 },   // south
    { x: -48, z: 0, w: 1, d: 96 },  // west
    { x: 48, z: 0, w: 1, d: 96 },   // east
  ];

  for (const wp of wallPositions) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(wp.w, 4, wp.d),
      wallMat
    );
    wall.position.set(wp.x, 2, wp.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    collision.addBox(wp.x, 2, wp.z, wp.w, 4, wp.d);
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
  for (const [x, z] of [[-30, 0], [30, 0]] as const) {
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.2, 6),
      spawnMat
    );
    platform.position.set(x, 0.1, z);
    platform.receiveShadow = true;
    scene.add(platform);
  }

  // Spawn A (blue, left side).
  const spawnA = new THREE.Vector3(-30, 0, 0);
  // Spawn B (red, right side).
  const spawnB = new THREE.Vector3(30, 0, 0);

  // Grid helper for orientation.
  const grid = new THREE.GridHelper(100, 50, 0x000000, 0x222222);
  grid.position.y = 0.01;
  scene.add(grid);

  return { spawnA, spawnB };
}
