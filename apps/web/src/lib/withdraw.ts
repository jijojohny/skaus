import { Connection, PublicKey } from '@solana/web3.js';
import { computeCommitment, computeNullifierHash } from '@skaus/crypto';
import { submitWithdrawal } from './gateway';
import { config } from './config';
import { derivePoolPda } from './stealth';
import type { ScannedDeposit } from './scan';

const MERKLE_DEPTH = 20;

export interface WithdrawResult {
  txSignature: string;
  status: string;
  fee: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bigintToBytes32BE(value: bigint): Buffer {
  const hex = value.toString(16).padStart(64, '0');
  return Buffer.from(hex, 'hex');
}

function bytes32ToBigint(bytes: Uint8Array): bigint {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return BigInt('0x' + (hex || '0'));
}

// ---------------------------------------------------------------------------
// Poseidon (via circomlibjs — BN254 X5 matching circuit & on-chain)
// ---------------------------------------------------------------------------

let poseidonInstance: any = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    const { buildPoseidon } = await import('circomlibjs');
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

async function poseidonHash2(a: bigint, b: bigint): Promise<bigint> {
  const poseidon = await getPoseidon();
  return poseidon.F.toObject(poseidon([a, b]));
}

// ---------------------------------------------------------------------------
// Merkle path computation (mirrors on-chain insert_leaf in merkle.rs)
//
// The on-chain incremental tree pairs each new leaf with zero-value
// siblings at every level. Each deposit produces an independent root.
// The proof must reproduce this exact root.
// ---------------------------------------------------------------------------

async function computeZeros(): Promise<bigint[]> {
  const zeros: bigint[] = [0n];
  for (let i = 1; i <= MERKLE_DEPTH; i++) {
    zeros.push(await poseidonHash2(zeros[i - 1], zeros[i - 1]));
  }
  return zeros;
}

async function computeMerklePath(
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

// ---------------------------------------------------------------------------
// snarkjs proof → 256-byte on-chain format
//
// Layout: proofA(64) + proofB(128) + proofC(64)
//   G1 (A, C): [x_BE(32), y_BE(32)]
//   G2 (B):    [x_c1_BE(32), x_c0_BE(32), y_c1_BE(32), y_c0_BE(32)]
// Fp2 components ordered imaginary-before-real for groth16-solana.
// ---------------------------------------------------------------------------

function proofToBytes(proof: {
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

// ---------------------------------------------------------------------------
// On-chain state reads
// ---------------------------------------------------------------------------

async function getPoolFeeBps(): Promise<bigint> {
  try {
    const rpc =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_RPC_URL ||
      'https://api.devnet.solana.com';
    const connection = new Connection(rpc, 'confirmed');
    const tokenMint = new PublicKey(config.tokenMint);
    const [poolPda] = derivePoolPda(tokenMint);
    const poolAccount = await connection.getAccountInfo(poolPda);

    if (poolAccount && poolAccount.data.length >= 74) {
      return BigInt(poolAccount.data.readUInt16LE(72));
    }
  } catch {}

  return 10n;
}

// ---------------------------------------------------------------------------
// Groth16 proof generation
// ---------------------------------------------------------------------------

/**
 * Circuit artifacts must be served as static assets under /public/circuits/.
 * Copy from:
 *   circuits/withdrawal/build/withdrawal_js/withdrawal.wasm → public/circuits/withdrawal.wasm
 *   circuits/withdrawal/keys/withdrawal_final.zkey          → public/circuits/withdrawal_final.zkey
 */
const WASM_PATH = '/circuits/withdrawal.wasm';
const ZKEY_PATH = '/circuits/withdrawal_final.zkey';

async function generateWithdrawalProof(
  deposit: ScannedDeposit,
  recipientAddress: string,
  fee: bigint,
): Promise<{ proofBytes: Buffer; merkleRootHex: string }> {
  // Recompute commitment from the decrypted note data
  const commitment = await computeCommitment(
    deposit.noteData.secret,
    deposit.noteData.nullifier,
    deposit.noteData.amount,
  );
  const commitmentBigint = bytes32ToBigint(commitment);

  // Build Merkle path (zero-value siblings matching on-chain insert_leaf)
  const { pathElements, pathIndices, root } = await computeMerklePath(
    commitmentBigint,
    deposit.leafIndex,
  );

  // Derive public input values
  const nullifierHashBytes = await computeNullifierHash(deposit.noteData.nullifier);
  const nullifierHashBigint = bytes32ToBigint(nullifierHashBytes);
  const recipientBigint = bytes32ToBigint(new PublicKey(recipientAddress).toBytes());

  // snarkjs expects all inputs as decimal strings
  const inputs = {
    merkleRoot: root.toString(),
    nullifierHash: nullifierHashBigint.toString(),
    recipient: recipientBigint.toString(),
    amount: deposit.noteData.amount.toString(),
    fee: fee.toString(),
    secret: deposit.noteData.secret.toString(),
    nullifier: deposit.noteData.nullifier.toString(),
    merklePath: pathElements.map((e) => e.toString()),
    pathIndices: pathIndices.map((i) => i.toString()),
  };

  const snarkjs = await import('snarkjs');
  const { proof } = await snarkjs.groth16.fullProve(inputs, WASM_PATH, ZKEY_PATH);

  return {
    proofBytes: proofToBytes(proof),
    merkleRootHex: bigintToBytes32BE(root).toString('hex'),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a privacy-preserving withdrawal via the gateway relayer.
 *
 * When NEXT_PUBLIC_DEMO_MODE=true, sends a zero-filled mock proof for use
 * with the on-chain devnet-mock verifier. Otherwise generates a real
 * Groth16 proof using snarkjs with the compiled circuit artifacts.
 */
export async function executeWithdraw(
  deposit: ScannedDeposit,
  recipientAddress: string,
  merkleRoot?: string,
): Promise<WithdrawResult> {
  const nullifierHash = await computeNullifierHash(deposit.noteData.nullifier);
  const nullifierHex = Buffer.from(nullifierHash).toString('hex');

  const amount = deposit.noteData.amount;
  const feeBps = await getPoolFeeBps();
  const fee = (amount * feeBps) / 10000n;

  let proofBase64: string;
  let resolvedRoot: string;

  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    // Devnet mock: on-chain verifier bypasses proof check
    proofBase64 = Buffer.alloc(256).toString('base64');
    resolvedRoot = merkleRoot || '0'.repeat(64);
  } else {
    const { proofBytes, merkleRootHex } = await generateWithdrawalProof(
      deposit,
      recipientAddress,
      fee,
    );
    proofBase64 = proofBytes.toString('base64');
    resolvedRoot = merkleRootHex;
  }

  return submitWithdrawal({
    proof: proofBase64,
    tokenMint: config.tokenMint,
    publicInputs: {
      merkleRoot: resolvedRoot,
      nullifierHash: nullifierHex,
      recipient: recipientAddress,
      amount: amount.toString(),
      fee: fee.toString(),
    },
  });
}
