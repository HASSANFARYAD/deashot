import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";

const port = Number(process.env.PORT || 4000);

const DEV_JWT_SECRET = "deashot-dev-secret-change-me";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

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

interface ProfileSettings {
  sensitivity: number;
  volume: number;
  crosshairColor: string;
}

const DEFAULT_SETTINGS: ProfileSettings = {
  sensitivity: 1.0,
  volume: 1.0,
  crosshairColor: "#00ff00",
};

/**
 * Lightweight per-profile store (keyed by JWT `sub`). No DB dependency in MVP.
 *
 * Every guest login mints a fresh `sub`, so this grows with traffic and never
 * shrinks. Bounded with least-recently-used eviction: unbounded, a scripted
 * login loop grows it until the process runs out of memory. A real store
 * replaces this when profiles are persisted.
 */
const MAX_TRACKED_PROFILES = 10_000;
const profileSettings = new Map<string, ProfileSettings>();

function readProfile(sub: string): ProfileSettings | undefined {
  const found = profileSettings.get(sub);
  if (found) {
    // Refresh recency: Map preserves insertion order, so re-inserting moves
    // this entry to the newest position.
    profileSettings.delete(sub);
    profileSettings.set(sub, found);
  }
  return found;
}

function writeProfile(sub: string, settings: ProfileSettings): void {
  profileSettings.delete(sub);
  profileSettings.set(sub, settings);
  while (profileSettings.size > MAX_TRACKED_PROFILES) {
    const oldest = profileSettings.keys().next();
    if (oldest.done) break;
    profileSettings.delete(oldest.value);
  }
}

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
    return readProfile(sub) || DEFAULT_SETTINGS;
  });

  app.put("/profile/settings", { schema: profileSettingsSchema }, async (request) => {
    await request.jwtVerify();
    const sub = (request.user as { sub: string }).sub;
    const body = (request.body ?? {}) as Partial<ProfileSettings>;
    const current = readProfile(sub) || { ...DEFAULT_SETTINGS };
    // Ranges are enforced by the schema above; anything absent keeps its
    // current value so this stays a partial update.
    const next: ProfileSettings = {
      sensitivity: body.sensitivity ?? current.sensitivity,
      volume: body.volume ?? current.volume,
      crosshairColor: body.crosshairColor ?? current.crosshairColor,
    };
    writeProfile(sub, next);
    return next;
  });

  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`API listening on :${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
