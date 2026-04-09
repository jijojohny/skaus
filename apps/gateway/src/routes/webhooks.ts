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
    nameIndexer.start();
  }
  return nameIndexer;
}

export async function webhookRoutes(app: FastifyInstance) {
  /**
   * POST /webhooks/name-registry
   *
   * Helius webhook endpoint for NameRecord account changes.
   * In production, Helius sends events when on-chain accounts are
   * created or updated. For local dev, the NameIndexer uses polling.
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
        indexer.handleWebhookEvent(event);
        processed++;
      } catch {
        // Skip malformed events
      }
    }

    return reply.send({ processed, total: events.length });
  });

  /**
   * GET /webhooks/name-registry/stats
   *
   * Returns indexer statistics.
   */
  app.get('/name-registry/stats', async (_request, reply) => {
    const indexer = getNameIndexer();
    return reply.send({
      totalNames: indexer.getNameCount(),
      names: indexer.getAllNames(),
    });
  });
}
