import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
  ConnectionConfig,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';
import pino from 'pino';
import { config } from './config';

const logger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

// Anchor discriminator: sha256("global:withdraw")[0..8]
const WITHDRAW_DISCRIMINATOR = Buffer.from([183, 18, 70, 156, 148, 109, 161, 34]);

// StealthPool fee_vault offset in account data
// disc(8) + authority(32) + mint(32) + fee_bps(2) + min_deposit(8) + max_deposit(8)
// + total_deposits(8) + total_withdrawals(8) + deposit_count(8) + withdrawal_count(8)
// + current_merkle_index(4) + paused(1) + merkle_root(32) = 151
const FEE_VAULT_OFFSET = 151;

// Compute unit budget constants
const COMPUTE_UNIT_LIMIT = 400_000;
// Fallback micro-lamports per CU when RPC provides no data
const FALLBACK_PRIORITY_FEE = 10_000;
// Multiply the percentile estimate to be competitive
const PRIORITY_FEE_MULTIPLIER = 1.25;

export interface WithdrawParams {
  proofBase64: string;
  merkleRoot: string;   // hex-encoded 32 bytes
  nullifierHash: string; // hex-encoded 32 bytes
  recipient: string;    // base58
  amount: string;       // u64 as decimal string
  tokenMint: string;    // base58
}

export interface ExecuteResult {
  txSignature: string;
}

export class WithdrawExecutor {
  private readonly connection: Connection;
  private readonly relayerKeypair: Keypair;
  private readonly programId: PublicKey;

  constructor() {
    if (!config.relayer.privateKey) {
      throw new Error('RELAYER_PRIVATE_KEY is required');
    }

    const fetchTimeoutMs = config.solana.rpcFetchTimeoutMs;

    // Wrap the global fetch with a per-request AbortController timeout so that
    // any hung RPC call fails fast rather than blocking the process indefinitely.
    const fetchWithTimeout: typeof fetch = (input, init) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
      return fetch(input, { ...init, signal: controller.signal }).finally(() =>
        clearTimeout(timer),
      );
    };

    const connectionConfig: ConnectionConfig = {
      commitment: 'confirmed',
      fetch: fetchWithTimeout,
    };

    this.connection = new Connection(config.solana.rpcUrl, connectionConfig);
    this.programId = new PublicKey(config.solana.stealthPoolProgramId);
    this.relayerKeypair = Keypair.fromSecretKey(bs58.decode(config.relayer.privateKey));
    logger.info(
      { pubkey: this.relayerKeypair.publicKey.toBase58(), rpcFetchTimeoutMs: fetchTimeoutMs },
      'WithdrawExecutor initialised',
    );
  }

  get relayerPubkey(): PublicKey {
    return this.relayerKeypair.publicKey;
  }

  /**
   * Execute a withdrawal with up to maxAttempts tries and exponential backoff.
   * Returns the confirmed transaction signature on success, or throws on final failure.
   */
  async execute(params: WithdrawParams): Promise<ExecuteResult> {
    const { maxAttempts } = config.relayer;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const sig = await this._buildAndSend(params);
        return { txSignature: sig };
      } catch (err) {
        lastError = err;
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
        logger.warn(
          { attempt, maxAttempts, backoffMs, err },
          'Withdraw attempt failed — will retry',
        );
        if (attempt < maxAttempts) {
          await sleep(backoffMs);
        }
      }
    }

    throw lastError;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _buildAndSend(params: WithdrawParams): Promise<string> {
    const proofBytes = Buffer.from(params.proofBase64, 'base64');
    if (proofBytes.length !== 256) {
      throw new Error(`Invalid proof size: expected 256, got ${proofBytes.length}`);
    }
    const proofA = proofBytes.subarray(0, 64);
    const proofB = proofBytes.subarray(64, 192);
    const proofC = proofBytes.subarray(192, 256);

    const nullifierHashBytes = Buffer.from(params.nullifierHash, 'hex');
    const merkleRootBytes = Buffer.from(params.merkleRoot, 'hex');
    if (nullifierHashBytes.length !== 32) throw new Error('nullifierHash must decode to 32 bytes');
    if (merkleRootBytes.length !== 32) throw new Error('merkleRoot must decode to 32 bytes');

    const tokenMint = new PublicKey(params.tokenMint);
    const recipient = new PublicKey(params.recipient);
    const amount = BigInt(params.amount);

    const accountMetas = await this._deriveAccounts(tokenMint, nullifierHashBytes, recipient);
    const ixData = buildWithdrawInstructionData(
      proofA, proofB, proofC, nullifierHashBytes, recipient, amount, merkleRootBytes,
    );

    const withdrawIx = new TransactionInstruction({
      programId: this.programId,
      keys: accountMetas,
      data: ixData,
    });

    const priorityFeeMicroLamports = await this._estimatePriorityFee();

    const tx = new Transaction();

    // Priority fee instructions must be first
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }));
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports }));

    // Create recipient ATA if it doesn't exist
    const recipientAta = await getAssociatedTokenAddress(tokenMint, recipient, true);
    const recipientAtaInfo = await this.connection.getAccountInfo(recipientAta);
    if (!recipientAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          this.relayerKeypair.publicKey,
          recipientAta,
          recipient,
          tokenMint,
        ),
      );
    }

    tx.add(withdrawIx);

    logger.info(
      {
        recipient: params.recipient,
        nullifierHash: params.nullifierHash,
        priorityFeeMicroLamports,
      },
      'Sending withdraw transaction',
    );

    // Cap the total time we wait for confirmation so the job doesn't hang
    // indefinitely if the RPC websocket subscription stalls.
    const TX_CONFIRM_TIMEOUT_MS = 60_000;
    const signature = await Promise.race([
      sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.relayerKeypair],
        { commitment: 'confirmed' },
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`sendAndConfirmTransaction timed out after ${TX_CONFIRM_TIMEOUT_MS}ms`)),
          TX_CONFIRM_TIMEOUT_MS,
        ),
      ),
    ]);

    logger.info({ signature }, 'Withdraw transaction confirmed');
    return signature;

  }

  /**
   * Derive all 9 accounts for the withdraw instruction.
   *
   * Account order (mirrors withdraw.rs):
   *   0. pool PDA                        (mut)
   *   1. merkle_root_history PDA         (read)
   *   2. spent_nullifier PDA             (init, mut)
   *   3. pool ATA                        (mut)
   *   4. recipient ATA                   (mut)
   *   5. fee_vault ATA                   (mut)
   *   6. relayer / payer                 (signer, mut)
   *   7. token_program                   (read)
   *   8. system_program                  (read)
   */
  private async _deriveAccounts(
    tokenMint: PublicKey,
    nullifierHash: Buffer,
    recipient: PublicKey,
  ) {
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('stealth_pool'), tokenMint.toBuffer()],
      this.programId,
    );

    const [merkleRootHistoryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('merkle_roots'), poolPda.toBuffer()],
      this.programId,
    );

    const [spentNullifierPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('nullifier'), poolPda.toBuffer(), nullifierHash],
      this.programId,
    );

    const poolTokenAccount = await getAssociatedTokenAddress(tokenMint, poolPda, true);
    const recipientTokenAccount = await getAssociatedTokenAddress(tokenMint, recipient, true);

    // Resolve fee_vault from on-chain pool account data
    const feeTokenAccount = await this._resolveFeeVault(poolPda, poolTokenAccount);

    return [
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: merkleRootHistoryPda, isSigner: false, isWritable: false },
      { pubkey: spentNullifierPda, isSigner: false, isWritable: true },
      { pubkey: poolTokenAccount, isSigner: false, isWritable: true },
      { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true },
      { pubkey: this.relayerKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
  }

  /**
   * Read the fee_vault pubkey from on-chain StealthPool account data.
   * Falls back to pool's own ATA if the account is not yet initialised.
   */
  private async _resolveFeeVault(
    poolPda: PublicKey,
    fallback: PublicKey,
  ): Promise<PublicKey> {
    const poolAccount = await this.connection.getAccountInfo(poolPda);
    if (poolAccount && poolAccount.data.length >= FEE_VAULT_OFFSET + 32) {
      return new PublicKey(
        poolAccount.data.subarray(FEE_VAULT_OFFSET, FEE_VAULT_OFFSET + 32),
      );
    }
    logger.warn({ poolPda: poolPda.toBase58() }, 'Could not read fee_vault from pool; using pool ATA as fallback');
    return fallback;
  }

  /**
   * Use getRecentPrioritizationFees to estimate a competitive micro-lamports/CU price.
   * Takes the 75th-percentile of the last-N-slot samples and applies a multiplier.
   */
  private async _estimatePriorityFee(): Promise<number> {
    try {
      const samples = await this.connection.getRecentPrioritizationFees();
      if (!samples || samples.length === 0) {
        return FALLBACK_PRIORITY_FEE;
      }

      const fees = samples
        .map((s) => s.prioritizationFee)
        .filter((f): f is number => typeof f === 'number' && f > 0)
        .sort((a, b) => a - b);

      if (fees.length === 0) return FALLBACK_PRIORITY_FEE;

      // 75th percentile
      const p75Index = Math.floor(fees.length * 0.75);
      const p75 = fees[p75Index] ?? fees[fees.length - 1];

      const estimate = Math.ceil(p75 * PRIORITY_FEE_MULTIPLIER);
      logger.debug({ p75, estimate, samples: fees.length }, 'Priority fee estimate');
      return Math.max(estimate, FALLBACK_PRIORITY_FEE);
    } catch (err) {
      logger.warn({ err }, 'Failed to fetch recent prioritization fees; using fallback');
      return FALLBACK_PRIORITY_FEE;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Serialise withdraw instruction data matching Anchor's layout:
 *   discriminator(8) + proof_a(64) + proof_b(128) + proof_c(64)
 *   + nullifier_hash(32) + recipient(32) + amount(8 u64le) + merkle_root(32)
 *   = 368 bytes total
 */
function buildWithdrawInstructionData(
  proofA: Buffer,
  proofB: Buffer,
  proofC: Buffer,
  nullifierHash: Buffer,
  recipient: PublicKey,
  amount: bigint,
  merkleRoot: Buffer,
): Buffer {
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amount);

  return Buffer.concat([
    WITHDRAW_DISCRIMINATOR,
    proofA,
    proofB,
    proofC,
    nullifierHash,
    recipient.toBuffer(),
    amountBuf,
    merkleRoot,
  ]); // 8+64+128+64+32+32+8+32 = 368 bytes
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
