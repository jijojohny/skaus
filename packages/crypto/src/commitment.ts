/**
 * Commitment and nullifier hash computation matching the ZK circuit.
 *
 * The circuit uses Poseidon over BN254:
 *   commitment    = Poseidon(secret, nullifier, amount)
 *   nullifierHash = Poseidon(nullifier)
 *
 * Client-side we use circomlibjs to produce identical hashes.
 * The `buildPoseidon()` call is async, so we cache the instance.
 */

let poseidonInstance: any = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    const { buildPoseidon } = await import('circomlibjs');
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

/**
 * Compute commitment = Poseidon(secret, nullifier, amount).
 * Returns 32-byte big-endian field element matching the circuit.
 */
export async function computeCommitment(
  secret: bigint,
  nullifier: bigint,
  amount: bigint,
): Promise<Uint8Array> {
  const poseidon = await getPoseidon();
  const hash = poseidon([secret, nullifier, amount]);
  const value = poseidon.F.toObject(hash);
  return bigintToBytes32BE(value);
}

/**
 * Compute nullifier hash = Poseidon(nullifier).
 * Returns 32-byte big-endian field element matching the circuit.
 */
export async function computeNullifierHash(nullifier: bigint): Promise<Uint8Array> {
  const poseidon = await getPoseidon();
  const hash = poseidon([nullifier]);
  const value = poseidon.F.toObject(hash);
  return bigintToBytes32BE(value);
}

/**
 * Convert a bigint to a 32-byte big-endian Uint8Array.
 */
function bigintToBytes32BE(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
