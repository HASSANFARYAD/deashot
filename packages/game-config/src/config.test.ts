import { describe, expect, it } from "vitest";
import { ASSAULT_RIFLE, getWeapon, WEAPONS } from "./weapons";
import {
  PLAYER_SPEED,
  PLAYER_AIM_SPEED_FACTOR,
  PLAYER_JUMP_VELOCITY,
  GRAVITY,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  EYE_HEIGHT,
  PLAYER_MAX_HEALTH,
} from "./player";
import { MAP_COLLIDERS } from "./map";
import { raycastAABB, resolveAABB } from "./collision";
import type { AABBCollider } from "./map";

describe("ASSAULT_RIFLE", () => {
  it("has valid stats", () => {
    const s = ASSAULT_RIFLE.stats;
    expect(s.damage).toBeGreaterThan(0);
    expect(s.magazineSize).toBeGreaterThan(0);
    expect(s.fireRate).toBeGreaterThan(0);
    expect(s.reloadTime).toBeGreaterThan(0);
    expect(s.range).toBeGreaterThan(0);
    expect(s.spread).toBeGreaterThanOrEqual(0);
    expect(s.headMultiplier).toBeGreaterThanOrEqual(1);
  });

  it("is registered and retrievable", () => {
    expect(WEAPONS[ASSAULT_RIFLE.id]).toBe(ASSAULT_RIFLE);
    expect(getWeapon("ar")).toBe(ASSAULT_RIFLE);
    expect(() => getWeapon("nope")).toThrow();
  });
});

describe("player constants", () => {
  it("keeps sane physics values", () => {
    expect(PLAYER_SPEED).toBeGreaterThan(0);
    expect(PLAYER_AIM_SPEED_FACTOR).toBeGreaterThan(0);
    expect(PLAYER_AIM_SPEED_FACTOR).toBeLessThan(1);
    expect(PLAYER_JUMP_VELOCITY).toBeGreaterThan(0);
    expect(GRAVITY).toBeLessThan(0);
  });

  it("keeps body dimensions consistent", () => {
    expect(PLAYER_HEIGHT).toBeGreaterThan(PLAYER_RADIUS * 2);
    expect(EYE_HEIGHT).toBeLessThanOrEqual(PLAYER_HEIGHT);
    expect(EYE_HEIGHT).toBeGreaterThan(0);
    expect(PLAYER_MAX_HEALTH).toBeGreaterThan(0);
  });
});

describe("MAP_COLLIDERS", () => {
  it("contains 15 colliders (4 walls + 11 cover)", () => {
    expect(MAP_COLLIDERS.length).toBe(15);
  });

  it("every collider has positive half-extents", () => {
    for (const c of MAP_COLLIDERS) {
      expect(c.hw).toBeGreaterThan(0);
      expect(c.hh).toBeGreaterThan(0);
      expect(c.hd).toBeGreaterThan(0);
    }
  });
});

describe("raycastAABB", () => {
  const box: AABBCollider = { cx: 5, cy: 1, cz: 0, hw: 1, hh: 1, hd: 1 };

  it("hits a box head-on", () => {
    const hit = raycastAABB(0, 1, 0, 1, 0, 0, box);
    expect(hit).not.toBeNull();
    // Box left face is at cx - hw = 5 - 1 = 4; ray from x=0 → t = 4
    expect(hit!.t).toBeCloseTo(4);
    expect(hit!.x).toBeCloseTo(4);
    expect(hit!.nx).toBeLessThan(0);
  });

  it("returns null for a ray that misses", () => {
    const hit = raycastAABB(0, 5, 0, 1, 0, 0, box);
    expect(hit).toBeNull();
  });

  it("returns null for a ray pointing away from the box", () => {
    const hit = raycastAABB(10, 1, 0, 1, 0, 0, box);
    expect(hit).toBeNull();
  });

  it("returns null when ray is parallel and outside the slab", () => {
    const hit = raycastAABB(0, 5, 0, 0, 1, 0, box);
    expect(hit).toBeNull();
  });

  it("returns null when ray starts inside the box (tmin < 0)", () => {
    const hit = raycastAABB(5, 1, 0, 1, 0, 0, box);
    expect(hit).toBeNull();
  });

  it("computes correct normal for a hit on the top face", () => {
    const hit = raycastAABB(5, 5, 0, 0, -1, 0, box);
    expect(hit).not.toBeNull();
    expect(hit!.ny).toBeCloseTo(1);
  });

  it("computes correct normal for a hit on the side face", () => {
    const hit = raycastAABB(0, 1, 0, 1, 0, 0, box);
    expect(hit).not.toBeNull();
    expect(hit!.nx).toBeCloseTo(-1);
  });
});

describe("resolveAABB", () => {
  const wall: AABBCollider = { cx: 10, cy: 1, cz: 0, hw: 1, hh: 1, hd: 1 };

  it("pushes player out of an overlapping wall", () => {
    // Player centre at x=9.6, radius=0.4 → player AABB [9.2, 10.0].
    // Wall at cx=10, hw=1 → wall AABB [9, 11].
    // Overlap on X = 10.0 - 9.2 = 0.8 (player is left-of-centre → pushed left).
    const result = resolveAABB(9.6, 0, 0, 0.4, 1.8, [wall]);
    expect(result.x).toBeLessThanOrEqual(9.2);
  });

  it("does not move a player with no overlap", () => {
    const result = resolveAABB(-20, 0, 0, 0.4, 1.8, [wall]);
    expect(result.x).toBeCloseTo(-20);
    expect(result.z).toBeCloseTo(0);
  });

  it("enforces the ground plane (y >= 0)", () => {
    const result = resolveAABB(0, -5, 0, 0.4, 1.8, []);
    expect(result.y).toBe(0);
  });

  it("clamps to map bounds", () => {
    const result = resolveAABB(100, 0, 100, 0.4, 1.8, []);
    expect(Math.abs(result.x)).toBeLessThanOrEqual(48);
    expect(Math.abs(result.z)).toBeLessThanOrEqual(48);
  });
});