/**
 * Profile service — dual-write: ZK-compressed account (Light Protocol) + Postgres cache.
 *
 * Write path (upsertProfile):
 *   1. Create or update the compressed account on Light Protocol.
 *      On failure, falls back gracefully — Postgres remains the source of truth.
 *   2. Persist profile + compressedHash to Postgres.
 *
 * Read path:
 *   - getProfileByUsername: reads from Postgres cache (fast, always available).
 *   - getProfileByHash: reads directly from Photon indexer by compressed account hash,
 *     falls back to Postgres if the chain read fails.
 *
 * On-chain linking:
 *   After upsertProfile returns, call buildUpdateProfileTx (compression service) to
 *   get a transaction for the user to sign, which stores the compressedHash in
 *   NameRecord.profile_cid on the name-registry program.
 */
import { prisma } from '../db';
import { compressProfile, fetchProfileFromChain } from './compression';
import type { CompressedProfile } from '@skaus/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toCompressedProfile(row: {
  displayName: string;
  bio: string;
  avatarUri: string;
  links: unknown;
  paymentConfig: unknown;
  tiers: unknown;
  gatedContent: unknown;
  version: number;
  updatedAt: bigint;
}): CompressedProfile {
  return {
    displayName: row.displayName,
    bio: row.bio,
    avatarUri: row.avatarUri,
    links: (row.links as CompressedProfile['links']) ?? [],
    paymentConfig: (row.paymentConfig as CompressedProfile['paymentConfig']) ?? {
      acceptedTokens: ['USDC'],
      suggestedAmounts: [],
      customAmountEnabled: true,
      thankYouMessage: '',
    },
    tiers: (row.tiers as CompressedProfile['tiers']) ?? [],
    gatedContent: (row.gatedContent as CompressedProfile['gatedContent']) ?? [],
    version: row.version,
    updatedAt: Number(row.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getProfileByUsername(username: string): Promise<CompressedProfile | null> {
  const row = await prisma.profile.findUnique({
    where: { username: username.toLowerCase() },
  });
  return row ? toCompressedProfile(row) : null;
}

/**
 * Fetch a profile by its compressed account hash.
 *
 * Tries the Photon indexer first (authoritative on-chain data), then falls
 * back to the Postgres cache if the chain read fails or ZK compression is off.
 */
export async function getProfileByHash(hash: string): Promise<CompressedProfile | null> {
  // 1. Try Photon indexer (authoritative).
  const onChain = await fetchProfileFromChain(hash);
  if (onChain) return onChain;

  // 2. Postgres fallback.
  const row = await prisma.profile.findUnique({
    where: { compressedHash: hash },
  });
  return row ? toCompressedProfile(row) : null;
}

export interface UpsertResult {
  /** Hex-encoded 32-byte compressed account hash. */
  compressedHash: string;
  /** True when the compressed account was successfully written on-chain. */
  compressedOnChain: boolean;
  /** Light Protocol transaction signature, or null if off-chain only. */
  compressionTxSignature: string | null;
}

/**
 * Create or update a profile.
 *
 * Dual-write: attempts ZK compression first, then always writes to Postgres.
 * The caller should use the returned compressedHash to build an update_profile
 * transaction (via buildUpdateProfileTx in the compression service) for the
 * user to sign and submit on-chain.
 */
export async function upsertProfile(
  username: string,
  profile: CompressedProfile,
  nameHash?: string,
): Promise<UpsertResult> {
  const key = username.toLowerCase();

  // Read current compressedHash (if any) so we know whether to create or update.
  const existing = await prisma.profile.findUnique({
    where: { username: key },
    select: { compressedHash: true },
  });

  // 1. ZK compression (non-blocking failure).
  const compressionResult = await compressProfile(
    key,
    profile,
    existing?.compressedHash ?? null,
  );

  // 2. Persist to Postgres.
  const ts = BigInt(profile.updatedAt ?? Date.now());
  await prisma.profile.upsert({
    where: { username: key },
    update: {
      nameHash:           nameHash ?? undefined,
      compressedHash:     compressionResult.hash,
      compressedOnChain:  compressionResult.onChain,
      displayName:        profile.displayName,
      bio:                profile.bio,
      avatarUri:          profile.avatarUri ?? '',
      links:              profile.links as object[],
      paymentConfig:      profile.paymentConfig as object,
      tiers:              profile.tiers as object[],
      gatedContent:       profile.gatedContent as object[],
      version:            profile.version,
      updatedAt:          ts,
    },
    create: {
      username:           key,
      nameHash:           nameHash ?? null,
      compressedHash:     compressionResult.hash,
      compressedOnChain:  compressionResult.onChain,
      displayName:        profile.displayName,
      bio:                profile.bio,
      avatarUri:          profile.avatarUri ?? '',
      links:              profile.links as object[],
      paymentConfig:      profile.paymentConfig as object,
      tiers:              profile.tiers as object[],
      gatedContent:       profile.gatedContent as object[],
      version:            profile.version,
      updatedAt:          ts,
    },
  });

  return {
    compressedHash:           compressionResult.hash,
    compressedOnChain:        compressionResult.onChain,
    compressionTxSignature:   compressionResult.txSignature,
  };
}

export async function deleteProfile(username: string): Promise<boolean> {
  try {
    await prisma.profile.delete({ where: { username: username.toLowerCase() } });
    return true;
  } catch {
    return false;
  }
}

export async function listProfiles(limit = 20, offset = 0): Promise<CompressedProfile[]> {
  const rows = await prisma.profile.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
  return rows.map(toCompressedProfile);
}

export async function searchProfiles(query: string, limit = 20): Promise<CompressedProfile[]> {
  const q = query.toLowerCase();
  const rows = await prisma.profile.findMany({
    where: {
      OR: [
        { displayName: { contains: q, mode: 'insensitive' } },
        { bio:          { contains: q, mode: 'insensitive' } },
        { username:     { contains: q, mode: 'insensitive' } },
      ],
    },
    take: limit,
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(toCompressedProfile);
}

/**
 * Mark a profile's compressedHash as confirmed on-chain.
 * Called after a client successfully submits the update_profile transaction.
 */
export async function markProfileOnChain(
  username: string,
  compressedHash: string,
): Promise<void> {
  await prisma.profile.updateMany({
    where: { username: username.toLowerCase(), compressedHash },
    data: { compressedOnChain: true },
  });
}
