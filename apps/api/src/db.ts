import { Pool } from "pg";

export interface ProfileSettings {
  sensitivity: number;
  volume: number;
  crosshairColor: string;
}

/**
 * Profile storage interface. Backed by Postgres when DATABASE_URL is set,
 * otherwise a bounded in-memory LRU so dev, tests, and the integration harness
 * run without a database.
 */
export interface ProfileStore {
  get(sub: string): Promise<ProfileSettings | null>;
  put(sub: string, settings: ProfileSettings): Promise<void>;
  close(): Promise<void>;
}

/** Cap the dev/in-memory fallback; a scripted login loop must not OOM the box. */
const MAX_TRACKED_PROFILES = 10_000;

class MemoryProfileStore implements ProfileStore {
  private map = new Map<string, ProfileSettings>();

  async get(sub: string): Promise<ProfileSettings | null> {
    const found = this.map.get(sub);
    if (found) {
      // Refresh recency: Map preserves insertion order, so re-inserting moves
      // this entry to the newest position.
      this.map.delete(sub);
      this.map.set(sub, found);
    }
    return found ?? null;
  }

  async put(sub: string, settings: ProfileSettings): Promise<void> {
    this.map.delete(sub);
    this.map.set(sub, settings);
    while (this.map.size > MAX_TRACKED_PROFILES) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  async close(): Promise<void> {}
}

class PostgresProfileStore implements ProfileStore {
  constructor(private pool: Pool) {}

  async get(sub: string): Promise<ProfileSettings | null> {
    const result = await this.pool.query<{
      sensitivity: string;
      volume: string;
      crosshairColor: string;
    }>(
      `SELECT sensitivity, volume, crosshair_color AS "crosshairColor"
       FROM profiles WHERE sub = $1`,
      [sub]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      sensitivity: Number(row.sensitivity),
      volume: Number(row.volume),
      crosshairColor: row.crosshairColor,
    };
  }

  async put(sub: string, settings: ProfileSettings): Promise<void> {
    await this.pool.query(
      `INSERT INTO profiles (sub, sensitivity, volume, crosshair_color)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sub) DO UPDATE SET
         sensitivity = EXCLUDED.sensitivity,
         volume = EXCLUDED.volume,
         crosshair_color = EXCLUDED.crosshair_color,
         updated_at = now()`,
      [sub, settings.sensitivity, settings.volume, settings.crosshairColor]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createProfileStore(connectionString?: string): ProfileStore {
  if (!connectionString) return new MemoryProfileStore();
  return new PostgresProfileStore(new Pool({ connectionString }));
}