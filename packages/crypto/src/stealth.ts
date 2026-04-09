import { x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
import type { StealthMetaAddress } from './types';

export interface StealthKeyPair {
  scanPrivkey: Uint8Array;
  scanPubkey: Uint8Array;
  spendPrivkey: Uint8Array;
  spendPubkey: Uint8Array;
}

/**
 * Generate a new stealth key pair for a recipient.
 * Produces scan and spend keys on Curve25519.
 */
export function generateStealthKeys(): StealthKeyPair {
  const scanPrivkey = randomBytes(32);
  const spendPrivkey = randomBytes(32);

  const scanPubkey = x25519.getPublicKey(scanPrivkey);
  const spendPubkey = x25519.getPublicKey(spendPrivkey);

  return { scanPrivkey, scanPubkey, spendPrivkey, spendPubkey };
}

/**
 * Sender: derive a one-time stealth deposit address from recipient's meta-address.
 *
 * Protocol:
 *   1. Generate ephemeral keypair (r, R = r*G)
 *   2. Compute shared secret S = r * scan_pubkey (ECDH)
 *   3. Derive deposit tag = SHA256(S || deposit_index)
 *   4. Return { ephemeralPubkey, sharedSecret, depositTag }
 */
export function deriveStealthAddress(
  recipientMeta: StealthMetaAddress,
  depositIndex: number = 0
): {
  ephemeralPrivkey: Uint8Array;
  ephemeralPubkey: Uint8Array;
  sharedSecret: Uint8Array;
  depositTag: Uint8Array;
} {
  const ephemeralPrivkey = randomBytes(32);
  const ephemeralPubkey = x25519.getPublicKey(ephemeralPrivkey);

  const sharedSecret = x25519.getSharedSecret(ephemeralPrivkey, recipientMeta.scanPubkey);

  const tagInput = new Uint8Array(sharedSecret.length + 4);
  tagInput.set(sharedSecret);
  tagInput[sharedSecret.length] = (depositIndex >> 0) & 0xff;
  tagInput[sharedSecret.length + 1] = (depositIndex >> 8) & 0xff;
  tagInput[sharedSecret.length + 2] = (depositIndex >> 16) & 0xff;
  tagInput[sharedSecret.length + 3] = (depositIndex >> 24) & 0xff;

  const depositTag = sha256(tagInput);

  return { ephemeralPrivkey, ephemeralPubkey, sharedSecret, depositTag };
}

/**
 * Recipient: try to detect and recover spend authority for a deposit.
 *
 * For each new DepositNote on-chain:
 *   1. Extract ephemeral pubkey R from encrypted note
 *   2. Compute S' = scan_privkey * R
 *   3. Derive deposit tag' = SHA256(S' || deposit_index)
 *   4. If tag matches, this deposit is ours — derive spend key
 */
export function recoverStealthSpendKey(
  scanPrivkey: Uint8Array,
  _spendPrivkey: Uint8Array,
  ephemeralPubkey: Uint8Array,
  depositIndex: number = 0
): {
  sharedSecret: Uint8Array;
  depositTag: Uint8Array;
} {
  // spendPrivkey is reserved for deriving the full spend key:
  // p = spend_privkey + Hash(shared_secret). Used after detection
  // confirms a deposit belongs to us. Kept in signature for API stability.
  const sharedSecret = x25519.getSharedSecret(scanPrivkey, ephemeralPubkey);

  const tagInput = new Uint8Array(sharedSecret.length + 4);
  tagInput.set(sharedSecret);
  tagInput[sharedSecret.length] = (depositIndex >> 0) & 0xff;
  tagInput[sharedSecret.length + 1] = (depositIndex >> 8) & 0xff;
  tagInput[sharedSecret.length + 2] = (depositIndex >> 16) & 0xff;
  tagInput[sharedSecret.length + 3] = (depositIndex >> 24) & 0xff;

  const depositTag = sha256(tagInput);

  return { sharedSecret, depositTag };
}
