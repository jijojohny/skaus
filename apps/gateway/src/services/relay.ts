import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';

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

export class RelayService {
  private connection: Connection;
  private relayerKeypair: Keypair | null;
  private programId: PublicKey;
  private maxPendingTxs: number;
  private pendingTxCount = 0;
  private totalRelayed = 0;

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
      const proofA = proofBytes.slice(0, 64);
      const proofB = proofBytes.slice(64, 192);
      const proofC = proofBytes.slice(192, 256);

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

      const instruction = new TransactionInstruction({
        programId: this.programId,
        keys: accountMetas,
        data: instructionData,
      });

      const transaction = new Transaction();

      const recipientAta = await getAssociatedTokenAddress(tokenMint, recipient, true);
      const recipientAtaInfo = await this.connection.getAccountInfo(recipientAta);
      if (!recipientAtaInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.relayerKeypair.publicKey,
            recipientAta,
            recipient,
            tokenMint,
          )
        );
      }

      transaction.add(instruction);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.relayerKeypair],
        { commitment: 'confirmed' }
      );

      this.totalRelayed++;

      return {
        txSignature: signature,
        status: 'confirmed',
        fee: publicInputs.fee,
      };
    } finally {
      this.pendingTxCount--;
    }
  }

  getStatus() {
    return {
      active: !!this.relayerKeypair,
      pendingTxs: this.pendingTxCount,
      totalRelayed: this.totalRelayed,
      maxPendingTxs: this.maxPendingTxs,
      relayerPubkey: this.relayerKeypair?.publicKey.toBase58() || null,
    };
  }

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
        poolAccount.data.slice(FEE_VAULT_OFFSET, FEE_VAULT_OFFSET + 32)
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
