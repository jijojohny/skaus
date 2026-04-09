import { x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';

/**
 * Key hierarchy for a SKAUS recipient.
 *
 * Master Seed
 *  ├── scanPrivkey  (Curve25519) — detect incoming deposits
 *  ├── spendPrivkey (Curve25519) — authorize withdrawals
 *  ├── viewKey      (derived from scanPrivkey) — selective disclosure
 *  └── encryptionKey (X25519) — off-chain data encryption
 */
export interface KeyHierarchy {
  masterSeed: Uint8Array;
  scanPrivkey: Uint8Array;
  scanPubkey: Uint8Array;
  spendPrivkey: Uint8Array;
  spendPubkey: Uint8Array;
  viewKey: Uint8Array;
  encryptionPrivkey: Uint8Array;
  encryptionPubkey: Uint8Array;
}

/**
 * Derive the full key hierarchy from a master seed (32 bytes).
 *
 * Uses HKDF-SHA256 with domain-separated info strings
 * to derive independent keys for each purpose.
 */
export function deriveKeyHierarchy(masterSeed: Uint8Array): KeyHierarchy {
  const salt = new TextEncoder().encode('skaus-v1');

  const scanPrivkey = hkdf(sha256, masterSeed, salt, 'skaus-scan-key', 32);
  const spendPrivkey = hkdf(sha256, masterSeed, salt, 'skaus-spend-key', 32);
  const encryptionPrivkey = hkdf(sha256, masterSeed, salt, 'skaus-encryption-key', 32);

  const scanPubkey = x25519.getPublicKey(scanPrivkey);
  const spendPubkey = x25519.getPublicKey(spendPrivkey);
  const encryptionPubkey = x25519.getPublicKey(encryptionPrivkey);

  const viewKey = hkdf(sha256, scanPrivkey, salt, 'skaus-view-key', 32);

  return {
    masterSeed,
    scanPrivkey,
    scanPubkey,
    spendPrivkey,
    spendPubkey,
    viewKey,
    encryptionPrivkey,
    encryptionPubkey,
  };
}
