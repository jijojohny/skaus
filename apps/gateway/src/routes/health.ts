import { FastifyInstance } from 'fastify';
import { Connection } from '@solana/web3.js';
import { config } from '../config';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_request, reply) => {
    const connection = new Connection(config.solana.rpcUrl);

    try {
      const slot = await connection.getSlot();
      return reply.send({
        status: 'ok',
        version: '0.1.0',
        cluster: config.solana.cluster,
        slot,
        timestamp: Date.now(),
      });
    } catch {
      return reply.status(503).send({
        status: 'degraded',
        error: 'Cannot reach Solana RPC',
        timestamp: Date.now(),
      });
    }
  });
}
