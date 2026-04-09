import { PublicKey } from '@solana/web3.js';
import type { StealthMetaAddress } from './types';

const NAME_REGISTRY_SEED = 'name';
const REGISTRY_CONFIG_SEED = 'registry_config';
const DEPOSIT_PATH_SEED = 'deposit_path';

/**
 * Compute the Poseidon hash of a lowercase name for PDA derivation.
 * Uses the same Poseidon instance as the commitment module.
 */
export async function hashName(name: string): Promise<Uint8Array> {
  const normalized = name.toLowerCase().trim();
  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();

  const nameBytes = new TextEncoder().encode(normalized);
  const chunks: bigint[] = [];
  for (let i = 0; i < nameBytes.length; i += 31) {
    let val = 0n;
    for (let j = 0; j < 31 && i + j < nameBytes.length; j++) {
      val |= BigInt(nameBytes[i + j]) << BigInt(j * 8);
    }
    chunks.push(val);
  }

  const hash = poseidon(chunks);
  const value = poseidon.F.toObject(hash);
  return bigintToBytes32BE(value);
}

/**
 * Derive the NameRecord PDA from a name hash.
 */
export function deriveNameRecordPDA(
  nameHash: Uint8Array,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(NAME_REGISTRY_SEED), Buffer.from(nameHash)],
    programId,
  );
}

/**
 * Derive the RegistryConfig PDA (singleton).
 */
export function deriveRegistryConfigPDA(
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(REGISTRY_CONFIG_SEED)],
    programId,
  );
}

/**
 * Derive a DepositPath PDA from the name record and path index.
 */
export function deriveDepositPathPDA(
  nameRecord: PublicKey,
  pathIndex: bigint,
  programId: PublicKey,
): [PublicKey, number] {
  const indexBytes = Buffer.alloc(8);
  indexBytes.writeBigUInt64LE(pathIndex);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(DEPOSIT_PATH_SEED), nameRecord.toBuffer(), indexBytes],
    programId,
  );
}

/**
 * Derive per-link scan and spend keys from base keys + path index.
 *
 * path_scan_key  = base_scan_key + Hash("skaus_path" || path_index) * G
 * path_spend_key = base_spend_key + Hash("skaus_path" || path_index) * G
 *
 * Since we're on Curve25519 (not an additive group for x25519 pubkeys),
 * we use HKDF to derive a path-specific sub-key from the base privkey.
 */
export function derivePathKeys(
  baseScanPubkey: Uint8Array,
  baseSpendPubkey: Uint8Array,
  pathIndex: bigint,
): StealthMetaAddress {
  const { sha256 } = require('@noble/hashes/sha256');

  const prefix = new TextEncoder().encode('skaus_path');
  const indexBytes = new Uint8Array(8);
  const view = new DataView(indexBytes.buffer);
  view.setBigUint64(0, pathIndex, true);

  const scanInput = new Uint8Array(prefix.length + indexBytes.length + baseScanPubkey.length);
  scanInput.set(prefix);
  scanInput.set(indexBytes, prefix.length);
  scanInput.set(baseScanPubkey, prefix.length + indexBytes.length);
  const pathScanKey = sha256(scanInput);

  const spendInput = new Uint8Array(prefix.length + indexBytes.length + baseSpendPubkey.length);
  spendInput.set(prefix);
  spendInput.set(indexBytes, prefix.length);
  spendInput.set(baseSpendPubkey, prefix.length + indexBytes.length);
  const pathSpendKey = sha256(spendInput);

  return {
    scanPubkey: pathScanKey,
    spendPubkey: pathSpendKey,
    version: 1,
  };
}

/**
 * Validate a SKAUS name string (client-side mirror of on-chain validation).
 */
export function validateName(name: string): { valid: boolean; error?: string } {
  if (name.length < 3) return { valid: false, error: 'Name must be at least 3 characters' };
  if (name.length > 32) return { valid: false, error: 'Name must be at most 32 characters' };

  if (name[0] === '_' || name[0] === '-') {
    return { valid: false, error: 'Name cannot start with underscore or hyphen' };
  }

  if (!/^[a-z0-9_-]+$/.test(name)) {
    return { valid: false, error: 'Name can only contain lowercase letters, digits, underscores, and hyphens' };
  }

  const reserved = [
    'admin', 'skaus', 'support', 'help', 'root', 'system',
    'official', 'mod', 'moderator', 'staff', 'api', 'app',
    'www', 'mail', 'null', 'undefined', 'test', 'demo',
  ];
  if (reserved.includes(name)) {
    return { valid: false, error: 'This name is reserved' };
  }

  return { valid: true };
}

function bigintToBytes32BE(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
