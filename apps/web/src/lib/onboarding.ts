import { config } from './config';

export async function checkUsernameAvailability(username: string): Promise<{
  available: boolean;
  reason?: string;
}> {
  try {
    const res = await fetch(`${config.gatewayUrl}/names/${username}/available`);
    if (!res.ok) {
      if (res.status === 404) return { available: true };
      throw new Error('Availability check failed');
    }
    return res.json();
  } catch {
    const res = await fetch(`${config.gatewayUrl}/names/${username}`);
    if (res.status === 404) return { available: true };
    if (res.ok) {
      const data = await res.json();
      return { available: data.available ?? false };
    }
    return { available: true };
  }
}

export async function buildRegisterTransaction(body: {
  username: string;
  authority: string;
  scanPubkey: string;
  spendPubkey: string;
}): Promise<{
  success: boolean;
  transaction?: string;
  nameRecord?: string;
  error?: string;
}> {
  const res = await fetch(`${config.gatewayUrl}/names/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Registration failed' }));
    return { success: false, error: err.error || 'Registration failed' };
  }
  return res.json();
}

export function deriveKeysFromPinAndSignature(
  pin: string,
  signature: Uint8Array,
): { scanPrivkey: Uint8Array; spendPrivkey: Uint8Array } {
  const { sha256 } = require('@noble/hashes/sha256');
  const { hkdf } = require('@noble/hashes/hkdf');

  const pinBytes = new TextEncoder().encode(pin);
  const combined = new Uint8Array([...signature, ...pinBytes]);
  const masterSeed = sha256(combined);

  const scanPrivkey = hkdf(sha256, masterSeed, 'skaus-v1', 'skaus-scan-key', 32);
  const spendPrivkey = hkdf(sha256, masterSeed, 'skaus-v1', 'skaus-spend-key', 32);

  return { scanPrivkey, spendPrivkey };
}

export function privateKeyToPublicKey(privkey: Uint8Array): Uint8Array {
  const { x25519 } = require('@noble/curves/ed25519');
  return x25519.getPublicKey(privkey);
}

export function isValidUsername(name: string): { valid: boolean; reason?: string } {
  if (name.length < 3) return { valid: false, reason: 'Must be at least 3 characters' };
  if (name.length > 20) return { valid: false, reason: 'Must be 20 characters or fewer' };
  if (!/^[a-z0-9_]+$/.test(name)) return { valid: false, reason: 'Only lowercase letters, numbers, and underscores' };
  if (name.startsWith('_') || name.endsWith('_')) return { valid: false, reason: 'Cannot start or end with underscore' };
  return { valid: true };
}
