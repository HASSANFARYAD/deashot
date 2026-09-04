import { describe, expect, it } from "vitest";
import {
  clamp,
  lerp,
  length3,
  normalizeAngle,
  lookVectorFromYawPitch,
} from "./index";

describe("clamp", () => {
  it("clamps values within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("lerp", () => {
  it("interpolates between a and b", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });
});

describe("length3", () => {
  it("computes vector length", () => {
    expect(length3(3, 4, 0)).toBeCloseTo(5, 6);
    expect(length3(0, 0, 0)).toBe(0);
  });
});

describe("normalizeAngle", () => {
  it("normalizes angles to [-PI, PI]", () => {
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI, 6);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(-Math.PI, 6);
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 6);
    expect(normalizeAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI, 6);
    expect(normalizeAngle(0)).toBe(0);
  });

  it("leaves in-range angles untouched", () => {
    expect(normalizeAngle(0.5)).toBe(0.5);
    expect(normalizeAngle(-1.25)).toBe(-1.25);
  });

  it("wraps large magnitudes into range, preserving the angle", () => {
    for (const angle of [Math.PI * 1001, -Math.PI * 1001, 1e9, -1e9, 12345.678]) {
      const n = normalizeAngle(angle);
      expect(n).toBeGreaterThanOrEqual(-Math.PI);
      expect(n).toBeLessThanOrEqual(Math.PI);
      // Same direction, just a different representative.
      expect(Math.sin(n)).toBeCloseTo(Math.sin(angle), 4);
      expect(Math.cos(n)).toBeCloseTo(Math.cos(angle), 4);
    }
  });

  // The previous subtract-in-a-loop implementation hung forever on these.
  // Reachable from unvalidated network yaw, so it was a remote DoS.
  it("returns 0 for non-finite input instead of hanging", () => {
    expect(normalizeAngle(Infinity)).toBe(0);
    expect(normalizeAngle(-Infinity)).toBe(0);
    expect(normalizeAngle(NaN)).toBe(0);
  });
});

describe("lookVectorFromYawPitch", () => {
  it("faces -Z at yaw=0, pitch=0 (project camera convention)", () => {
    const [x, y, z] = lookVectorFromYawPitch(0, 0);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(-1, 6);
  });

  it("faces -X at yaw=PI/2", () => {
    const [x, , z] = lookVectorFromYawPitch(Math.PI / 2, 0);
    expect(x).toBeCloseTo(-1, 6);
    expect(z).toBeCloseTo(0, 6);
  });

  it("agrees with the horizontal forward used by camera and server", () => {
    for (const yaw of [0, 0.7, -2.1, Math.PI]) {
      const [x, , z] = lookVectorFromYawPitch(yaw, 0);
      expect(x).toBeCloseTo(-Math.sin(yaw), 6);
      expect(z).toBeCloseTo(-Math.cos(yaw), 6);
    }
  });

  it("points up when pitching up", () => {
    const [, y] = lookVectorFromYawPitch(0, Math.PI / 2);
    expect(y).toBeCloseTo(1, 6);
  });

  it("returns a unit vector", () => {
    const dir = lookVectorFromYawPitch(Math.PI / 3, -Math.PI / 4);
    const len = length3(dir[0], dir[1], dir[2]);
    expect(len).toBeCloseTo(1, 6);
  });
});