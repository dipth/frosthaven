# syntax=docker/dockerfile:1
FROM node:24.21.0-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN npm install -g pnpm@10.34.6
WORKDIR /app

FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/data/package.json packages/data/
COPY packages/engine/package.json packages/engine/
COPY packages/ghs-core/package.json packages/ghs-core/
RUN pnpm install --frozen-lockfile
COPY . .
# Fetch pinned game data (GHS, fhtts, Worldhaven indexes) and build the SPA.
RUN pnpm data:sync && pnpm --filter @fh/web build

FROM base AS runtime
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 ASSETS_DIR=/data/assets
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
WORKDIR /app/apps/server
EXPOSE 8080
CMD ["node", "--import", "tsx", "src/main.ts"]
