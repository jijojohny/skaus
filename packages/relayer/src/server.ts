import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import pino from 'pino';
import { config } from './config';
import { WithdrawExecutor } from './executor';
import { QueueProcessor } from './queue';
import { jobRoutes } from './routes/jobs';
import { prisma } from './db';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

// ---------------------------------------------------------------------------
// Build server
// ---------------------------------------------------------------------------

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // CORS
  await fastify.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // Rate limiting — 120 requests per minute per IP
  await fastify.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, context) => ({
      error: 'Too Many Requests',
      message: `Rate limit exceeded — retry after ${context.after}`,
    }),
  });

  // Build executor + processor
  let executor: WithdrawExecutor;
  try {
    executor = new WithdrawExecutor();
  } catch (err) {
    logger.warn({ err }, 'WithdrawExecutor could not be initialised — relayer will accept jobs but not process them');
    // Create a stub executor that always throws so queue stays pending
    executor = { execute: async () => { throw new Error('Relayer not configured'); } } as unknown as WithdrawExecutor;
  }

  const processor = new QueueProcessor(executor);

  // Register routes with processor injected
  await fastify.register(jobRoutes, { processor } as Parameters<typeof jobRoutes>[1]);

  // Health probe (used by load balancers / Railway)
  fastify.get('/health', async (_req, reply) => {
    return reply.send({ ok: true, ts: Date.now() });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    processor.stop();
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  return { fastify, processor };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const { fastify, processor } = await buildServer();

  // Ensure DB is reachable before starting
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to database');
    process.exit(1);
  }

  await fastify.listen({ port: config.port, host: '0.0.0.0' });
  logger.info({ port: config.port }, 'Relayer HTTP server listening');

  // Start background job processor
  processor.start();
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
