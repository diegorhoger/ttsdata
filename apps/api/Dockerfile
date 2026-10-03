# TTSData API — production image
#
# Builds from the monorepo root so pnpm workspace dependencies resolve:
#   docker build -f apps/api/Dockerfile -t ttsdata-api .
#
# The runtime stage carries only the compiled artifact and production
# dependencies. Secrets are NEVER baked in; they are provided at runtime.

# ---------------------------------------------------------------- build stage
FROM node:20-alpine AS build

WORKDIR /repo

# pnpm via corepack, pinned to the repository's packageManager field.
RUN corepack enable && corepack prepare pnpm@9.0.6 --activate

# Manifests first so dependency installation is cached independently of source.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/data-quality/package.json packages/data-quality/
COPY packages/security/package.json packages/security/
COPY packages/ui/package.json packages/ui/

RUN pnpm install --frozen-lockfile

# Source required for the API and its workspace dependencies.
# NOTE: there is no root tsconfig.json in this repository — each workspace
# package carries its own. Copying a nonexistent path would fail the build.
COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY packages/data-quality packages/data-quality

# Reproducible production build: workspace deps compile first, then the API.
RUN pnpm --filter @ttsdata/api build:production

# -------------------------------------------------------------- runtime stage
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.0.6 --activate

# Production dependencies only.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/data-quality/package.json packages/data-quality/

RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
    && pnpm store prune

# Compiled output.
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/packages/db/dist packages/db/dist
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/data-quality/dist packages/data-quality/dist

# Migration SQL ships with the image. The migrator itself is compiled
# JavaScript in packages/db/dist, so the runtime stage needs no TypeScript
# tooling: `tsx` is a devDependency and is pruned by --prod, which would make a
# `tsx`-based migration command unrunnable inside this image.
COPY --from=build /repo/packages/db/drizzle packages/db/drizzle
COPY --from=build /repo/packages/db/package.json packages/db/package.json

# Fail the build if the production migration entrypoint is missing. This keeps
# the documented migration command honest: the image must be able to run it.
RUN test -f packages/db/dist/src/migrate.js \
    || (echo "FATAL: packages/db/dist/src/migrate.js missing — the documented production migration command would not run" && exit 1)

# Run unprivileged.
USER node

WORKDIR /repo/apps/api

# The service binds HOST/PORT; 0.0.0.0 is required inside a container.
ENV HOST=0.0.0.0
ENV PORT=4000
EXPOSE 4000

# Readiness is the database-backed health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# SIGTERM is forwarded so the server's graceful shutdown runs.
STOPSIGNAL SIGTERM
CMD ["node", "dist/server.js"]
