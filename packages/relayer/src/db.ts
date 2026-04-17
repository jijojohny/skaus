import { PrismaClient } from '../generated';

// Singleton pattern — reuse connection across hot-reloads in dev
const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Ensure the DATABASE_URL includes a connection_limit parameter so the Prisma
 * connection pool is large enough to handle the queue processor's concurrent
 * polling load.  If the env var already contains connection_limit (e.g. set
 * explicitly in Railway), that value takes precedence and we leave it alone.
 */
function buildDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  if (raw.includes('connection_limit=')) return raw;
  const separator = raw.includes('?') ? '&' : '?';
  return `${raw}${separator}connection_limit=50`;
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
    datasources: {
      db: { url: buildDatabaseUrl() },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
