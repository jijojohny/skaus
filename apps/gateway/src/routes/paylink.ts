import { FastifyInstance } from 'fastify';
import { Connection } from '@solana/web3.js';
import { config } from '../config';
import { resolveUsername, ResolvedName } from '../services/name-resolver';

let connection: Connection;

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(config.solana.rpcUrl, 'confirmed');
  }
  return connection;
}

export async function payLinkRoutes(app: FastifyInstance) {
  /**
   * GET /pay/:username
   *
   * Resolve a pay link to the recipient's stealth meta-address and pool config.
   * Queries the on-chain name registry, with mock fallback for localnet.
   */
  app.get<{ Params: { username: string }; Querystring: { amount?: string; token?: string } }>(
    '/:username',
    async (request, reply) => {
      const { username } = request.params;
      const { amount, token } = request.query;

      app.log.info({ username, amount, token }, 'Pay link resolution');

      const resolved = await resolveUsername(getConnection(), username);

      if (!resolved) {
        return reply.status(404).send({ error: 'Username not found' });
      }

      if (resolved.status !== 'active') {
        return reply.status(403).send({ error: `Name is ${resolved.status}` });
      }

      return reply.send({
        version: 1,
        username,
        recipientMetaAddress: {
          scanPubkey: resolved.stealthMetaAddress.scanPubkey,
          spendPubkey: resolved.stealthMetaAddress.spendPubkey,
          version: resolved.stealthMetaAddress.version,
        },
        pool: config.solana.stealthPoolProgramId,
        network: config.solana.cluster,
        amount: amount ? BigInt(amount).toString() : null,
        token: token || 'USDC',
        payUrl: `https://skaus.pay/${username}`,
        profileCid: resolved.profileCid,
        depositIndex: resolved.depositIndex,
      });
    }
  );

  /**
   * POST /pay/link
   *
   * Generate a pay link with custom parameters.
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

    const resolved = await resolveUsername(getConnection(), username);

    const payLink = {
      url: buildPayUrl(username, amount, token),
      qrData: JSON.stringify({
        v: 1,
        recipient_meta_address: resolved?.stealthMetaAddress ?? 'pending_resolution',
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

function buildPayUrl(username: string, amount?: string, token?: string): string {
  const params = new URLSearchParams();
  if (amount) params.set('amount', amount);
  if (token) params.set('token', token);
  const qs = params.toString();
  return `https://skaus.pay/${username}${qs ? `?${qs}` : ''}`;
}
