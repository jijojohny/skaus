import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { prisma } from '../db';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PaymentStatus = 'pending' | 'partial' | 'paid' | 'expired' | 'cancelled';

interface StoredRequest {
  id: string;
  creator: string;
  username: string;
  slug: string;
  amount: number;
  token: string;
  memo: string;
  title: string;
  openAmount: boolean;
  expiresAt: number | null;
  maxPayments: number;
  depositPathIndex: number;
  status: PaymentStatus;
  payments: Array<{ txSignature: string; amount: number; paidAt: number }>;
  createdAt: number;
  updatedAt: number;
  views: number;
}

/**
 * Convert a title into a URL-safe slug.
 * "My Invoice #1" → "my-invoice-1"
 */
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // strip special chars
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .replace(/^-|-$/g, '')           // trim leading/trailing hyphens
    .slice(0, 60)                    // max length
    || 'payment';
}

/**
 * Returns true if the slug is already taken for this username.
 */
async function slugExists(username: string, slug: string): Promise<boolean> {
  const existing = await prisma.paymentRequest.findUnique({
    where: { username_slug: { username, slug } },
  });
  return !!existing;
}

/** Expand a DB row + its payments into the legacy StoredRequest shape. */
function toStoredRequest(
  row: {
    id: string;
    creator: string;
    username: string;
    slug: string;
    amount: number;
    token: string;
    memo: string;
    title: string;
    openAmount: boolean;
    expiresAt: bigint | null;
    maxPayments: number;
    depositPathIndex: number;
    status: string;
    views: number;
    createdAt: bigint;
    updatedAt: bigint;
    payments: Array<{ txSignature: string; amount: number; paidAt: bigint }>;
  },
): StoredRequest {
  return {
    id: row.id,
    creator: row.creator,
    username: row.username,
    slug: row.slug,
    amount: row.amount,
    token: row.token,
    memo: row.memo,
    title: row.title,
    openAmount: row.openAmount,
    expiresAt: row.expiresAt !== null ? Number(row.expiresAt) : null,
    maxPayments: row.maxPayments,
    depositPathIndex: row.depositPathIndex,
    status: row.status as PaymentStatus,
    views: row.views,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    payments: row.payments.map((p) => ({
      txSignature: p.txSignature,
      amount: p.amount,
      paidAt: Number(p.paidAt),
    })),
  };
}

/** Recompute status from payments, expiry and max. Persists change if status changed. */
async function resolveStatus(req: StoredRequest): Promise<StoredRequest> {
  if (req.status === 'cancelled' || req.status === 'paid') return req;

  let newStatus: PaymentStatus = req.status;

  // Check expiry
  if (req.expiresAt && Date.now() > req.expiresAt && req.status === 'pending') {
    newStatus = 'expired';
  }

  if (newStatus !== req.status) {
    await prisma.paymentRequest.update({
      where: { id: req.id },
      data: { status: newStatus, updatedAt: BigInt(Date.now()) },
    });
    req.status = newStatus;
    req.updatedAt = Date.now();
  }

  return req;
}

function buildRequestUrl(username: string, slug: string): string {
  return `${config.webAppPublicUrl}/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function requestRoutes(app: FastifyInstance) {
  /**
   * POST /requests
   *
   * Create a new payment request.
   */
  app.post<{
    Body: {
      creator: string;
      username: string;
      amount: number;
      token?: string;
      memo?: string;
      title?: string;
      openAmount?: boolean;
      expiresAt?: number;
      maxPayments?: number;
      depositPathIndex: number;
    };
  }>('/', async (request, reply) => {
    const {
      creator,
      username,
      amount,
      token,
      memo,
      title,
      openAmount: openAmountBody,
      expiresAt,
      maxPayments,
      depositPathIndex,
    } = request.body;

    if (!creator || !username || depositPathIndex === undefined) {
      return reply
        .status(400)
        .send({ error: 'Missing required fields: creator, username, depositPathIndex' });
    }

    const openAmount = Boolean(openAmountBody);
    const amt = Number(amount);
    if (Number.isNaN(amt) || amt < 0) {
      return reply.status(400).send({ error: 'Invalid amount' });
    }
    if (!openAmount && amt <= 0) {
      return reply.status(400).send({ error: 'Fixed amount must be greater than zero' });
    }

    const id = randomUUID();
    const now = BigInt(Date.now());
    const linkTitle = (title && String(title).trim()) || 'Payment link';
    const slug = toSlug(linkTitle);

    if (await slugExists(username, slug)) {
      return reply.status(409).send({ error: `A link named "${slug}" already exists. Choose a different title.` });
    }

    const row = await prisma.paymentRequest.create({
      data: {
        id,
        creator,
        username,
        slug,
        amount: openAmount ? 0 : amt,
        token: token || 'USDC',
        memo: memo || '',
        title: linkTitle,
        openAmount,
        expiresAt: expiresAt ? BigInt(expiresAt) : null,
        maxPayments: maxPayments || 1,
        depositPathIndex,
        status: 'pending',
        views: 0,
        createdAt: now,
        updatedAt: now,
      },
      include: { payments: true },
    });

    const stored = toStoredRequest(row);
    const payUrl = buildRequestUrl(stored.username, stored.slug);

    return reply.status(201).send({ ...stored, payUrl });
  });

  /**
   * GET /requests/:id
   *
   * Get a payment request by ID.
   */
  app.get<{ Params: { id: string }; Querystring: { recordView?: string } }>(
    '/:id',
    async (request, reply) => {
      const row = await prisma.paymentRequest.findUnique({
        where: { id: request.params.id },
        include: { payments: { orderBy: { paidAt: 'asc' } } },
      });

      if (!row) {
        return reply.status(404).send({ error: 'Payment request not found' });
      }

      let stored = toStoredRequest(row);
      stored = await resolveStatus(stored);

      if (request.query.recordView === '1') {
        await prisma.paymentRequest.update({
          where: { id: stored.id },
          data: { views: { increment: 1 }, updatedAt: BigInt(Date.now()) },
        });
        stored.views += 1;
      }

      return reply.send(stored);
    },
  );

  /**
   * GET /requests/by-creator/:creator
   *
   * List payment requests for a creator (most recent first).
   */
  app.get<{ Params: { creator: string }; Querystring: { status?: string } }>(
    '/by-creator/:creator',
    async (request, reply) => {
      const { creator } = request.params;
      const { status } = request.query;

      const rows = await prisma.paymentRequest.findMany({
        where: {
          creator,
          ...(status ? { status } : {}),
        },
        include: { payments: { orderBy: { paidAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      });

      type RequestRow = Parameters<typeof toStoredRequest>[0];
      const requests = await Promise.all(
        rows.map((r: RequestRow) => resolveStatus(toStoredRequest(r))),
      );

      return reply.send({ requests });
    },
  );

  /**
   * POST /requests/:id/cancel
   *
   * Cancel a pending or partial payment request.
   */
  app.post<{ Params: { id: string }; Body: { creator: string } }>(
    '/:id/cancel',
    async (request, reply) => {
      const row = await prisma.paymentRequest.findUnique({
        where: { id: request.params.id },
        include: { payments: true },
      });

      if (!row) {
        return reply.status(404).send({ error: 'Payment request not found' });
      }

      if (row.creator !== request.body.creator) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      if (row.status !== 'pending' && row.status !== 'partial') {
        return reply
          .status(400)
          .send({ error: `Cannot cancel request with status: ${row.status}` });
      }

      const updated = await prisma.paymentRequest.update({
        where: { id: row.id },
        data: { status: 'cancelled', updatedAt: BigInt(Date.now()) },
        include: { payments: true },
      });

      return reply.send(toStoredRequest(updated));
    },
  );

  /**
   * POST /requests/:id/payment
   *
   * Record a payment against a request.
   */
  app.post<{
    Params: { id: string };
    Body: { txSignature: string; amount: number; payerAddress?: string };
  }>(
    '/:id/payment',
    async (request, reply) => {
      const row = await prisma.paymentRequest.findUnique({
        where: { id: request.params.id },
        include: { payments: true },
      });

      if (!row) {
        return reply.status(404).send({ error: 'Payment request not found' });
      }

      let stored = toStoredRequest(row);
      stored = await resolveStatus(stored);

      if (stored.status === 'expired' || stored.status === 'cancelled') {
        return reply.status(400).send({ error: `Request is ${stored.status}` });
      }

      const { txSignature, amount, payerAddress } = request.body;
      const paidAt = BigInt(Date.now());

      // Append new payment
      await prisma.payment.create({
        data: { requestId: row.id, txSignature, amount, paidAt, payerAddress: payerAddress || '' },
      });

      // Re-read with updated payments to compute new status
      const refreshed = await prisma.paymentRequest.findUniqueOrThrow({
        where: { id: row.id },
        include: { payments: { orderBy: { paidAt: 'asc' } } },
      });
      const updated = toStoredRequest(refreshed);
      const totalPaid = updated.payments.reduce((s, p) => s + p.amount, 0);

      let newStatus: PaymentStatus = updated.status as PaymentStatus;
      if (updated.openAmount) {
        if (updated.payments.length >= updated.maxPayments) newStatus = 'paid';
        else if (totalPaid > 0) newStatus = 'partial';
      } else {
        if (totalPaid >= updated.amount) {
          newStatus = 'paid';
        } else if (totalPaid > 0) {
          newStatus = 'partial';
        }
        if (updated.payments.length >= updated.maxPayments && newStatus !== 'paid') {
          newStatus = 'paid';
        }
      }

      const final = await prisma.paymentRequest.update({
        where: { id: row.id },
        data: { status: newStatus, updatedAt: BigInt(Date.now()) },
        include: { payments: { orderBy: { paidAt: 'asc' } } },
      });

      return reply.send(toStoredRequest(final));
    },
  );

  /**
   * GET /requests/by-slug/:username/:slug
   *
   * Resolve a payment request by its human-readable slug URL.
   */
  app.get<{ Params: { username: string; slug: string }; Querystring: { recordView?: string } }>(
    '/by-slug/:username/:slug',
    async (request, reply) => {
      const { username, slug } = request.params;

      const row = await prisma.paymentRequest.findUnique({
        where: { username_slug: { username, slug } },
        include: { payments: { orderBy: { paidAt: 'asc' } } },
      });

      if (!row) {
        return reply.status(404).send({ error: 'Payment request not found' });
      }

      let stored = toStoredRequest(row);
      stored = await resolveStatus(stored);

      if (request.query.recordView === '1') {
        await prisma.paymentRequest.update({
          where: { id: stored.id },
          data: { views: { increment: 1 }, updatedAt: BigInt(Date.now()) },
        });
        stored.views += 1;
      }

      return reply.send(stored);
    },
  );
}
