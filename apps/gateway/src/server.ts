import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { relayRoutes } from './routes/relay';
import { payLinkRoutes } from './routes/paylink';
import { healthRoutes } from './routes/health';
import { indexerRoutes } from './routes/indexer';
import { nameRoutes } from './routes/names';
import { requestRoutes } from './routes/requests';
import { webhookRoutes } from './routes/webhooks';
import { profileRoutes } from './routes/profiles';
import { config } from './config';
import { prisma } from './db';

async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: config.nodeEnv === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
    },
  });

  await app.register(cors, {
    origin: config.corsOrigins.length === 1 && config.corsOrigins[0] === '*' ? true : config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(healthRoutes, { prefix: '/' });
  await app.register(relayRoutes, { prefix: '/relay' });
  await app.register(payLinkRoutes, { prefix: '/pay' });
  await app.register(indexerRoutes, { prefix: '/indexer' });
  await app.register(nameRoutes, { prefix: '/names' });
  await app.register(requestRoutes, { prefix: '/requests' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(profileRoutes, { prefix: '/profiles' });

  return app;
}

async function main() {
  const app = await buildServer();

  // Connect to PostgreSQL before accepting requests
  await prisma.$connect();
  app.log.info('PostgreSQL connected');

  // Initialise indexers (restores polling cursors from DB)
  const { DepositIndexer, buildHeliusGeyserUrl } = await import('./services/indexer');
  const { NameIndexer } = await import('./services/name-indexer');

  const geyserWsUrl = buildHeliusGeyserUrl(
    config.helius.apiKey,
    config.solana.cluster,
    config.helius.wsUrl,
  );

  const depositIndexer = new DepositIndexer({
    rpcUrl: config.solana.rpcUrl,
    programId: config.solana.stealthPoolProgramId,
    geyserWsUrl: geyserWsUrl || undefined,
  });
  await depositIndexer.start();
  app.log.info(
    geyserWsUrl
      ? 'Deposit indexer started (Helius Geyser + polling)'
      : 'Deposit indexer started (polling only — set HELIUS_API_KEY for real-time)',
  );

  const nameIndexer = new NameIndexer({
    rpcUrl: config.solana.rpcUrl,
    programId: config.solana.nameRegistryProgramId,
  });
  await nameIndexer.start();
  app.log.info('Name indexer started');

  // Graceful shutdown
  const shutdown = async () => {
    depositIndexer.stop();
    nameIndexer.stop();
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`SKAUS Gateway running on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();

export { buildServer };
