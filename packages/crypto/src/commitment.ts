import { sha256 } from '@noble/hashes/sha256';

/**
 * Compute a Pedersen-style commitment for a deposit.
 *
 * commitment = Hash(secret || nullifier || amount || tokenMint)
 *
 * In the ZK circuit, this uses Poseidon for field-friendliness.
 * Client-side, we replicate with SHA-256 for non-ZK contexts,
 * and use the circomlibjs Poseidon for proof generation.
 */
export function computeCommitment(
  secret: Uint8Array,
  nullifier: Uint8Array,
  amount: bigint,
  tokenMint: Uint8Array
): Uint8Array {
  const amountBytes = bigintToBytes(amount, 8);

  const input = new Uint8Array(
    secret.length + nullifier.length + amountBytes.length + tokenMint.length
  );
  let offset = 0;
  input.set(secret, offset); offset += secret.length;
  input.set(nullifier, offset); offset += nullifier.length;
  input.set(amountBytes, offset); offset += amountBytes.length;
  input.set(tokenMint, offset);

  return sha256(input);
}

/**
 * Compute the nullifier hash.
 *
 * nullifier_hash = Hash(nullifier)
 *
 * Same note as above — in-circuit this is Poseidon, off-circuit this is SHA-256.
 */
export function computeNullifierHash(nullifier: Uint8Array): Uint8Array {
  return sha256(nullifier);
}

function bigintToBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let remaining = value;
  for (let i = 0; i < length; i++) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}
