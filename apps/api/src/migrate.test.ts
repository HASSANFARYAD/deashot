import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrationVersions } from "./migrate";

let tempDir: string;

afterEach(() => {
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  }
});

function makeDir(files: string[]): string {
  tempDir = mkdtempSync(join(tmpdir(), "deashot-migrate-"));
  for (const f of files) writeFileSync(join(tempDir, f), "-- migration");
  return tempDir;
}

describe("migrationVersions", () => {
  it("lists only .sql files, stripped of extension, in lexical order", () => {
    const dir = makeDir(["005_x.sql", "001_profiles.sql", "README.md", "010_y.sql"]);
    expect(migrationVersions(dir)).toEqual([
      "001_profiles",
      "005_x",
      "010_y",
    ]);
  });

  it("returns an empty array when there are no migrations", () => {
    const dir = makeDir(["notes.txt"]);
    expect(migrationVersions(dir)).toEqual([]);
  });
});