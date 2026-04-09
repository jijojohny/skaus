import type { CompressedProfile } from '@skaus/types';

/**
 * Profile service — manages compressed profiles.
 *
 * Current: in-memory store for development.
 * Production: Light Protocol ZK Compression for on-chain storage
 * at ~$0.0001 per profile (vs ~$3+ per profile with standard accounts).
 *
 * The Light Protocol integration will use:
 *   - @lightprotocol/stateless.js for RPC
 *   - @lightprotocol/compressed-token for account ops
 *   - Borsh serialization matching the on-chain schema
 */

const profileStore = new Map<string, CompressedProfile>();
const profileByNameHash = new Map<string, string>();

export function getProfileByUsername(username: string): CompressedProfile | null {
  return profileStore.get(username.toLowerCase()) || null;
}

export function getProfileByHash(hash: string): CompressedProfile | null {
  const username = profileByNameHash.get(hash);
  if (!username) return null;
  return profileStore.get(username) || null;
}

export function upsertProfile(username: string, profile: CompressedProfile, nameHash?: string): void {
  const key = username.toLowerCase();
  profile.updatedAt = Date.now();
  profileStore.set(key, profile);
  if (nameHash) {
    profileByNameHash.set(nameHash, key);
  }
}

export function deleteProfile(username: string): boolean {
  return profileStore.delete(username.toLowerCase());
}

export function listProfiles(limit = 20, offset = 0): CompressedProfile[] {
  return Array.from(profileStore.values()).slice(offset, offset + limit);
}

export function searchProfiles(query: string, limit = 20): CompressedProfile[] {
  const q = query.toLowerCase();
  return Array.from(profileStore.values())
    .filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.bio.toLowerCase().includes(q),
    )
    .slice(0, limit);
}
