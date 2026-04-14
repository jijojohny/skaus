import pino from 'pino';
import { prisma } from './db';
import { WithdrawExecutor } from './executor';
import { config } from './config';

const logger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export class QueueProcessor {
  private executor: WithdrawExecutor;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeJobs = 0;

  constructor(executor: WithdrawExecutor) {
    this.executor = executor;
  }

  /** Start polling the DB for pending jobs. */
  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info(
      {
        pollIntervalMs: config.relayer.pollIntervalMs,
        maxConcurrent: config.relayer.maxConcurrent,
        maxAttempts: config.relayer.maxAttempts,
      },
      'QueueProcessor started',
    );
    this._scheduleNextPoll();
  }

  /** Gracefully stop polling (waits for current cycle to finish). */
  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info('QueueProcessor stopped');
  }

  get concurrentJobs(): number {
    return this.activeJobs;
  }

  async pendingCount(): Promise<number> {
    return prisma.withdrawalJob.count({ where: { status: 'pending' } });
  }

  // ---------------------------------------------------------------------------
  // Internal poll loop
  // ---------------------------------------------------------------------------

  private _scheduleNextPoll(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => this._poll(), config.relayer.pollIntervalMs);
  }

  private async _poll(): Promise<void> {
    this.timer = null;
    try {
      const capacity = config.relayer.maxConcurrent - this.activeJobs;
      if (capacity <= 0) {
        logger.debug({ activeJobs: this.activeJobs }, 'At max concurrency — skipping poll');
        this._scheduleNextPoll();
        return;
      }

      // Fetch jobs that are still retryable and not currently being processed
      const jobs = await prisma.withdrawalJob.findMany({
        where: {
          status: 'pending',
          attempts: { lt: config.relayer.maxAttempts },
        },
        orderBy: { createdAt: 'asc' },
        take: capacity,
      });

      if (jobs.length === 0) {
        this._scheduleNextPoll();
        return;
      }

      logger.debug({ count: jobs.length }, 'Picked jobs for processing');

      // Mark all as processing atomically before we kick them off
      const ids = jobs.map((j) => j.id);
      await prisma.withdrawalJob.updateMany({
        where: { id: { in: ids }, status: 'pending' },
        data: { status: 'processing' },
      });

      // Fire off all jobs concurrently (up to capacity)
      for (const job of jobs) {
        this.activeJobs++;
        this._processJob(job.id, {
          proofBase64: job.proofBase64,
          merkleRoot: job.merkleRoot,
          nullifierHash: job.nullifierHash,
          recipient: job.recipient,
          amount: job.amount,
          tokenMint: job.tokenMint,
        }).catch((err) => {
          // Catastrophic failure (e.g. DB unavailable at the first update).
          // Reset job to 'pending' so the next poll can retry it.
          logger.error({ id: job.id, err }, 'Catastrophic job failure — resetting to pending');
          prisma.withdrawalJob.update({
            where: { id: job.id },
            data: { status: 'pending' },
          }).catch((dbErr) => {
            logger.error({ id: job.id, dbErr }, 'Failed to reset stuck job — manual intervention required');
          });
        }).finally(() => {
          this.activeJobs--;
        });
      }
    } catch (err) {
      logger.error({ err }, 'Error during queue poll');
    } finally {
      this._scheduleNextPoll();
    }
  }

  /**
   * Run a single job through the executor and persist the result.
   * We increment attempts before calling execute so that even a hard crash is
   * accounted for.
   */
  private async _processJob(
    id: string,
    params: {
      proofBase64: string;
      merkleRoot: string;
      nullifierHash: string;
      recipient: string;
      amount: string;
      tokenMint: string;
    },
  ): Promise<void> {
    // Increment attempt counter up-front
    const updated = await prisma.withdrawalJob.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });

    const attemptNumber = updated.attempts;
    logger.info({ id, attempt: attemptNumber }, 'Processing withdrawal job');

    try {
      const result = await this.executor.execute(params);

      await prisma.withdrawalJob.update({
        where: { id },
        data: {
          status: 'confirmed',
          txSignature: result.txSignature,
          lastError: null,
        },
      });

      logger.info({ id, txSignature: result.txSignature }, 'Job confirmed');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const exhausted = attemptNumber >= config.relayer.maxAttempts;
      const nextStatus = exhausted ? 'failed' : 'pending';

      await prisma.withdrawalJob.update({
        where: { id },
        data: {
          status: nextStatus,
          lastError: errorMessage,
        },
      });

      if (exhausted) {
        logger.error({ id, error: errorMessage }, 'Job failed — max attempts exhausted');
      } else {
        logger.warn(
          { id, attempt: attemptNumber, maxAttempts: config.relayer.maxAttempts, error: errorMessage },
          'Job attempt failed — will retry',
        );
      }
    }
  }
}
