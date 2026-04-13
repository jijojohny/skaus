# Build with context = this directory (e.g. `docker build -f packages/relayer/Dockerfile packages/relayer`).
# Required when Railway (or similar) sets the service root to `packages/relayer` — then paths like
# `COPY packages/relayer/` from infra/docker are invalid because that folder is not in the build context.
FROM node:18-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN pnpm install --no-frozen-lockfile
RUN pnpm exec prisma generate
RUN pnpm exec tsc

FROM node:18-alpine AS runner

WORKDIR /app
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/dist ./dist

RUN pnpm install --prod --no-frozen-lockfile

EXPOSE 3002

CMD ["sh", "-c", "cd /app && npx -y prisma migrate deploy && node dist/server.js"]
