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
    origin: config.corsOrigins,
    methods: ['GET', 'POST'],
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

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`SKAUS Gateway running on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

export { buildServer };
