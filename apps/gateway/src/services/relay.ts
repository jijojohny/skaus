import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { prisma } from '../db';

interface RelayConfig {
  solana: {
    rpcUrl: string;
    cluster: string;
    stealthPoolProgramId: string;
  };
  relayer: {
    privateKey: string;
    feeBps: number;
    maxPendingTxs: number;
  };
}

interface PublicInputs {
  merkleRoot: string;
  nullifierHash: string;
  recipient: string;
  amount: string;
  fee: string;
}

/** Compute units to request for the withdraw instruction. */
const WITHDRAW_CU_LIMIT = 400_000;

/** Minimum priority fee (microlamports/CU) used when chain data is unavailable. */
const MIN_PRIORITY_FEE_ULAMPORTS = 1_000;

/** Maximum retry attempts for a single withdrawal submission. */
const MAX_SUBMIT_ATTEMPTS = 3;

export class RelayService {
  private connection: Connection;
  private relayerKeypair: Keypair | null;
  private programId: PublicKey;
  private maxPendingTxs: number;
  private pendingTxCount = 0;
  private totalRelayed = 0n;

  constructor(config: RelayConfig) {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.programId = new PublicKey(config.solana.stealthPoolProgramId);
    this.maxPendingTxs = config.relayer.maxPendingTxs;

    if (config.relayer.privateKey) {
      this.relayerKeypair = Keypair.fromSecretKey(
        bs58.decode(config.relayer.privateKey)
      );
    } else {
      this.relayerKeypair = null;
    }
  }

  /** Call once after construction to restore persisted totalRelayed count. */
  async init() {
    const row = await prisma.relayMetrics.findUnique({ where: { id: 1 } });
    if (row) this.totalRelayed = row.totalRelayed;
  }

  async submitWithdrawal(
    proofBase64: string,
    publicInputs: PublicInputs,
    tokenMint: PublicKey,
  ): Promise<{ txSignature: string; status: string; fee: string }> {
    if (!this.relayerKeypair) {
      throw new Error('Relayer private key not configured');
    }

    if (this.pendingTxCount >= this.maxPendingTxs) {
      throw new Error('Relayer at capacity — try again later');
    }

    this.pendingTxCount++;

    try {
      const proofBytes = Buffer.from(proofBase64, 'base64');
      if (proofBytes.length !== 256) {
        throw new Error(`Invalid proof size: expected 256 bytes, got ${proofBytes.length}`);
      }
      const proofA = proofBytes.subarray(0, 64);
      const proofB = proofBytes.subarray(64, 192);
      const proofC = proofBytes.subarray(192, 256);

      const nullifierHashBytes = Buffer.from(publicInputs.nullifierHash, 'hex');
      const merkleRootBytes = Buffer.from(publicInputs.merkleRoot, 'hex');
      const recipient = new PublicKey(publicInputs.recipient);
      const amount = BigInt(publicInputs.amount);

      if (nullifierHashBytes.length !== 32) throw new Error('nullifierHash must be 32 bytes');
      if (merkleRootBytes.length !== 32) throw new Error('merkleRoot must be 32 bytes');

      const accountMetas = await this.deriveWithdrawAccounts(
        tokenMint,
        nullifierHashBytes,
        recipient,
      );

      const instructionData = this.buildWithdrawInstructionData(
        proofA, proofB, proofC,
        nullifierHashBytes,
        recipient,
        amount,
        merkleRootBytes,
      );

      // Estimate priority fee from recent on-chain data (75th-percentile).
      const priorityFee = await this.estimatePriorityFee();

      const withdrawIx = new TransactionInstruction({
        programId: this.programId,
        keys: accountMetas,
        data: instructionData,
      });

      // Build the base transaction (may add ATA creation instruction).
      const buildTx = async (): Promise<Transaction> => {
        const tx = new Transaction();

        // ComputeBudget: request explicit CU limit and pay priority fee.
        tx.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: WITHDRAW_CU_LIMIT }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
        );

        const recipientAta = await getAssociatedTokenAddress(tokenMint, recipient, true);
        const recipientAtaInfo = await this.connection.getAccountInfo(recipientAta);
        if (!recipientAtaInfo) {
          tx.add(
            createAssociatedTokenAccountInstruction(
              this.relayerKeypair!.publicKey,
              recipientAta,
              recipient,
              tokenMint,
            )
          );
        }

        tx.add(withdrawIx);
        return tx;
      };

      // Submit with exponential-backoff retry (blockhash refreshed each attempt).
      let lastError: unknown;
      for (let attempt = 0; attempt < MAX_SUBMIT_ATTEMPTS; attempt++) {
        try {
          const tx = await buildTx();
          const signature = await sendAndConfirmTransaction(
            this.connection,
            tx,
            [this.relayerKeypair],
            { commitment: 'confirmed' }
          );

          this.totalRelayed += 1n;
          await prisma.relayMetrics.upsert({
            where: { id: 1 },
            update: { totalRelayed: this.totalRelayed },
            create: { id: 1, totalRelayed: this.totalRelayed },
          });

          return { txSignature: signature, status: 'confirmed', fee: publicInputs.fee };
        } catch (err) {
          lastError = err;
          if (attempt < MAX_SUBMIT_ATTEMPTS - 1) {
            // Exponential back-off: 500 ms, 1 000 ms.
            await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          }
        }
      }

      throw lastError;
    } finally {
      this.pendingTxCount--;
    }
  }

  getStatus() {
    return {
      active: !!this.relayerKeypair,
      pendingTxs: this.pendingTxCount,
      totalRelayed: Number(this.totalRelayed),
      maxPendingTxs: this.maxPendingTxs,
      relayerPubkey: this.relayerKeypair?.publicKey.toBase58() || null,
    };
  }

  // ---------------------------------------------------------------------------
  // Priority fee estimation
  // ---------------------------------------------------------------------------

  /**
   * Query recent prioritisation fees for the stealth pool program and return
   * the 75th-percentile value (microlamports per CU).  Falls back to
   * MIN_PRIORITY_FEE_ULAMPORTS if the RPC call fails or returns no data.
   */
  private async estimatePriorityFee(): Promise<number> {
    try {
      const fees = await this.connection.getRecentPrioritizationFees({
        lockedWritableAccounts: [this.programId],
      });
      if (fees.length === 0) return MIN_PRIORITY_FEE_ULAMPORTS;

      const sorted = fees
        .map((f) => f.prioritizationFee)
        .sort((a, b) => a - b);

      const p75Index = Math.floor(sorted.length * 0.75);
      return Math.max(sorted[p75Index] ?? MIN_PRIORITY_FEE_ULAMPORTS, MIN_PRIORITY_FEE_ULAMPORTS);
    } catch {
      return MIN_PRIORITY_FEE_ULAMPORTS;
    }
  }

  // ---------------------------------------------------------------------------
  // Account derivation
  // ---------------------------------------------------------------------------

  /**
   * Derive the full set of account metas for the Withdraw instruction.
   *
   * On-chain account order (from withdraw.rs):
   *   0. pool              — PDA ["stealth_pool", token_mint]  (mut)
   *   1. merkle_root_history — PDA ["merkle_roots", pool]       (read)
   *   2. spent_nullifier   — PDA ["nullifier", pool, nullifier_hash] (init, mut)
   *   3. pool_token_account  — ATA(pool, token_mint)            (mut)
   *   4. recipient_token_account — ATA(recipient, token_mint)   (mut)
   *   5. fee_token_account — fee vault token account             (mut)
   *   6. relayer           — signer, payer for nullifier PDA    (mut)
   *   7. token_program     — SPL Token program                  (read)
   *   8. system_program    — System program                     (read)
   */
  private async deriveWithdrawAccounts(
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

    const poolTokenAccount = await getAssociatedTokenAddress(
      tokenMint, poolPda, true,
    );

    const recipientTokenAccount = await getAssociatedTokenAddress(
      tokenMint, recipient, true,
    );

    // Parse fee_vault pubkey from on-chain pool account data.
    // StealthPool layout: disc(8) + authority(32) + token_mint(32) + fee_bps(2) +
    //   min_deposit(8) + max_deposit(8) + total_deposits(8) + total_withdrawals(8) +
    //   deposit_count(8) + withdrawal_count(8) + current_merkle_index(4) + paused(1) +
    //   merkle_root(32) + fee_vault(32) + bump(1)
    const FEE_VAULT_OFFSET = 8 + 32 + 32 + 2 + 8 + 8 + 8 + 8 + 8 + 8 + 4 + 1 + 32; // = 151
    const poolAccount = await this.connection.getAccountInfo(poolPda);
    let feeTokenAccount: PublicKey;
    if (poolAccount && poolAccount.data.length >= FEE_VAULT_OFFSET + 32) {
      feeTokenAccount = new PublicKey(
        poolAccount.data.subarray(FEE_VAULT_OFFSET, FEE_VAULT_OFFSET + 32)
      );
    } else {
      feeTokenAccount = poolTokenAccount;
    }

    return [
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: merkleRootHistoryPda, isSigner: false, isWritable: false },
      { pubkey: spentNullifierPda, isSigner: false, isWritable: true },
      { pubkey: poolTokenAccount, isSigner: false, isWritable: true },
      { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true },
      { pubkey: this.relayerKeypair!.publicKey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
  }

  // ---------------------------------------------------------------------------
  // Instruction serialization
  // ---------------------------------------------------------------------------

  /**
   * Serialize withdrawal instruction data matching Anchor's layout:
   *   discriminator(8) + proof_a(64) + proof_b(128) + proof_c(64) +
   *   nullifier_hash(32) + recipient(32) + amount(8) + merkle_root(32)
   */
  private buildWithdrawInstructionData(
    proofA: Buffer,
    proofB: Buffer,
    proofC: Buffer,
    nullifierHash: Buffer,
    recipient: PublicKey,
    amount: bigint,
    merkleRoot: Buffer,
  ): Buffer {
    // Anchor discriminator: first 8 bytes of sha256("global:withdraw")
    const discriminator = Buffer.from([183, 18, 70, 156, 148, 109, 161, 34]);

    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64LE(amount);

    return Buffer.concat([
      discriminator,
      proofA,
      proofB,
      proofC,
      nullifierHash,
      recipient.toBuffer(),
      amountBuf,
      merkleRoot,
    ]);
  }
}
