import bs58 from 'bs58';

/**
 * Decode a base58-encoded public key string to 32 bytes.
 * Falls back to hex decoding if bs58 fails.
 */
export function decodePubkey(encoded: string): Uint8Array {
  try {
    const decoded = bs58.decode(encoded);
    if (decoded.length === 32) return decoded;
  } catch {}

  if (/^[0-9a-f]{64}$/i.test(encoded)) {
    return Uint8Array.from(Buffer.from(encoded, 'hex'));
  }

  throw new Error(`Cannot decode pubkey: ${encoded.slice(0, 16)}...`);
}

/**
 * Check if a meta-address field looks like a mock/placeholder.
 */
export function isMockPubkey(value: string): boolean {
  return !value || value.startsWith('mock_') || value === 'pending_resolution';
}
