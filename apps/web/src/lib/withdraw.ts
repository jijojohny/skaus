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
 * Execute a withdrawal via the gateway relayer.
 *
 * The devnet deployment uses the `devnet-mock` feature flag, which accepts
 * any proof. In production, a real Groth16 proof would be generated from
 * the circuit using snarkjs with the proving key.
 *
 * Flow:
 *  1. Compute nullifier hash from the note's nullifier
 *  2. Build mock proof (256 bytes of zeros — accepted by devnet-mock)
 *  3. Submit to the gateway relay endpoint
 *  4. Gateway builds and sends the withdraw transaction on-chain
 */
export async function executeWithdraw(
  deposit: ScannedDeposit,
  recipientAddress: string,
  merkleRoot: string,
): Promise<WithdrawResult> {
  const nullifierHash = await computeNullifierHash(deposit.noteData.nullifier);
  const nullifierHex = Buffer.from(nullifierHash).toString('hex');

  // On devnet with devnet-mock feature, proof verification is bypassed.
  // Create a valid-sized mock proof (256 bytes = proofA(64) + proofB(128) + proofC(64)).
  const mockProof = Buffer.alloc(256);
  const proofBase64 = mockProof.toString('base64');

  const amount = deposit.noteData.amount;
  const feeBps = 30n;
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
