import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
} from '@solana/web3.js';

interface DepositEvent {
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

/**
 * Indexes DepositNote account creations from the stealth pool program.
 *
 * Watches for new deposit transactions by polling confirmed signatures
 * and parsing DepositNote account data. Recipients scan these events
 * to detect deposits addressed to them via ECDH trial decryption.
 */
export class DepositIndexer {
  private connection: Connection;
  private programId: PublicKey;
  private pollIntervalMs: number;
  private deposits: DepositEvent[] = [];
  private lastSignature: string | undefined;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: IndexerConfig) {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
    this.programId = new PublicKey(config.programId);
    this.pollIntervalMs = config.pollIntervalMs ?? 5000;
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

  getDeposits(sinceTimestamp?: number): DepositEvent[] {
    if (!sinceTimestamp) return [...this.deposits];
    return this.deposits.filter((d) => d.timestamp >= sinceTimestamp);
  }

  getDepositsByPool(pool: string, sinceTimestamp?: number): DepositEvent[] {
    return this.getDeposits(sinceTimestamp).filter((d) => d.pool === pool);
  }

  getDepositCount(): number {
    return this.deposits.length;
  }

  private async poll() {
    try {
      const sigs = await this.connection.getSignaturesForAddress(
        this.programId,
        {
          limit: 100,
          until: this.lastSignature,
        },
        'confirmed'
      );

      if (sigs.length === 0) return;

      this.lastSignature = sigs[0].signature;

      for (const sig of sigs.reverse()) {
        if (sig.err) continue;
        await this.processTransaction(sig.signature, sig.slot, sig.blockTime ?? 0);
      }
    } catch (err) {
      // Silently retry on next poll
    }
  }

  private async processTransaction(signature: string, slot: number, blockTime: number) {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx?.meta?.logMessages) return;

      // Look for deposit log messages from our program
      const depositLogs = tx.meta.logMessages.filter(
        (log) => log.includes('Deposit #')
      );

      if (depositLogs.length === 0) return;

      // Parse inner instructions to find newly created DepositNote accounts
      const accountKeys = tx.transaction.message.accountKeys;
      for (const key of accountKeys) {
        const pubkey = typeof key === 'string' ? key : key.pubkey.toBase58();

        // Check if this is a DepositNote PDA (owned by our program)
        try {
          const accountInfo = await this.connection.getAccountInfo(new PublicKey(pubkey));
          if (!accountInfo || !accountInfo.owner.equals(this.programId)) continue;

          // DepositNote layout:
          // discriminator(8) + pool(32) + commitment(32) + encrypted_note_len(4) + ... + leaf_index(4) + timestamp(8) + bump(1)
          const data = accountInfo.data;
          if (data.length < 8 + 32 + 32 + 4) continue;

          const pool = new PublicKey(data.slice(8, 40)).toBase58();
          const commitment = Buffer.from(data.slice(40, 72)).toString('hex');

          const noteLen = data.readUInt32LE(72);
          const noteEnd = 76 + noteLen;
          const encryptedNote = Buffer.from(data.slice(76, noteEnd)).toString('base64');

          const leafIndex = data.readUInt32LE(noteEnd);
          const timestamp = Number(data.readBigInt64LE(noteEnd + 4));

          this.deposits.push({
            pool,
            commitment,
            leafIndex,
            amount: '0', // Amount is in the encrypted note, not stored plainly
            encryptedNote,
            timestamp,
            txSignature: signature,
            slot,
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
