import { describe, expect, it } from "vitest";
import {
  clamp,
  lerp,
  length3,
  normalizeAngle,
  directionFromYawPitch,
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
});

describe("directionFromYawPitch", () => {
  it("faces +Z at yaw=0, pitch=0 (standard spherical convention)", () => {
    const [x, y, z] = directionFromYawPitch(0, 0);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(1, 6);
  });

  it("points up when pitching up", () => {
    const [, y] = directionFromYawPitch(0, Math.PI / 2);
    expect(y).toBeCloseTo(1, 6);
  });

  it("returns a unit vector", () => {
    const dir = directionFromYawPitch(Math.PI / 3, -Math.PI / 4);
    const len = length3(dir[0], dir[1], dir[2]);
    expect(len).toBeCloseTo(1, 6);
  });
});