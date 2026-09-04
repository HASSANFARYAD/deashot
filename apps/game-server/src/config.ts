/**
 * Game server runtime configuration, resolved once at boot.
 *
 * Anything that weakens the server's trust boundary is opt-in and refuses to
 * stay silent in production: a misconfigured deploy should fail loudly at
 * startup rather than quietly accept forged tokens or client-tuned matches.
 */

const DEV_JWT_SECRET = "deashot-dev-secret-change-me";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Shared with the API, which signs the guest tokens this server verifies.
 * In production the fallback is refused outright — it is a literal published
 * in this repository, so a deploy using it accepts tokens forged by anyone.
 */
export const JWT_SECRET: string = (() => {
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

/**
 * When set, a client that supplies no auth token is rejected instead of being
 * given a generated guest identity. Defaults on in production.
 *
 * Spec 0007 section 2 requires that missing tokens do not join; the generated
 * identity exists so the integration harness and `pnpm dev:server` work
 * without the API running.
 */
export const REQUIRE_AUTH =
  process.env.REQUIRE_AUTH === "1" ||
  (IS_PRODUCTION && process.env.REQUIRE_AUTH !== "0");

/**
 * When set, `joinOrCreate` options may override match tuning (kill limit,
 * duration, warmup thresholds). These exist for deterministic integration
 * tests. Left enabled in production, any client could open a room with
 * `killLimit: 1` and win a match with a single kill, so it is off unless
 * explicitly requested and always off in production.
 */
export const ALLOW_TEST_ROOM_OPTIONS =
  !IS_PRODUCTION && process.env.ALLOW_TEST_ROOM_OPTIONS === "1";

/** Log the resolved posture once, so a running server is self-describing. */
export function logStartupConfig(): void {
  console.log(
    `[config] production=${IS_PRODUCTION} requireAuth=${REQUIRE_AUTH} ` +
      `testRoomOptions=${ALLOW_TEST_ROOM_OPTIONS} ` +
      `jwtSecret=${process.env.JWT_SECRET ? "from env" : "development fallback"}`
  );
}
