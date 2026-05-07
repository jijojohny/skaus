import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';

export function derivePoolPda(tokenMint: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stealth_pool'), tokenMint.toBuffer()],
    programId,
  );
}

export function deriveMerkleRootHistoryPda(pool: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('merkle_roots'), pool.toBuffer()],
    programId,
  );
}

export function deriveDepositNotePda(pool: PublicKey, commitment: Uint8Array, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('deposit_note'), pool.toBuffer(), Buffer.from(commitment)],
    programId,
  );
}

export function deriveSpentNullifierPda(pool: PublicKey, nullifierHash: Uint8Array, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('nullifier'), pool.toBuffer(), Buffer.from(nullifierHash)],
    programId,
  );
}

// Anchor discriminator: first 8 bytes of sha256("global:deposit")
const DEPOSIT_DISCRIMINATOR = Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]);

/**
 * Build a deposit transaction for the stealth pool.
 *
 * On-chain account order (deposit.rs):
 *   0. pool                    — PDA ["stealth_pool", token_mint]       (mut)
 *   1. merkle_root_history     — PDA ["merkle_roots", pool]             (mut)
 *   2. deposit_note            — PDA ["deposit_note", pool, commitment] (init, mut)
 *   3. depositor_token_account — ATA(depositor, token_mint)             (mut)
 *   4. pool_token_account      — ATA(pool, token_mint)                  (mut)
 *   5. depositor               — signer, payer                          (mut)
 *   6. token_program           — SPL Token                              (read)
 *   7. system_program          — System                                 (read)
 */
export async function buildDepositTransaction(
  connection: Connection,
  depositor: PublicKey,
  tokenMint: PublicKey,
  amount: bigint,
  commitment: Uint8Array,
  encryptedNote: Uint8Array,
  programId: PublicKey,
): Promise<Transaction> {
  const [poolPda] = derivePoolPda(tokenMint, programId);
  const [merkleRootHistoryPda] = deriveMerkleRootHistoryPda(poolPda, programId);
  const [depositNotePda] = deriveDepositNotePda(poolPda, commitment, programId);

  const depositorTokenAccount = await getAssociatedTokenAddress(tokenMint, depositor);
  const poolTokenAccount = await getAssociatedTokenAddress(tokenMint, poolPda, true);

  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amount);

  const noteLen = Buffer.alloc(4);
  noteLen.writeUInt32LE(encryptedNote.length);

  const data = Buffer.concat([
    DEPOSIT_DISCRIMINATOR,
    amountBuf,
    Buffer.from(commitment),
    noteLen,
    Buffer.from(encryptedNote),
  ]);

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: merkleRootHistoryPda, isSigner: false, isWritable: true },
      { pubkey: depositNotePda, isSigner: false, isWritable: true },
      { pubkey: depositorTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolTokenAccount, isSigner: false, isWritable: true },
      { pubkey: depositor, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const transaction = new Transaction().add(instruction);
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = depositor;

  return transaction;
}
