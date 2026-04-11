import { FastifyInstance } from 'fastify';
import { NameIndexer } from '../services/name-indexer';
import { config } from '../config';

let nameIndexer: NameIndexer | null = null;

function getNameIndexer(): NameIndexer {
  if (!nameIndexer) {
    nameIndexer = new NameIndexer({
      rpcUrl: config.solana.rpcUrl,
      programId: config.solana.nameRegistryProgramId,
      pollIntervalMs: 10000,
    });
    nameIndexer.start().catch(() => {});
  }
  return nameIndexer;
}

export async function webhookRoutes(app: FastifyInstance) {
  /**
   * POST /webhooks/name-registry
   *
   * Helius webhook endpoint for NameRecord account changes.
   */
  app.post('/name-registry', async (request, reply) => {
    const events = request.body as any[];

    if (!Array.isArray(events)) {
      return reply.status(400).send({ error: 'Expected array of events' });
    }

    const indexer = getNameIndexer();
    let processed = 0;

    for (const event of events) {
      try {
        await indexer.handleWebhookEvent(event);
        processed++;
      } catch {
        // Skip malformed events
      }
    }

    return reply.send({ processed, total: events.length });
  });

  /**
   * GET /webhooks/name-registry/stats
   */
  app.get('/name-registry/stats', async (_request, reply) => {
    const indexer = getNameIndexer();
    return reply.send({
      totalNames: await indexer.getNameCount(),
      names: await indexer.getAllNames(),
    });
  });
}
