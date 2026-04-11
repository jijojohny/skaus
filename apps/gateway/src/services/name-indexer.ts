import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { prisma } from '../db';

export interface NameEvent {
  nameHash: string;
  authority: string;
  scanPubkey: string;
  spendPubkey: string;
  version: number;
  profileCid: string | null;
  status: 'active' | 'suspended' | 'expired';
  updatedAt: number;
  txSignature: string;
}

interface NameIndexerConfig {
  rpcUrl: string;
  programId: string;
  pollIntervalMs?: number;
}

const CHECKPOINT_KEY = 'name_indexer_last_sig';

/**
 * Indexes NameRecord account changes from the name-registry program.
 *
 * Records are persisted to PostgreSQL so cache survives gateway restarts
 * and polling resumes from the correct slot.
 */
export class NameIndexer {
  private connection: Connection;
  private programId: PublicKey;
  private pollIntervalMs: number;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSignature: string | undefined;

  constructor(cfg: NameIndexerConfig) {
    this.connection = new Connection(cfg.rpcUrl, 'confirmed');
    this.programId = new PublicKey(cfg.programId);
    this.pollIntervalMs = cfg.pollIntervalMs ?? 10000;
  }

  /** Load checkpoint from DB then begin polling. */
  async start() {
    if (this.running) return;
    this.running = true;

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

  async getNameByHash(nameHash: string): Promise<NameEvent | undefined> {
    const row = await prisma.nameRecord.findUnique({ where: { nameHash } });
    return row ? this.toNameEvent(row) : undefined;
  }

  async getAllNames(): Promise<NameEvent[]> {
    const rows = await prisma.nameRecord.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((r: Parameters<typeof this.toNameEvent>[0]) => this.toNameEvent(r));
  }

  async getNameCount(): Promise<number> {
    return prisma.nameRecord.count();
  }

  /** Handle a Helius webhook event for real-time account updates. */
  async handleWebhookEvent(event: {
    type: string;
    data: { accountData: Buffer; pubkey: string };
    signature: string;
  }) {
    if (event.type !== 'ACCOUNT_UPDATE') return;

    try {
      const nameEvent = this.deserializeNameRecord(
        Buffer.from(event.data.accountData),
        event.signature,
      );
      if (nameEvent) await this.persistNameEvent(nameEvent);
    } catch {
      // Not a valid NameRecord
    }
  }

  private toNameEvent(row: {
    nameHash: string;
    authority: string;
    scanPubkey: string;
    spendPubkey: string;
    version: number;
    profileCid: string | null;
    status: string;
    updatedAt: bigint;
    txSignature: string;
  }): NameEvent {
    return {
      nameHash: row.nameHash,
      authority: row.authority,
      scanPubkey: row.scanPubkey,
      spendPubkey: row.spendPubkey,
      version: row.version,
      profileCid: row.profileCid,
      status: row.status as NameEvent['status'],
      updatedAt: Number(row.updatedAt),
      txSignature: row.txSignature,
    };
  }

  private async persistNameEvent(event: NameEvent) {
    await prisma.nameRecord.upsert({
      where: { nameHash: event.nameHash },
      update: {
        authority: event.authority,
        scanPubkey: event.scanPubkey,
        spendPubkey: event.spendPubkey,
        version: event.version,
        profileCid: event.profileCid,
        status: event.status,
        updatedAt: BigInt(event.updatedAt),
        txSignature: event.txSignature,
      },
      create: {
        nameHash: event.nameHash,
        authority: event.authority,
        scanPubkey: event.scanPubkey,
        spendPubkey: event.spendPubkey,
        version: event.version,
        profileCid: event.profileCid,
        status: event.status,
        updatedAt: BigInt(event.updatedAt),
        txSignature: event.txSignature,
      },
    });
  }

  private async poll() {
    try {
      const sigs = await this.connection.getSignaturesForAddress(
        this.programId,
        { limit: 50, until: this.lastSignature },
        'confirmed',
      );

      if (sigs.length === 0) return;
      this.lastSignature = sigs[0].signature;

      await prisma.indexerCheckpoint.upsert({
        where: { key: CHECKPOINT_KEY },
        update: { value: this.lastSignature },
        create: { key: CHECKPOINT_KEY, value: this.lastSignature },
      });

      for (const sig of sigs.reverse()) {
        if (sig.err) continue;
        await this.processTransaction(sig.signature);
      }
    } catch {
      // Silently retry on next poll
    }
  }

  private async processTransaction(signature: string) {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx?.meta?.logMessages) return;

      const relevant = tx.meta.logMessages.some(
        (log) =>
          log.includes('Name registered') ||
          log.includes('Keys rotated') ||
          log.includes('Profile updated') ||
          log.includes('Name suspended') ||
          log.includes('Name unsuspended'),
      );
      if (!relevant) return;

      const accountKeys = tx.transaction.message.accountKeys;
      for (const key of accountKeys) {
        const pubkey = typeof key === 'string' ? key : key.pubkey.toBase58();

        try {
          const accountInfo = await this.connection.getAccountInfo(new PublicKey(pubkey));
          if (!accountInfo || !accountInfo.owner.equals(this.programId)) continue;
          if (accountInfo.data.length < 150) continue;

          const nameEvent = this.deserializeNameRecord(accountInfo.data, signature);
          if (nameEvent) await this.persistNameEvent(nameEvent);
        } catch {
          // Not a NameRecord
        }
      }
    } catch {
      // Transaction fetch failed
    }
  }

  private deserializeNameRecord(data: Buffer, txSignature: string): NameEvent | null {
    try {
      let offset = 8; // discriminator

      const authority = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
      offset += 32;

      const nameHash = bs58.encode(data.subarray(offset, offset + 32));
      offset += 32;

      const scanPubkey = bs58.encode(data.subarray(offset, offset + 32));
      offset += 32;
      const spendPubkey = bs58.encode(data.subarray(offset, offset + 32));
      offset += 32;
      const version = data[offset];
      offset += 1;

      const hasProfileCid = data[offset] === 1;
      offset += 1;
      let profileCid: string | null = null;
      if (hasProfileCid) {
        profileCid = bs58.encode(data.subarray(offset, offset + 32));
      }
      offset += 32;

      offset += 8; // deposit_index
      offset += 8; // created_at

      const updatedAt = Number(data.readBigInt64LE(offset));
      offset += 8;

      const statusByte = data[offset];
      const statusMap: Record<number, NameEvent['status']> = {
        0: 'active',
        1: 'suspended',
        2: 'expired',
      };

      return {
        nameHash,
        authority,
        scanPubkey,
        spendPubkey,
        version,
        profileCid,
        status: statusMap[statusByte] ?? 'active',
        updatedAt,
        txSignature,
      };
    } catch {
      return null;
    }
  }
}
