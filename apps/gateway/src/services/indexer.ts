import { Connection, PublicKey } from '@solana/web3.js';
import { prisma } from '../db';

export interface DepositEvent {
  pool: string;
  commitment: string;
  leafIndex: number;
  amount: string;
  encryptedNote: string;
  timestamp: number;
  txSignature: string;
  slot: number;
}

interface IndexerConfig {
  rpcUrl: string;
  programId: string;
  pollIntervalMs?: number;
}

const CHECKPOINT_KEY = 'deposit_indexer_last_sig';

/**
 * Indexes DepositNote account creations from the stealth pool program.
 *
 * Events are persisted to PostgreSQL so scanning resumes from the correct
 * slot after a restart — no full re-index needed.
 */
export class DepositIndexer {
  private connection: Connection;
  private programId: PublicKey;
  private pollIntervalMs: number;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSignature: string | undefined;

  constructor(cfg: IndexerConfig) {
    this.connection = new Connection(cfg.rpcUrl, 'confirmed');
    this.programId = new PublicKey(cfg.programId);
    this.pollIntervalMs = cfg.pollIntervalMs ?? 5000;
  }

  /** Load checkpoint + seed in-memory cache from DB, then begin polling. */
  async start() {
    if (this.running) return;
    this.running = true;

    // Restore polling cursor from DB so we don't re-index on restart
    const cp = await prisma.indexerCheckpoint.findUnique({ where: { key: CHECKPOINT_KEY } });
    if (cp) this.lastSignature = cp.value;

    this.poll();
    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  stop() {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async getDeposits(sinceTimestamp?: number): Promise<DepositEvent[]> {
    const rows = await prisma.depositEvent.findMany({
      where: sinceTimestamp ? { timestamp: { gte: BigInt(sinceTimestamp) } } : undefined,
      orderBy: { timestamp: 'asc' },
    });
    return rows.map(this.toDepositEvent);
  }

  async getDepositsByPool(pool: string, sinceTimestamp?: number): Promise<DepositEvent[]> {
    const rows = await prisma.depositEvent.findMany({
      where: {
        pool,
        ...(sinceTimestamp ? { timestamp: { gte: BigInt(sinceTimestamp) } } : {}),
      },
      orderBy: { timestamp: 'asc' },
    });
    return rows.map(this.toDepositEvent);
  }

  async getDepositCount(): Promise<number> {
    return prisma.depositEvent.count();
  }

  private toDepositEvent(row: {
    pool: string;
    commitment: string;
    leafIndex: number;
    amount: string;
    encryptedNote: string;
    timestamp: bigint;
    txSignature: string;
    slot: bigint;
  }): DepositEvent {
    return {
      pool: row.pool,
      commitment: row.commitment,
      leafIndex: row.leafIndex,
      amount: row.amount,
      encryptedNote: row.encryptedNote,
      timestamp: Number(row.timestamp),
      txSignature: row.txSignature,
      slot: Number(row.slot),
    };
  }

  private async poll() {
    try {
      const sigs = await this.connection.getSignaturesForAddress(
        this.programId,
        { limit: 100, until: this.lastSignature },
        'confirmed',
      );

      if (sigs.length === 0) return;

      this.lastSignature = sigs[0].signature;

      // Persist the new cursor immediately so it survives a crash mid-batch
      await prisma.indexerCheckpoint.upsert({
        where: { key: CHECKPOINT_KEY },
        update: { value: this.lastSignature },
        create: { key: CHECKPOINT_KEY, value: this.lastSignature },
      });

      for (const sig of sigs.reverse()) {
        if (sig.err) continue;
        await this.processTransaction(sig.signature, sig.slot, sig.blockTime ?? 0);
      }
    } catch {
      // Silently retry on next poll
    }
  }

  private async processTransaction(signature: string, slot: number, _blockTime: number) {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx?.meta?.logMessages) return;

      const depositLogs = tx.meta.logMessages.filter((log) => log.includes('Deposit #'));
      if (depositLogs.length === 0) return;

      const accountKeys = tx.transaction.message.accountKeys;
      for (const key of accountKeys) {
        const pubkey = typeof key === 'string' ? key : key.pubkey.toBase58();

        try {
          const accountInfo = await this.connection.getAccountInfo(new PublicKey(pubkey));
          if (!accountInfo || !accountInfo.owner.equals(this.programId)) continue;

          const data = accountInfo.data;
          if (data.length < 8 + 32 + 32 + 4) continue;

          const pool = new PublicKey(data.subarray(8, 40)).toBase58();
          const commitment = Buffer.from(data.subarray(40, 72)).toString('hex');

          const noteLen = data.readUInt32LE(72);
          const noteEnd = 76 + noteLen;
          const encryptedNote = Buffer.from(data.subarray(76, noteEnd)).toString('base64');

          const leafIndex = data.readUInt32LE(noteEnd);
          const timestamp = Number(data.readBigInt64LE(noteEnd + 4));

          // Upsert so reprocessing the same tx is idempotent
          await prisma.depositEvent.upsert({
            where: { commitment },
            update: {},
            create: {
              pool,
              commitment,
              leafIndex,
              amount: '0',
              encryptedNote,
              timestamp: BigInt(timestamp),
              txSignature: signature,
              slot: BigInt(slot),
            },
          });
        } catch {
          // Not a DepositNote account
        }
      }
    } catch {
      // Transaction fetch failed
    }
  }
}
