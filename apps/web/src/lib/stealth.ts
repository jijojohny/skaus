import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';

const STEALTH_POOL_PROGRAM_ID = new PublicKey('EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq');

/**
 * Derive the pool PDA for a given token mint.
 */
export function derivePoolPda(tokenMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stealth_pool'), tokenMint.toBuffer()],
    STEALTH_POOL_PROGRAM_ID,
  );
}

/**
 * Derive the Merkle root history PDA for a given pool.
 */
export function deriveMerkleRootHistoryPda(pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('merkle_roots'), pool.toBuffer()],
    STEALTH_POOL_PROGRAM_ID,
  );
}

/**
 * Derive the deposit note PDA for a given pool and commitment.
 */
export function deriveDepositNotePda(pool: PublicKey, commitment: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('deposit_note'), pool.toBuffer(), Buffer.from(commitment)],
    STEALTH_POOL_PROGRAM_ID,
  );
}

/**
 * Derive the spent nullifier PDA for double-spend checking.
 */
export function deriveSpentNullifierPda(pool: PublicKey, nullifierHash: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('nullifier'), pool.toBuffer(), Buffer.from(nullifierHash)],
    STEALTH_POOL_PROGRAM_ID,
  );
}

/**
 * Build a deposit transaction for the stealth pool.
 *
 * On-chain account order (from deposit.rs):
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
): Promise<Transaction> {
  const [poolPda] = derivePoolPda(tokenMint);
  const [merkleRootHistoryPda] = deriveMerkleRootHistoryPda(poolPda);
  const [depositNotePda] = deriveDepositNotePda(poolPda, commitment);

  const depositorTokenAccount = await getAssociatedTokenAddress(
    tokenMint, depositor,
  );

  const poolTokenAccount = await getAssociatedTokenAddress(
    tokenMint, poolPda, true,
  );

  // Anchor discriminator: first 8 bytes of sha256("global:deposit")
  const discriminator = Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]);

  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amount);

  const commitmentBuf = Buffer.from(commitment);

  // Vec<u8> serialization: 4-byte LE length prefix + data
  const noteLen = Buffer.alloc(4);
  noteLen.writeUInt32LE(encryptedNote.length);

  const data = Buffer.concat([
    discriminator,
    amountBuf,
    commitmentBuf,
    noteLen,
    Buffer.from(encryptedNote),
  ]);

  const instruction = new TransactionInstruction({
    programId: STEALTH_POOL_PROGRAM_ID,
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

/**
 * Resolve a SKAUS pay link to the recipient's stealth meta-address.
 */
export async function resolvePayLink(
  username: string,
  gatewayUrl: string = 'http://localhost:3001'
): Promise<{
  recipientMetaAddress: string;
  pool: string;
  network: string;
}> {
  const response = await fetch(`${gatewayUrl}/pay/${username}`);
  if (!response.ok) {
    throw new Error(`Failed to resolve pay link: ${response.statusText}`);
  }
  return response.json();
}
