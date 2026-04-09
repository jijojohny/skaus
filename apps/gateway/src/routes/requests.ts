import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { config } from '../config';

interface StoredRequest {
  id: string;
  creator: string;
  amount: number;
  token: string;
  memo: string;
  expiresAt: number | null;
  maxPayments: number;
  depositPathIndex: number;
  status: 'pending' | 'partial' | 'paid' | 'expired' | 'cancelled';
  payments: Array<{ txSignature: string; amount: number; paidAt: number }>;
  createdAt: number;
  updatedAt: number;
}

/**
 * In-memory store for payment requests.
 * Production: encrypted PostgreSQL (see Plan B § 4.4).
 */
const requestStore = new Map<string, StoredRequest>();
const requestsByCreator = new Map<string, Set<string>>();

export async function requestRoutes(app: FastifyInstance) {
  /**
   * POST /requests
   *
   * Create a new payment request.
   */
  app.post<{
    Body: {
      creator: string;
      amount: number;
      token?: string;
      memo?: string;
      expiresAt?: number;
      maxPayments?: number;
      depositPathIndex: number;
    };
  }>('/', async (request, reply) => {
    const { creator, amount, token, memo, expiresAt, maxPayments, depositPathIndex } = request.body;

    if (!creator || !amount || depositPathIndex === undefined) {
      return reply.status(400).send({ error: 'Missing required fields: creator, amount, depositPathIndex' });
    }

    const id = randomUUID();
    const now = Date.now();

    const stored: StoredRequest = {
      id,
      creator,
      amount,
      token: token || 'USDC',
      memo: memo || '',
      expiresAt: expiresAt || null,
      maxPayments: maxPayments || 1,
      depositPathIndex,
      status: 'pending',
      payments: [],
      createdAt: now,
      updatedAt: now,
    };

    requestStore.set(id, stored);
    if (!requestsByCreator.has(creator)) {
      requestsByCreator.set(creator, new Set());
    }
    requestsByCreator.get(creator)!.add(id);

    const payUrl = buildRequestUrl(creator, id, amount, stored.token, stored.memo, expiresAt);

    return reply.status(201).send({
      ...stored,
      payUrl,
    });
  });

  /**
   * GET /requests/:id
   *
   * Get a payment request by ID.
   */
  app.get<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      const stored = requestStore.get(request.params.id);

      if (!stored) {
        return reply.status(404).send({ error: 'Payment request not found' });
      }

      checkExpiry(stored);

      return reply.send(stored);
    },
  );

  /**
   * GET /requests/by-creator/:creator
   *
   * List payment requests for a creator.
   */
  app.get<{ Params: { creator: string }; Querystring: { status?: string } }>(
    '/by-creator/:creator',
    async (request, reply) => {
      const { creator } = request.params;
      const { status } = request.query;

      const ids = requestsByCreator.get(creator);
      if (!ids || ids.size === 0) {
        return reply.send({ requests: [] });
      }

      let requests = Array.from(ids)
        .map(id => requestStore.get(id)!)
        .filter(Boolean);

      requests.forEach(checkExpiry);

      if (status) {
        requests = requests.filter(r => r.status === status);
      }

      requests.sort((a, b) => b.createdAt - a.createdAt);

      return reply.send({ requests });
    },
  );

  /**
   * POST /requests/:id/cancel
   *
   * Cancel a pending payment request.
   */
  app.post<{ Params: { id: string }; Body: { creator: string } }>(
    '/:id/cancel',
    async (request, reply) => {
      const stored = requestStore.get(request.params.id);

      if (!stored) {
        return reply.status(404).send({ error: 'Payment request not found' });
      }

      if (stored.creator !== request.body.creator) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      if (stored.status !== 'pending' && stored.status !== 'partial') {
        return reply.status(400).send({ error: `Cannot cancel request with status: ${stored.status}` });
      }

      stored.status = 'cancelled';
      stored.updatedAt = Date.now();

      return reply.send(stored);
    },
  );

  /**
   * POST /requests/:id/payment
   *
   * Record a payment against a request (called by indexer or client).
   */
  app.post<{
    Params: { id: string };
    Body: { txSignature: string; amount: number };
  }>(
    '/:id/payment',
    async (request, reply) => {
      const stored = requestStore.get(request.params.id);

      if (!stored) {
        return reply.status(404).send({ error: 'Payment request not found' });
      }

      checkExpiry(stored);

      if (stored.status === 'expired' || stored.status === 'cancelled') {
        return reply.status(400).send({ error: `Request is ${stored.status}` });
      }

      const { txSignature, amount } = request.body;

      stored.payments.push({
        txSignature,
        amount,
        paidAt: Date.now(),
      });

      const totalPaid = stored.payments.reduce((sum, p) => sum + p.amount, 0);

      if (totalPaid >= stored.amount) {
        stored.status = 'paid';
      } else if (totalPaid > 0) {
        stored.status = 'partial';
      }

      if (stored.payments.length >= stored.maxPayments && stored.status !== 'paid') {
        stored.status = 'paid';
      }

      stored.updatedAt = Date.now();

      return reply.send(stored);
    },
  );
}

function checkExpiry(req: StoredRequest) {
  if (req.status === 'pending' && req.expiresAt && Date.now() > req.expiresAt) {
    req.status = 'expired';
    req.updatedAt = Date.now();
  }
}

function buildRequestUrl(
  creator: string,
  id: string,
  amount: number,
  token: string,
  memo: string,
  expiresAt?: number,
): string {
  const params = new URLSearchParams();
  params.set('amount', amount.toString());
  params.set('token', token);
  if (memo) params.set('memo', memo);
  if (expiresAt) params.set('expires', expiresAt.toString());
  return `https://skaus.pay/${creator}/request/${id}?${params.toString()}`;
}
