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
  /**
   * Helius Geyser WebSocket URL. When provided, real-time logsSubscribe is used
   * alongside polling (polling acts as catch-up / fallback).
   */
  geyserWsUrl?: string;
}

const CHECKPOINT_KEY = 'deposit_indexer_last_sig';

// ---------------------------------------------------------------------------
// Helius Geyser real-time subscriber
// ---------------------------------------------------------------------------

type LogHandler = (signature: string, slot: number) => Promise<void>;

/**
 * Subscribes to Solana program logs via a Helius Geyser WebSocket
 * (`logsSubscribe` filtered on a single program ID).
 *
 * Reconnects with exponential back-off (1 s → 2 s → 4 s … capped at 30 s).
 * Call `stop()` to cancel reconnection permanently.
 */
export class HeliusGeyserSubscriber {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1_000;
  private stopped = false;

  constructor(
    private readonly wsUrl: string,
    private readonly programId: string,
    private readonly onLog: LogHandler,
  ) {}

  connect() {
    if (this.stopped) return;

    try {
      // Node 22+ ships WebSocket as a global; Node 18+ requires
      // --experimental-websocket or the `ws` package polyfill.
      this.ws = new WebSocket(this.wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1_000; // reset back-off on successful connection
      this.ws!.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'logsSubscribe',
          params: [
            { mentions: [this.programId] },
            { commitment: 'confirmed' },
          ],
        }),
      );
    };

    this.ws.onmessage = async (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.method !== 'logsNotification') return;

        const { value, context } = msg.params.result as {
          value: { signature: string; err: unknown; logs: string[] };
          context: { slot: number };
        };

        if (value.err) return;
        if (!value.logs?.some((l) => l.includes('Deposit #'))) return;

        await this.onLog(value.signature, context.slot);
      } catch {
        // Malformed message — ignore.
      }
    };

    this.ws.onclose = () => {
      if (!this.stopped) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose fires after onerror; reconnect is handled there.
      try { this.ws?.close(); } catch { /* ignore */ }
    };
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }

  private scheduleReconnect() {
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
  }
}

// ---------------------------------------------------------------------------
// Deposit indexer
// ---------------------------------------------------------------------------

/**
 * Indexes DepositNote account creations from the stealth pool program.
 *
 * Two complementary strategies run in parallel:
 *   1. **Helius Geyser** (real-time) — `logsSubscribe` WebSocket fires within
 *      milliseconds of a confirmed deposit. Only active when `geyserWsUrl` is
 *      set.
 *   2. **Polling** (catch-up / fallback) — `getSignaturesForAddress` every
 *      `pollIntervalMs` ms. Fills gaps from Geyser disconnects and covers
 *      environments without a Helius API key.
 *
 * Events are persisted to PostgreSQL so scanning resumes from the correct
 * slot after a restart — no full re-index needed.
 */
export class DepositIndexer {
  private connection: Connection;
  private programId: PublicKey;
  private pollIntervalMs: number;
  private geyserWsUrl: string | undefined;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private geyserSubscriber: HeliusGeyserSubscriber | null = null;
  private lastSignature: string | undefined;

  constructor(cfg: IndexerConfig) {
    this.connection = new Connection(cfg.rpcUrl, 'confirmed');
    this.programId = new PublicKey(cfg.programId);
    this.pollIntervalMs = cfg.pollIntervalMs ?? 5_000;
    this.geyserWsUrl = cfg.geyserWsUrl;
  }

  /** Load checkpoint, optionally start Geyser subscriber, then begin polling. */
  async start() {
    if (this.running) return;
    this.running = true;

    // Restore polling cursor from DB so we don't re-index on restart.
    const cp = await prisma.indexerCheckpoint.findUnique({ where: { key: CHECKPOINT_KEY } });
    if (cp) this.lastSignature = cp.value;

    // ── Helius Geyser (real-time) ─────────────────────────────────────────
    if (this.geyserWsUrl) {
      this.geyserSubscriber = new HeliusGeyserSubscriber(
        this.geyserWsUrl,
        this.programId.toBase58(),
        async (signature, slot) => {
          await this.processTransaction(signature, slot, Math.floor(Date.now() / 1_000));
        },
      );
      this.geyserSubscriber.connect();
    }

    // ── Polling (catch-up / fallback, always runs) ────────────────────────
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  stop() {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.geyserSubscriber?.stop();
    this.geyserSubscriber = null;
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

      // Persist the new cursor immediately so it survives a crash mid-batch.
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
      // Silently retry on next poll.
    }
  }

  /** Shared handler used by both Geyser notifications and polling. */
  async processTransaction(signature: string, slot: number, _blockTime: number) {
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

          // Upsert so reprocessing the same tx is idempotent.
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
          // Not a DepositNote account — continue scanning.
        }
      }
    } catch {
      // Transaction fetch failed — will be retried via polling.
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: derive Helius Geyser WebSocket URL from API key + cluster.
// ---------------------------------------------------------------------------

/**
 * Build the Helius Geyser WebSocket URL for the given cluster.
 * Returns an empty string when no API key is available (localnet, CI, etc.).
 */
export function buildHeliusGeyserUrl(
  apiKey: string,
  cluster: 'mainnet-beta' | 'devnet' | 'localnet',
  override?: string,
): string {
  if (override) return override;
  if (!apiKey) return '';
  const subdomain = cluster === 'mainnet-beta' ? 'mainnet' : 'devnet';
  return `wss://${subdomain}.helius-rpc.com/?api-key=${apiKey}`;
}
