import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

/** Migration filenames, sorted lexically for deterministic ordering. */
export function migrationVersions(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""))
    .sort();
}

/**
 * Minimal versioned migration runner. Applies `*.sql` files in lexical order,
 * recording each version in `schema_migrations` so re-runs are idempotent.
 * Every migration runs in a transaction; a failure rolls back and aborts boot.
 *
 * No heavy ORM dependency is needed at this stage — two tables now, revisit
 * only if the schema grows enough to warrant one (spec 0008 §6).
 */
export async function runMigrations(
  connectionString: string,
  dir: string
): Promise<string[]> {
  const pool = new Pool({ connectionString });
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`
    );

    const appliedResult = await pool.query<{ version: string }>(
      "SELECT version FROM schema_migrations"
    );
    const applied = new Set(appliedResult.rows.map((r) => r.version));

    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const newlyApplied: string[] = [];
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) continue;

      const client = await pool.connect();
      const sql = readFileSync(join(dir, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [version]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
      newlyApplied.push(version);
    }
    return newlyApplied;
  } finally {
    await pool.end();
  }
}