import { FastifyInstance } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import { RelayService } from '../services/relay';
import { config } from '../config';

const relayRequestSchema = {
  type: 'object',
  required: ['proof', 'publicInputs', 'tokenMint'],
  properties: {
    proof: { type: 'string' },
    tokenMint: { type: 'string' },
    publicInputs: {
      type: 'object',
      required: ['merkleRoot', 'nullifierHash', 'recipient', 'amount', 'fee'],
      properties: {
        merkleRoot: { type: 'string' },
        nullifierHash: { type: 'string' },
        recipient: { type: 'string' },
        amount: { type: 'string' },
        fee: { type: 'string' },
      },
    },
  },
} as const;

export async function relayRoutes(app: FastifyInstance) {
  const relayService = new RelayService(config);

  app.post<{
    Body: {
      proof: string;
      tokenMint: string;
      publicInputs: {
        merkleRoot: string;
        nullifierHash: string;
        recipient: string;
        amount: string;
        fee: string;
      };
    };
  }>('/withdraw', {
    schema: { body: relayRequestSchema },
    handler: async (request, reply) => {
      const { proof, publicInputs, tokenMint } = request.body;

      app.log.info(
        { nullifierHash: publicInputs.nullifierHash.slice(0, 16) + '...' },
        'Withdrawal relay request received'
      );

      try {
        const mint = new PublicKey(tokenMint);
        const result = await relayService.submitWithdrawal(proof, publicInputs, mint);
        return reply.send(result);
      } catch (err: any) {
        app.log.error({ err }, 'Relay withdrawal failed');
        return reply.status(400).send({
          error: err.message || 'Withdrawal relay failed',
        });
      }
    },
  });

  app.get('/status', async (_request, reply) => {
    const status = relayService.getStatus();
    return reply.send(status);
  });
}
