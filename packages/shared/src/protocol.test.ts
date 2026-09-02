import { describe, expect, it } from "vitest";
import type { PlayerInput } from "./protocol/input";
import {
  SERVER_TICK_RATE,
  CLIENT_INPUT_RATE,
  SERVER_SNAPSHOT_RATE,
  MAX_PLAYERS,
  MATCH_DURATION,
  KILL_LIMIT,
} from "./constants";

describe("PlayerInput protocol", () => {
  it("round-trips through JSON (as sent over the wire)", () => {
    const input: PlayerInput = {
      sequence: 42,
      tick: 1337,
      forward: true,
      backward: false,
      left: true,
      right: false,
      jump: false,
      yaw: 0.5,
      pitch: -0.25,
      shoot: true,
      reload: false,
    };

    const wire = JSON.stringify(input);
    const back: PlayerInput = JSON.parse(wire);

    expect(back).toEqual(input);
    expect(Number.isFinite(back.sequence)).toBe(true);
    expect(Number.isFinite(back.yaw)).toBe(true);
  });

  it("preserves default input shape", () => {
    const idle: PlayerInput = {
      sequence: 0,
      tick: 0,
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      yaw: 0,
      pitch: 0,
      shoot: false,
      reload: false,
    };
    expect(idle.forward).toBe(false);
    expect(idle.shoot).toBe(false);
  });
});

describe("match constants", () => {
  it("keeps sane tick ordering", () => {
    expect(SERVER_TICK_RATE).toBeGreaterThan(SERVER_SNAPSHOT_RATE);
    expect(CLIENT_INPUT_RATE).toBeGreaterThan(SERVER_SNAPSHOT_RATE);
  });

  it("keeps match limits positive", () => {
    expect(MAX_PLAYERS).toBeGreaterThan(0);
    expect(MATCH_DURATION).toBeGreaterThan(0);
    expect(KILL_LIMIT).toBeGreaterThan(0);
  });
});