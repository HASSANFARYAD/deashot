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