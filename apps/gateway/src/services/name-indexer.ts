import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

interface NameEvent {
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

/**
 * Indexes NameRecord account changes from the name-registry program.
 *
 * Watches for new registrations, key rotations, profile updates,
 * and status changes. Maintains an in-memory lookup cache.
 *
 * In production, this would be replaced by Helius webhooks
 * for real-time notifications.
 */
export class NameIndexer {
  private connection: Connection;
  private programId: PublicKey;
  private pollIntervalMs: number;
  private names: Map<string, NameEvent> = new Map();
  private lastSignature: string | undefined;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: NameIndexerConfig) {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
    this.programId = new PublicKey(config.programId);
    this.pollIntervalMs = config.pollIntervalMs ?? 10000;
  }

  start() {
    if (this.running) return;
    this.running = true;
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

  getNameByHash(nameHash: string): NameEvent | undefined {
    return this.names.get(nameHash);
  }

  getAllNames(): NameEvent[] {
    return Array.from(this.names.values());
  }

  getNameCount(): number {
    return this.names.size;
  }

  /**
   * Handle a Helius webhook event for account updates.
   * Called by the webhook route.
   */
  handleWebhookEvent(event: {
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
      if (nameEvent) {
        this.names.set(nameEvent.nameHash, nameEvent);
      }
    } catch {
      // Not a valid NameRecord
    }
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

      const relevantLogs = tx.meta.logMessages.filter(
        (log) =>
          log.includes('Name registered') ||
          log.includes('Keys rotated') ||
          log.includes('Profile updated') ||
          log.includes('Name suspended') ||
          log.includes('Name unsuspended'),
      );

      if (relevantLogs.length === 0) return;

      const accountKeys = tx.transaction.message.accountKeys;
      for (const key of accountKeys) {
        const pubkey = typeof key === 'string' ? key : key.pubkey.toBase58();

        try {
          const accountInfo = await this.connection.getAccountInfo(new PublicKey(pubkey));
          if (!accountInfo || !accountInfo.owner.equals(this.programId)) continue;
          if (accountInfo.data.length < 150) continue;

          const nameEvent = this.deserializeNameRecord(accountInfo.data, signature);
          if (nameEvent) {
            this.names.set(nameEvent.nameHash, nameEvent);
          }
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
      const statusMap: Record<number, 'active' | 'suspended' | 'expired'> = {
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
