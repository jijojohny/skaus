import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import {
  computeCommitment,
  encryptNote,
  deriveStealthAddress,
} from '@skaus/crypto';
import type { StealthMetaAddress, DepositNoteData } from '@skaus/crypto';
import {
  splitIntoTiers,
  splitIntoTiersWithRemainder,
  DEPOSIT_TIERS_USDC,
  DEPOSIT_TIERS_SOL,
  MIN_DEPOSIT_USDC,
  MIN_DEPOSIT_SOL,
} from '@skaus/types';
import { buildDepositTransaction } from './stealth';
import { config } from './config';

function generateSecureRandom(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  return value;
}

export interface DepositResult {
  signatures: string[];
  tiers: bigint[];
  commitments: Uint8Array[];
}

/**
 * Preview how an amount will be split into tier deposits.
 * Returns the deposit count and any unsplittable remainder.
 */
export function previewDeposit(
  amount: bigint,
  token: 'USDC' | 'SOL',
): { depositCount: number; remainder: bigint; minUnit: string } {
  const tiers = token === 'USDC' ? DEPOSIT_TIERS_USDC : DEPOSIT_TIERS_SOL;
  const { deposits, remainder } = splitIntoTiersWithRemainder(amount, [...tiers]);
  const minUnit = token === 'USDC' ? '$0.01' : '0.001 SOL';
  return { depositCount: deposits.length, remainder, minUnit };
}

/**
 * Execute a full deposit flow:
 *  1. Split amount into fixed tiers
 *  2. For each tier, generate secret/nullifier, compute commitment
 *  3. Derive stealth shared secret, encrypt note for recipient
 *  4. Build and sign on-chain deposit transaction
 */
export async function executeDeposit(
  connection: Connection,
  depositor: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  amount: bigint,
  token: 'USDC' | 'SOL',
  recipientMeta: StealthMetaAddress,
  onProgress?: (step: string, current: number, total: number) => void,
): Promise<DepositResult> {
  const tierList = token === 'USDC' ? DEPOSIT_TIERS_USDC : DEPOSIT_TIERS_SOL;
  const minDeposit = token === 'USDC' ? MIN_DEPOSIT_USDC : MIN_DEPOSIT_SOL;

  if (amount < minDeposit) {
    const label = token === 'USDC' ? '$0.01' : '0.001 SOL';
    throw new Error(`Amount is below the minimum deposit of ${label}`);
  }

  const tiers = splitIntoTiers(amount, [...tierList]);

  const tokenMint = new PublicKey(config.tokenMint);
  const { derivePoolPda } = await import('./stealth');
  const [poolPda] = derivePoolPda(tokenMint);

  const depositorAta = await getAssociatedTokenAddress(tokenMint, depositor);
  const poolAta = await getAssociatedTokenAddress(tokenMint, poolPda, true);

  const signatures: string[] = [];
  const commitments: Uint8Array[] = [];

  for (let i = 0; i < tiers.length; i++) {
    const tierAmount = tiers[i];
    onProgress?.('preparing', i + 1, tiers.length);

    const secret = generateSecureRandom();
    const nullifier = generateSecureRandom();
    const commitment = await computeCommitment(secret, nullifier, tierAmount);
    commitments.push(commitment);

    const { ephemeralPubkey, sharedSecret } = deriveStealthAddress(recipientMeta, i);

    const noteData: DepositNoteData = {
      secret,
      nullifier,
      amount: tierAmount,
      tokenMint: tokenMint.toBase58(),
      ephemeralPubkey,
    };
    const encryptedNote = encryptNote(noteData, sharedSecret);

    const tx = await buildDepositTransaction(
      connection,
      depositor,
      tokenMint,
      tierAmount,
      commitment,
      encryptedNote,
    );

    // Always prepend idempotent ATA creates on the first deposit tx.
    // These are no-ops if the accounts already exist — safe to always include.
    // This guarantees both the depositor and pool token accounts are initialized
    // before the deposit instruction executes.
    if (i === 0) {
      tx.instructions.unshift(
        // Pool ATA (owned by PDA — allowOwnerOffCurve)
        createAssociatedTokenAccountIdempotentInstruction(
          depositor,
          poolAta,
          poolPda,
          tokenMint,
        ),
      );
      tx.instructions.unshift(
        // Depositor ATA
        createAssociatedTokenAccountIdempotentInstruction(
          depositor,
          depositorAta,
          depositor,
          tokenMint,
        ),
      );
    }

    onProgress?.('signing', i + 1, tiers.length);
    const signedTx = await signTransaction(tx);

    onProgress?.('confirming', i + 1, tiers.length);
    const sig = await connection.sendRawTransaction(signedTx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');

    signatures.push(sig);
  }

  return { signatures, tiers, commitments };
}
