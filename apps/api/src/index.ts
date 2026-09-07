import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import * as Sentry from "@sentry/node";
import { join } from "node:path";
import { createProfileStore, type ProfileSettings } from "./db";
import { runMigrations } from "./migrate";

const port = Number(process.env.PORT || 4000);

const DEV_JWT_SECRET = "deashot-dev-secret-change-me";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DATABASE_URL = process.env.DATABASE_URL;
const SENTRY_DSN = process.env.SENTRY_DSN;

/**
 * Must match the game server's secret — it verifies the tokens signed here.
 * The development fallback is a literal published in this repository, so a
 * production deploy using it would accept tokens forged by anyone.
 */
const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (IS_PRODUCTION) {
    throw new Error(
      "JWT_SECRET is required when NODE_ENV=production. Refusing to start with " +
        "the development fallback, which is public in this repository."
    );
  }
  return DEV_JWT_SECRET;
})();

/** Guest tokens are disposable identities, not long-lived credentials. */
const GUEST_TOKEN_TTL = "12h";

const DEFAULT_SETTINGS: ProfileSettings = {
  sensitivity: 1.0,
  volume: 1.0,
  crosshairColor: "#00ff00",
};

/**
 * Profile store resolved once at boot. When `DATABASE_URL` is present the
 * store is Postgres-backed (via `db.ts`); otherwise a bounded in-memory LRU
 * keeps dev/test/integration wiring simple.
 */
const profileStore = createProfileStore(DATABASE_URL);

/** Relative to dist/ at runtime (tsc resolves __dirname as cwd). */
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

/**
 * Usernames are shown to every other player in the kill feed and scoreboard,
 * and are carried in the JWT the game server trusts for identity. The client
 * caps length at 16 characters, but the client is not a trust boundary.
 */
const USERNAME_PATTERN = "^[A-Za-z0-9_-]{3,16}$";

const guestLoginSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      username: { type: "string", pattern: USERNAME_PATTERN },
    },
  },
} as const;

const profileSettingsSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      sensitivity: { type: "number", minimum: 0, maximum: 5 },
      volume: { type: "number", minimum: 0, maximum: 1 },
      crosshairColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
    },
  },
} as const;

async function main() {
  // Opt-in error reporting: only active when SENTRY_DSN is configured.
  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: IS_PRODUCTION ? "production" : "development",
      tracesSampleRate: 0,
    });
    Sentry.setTag("service", "api");
  }

  const app = Fastify({ logger: true });

  // Browsers are the only intended caller. ALLOWED_ORIGINS restricts this to
  // the deployed web origin(s); reflecting any origin is a development
  // convenience, not a production posture.
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  await app.register(cors, {
    origin: allowedOrigins.length > 0 ? allowedOrigins : !IS_PRODUCTION,
  });

  await app.register(jwt, { secret: JWT_SECRET });

  // /auth/guest is unauthenticated and mints a token plus a profile slot on
  // every call, so it is the obvious lever for exhausting memory. The bound on
  // the profile store is what actually caps memory; this is defence in depth
  // against the flood itself.
  //
  // Limits are per-IP, and players can share one (offices, schools, mobile
  // carriers), so they are deliberately loose enough that a room's worth of
  // real players behind a single NAT never trips them.
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
  });

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  // Guest login: issue a JWT with a per-session profile id (sub) + username.
  app.post(
    "/auth/guest",
    {
      schema: guestLoginSchema,
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request) => {
      const body = request.body as { username?: string } | undefined;
      const username = body?.username || `player${Math.floor(Math.random() * 100000)}`;
      const sub = `guest-${Math.floor(Math.random() * 1e9)}`;
      const token = app.jwt.sign(
        { username, guest: true, sub },
        { expiresIn: GUEST_TOKEN_TTL }
      );
      return { token, username, sub };
    }
  );

  // Authenticated profile settings (guarded by the guest JWT).
  app.get("/profile/settings", async (request) => {
    await request.jwtVerify();
    const sub = (request.user as { sub: string }).sub;
    return (await profileStore.get(sub)) ?? DEFAULT_SETTINGS;
  });

  app.put("/profile/settings", { schema: profileSettingsSchema }, async (request) => {
    await request.jwtVerify();
    const sub = (request.user as { sub: string }).sub;
    const body = (request.body ?? {}) as Partial<ProfileSettings>;
    const current = (await profileStore.get(sub)) ?? { ...DEFAULT_SETTINGS };
    // Ranges are enforced by the schema above; anything absent keeps its
    // current value so this stays a partial update.
    const next: ProfileSettings = {
      sensitivity: body.sensitivity ?? current.sensitivity,
      volume: body.volume ?? current.volume,
      crosshairColor: body.crosshairColor ?? current.crosshairColor,
    };
    await profileStore.put(sub, next);
    return next;
  });

  // Run pending database migrations once at boot before accepting traffic.
  if (DATABASE_URL) {
    try {
      const applied = await runMigrations(DATABASE_URL, MIGRATIONS_DIR);
      app.log.info(
        `[db] migrations applied: ${applied.length ? applied.join(", ") : "none"}`
      );
    } catch (err) {
      app.log.error(err, "[db] migration failed — aborting");
      await profileStore.close();
      throw err;
    }
  }

  // Graceful shutdown: close the store (Postgres pool, if present).
  const shutdown = async () => {
    await profileStore.close();
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`API listening on :${port}`);
}

main().catch((err) => {
  if (SENTRY_DSN) Sentry.captureException(err);
  console.error(err);
  process.exit(1);
});
