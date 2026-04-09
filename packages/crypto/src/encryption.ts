import { x25519 } from '@noble/curves/ed25519';
import { randomBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import type { DepositNoteData } from './types';

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const EPHEMERAL_PK_LENGTH = 32;

/**
 * Encrypt a deposit note for the recipient using a shared secret derived via ECDH.
 *
 * Scheme: SHA-256–based stream cipher (CTR mode) + SHA-256 MAC.
 *   - Key: SHA-256(sharedSecret || "skaus_note_key")
 *   - Nonce: random 12 bytes
 *   - Output: ephemeralPubkey(32) || nonce(12) || ciphertext(n) || tag(16)
 *
 * The ephemeral pubkey is prepended unencrypted so the recipient can compute
 * the shared secret via ECDH without needing anything other than their scan privkey.
 */
export function encryptNote(
  noteData: DepositNoteData,
  sharedSecret: Uint8Array
): Uint8Array {
  const key = deriveNoteKey(sharedSecret);
  const nonce = randomBytes(NONCE_LENGTH);
  const plaintext = serializeNote(noteData);

  const ciphertext = xorCipher(plaintext, key, nonce);
  const tag = computeTag(key, nonce, ciphertext);

  const result = new Uint8Array(
    EPHEMERAL_PK_LENGTH + NONCE_LENGTH + ciphertext.length + TAG_LENGTH
  );
  result.set(noteData.ephemeralPubkey, 0);
  result.set(nonce, EPHEMERAL_PK_LENGTH);
  result.set(ciphertext, EPHEMERAL_PK_LENGTH + NONCE_LENGTH);
  result.set(tag, EPHEMERAL_PK_LENGTH + NONCE_LENGTH + ciphertext.length);
  return result;
}

/**
 * Decrypt a deposit note using the recipient's scan private key.
 *
 * Input format: ephemeralPubkey(32) || nonce(12) || ciphertext || tag(16)
 *
 * Steps:
 *   1. Extract ephemeral pubkey from the first 32 bytes
 *   2. Compute sharedSecret = x25519(scanPrivkey, ephemeralPubkey)
 *   3. Derive encryption key and decrypt
 *
 * Throws on MAC mismatch (the deposit doesn't belong to us).
 */
export function decryptNote(
  encrypted: Uint8Array,
  scanPrivkey: Uint8Array
): DepositNoteData {
  if (encrypted.length < EPHEMERAL_PK_LENGTH + NONCE_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Encrypted note too short');
  }

  const ephemeralPubkey = encrypted.slice(0, EPHEMERAL_PK_LENGTH);
  const rest = encrypted.slice(EPHEMERAL_PK_LENGTH);

  const sharedSecret = x25519.getSharedSecret(scanPrivkey, ephemeralPubkey);

  const key = deriveNoteKey(sharedSecret);
  const nonce = rest.slice(0, NONCE_LENGTH);
  const ciphertext = rest.slice(NONCE_LENGTH, rest.length - TAG_LENGTH);
  const tag = rest.slice(rest.length - TAG_LENGTH);

  const expectedTag = computeTag(key, nonce, ciphertext);
  if (!constantTimeEqual(tag, expectedTag)) {
    throw new Error('Decryption failed — invalid authentication tag');
  }

  const plaintext = xorCipher(ciphertext, key, nonce);
  return deserializeNote(plaintext);
}

function xorCipher(data: Uint8Array, key: Uint8Array, nonce: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const blockInput = new Uint8Array(key.length + nonce.length + 4);
    blockInput.set(key);
    blockInput.set(nonce, key.length);
    blockInput[key.length + nonce.length] = (i >> 0) & 0xff;
    blockInput[key.length + nonce.length + 1] = (i >> 8) & 0xff;
    blockInput[key.length + nonce.length + 2] = (i >> 16) & 0xff;
    blockInput[key.length + nonce.length + 3] = (i >> 24) & 0xff;
    const stream = sha256(blockInput);
    result[i] = data[i] ^ stream[i % 32];
  }
  return result;
}

function computeTag(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const input = new Uint8Array(key.length + nonce.length + ciphertext.length);
  input.set(key);
  input.set(nonce, key.length);
  input.set(ciphertext, key.length + nonce.length);
  return sha256(input).slice(0, TAG_LENGTH);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

function deriveNoteKey(sharedSecret: Uint8Array): Uint8Array {
  const domain = new TextEncoder().encode('skaus_note_key');
  const input = new Uint8Array(sharedSecret.length + domain.length);
  input.set(sharedSecret);
  input.set(domain, sharedSecret.length);
  return sha256(input);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function serializeNote(note: DepositNoteData): Uint8Array {
  const json = JSON.stringify({
    secret: note.secret.toString(),
    nullifier: note.nullifier.toString(),
    amount: note.amount.toString(),
    tokenMint: note.tokenMint,
    ephemeralPubkey: bytesToHex(note.ephemeralPubkey),
  });
  return new TextEncoder().encode(json);
}

function deserializeNote(data: Uint8Array): DepositNoteData {
  const json = JSON.parse(new TextDecoder().decode(data));
  return {
    secret: BigInt(json.secret),
    nullifier: BigInt(json.nullifier),
    amount: BigInt(json.amount),
    tokenMint: json.tokenMint,
    ephemeralPubkey: hexToBytes(json.ephemeralPubkey),
  };
}
