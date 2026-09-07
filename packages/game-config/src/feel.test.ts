import { describe, expect, it } from "vitest";
import {
  RECOIL_PITCH,
  RECOIL_YAW,
  SHAKE_FIRE,
  SHAKE_DAMAGE,
  BOB_FREQ,
  BOB_AMP,
  FOOTSTEP_INTERVAL,
  HIT_FLASH_DURATION,
  BLOOD_PARTICLE_COUNT,
  MUZZLE_FLASH_DURATION,
  MUZZLE_FLASH_LIGHT,
  MUZZLE_FLASH_SPRITE_SCALE,
  MAX_PARTICLES,
  VOLUME_MASTER,
  VOLUME_SFX,
  VOLUME_AMBIENT,
  GUNSHOT_VOLUME,
  IMPACT_VOLUME,
  HIT_VOLUME,
  DAMAGE_VOLUME,
  DEATH_VOLUME,
  FOOTSTEP_VOLUME,
  RELOAD_VOLUME,
} from "./feel";

describe("feel constants", () => {
  it("has finite positive recoil values", () => {
    expect(Number.isFinite(RECOIL_PITCH)).toBe(true);
    expect(RECOIL_PITCH).toBeGreaterThan(0);
    expect(Number.isFinite(RECOIL_YAW)).toBe(true);
    expect(RECOIL_YAW).toBeGreaterThan(0);
  });

  it("has finite positive shake values", () => {
    expect(Number.isFinite(SHAKE_FIRE)).toBe(true);
    expect(SHAKE_FIRE).toBeGreaterThan(0);
    expect(Number.isFinite(SHAKE_DAMAGE)).toBe(true);
    expect(SHAKE_DAMAGE).toBeGreaterThan(0);
    expect(SHAKE_DAMAGE).toBeGreaterThanOrEqual(SHAKE_FIRE);
  });

  it("has sane bob constants", () => {
    expect(Number.isFinite(BOB_FREQ)).toBe(true);
    expect(BOB_FREQ).toBeGreaterThan(0);
    expect(Number.isFinite(BOB_AMP)).toBe(true);
    expect(BOB_AMP).toBeGreaterThan(0);
    expect(BOB_AMP).toBeLessThan(0.15);
  });

  it("has sane footstep interval", () => {
    expect(Number.isFinite(FOOTSTEP_INTERVAL)).toBe(true);
    expect(FOOTSTEP_INTERVAL).toBeGreaterThan(0.1);
    expect(FOOTSTEP_INTERVAL).toBeLessThan(2);
  });

  it("has sane combat feedback values", () => {
    expect(Number.isFinite(HIT_FLASH_DURATION)).toBe(true);
    expect(HIT_FLASH_DURATION).toBeGreaterThan(0.05);
    expect(HIT_FLASH_DURATION).toBeLessThan(0.5);
    expect(Number.isFinite(BLOOD_PARTICLE_COUNT)).toBe(true);
    expect(BLOOD_PARTICLE_COUNT).toBeGreaterThanOrEqual(1);
    expect(BLOOD_PARTICLE_COUNT).toBeLessThanOrEqual(20);
  });

  it("has sane muzzle flash duration", () => {
    expect(Number.isFinite(MUZZLE_FLASH_DURATION)).toBe(true);
    expect(MUZZLE_FLASH_DURATION).toBeGreaterThan(0.01);
    expect(MUZZLE_FLASH_DURATION).toBeLessThan(0.2);
  });

  it("has applicable muzzle flash light and sprite scale", () => {
    expect(Number.isFinite(MUZZLE_FLASH_LIGHT)).toBe(true);
    expect(MUZZLE_FLASH_LIGHT).toBeGreaterThan(1);
    expect(Number.isFinite(MUZZLE_FLASH_SPRITE_SCALE)).toBe(true);
    expect(MUZZLE_FLASH_SPRITE_SCALE).toBeGreaterThan(0.05);
    expect(MUZZLE_FLASH_SPRITE_SCALE).toBeLessThan(1);
  });

  it("bounds the particle pool", () => {
    expect(Number.isInteger(MAX_PARTICLES)).toBe(true);
    expect(MAX_PARTICLES).toBeGreaterThanOrEqual(200);
    expect(MAX_PARTICLES).toBeLessThanOrEqual(400);
  });

  describe("audio volumes", () => {
    const volumes = [
      VOLUME_MASTER,
      VOLUME_SFX,
      VOLUME_AMBIENT,
      GUNSHOT_VOLUME,
      IMPACT_VOLUME,
      HIT_VOLUME,
      DAMAGE_VOLUME,
      DEATH_VOLUME,
      FOOTSTEP_VOLUME,
      RELOAD_VOLUME,
    ];

    it.each(volumes)("volume %s is finite and within 0..1", (v) => {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });
});
