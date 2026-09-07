# ---- Build ----
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.app.json tsconfig.pkg.json tsconfig.base.json ./
COPY scripts ./scripts
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile --prefer-offline
ARG VITE_API_URL=/api
ARG VITE_SERVER_URL=ws://localhost/ws
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN pnpm --filter web... build

# ---- Serve (Nginx) ----
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
