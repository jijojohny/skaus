# Build with context = this directory (e.g. `docker build -f packages/relayer/Dockerfile packages/relayer`).
# Required when Railway (or similar) sets the service root to `packages/relayer` — then paths like
# `COPY packages/relayer/` from infra/docker are invalid because that folder is not in the build context.
#
# Use Debian slim (glibc) so Prisma engines and bigint-buffer native bindings match the runtime.
FROM node:20-bookworm-slim AS builder

WORKDIR /app
ENV NODE_ENV=development
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json tsconfig.json .npmrc ./
COPY prisma ./prisma
COPY src ./src

RUN pnpm install --no-frozen-lockfile
RUN pnpm exec prisma generate
RUN pnpm exec tsc

FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=builder /app/package.json ./
COPY --from=builder /app/.npmrc ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/dist ./dist

RUN pnpm install --prod --no-frozen-lockfile

EXPOSE 3002

# Use the Prisma version from package.json — never `npx -y prisma` (pulls latest CLI and breaks the client).
CMD ["sh", "-c", "cd /app && pnpm exec prisma migrate deploy && node dist/server.js"]
