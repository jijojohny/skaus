import { FastifyInstance } from 'fastify';
import { config } from '../config';

export async function payLinkRoutes(app: FastifyInstance) {
  /**
   * GET /pay/:username
   *
   * Resolve a pay link to the recipient's stealth meta-address and pool config.
   * In production, this queries the on-chain name registry (Plan B).
   * For MVP, we use a simple in-memory mapping.
   */
  app.get<{ Params: { username: string }; Querystring: { amount?: string; token?: string } }>(
    '/:username',
    async (request, reply) => {
      const { username } = request.params;
      const { amount, token } = request.query;

      app.log.info({ username, amount, token }, 'Pay link resolution');

      // MVP: In-memory lookup. Production: on-chain NameRegistry query.
      const recipient = await resolveUsername(username);

      if (!recipient) {
        return reply.status(404).send({ error: 'Username not found' });
      }

      return reply.send({
        version: 1,
        username,
        recipientMetaAddress: recipient.metaAddress,
        pool: config.solana.stealthPoolProgramId,
        network: config.solana.cluster,
        amount: amount ? BigInt(amount).toString() : null,
        token: token || 'USDC',
        payUrl: `https://skaus.pay/${username}`,
      });
    }
  );

  /**
   * POST /pay/link
   *
   * Generate a new pay link with custom parameters.
   */
  app.post<{
    Body: {
      username: string;
      amount?: string;
      token?: string;
      memo?: string;
    };
  }>('/link', async (request, reply) => {
    const { username, amount, token, memo } = request.body;

    const payLink = {
      url: `https://skaus.pay/${username}${amount ? `?amount=${amount}` : ''}${token ? `&token=${token}` : ''}`,
      qrData: JSON.stringify({
        v: 1,
        recipient_meta_address: 'pending_resolution',
        pool: config.solana.stealthPoolProgramId,
        network: config.solana.cluster,
        amount: amount || null,
        token: token || 'USDC',
        memo_encrypted: memo ? Buffer.from(memo).toString('base64') : null,
      }),
    };

    return reply.send(payLink);
  });
}

interface RecipientRecord {
  metaAddress: string;
  scanPubkey: string;
  spendPubkey: string;
}

async function resolveUsername(username: string): Promise<RecipientRecord | null> {
  // MVP placeholder — in production this queries the on-chain NameRegistry program
  // and fetches the stealth meta-address from the PDA
  const mockRegistry: Record<string, RecipientRecord> = {
    alice: {
      metaAddress: 'mock_stealth_meta_address_alice',
      scanPubkey: 'mock_scan_pubkey_alice',
      spendPubkey: 'mock_spend_pubkey_alice',
    },
    bob: {
      metaAddress: 'mock_stealth_meta_address_bob',
      scanPubkey: 'mock_scan_pubkey_bob',
      spendPubkey: 'mock_spend_pubkey_bob',
    },
  };

  return mockRegistry[username.toLowerCase()] || null;
}
