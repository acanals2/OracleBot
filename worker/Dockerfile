# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# Oracle Bot worker — multi-stage build
#
# Why bookworm-slim and not alpine: Playwright bundles Chromium which links
# against glibc; alpine's musl breaks it. bookworm-slim is the smallest glibc
# base that still has apt for system deps.
# ─────────────────────────────────────────────────────────────────────────────

# ── deps ───────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

# ── build (TypeScript → dist/) ────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── runtime ───────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# System packages: curl for HEALTHCHECK, ca-certs for TLS to Neon/Anthropic,
# tini as PID 1 so SIGTERM forwards correctly to the Node process.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

# Playwright system deps + Chromium browser binary. Pinning the version keeps
# the install layer deterministic and cache-friendly across rebuilds.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx -y playwright@1.59.1 install-deps chromium \
 && npx -y playwright@1.59.1 install chromium

COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Non-root user; chown the Playwright cache so it's readable post-USER-switch.
RUN groupadd -r app \
 && useradd -r -g app -m -d /home/app app \
 && chown -R app:app /ms-playwright /app
USER app

ENV NODE_ENV=production
# Local-only fallback. Railway/Vercel/Fly all inject their own PORT which the
# worker prefers; this default only matters if you run the image bare.
ENV PORT_HEALTH=8080
EXPOSE 8080

# Container-level healthcheck. Honours $PORT (Railway), falls back to 8080.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT:-8080}/readyz" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
