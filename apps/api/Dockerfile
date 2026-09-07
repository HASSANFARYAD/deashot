# ---- Build ----
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.app.json tsconfig.pkg.json tsconfig.base.json ./
COPY scripts ./scripts
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile --prefer-offline
RUN pnpm --filter api... build

# ---- Runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/migrations ./apps/api/migrations
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

RUN addgroup -S app && adduser -S app -G app
USER app

WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
