import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { CompressedProfile } from '@skaus/types';

/**
 * Profile service — manages compressed profiles with file-backed persistence.
 *
 * Data is stored as JSON on disk and cached in memory for fast reads.
 * Every mutation flushes to disk via atomic write (temp file + rename)
 * to prevent corruption on crash.
 *
 * Production: replace with Light Protocol ZK Compression for on-chain
 * storage at ~$0.0001 per profile (vs ~$3+ with standard accounts).
 */

const DATA_DIR = process.env.PROFILE_DATA_DIR || join(process.cwd(), 'data');
const PROFILES_FILE = join(DATA_DIR, 'profiles.json');

// In-memory cache, loaded from disk on startup
let profileStore = new Map<string, CompressedProfile>();
let profileByNameHash = new Map<string, string>();

interface PersistedState {
  profiles: Record<string, CompressedProfile>;
  nameHashIndex: Record<string, string>;
}

function loadFromDisk(): void {
  if (!existsSync(PROFILES_FILE)) return;
  try {
    const raw = readFileSync(PROFILES_FILE, 'utf-8');
    const data: PersistedState = JSON.parse(raw);
    profileStore = new Map(Object.entries(data.profiles || {}));
    profileByNameHash = new Map(Object.entries(data.nameHashIndex || {}));
  } catch {
    // Corrupt file — start fresh but don't delete the file
    profileStore = new Map();
    profileByNameHash = new Map();
  }
}

function flushToDisk(): void {
  const data: PersistedState = {
    profiles: Object.fromEntries(profileStore),
    nameHashIndex: Object.fromEntries(profileByNameHash),
  };
  const json = JSON.stringify(data, null, 2);

  // Atomic write: write to temp, then rename
  mkdirSync(dirname(PROFILES_FILE), { recursive: true });
  const tmp = PROFILES_FILE + '.tmp';
  writeFileSync(tmp, json, 'utf-8');
  renameSync(tmp, PROFILES_FILE);
}

// Load existing data on module initialization
loadFromDisk();

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
  flushToDisk();
}

export function deleteProfile(username: string): boolean {
  const deleted = profileStore.delete(username.toLowerCase());
  if (deleted) flushToDisk();
  return deleted;
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
