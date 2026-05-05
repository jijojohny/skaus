import { FastifyInstance } from 'fastify';
import { config } from '../config';
import { fetchSolanaBalancesCached } from '../services/goldrush';

export async function analyticsRoutes(app: FastifyInstance) {
  /**
   * GET /analytics/balances/:address
   *
   * Returns SPL token balances for a Solana wallet address, enriched with
   * current USD pricing via GoldRush. Queries mainnet data regardless of the
   * configured Solana cluster (GoldRush only indexes mainnet).
   *
   * Requires GOLDRUSH_API_KEY env var. Returns empty array when key is absent.
   */
  app.get<{ Params: { address: string } }>(
    '/balances/:address',
    async (request, reply) => {
      const { address } = request.params;

      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        return reply.status(400).send({ error: 'Invalid Solana address' });
      }

      if (!config.goldrushApiKey) {
        return reply.send({ balances: [], note: 'GOLDRUSH_API_KEY not configured' });
      }

      try {
        const balances = await fetchSolanaBalancesCached(address, config.goldrushApiKey);
        return reply.send({ balances });
      } catch (err: any) {
        app.log.warn({ err }, 'GoldRush balance fetch failed');
        return reply.send({ balances: [], error: err.message });
      }
    },
  );
}
