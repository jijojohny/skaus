import { computeCommitment, computeNullifierHash } from '@skaus/crypto';
import type { DepositNoteData } from '@skaus/crypto';

const MERKLE_DEPTH = 20;

function bigintToBytes32BE(value: bigint): Buffer {
  const hex = value.toString(16).padStart(64, '0');
  return Buffer.from(hex, 'hex');
}

function bytes32ToBigint(bytes: Uint8Array): bigint {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return BigInt('0x' + (hex || '0'));
}

let poseidonInstance: unknown = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    const { buildPoseidon } = await import('circomlibjs');
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance as any;
}

async function poseidonHash2(a: bigint, b: bigint): Promise<bigint> {
  const poseidon = await getPoseidon();
  return poseidon.F.toObject(poseidon([a, b]));
}

async function computeZeros(): Promise<bigint[]> {
  const zeros: bigint[] = [0n];
  for (let i = 1; i <= MERKLE_DEPTH; i++) {
    zeros.push(await poseidonHash2(zeros[i - 1], zeros[i - 1]));
  }
  return zeros;
}

/**
 * Compute the Merkle path for a leaf at the given index.
 * Uses zero-value siblings matching the on-chain incremental tree in merkle.rs.
 */
export async function computeMerklePath(
  leafCommitment: bigint,
  leafIndex: number,
): Promise<{ pathElements: bigint[]; pathIndices: number[]; root: bigint }> {
  const zeros = await computeZeros();
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];

  let currentHash = leafCommitment;
  let idx = leafIndex;

  for (let level = 0; level < MERKLE_DEPTH; level++) {
    pathElements.push(zeros[level]);
    pathIndices.push(idx & 1);

    if ((idx & 1) === 0) {
      currentHash = await poseidonHash2(currentHash, zeros[level]);
    } else {
      currentHash = await poseidonHash2(zeros[level], currentHash);
    }
    idx >>= 1;
  }

  return { pathElements, pathIndices, root: currentHash };
}

/**
 * Encode a snarkjs proof into the 256-byte format expected by groth16-solana.
 *
 * Layout: proofA(64) + proofB(128) + proofC(64)
 *   G1: [x_BE(32), y_BE(32)]
 *   G2: [x_c1_BE(32), x_c0_BE(32), y_c1_BE(32), y_c0_BE(32)]  (imaginary-before-real)
 */
export function proofToBytes(proof: {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}): Buffer {
  const a = Buffer.concat([
    bigintToBytes32BE(BigInt(proof.pi_a[0])),
    bigintToBytes32BE(BigInt(proof.pi_a[1])),
  ]);
  const b = Buffer.concat([
    bigintToBytes32BE(BigInt(proof.pi_b[0][1])),
    bigintToBytes32BE(BigInt(proof.pi_b[0][0])),
    bigintToBytes32BE(BigInt(proof.pi_b[1][1])),
    bigintToBytes32BE(BigInt(proof.pi_b[1][0])),
  ]);
  const c = Buffer.concat([
    bigintToBytes32BE(BigInt(proof.pi_c[0])),
    bigintToBytes32BE(BigInt(proof.pi_c[1])),
  ]);
  return Buffer.concat([a, b, c]);
}

export interface WithdrawalProofResult {
  proofBytes: Buffer;
  merkleRootHex: string;
}

/**
 * Generate a Groth16 withdrawal proof using snarkjs in-browser WASM.
 *
 * @param noteData     Decrypted deposit note (secret, nullifier, amount, tokenMint).
 * @param leafIndex    On-chain leaf index of this deposit.
 * @param recipientPubkeyBytes  32-byte recipient Solana public key.
 * @param fee          Fee amount in token base units.
 * @param wasmPath     URL or path to withdrawal.wasm (served as static asset).
 * @param zkeyPath     URL or path to withdrawal_final.zkey (served as static asset).
 */
export async function generateWithdrawalProof(
  noteData: DepositNoteData,
  leafIndex: number,
  recipientPubkeyBytes: Uint8Array,
  fee: bigint,
  wasmPath: string,
  zkeyPath: string,
): Promise<WithdrawalProofResult> {
  const commitment = await computeCommitment(noteData.secret, noteData.nullifier, noteData.amount);
  const commitmentBigint = bytes32ToBigint(commitment);

  const { pathElements, pathIndices, root } = await computeMerklePath(commitmentBigint, leafIndex);

  const nullifierHashBytes = await computeNullifierHash(noteData.nullifier);
  const nullifierHashBigint = bytes32ToBigint(nullifierHashBytes);
  const recipientBigint = bytes32ToBigint(recipientPubkeyBytes);

  const inputs = {
    merkleRoot: root.toString(),
    nullifierHash: nullifierHashBigint.toString(),
    recipient: recipientBigint.toString(),
    amount: noteData.amount.toString(),
    fee: fee.toString(),
    secret: noteData.secret.toString(),
    nullifier: noteData.nullifier.toString(),
    merklePath: pathElements.map((e) => e.toString()),
    pathIndices: pathIndices.map((i) => i.toString()),
  };

  const snarkjs = await import('snarkjs');
  const { proof } = await snarkjs.groth16.fullProve(inputs, wasmPath, zkeyPath);

  return {
    proofBytes: proofToBytes(proof),
    merkleRootHex: bigintToBytes32BE(root).toString('hex'),
  };
}
