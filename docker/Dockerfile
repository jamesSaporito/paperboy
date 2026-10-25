# syntax=docker/dockerfile:1

ARG NODE_VERSION=26.12.1
ARG COREPACK_VERSION=0.36.0

FROM node:${NODE_VERSION}-alpine AS base
ARG COREPACK_VERSION
ENV COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1
# libc6-compat: glibc shim some native binaries expect on Alpine.
RUN apk add --no-cache libc6-compat
# Node 25+ no longer bundles Corepack. Pre-install the pinned pnpm so the
# non-root user never downloads it at runtime.
COPY package.json /tmp/package.json
RUN npm install -g "corepack@${COREPACK_VERSION}" \
    && corepack enable pnpm \
    && corepack install -g "$(node -p 'require("/tmp/package.json").packageManager')" \
    && pnpm --version \
    && chmod -R a+rX "$COREPACK_HOME" \
    && rm /tmp/package.json
WORKDIR /app

# --- dev: source is bind-mounted; node_modules live in named volumes (see docker-compose.yml)
FROM base AS dev
# Compose starts Postgres itself; this makes @paperboy/db's db:up a no-op in here.
ENV DEV_CONTAINER=1
# Pre-create mount points owned by `node` so named volumes inherit that ownership.
RUN mkdir -p node_modules apps/backend/node_modules apps/twilio-sim/node_modules \
      packages/ai/node_modules packages/config/node_modules packages/contracts/node_modules packages/db/node_modules \
      /home/node/.local/share/pnpm \
    && chown -R node:node /app /home/node/.local
USER node
EXPOSE 3100 3101
# docker-compose.yml overrides this per service.
CMD ["sh", "-c", "pnpm install --frozen-lockfile && pnpm dev"]
