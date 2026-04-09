import { FastifyInstance } from 'fastify';
import { DepositIndexer } from '../services/indexer';
import { config } from '../config';

let indexer: DepositIndexer | null = null;

function getIndexer(): DepositIndexer {
  if (!indexer) {
    indexer = new DepositIndexer({
      rpcUrl: config.solana.rpcUrl,
      programId: config.solana.stealthPoolProgramId,
      pollIntervalMs: 5000,
    });
    indexer.start();
  }
  return indexer;
}

export async function indexerRoutes(app: FastifyInstance) {
  app.get('/deposits', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          pool: { type: 'string' },
          since: { type: 'number' },
        },
      },
    },
    handler: async (request, reply) => {
      const { pool, since } = request.query as { pool?: string; since?: number };
      const idx = getIndexer();

      const deposits = pool
        ? idx.getDepositsByPool(pool, since)
        : idx.getDeposits(since);

      return reply.send({
        count: deposits.length,
        deposits,
      });
    },
  });

  app.get('/deposits/count', {
    handler: async (_request, reply) => {
      return reply.send({ count: getIndexer().getDepositCount() });
    },
  });
}
