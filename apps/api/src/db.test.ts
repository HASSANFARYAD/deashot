import { describe, it, expect } from "vitest";
import { createProfileStore } from "./db";

describe("in-memory profile store", () => {
  it("returns null when no profile exists", async () => {
    const store = createProfileStore();
    expect(await store.get("sub-1")).toBeNull();
    await store.close();
  });

  it("round-trips a profile", async () => {
    const store = createProfileStore();
    await store.put("sub-1", {
      sensitivity: 0.8,
      volume: 0.5,
      crosshairColor: "#ff0000",
    });
    const got = await store.get("sub-1");
    expect(got).toEqual({
      sensitivity: 0.8,
      volume: 0.5,
      crosshairColor: "#ff0000",
    });
    await store.close();
  });

  it("overwrites a profile on re-put", async () => {
    const store = createProfileStore();
    await store.put("sub-1", {
      sensitivity: 0.8,
      volume: 0.5,
      crosshairColor: "#ff0000",
    });
    await store.put("sub-1", {
      sensitivity: 1.0,
      volume: 0.9,
      crosshairColor: "#0000ff",
    });
    expect(await store.get("sub-1")).toEqual({
      sensitivity: 1.0,
      volume: 0.9,
      crosshairColor: "#0000ff",
    });
    await store.close();
  });

  it("evicts the least-recently-used entry when exceeding the cap", async () => {
    const store = createProfileStore();
    const CAP = 10_000;
    const settings = {
      sensitivity: 1.0,
      volume: 1.0,
      crosshairColor: "#00ff00",
    };
    for (let i = 0; i <= CAP; i++) {
      await store.put(`sub-${i}`, settings);
    }
    expect(await store.get("sub-0")).toBeNull();
    expect(await store.get("sub-1")).toBeDefined();
    await store.close();
  });

  it("refreshes recency so the oldest gets evicted instead", async () => {
    const store = createProfileStore();
    const settings = {
      sensitivity: 1.0,
      volume: 1.0,
      crosshairColor: "#00ff00",
    };
    // Fill to cap and touch sub-0 to refresh it.
    for (let i = 0; i < 10_000; i++) await store.put(`sub-${i}`, settings);
    await store.get("sub-0");
    // Now push one more: sub-1 (the true oldest) should be evicted.
    await store.put("overflow", settings);
    expect(await store.get("sub-1")).toBeNull();
    expect(await store.get("sub-0")).toBeDefined();
    await store.close();
  });
});