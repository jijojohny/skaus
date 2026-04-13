import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db';
import { QueueProcessor } from '../queue';

// ---------------------------------------------------------------------------
// Request / response schemas (Fastify JSON schema for validation + serialisation)
// ---------------------------------------------------------------------------

const enqueueBodySchema = {
  type: 'object',
  required: ['proofBase64', 'merkleRoot', 'nullifierHash', 'recipient', 'amount', 'fee', 'tokenMint'],
  properties: {
    proofBase64:   { type: 'string', minLength: 1 },
    merkleRoot:    { type: 'string', minLength: 64, maxLength: 64 },
    nullifierHash: { type: 'string', minLength: 64, maxLength: 64 },
    recipient:     { type: 'string', minLength: 32, maxLength: 44 },
    amount:        { type: 'string', pattern: '^[0-9]+$' },
    fee:           { type: 'string', pattern: '^[0-9]+$' },
    tokenMint:     { type: 'string', minLength: 32, maxLength: 44 },
  },
  additionalProperties: false,
} as const;

const jobIdParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
  },
} as const;

// ---------------------------------------------------------------------------
// Route handler types
// ---------------------------------------------------------------------------

interface EnqueueBody {
  proofBase64: string;
  merkleRoot: string;
  nullifierHash: string;
  recipient: string;
  amount: string;
  fee: string;
  tokenMint: string;
}

interface JobIdParams {
  id: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function jobRoutes(
  fastify: FastifyInstance,
  opts: { processor: QueueProcessor },
): Promise<void> {
  const { processor } = opts;

  /**
   * POST /jobs
   * Enqueue a new withdrawal job.
   */
  fastify.post<{ Body: EnqueueBody }>(
    '/jobs',
    { schema: { body: enqueueBodySchema } },
    async (req: FastifyRequest<{ Body: EnqueueBody }>, reply: FastifyReply) => {
      const { proofBase64, merkleRoot, nullifierHash, recipient, amount, fee, tokenMint } = req.body;

      // Validate proof byte length (base64-encoded 256 bytes)
      const proofBytes = Buffer.from(proofBase64, 'base64');
      if (proofBytes.length !== 256) {
        return reply.status(400).send({
          error: `proof must decode to exactly 256 bytes, got ${proofBytes.length}`,
        });
      }

      // Check for duplicate nullifier — idempotent: return existing job
      const existing = await prisma.withdrawalJob.findUnique({
        where: { nullifierHash },
      });
      if (existing) {
        return reply.status(200).send({
          id: existing.id,
          status: existing.status,
          txSignature: existing.txSignature ?? undefined,
        });
      }

      const job = await prisma.withdrawalJob.create({
        data: {
          proofBase64,
          merkleRoot,
          nullifierHash,
          recipient,
          amount,
          fee,
          tokenMint,
          status: 'pending',
        },
      });

      req.log.debug({ jobId: job.id, nullifierHash }, 'Withdrawal job enqueued');

      return reply.status(201).send({
        id: job.id,
        status: job.status,
      });
    },
  );

  /**
   * GET /jobs/:id
   * Return the current status of a single job.
   */
  fastify.get<{ Params: JobIdParams }>(
    '/jobs/:id',
    { schema: { params: jobIdParamSchema } },
    async (req: FastifyRequest<{ Params: JobIdParams }>, reply: FastifyReply) => {
      const { id } = req.params;

      const job = await prisma.withdrawalJob.findUnique({ where: { id } });
      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      return reply.send({
        id: job.id,
        status: job.status,
        txSignature: job.txSignature ?? undefined,
        attempts: job.attempts,
        lastError: job.lastError ?? undefined,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      });
    },
  );

  /**
   * GET /jobs
   * List the 50 most recent withdrawal jobs (newest first).
   */
  fastify.get('/jobs', async (_req: FastifyRequest, reply: FastifyReply) => {
    const jobs = await prisma.withdrawalJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        nullifierHash: true,
        recipient: true,
        amount: true,
        tokenMint: true,
        txSignature: true,
        attempts: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.send({
      jobs: jobs.map((j) => ({
        ...j,
        txSignature: j.txSignature ?? undefined,
        lastError: j.lastError ?? undefined,
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
      })),
    });
  });

  /**
   * GET /status
   * Relayer health and concurrency snapshot.
   */
  fastify.get('/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    const pendingJobs = await processor.pendingCount();

    return reply.send({
      active: true,
      concurrentJobs: processor.concurrentJobs,
      pendingJobs,
    });
  });
}
