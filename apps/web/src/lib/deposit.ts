import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import {
  computeCommitment,
  computeNullifierHash,
  encryptNote,
  deriveStealthAddress,
} from '@skaus/crypto';
import type { StealthMetaAddress, DepositNoteData } from '@skaus/crypto';
import { splitIntoTiers, DEPOSIT_TIERS_USDC, DEPOSIT_TIERS_SOL } from '@skaus/types';
import { buildDepositTransaction, derivePoolPda } from './stealth';
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
  const tiers = token === 'USDC'
    ? splitIntoTiers(amount, [...DEPOSIT_TIERS_USDC])
    : splitIntoTiers(amount, [...DEPOSIT_TIERS_SOL]);

  const tokenMint = new PublicKey(config.tokenMint);
  const [poolPda] = derivePoolPda(tokenMint);

  const depositorAta = await getAssociatedTokenAddress(tokenMint, depositor);
  const poolAta = await getAssociatedTokenAddress(tokenMint, poolPda, true);

  const depositorAtaInfo = await connection.getAccountInfo(depositorAta);
  if (!depositorAtaInfo) {
    throw new Error(
      'You do not have a token account for this mint. ' +
      'Please fund your wallet with the pool token first.'
    );
  }

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

    onProgress?.('signing', i + 1, tiers.length);
    const signedTx = await signTransaction(tx);

    onProgress?.('confirming', i + 1, tiers.length);
    const sig = await connection.sendRawTransaction(signedTx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');

    signatures.push(sig);
  }

  return { signatures, tiers, commitments };
}
