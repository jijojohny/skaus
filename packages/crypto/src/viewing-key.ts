import { x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { randomBytes } from '@noble/hashes/utils';
import type { ViewingCredential, EncryptedViewingCredential } from './types';

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

export interface ViewingScope {
  startTime: number;
  endTime: number;
  tokenMints?: string[];
  maxAmount?: bigint;
}

/**
 * Derive a scoped view key from the recipient's view key.
 *
 * The scope is mixed into the HKDF info so different scopes produce
 * independent keys: an auditor with a time-windowed key cannot decrypt
 * notes outside that window even if they have the scoped key.
 */
function deriveScopedKey(viewKey: Uint8Array, scope: ViewingScope): Uint8Array {
  const scopeDigest = sha256(
    new TextEncoder().encode(
      `skaus-view-scope:${scope.startTime}:${scope.endTime}:${(scope.tokenMints ?? []).join(',')}:${(scope.maxAmount ?? '').toString()}`,
    ),
  );
  return hkdf(sha256, viewKey, new Uint8Array(0), scopeDigest, 32);
}

/**
 * Encrypt a payload for an auditor using ephemeral X25519 ECDH.
 *
 * The shared secret is derived as SHA-256(x25519(ephemeralPrivkey, auditorPubkey)).
 * The stream cipher and MAC are the same scheme used in encryption.ts.
 */
function encryptForAuditor(
  payload: Uint8Array,
  auditorPubkey: Uint8Array,
): { ephemeralPubkey: Uint8Array; ciphertext: Uint8Array } {
  const ephemeralPrivkey = randomBytes(32);
  const ephemeralPubkey = x25519.getPublicKey(ephemeralPrivkey);
  const rawSecret = x25519.getSharedSecret(ephemeralPrivkey, auditorPubkey);

  const encKey = sha256(
    (() => {
      const domain = new TextEncoder().encode('skaus_viewing_key');
      const buf = new Uint8Array(rawSecret.length + domain.length);
      buf.set(rawSecret);
      buf.set(domain, rawSecret.length);
      return buf;
    })(),
  );

  const nonce = randomBytes(NONCE_LENGTH);
  const encrypted = xorCipher(payload, encKey, nonce);
  const tag = computeTag(encKey, nonce, encrypted);

  const ciphertext = new Uint8Array(NONCE_LENGTH + encrypted.length + TAG_LENGTH);
  ciphertext.set(nonce, 0);
  ciphertext.set(encrypted, NONCE_LENGTH);
  ciphertext.set(tag, NONCE_LENGTH + encrypted.length);

  return { ephemeralPubkey, ciphertext };
}

/**
 * Decrypt a viewing credential previously issued to an auditor.
 *
 * @param credential  The encrypted credential issued by the recipient.
 * @param auditorPrivkey  The auditor's X25519 private key.
 */
export function decryptViewingCredential(
  credential: EncryptedViewingCredential,
  auditorPrivkey: Uint8Array,
): ViewingCredential {
  const rawSecret = x25519.getSharedSecret(auditorPrivkey, credential.ephemeralPubkey);

  const encKey = sha256(
    (() => {
      const domain = new TextEncoder().encode('skaus_viewing_key');
      const buf = new Uint8Array(rawSecret.length + domain.length);
      buf.set(rawSecret);
      buf.set(domain, rawSecret.length);
      return buf;
    })(),
  );

  const nonce = credential.ciphertext.slice(0, NONCE_LENGTH);
  const encrypted = credential.ciphertext.slice(NONCE_LENGTH, credential.ciphertext.length - TAG_LENGTH);
  const tag = credential.ciphertext.slice(credential.ciphertext.length - TAG_LENGTH);

  const expectedTag = computeTag(encKey, nonce, encrypted);
  if (!constantTimeEqual(tag, expectedTag)) {
    throw new Error('Viewing credential decryption failed — invalid authentication tag');
  }

  const plaintext = xorCipher(encrypted, encKey, nonce);
  return deserializeCredential(plaintext);
}

/**
 * Issue a scoped viewing credential encrypted for a specific auditor.
 *
 * The credential allows the auditor to decrypt deposit notes whose
 * ephemeral keys fall within the declared scope (time window + optional
 * token mint filter). Scope-binding is cryptographic: the scoped key is
 * derived with the scope mixed into the HKDF info string.
 *
 * @param viewKey      Recipient's view key (from deriveKeyHierarchy).
 * @param auditorPubkey  Auditor's X25519 public key (32 bytes).
 * @param scope        Time window and optional token / amount filters.
 */
export function issueViewingCredential(
  viewKey: Uint8Array,
  auditorPubkey: Uint8Array,
  scope: ViewingScope,
): EncryptedViewingCredential {
  const scopedKey = deriveScopedKey(viewKey, scope);
  const issuedAt = Math.floor(Date.now() / 1000);

  const credential: ViewingCredential = {
    scopedKey,
    scope: {
      startTime: scope.startTime,
      endTime: scope.endTime,
      tokenMints: scope.tokenMints,
      maxAmount: scope.maxAmount,
    },
    issuedTo: auditorPubkey,
    issuedAt,
  };

  const payload = serializeCredential(credential);
  const { ephemeralPubkey, ciphertext } = encryptForAuditor(payload, auditorPubkey);

  return { ephemeralPubkey, ciphertext, issuedAt };
}

// ---------------------------------------------------------------------------
// Serialization (JSON over TextEncoder — compact, readable)
// ---------------------------------------------------------------------------

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function serializeCredential(c: ViewingCredential): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      scopedKey: bytesToHex(c.scopedKey),
      scope: {
        startTime: c.scope.startTime,
        endTime: c.scope.endTime,
        tokenMints: c.scope.tokenMints ?? null,
        maxAmount: c.scope.maxAmount !== undefined ? c.scope.maxAmount.toString() : null,
      },
      issuedTo: bytesToHex(c.issuedTo),
      issuedAt: c.issuedAt,
    }),
  );
}

function deserializeCredential(data: Uint8Array): ViewingCredential {
  const obj = JSON.parse(new TextDecoder().decode(data));
  return {
    scopedKey: hexToBytes(obj.scopedKey),
    scope: {
      startTime: obj.scope.startTime,
      endTime: obj.scope.endTime,
      tokenMints: obj.scope.tokenMints ?? undefined,
      maxAmount: obj.scope.maxAmount !== null ? BigInt(obj.scope.maxAmount) : undefined,
    },
    issuedTo: hexToBytes(obj.issuedTo),
    issuedAt: obj.issuedAt,
  };
}

// ---------------------------------------------------------------------------
// Cipher helpers (same scheme as encryption.ts for consistency)
// ---------------------------------------------------------------------------

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
  for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
  return result === 0;
}
