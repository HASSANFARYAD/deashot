# ---- Build ----
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.app.json tsconfig.pkg.json tsconfig.base.json ./
COPY scripts ./scripts
COPY packages ./packages
COPY apps/game-server ./apps/game-server

RUN pnpm install --frozen-lockfile --prefer-offline
RUN pnpm --filter game-server... build

# ---- Runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable
COPY --from=build /app/apps/game-server/dist ./apps/game-server/dist
COPY --from=build /app/apps/game-server/package.json ./apps/game-server/package.json
COPY --from=build /app/apps/game-server/node_modules ./apps/game-server/node_modules
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

RUN addgroup -S app && adduser -S app -G app
USER app

WORKDIR /app/apps/game-server
EXPOSE 2567
CMD ["node", "dist/index.js"]
