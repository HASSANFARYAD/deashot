import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";

const port = Number(process.env.PORT || 4000);

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

/** Lightweight per-profile store (keyed by JWT `sub`). No DB dependency in MVP. */
const profileSettings = new Map<string, ProfileSettings>();

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET || "deashot-dev-secret-change-me",
  });

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  // Guest login: issue a JWT with a persistent profile id (sub) + username.
  app.post("/auth/guest", async (request, _reply) => {
    const username =
      (request.body as any)?.username || `player${Math.floor(Math.random() * 100000)}`;
    const sub = `guest-${Math.floor(Math.random() * 1e9)}`;
    const token = app.jwt.sign({ username, guest: true, sub });
    return { token, username, sub };
  });

  // Authenticated profile settings (guarded by the guest JWT).
  app.get("/profile/settings", async (request) => {
    await request.jwtVerify();
    const sub = (request.user as any).sub as string;
    return profileSettings.get(sub) || DEFAULT_SETTINGS;
  });

  app.put("/profile/settings", async (request) => {
    await request.jwtVerify();
    const sub = (request.user as any).sub as string;
    const body = (request.body ?? {}) as Partial<ProfileSettings>;
    const current = profileSettings.get(sub) || { ...DEFAULT_SETTINGS };
    const next: ProfileSettings = {
      sensitivity:
        typeof body.sensitivity === "number" && body.sensitivity >= 0 && body.sensitivity <= 5
          ? body.sensitivity
          : current.sensitivity,
      volume:
        typeof body.volume === "number" && body.volume >= 0 && body.volume <= 1
          ? body.volume
          : current.volume,
      crosshairColor:
        typeof body.crosshairColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.crosshairColor)
          ? body.crosshairColor
          : current.crosshairColor,
    };
    profileSettings.set(sub, next);
    return next;
  });

  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`API listening on :${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
