import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";

const port = Number(process.env.PORT || 4000);

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET || "deashot-dev-secret-change-me",
  });

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  // Guest login: issue a JWT with a random username
  app.post("/auth/guest", async (request, _reply) => {
    const username =
      (request.body as any)?.username || `player${Math.floor(Math.random() * 100000)}`;
    const token = app.jwt.sign({ username, guest: true });
    return { token, username };
  });

  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`API listening on :${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
