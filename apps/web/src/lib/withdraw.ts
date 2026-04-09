import { PublicKey } from '@solana/web3.js';
import { computeNullifierHash } from '@skaus/crypto';
import { submitWithdrawal } from './gateway';
import { config } from './config';
import type { ScannedDeposit } from './scan';

export interface WithdrawResult {
  txSignature: string;
  status: string;
  fee: string;
}

/**
 * Fetch the pool's fee_bps from on-chain data.
 * StealthPool layout: disc(8) + authority(32) + token_mint(32) + fee_bps(2)
 * fee_bps is a u16 at offset 72.
 */
async function getPoolFeeBps(): Promise<bigint> {
  try {
    const { Connection } = await import('@solana/web3.js');
    const connection = new Connection(
      process.env.NEXT_PUBLIC_RPC_URL || `https://api.devnet.solana.com`,
      'confirmed'
    );
    const { derivePoolPda } = await import('./stealth');
    const tokenMint = new PublicKey(config.tokenMint);
    const [poolPda] = derivePoolPda(tokenMint);
    const poolAccount = await connection.getAccountInfo(poolPda);

    if (poolAccount && poolAccount.data.length >= 74) {
      return BigInt(poolAccount.data.readUInt16LE(72));
    }
  } catch {}

  return 10n;
}

/**
 * Execute a withdrawal via the gateway relayer.
 *
 * The devnet deployment uses the `devnet-mock` feature flag, which accepts
 * any proof. In production, a real Groth16 proof would be generated from
 * the circuit using snarkjs with the proving key.
 */
export async function executeWithdraw(
  deposit: ScannedDeposit,
  recipientAddress: string,
  merkleRoot: string,
): Promise<WithdrawResult> {
  const nullifierHash = await computeNullifierHash(deposit.noteData.nullifier);
  const nullifierHex = Buffer.from(nullifierHash).toString('hex');

  const mockProof = Buffer.alloc(256);
  const proofBase64 = mockProof.toString('base64');

  const amount = deposit.noteData.amount;
  const feeBps = await getPoolFeeBps();
  const fee = (amount * feeBps) / 10000n;

  const result = await submitWithdrawal({
    proof: proofBase64,
    tokenMint: config.tokenMint,
    publicInputs: {
      merkleRoot,
      nullifierHash: nullifierHex,
      recipient: recipientAddress,
      amount: amount.toString(),
      fee: fee.toString(),
    },
  });

  return result;
}
