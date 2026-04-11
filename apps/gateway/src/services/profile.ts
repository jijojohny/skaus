import { prisma } from '../db';
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
// Public API  (all async — callers must await)
// ---------------------------------------------------------------------------

export async function getProfileByUsername(username: string): Promise<CompressedProfile | null> {
  const row = await prisma.profile.findUnique({
    where: { username: username.toLowerCase() },
  });
  return row ? toCompressedProfile(row) : null;
}

export async function getProfileByHash(hash: string): Promise<CompressedProfile | null> {
  const row = await prisma.profile.findUnique({
    where: { nameHash: hash },
  });
  return row ? toCompressedProfile(row) : null;
}

export async function upsertProfile(
  username: string,
  profile: CompressedProfile,
  nameHash?: string,
): Promise<void> {
  const key = username.toLowerCase();
  await prisma.profile.upsert({
    where: { username: key },
    update: {
      nameHash: nameHash ?? undefined,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUri: profile.avatarUri ?? '',
      links: profile.links as object[],
      paymentConfig: profile.paymentConfig as object,
      tiers: profile.tiers as object[],
      gatedContent: profile.gatedContent as object[],
      version: profile.version,
      updatedAt: BigInt(profile.updatedAt ?? Date.now()),
    },
    create: {
      username: key,
      nameHash: nameHash ?? null,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUri: profile.avatarUri ?? '',
      links: profile.links as object[],
      paymentConfig: profile.paymentConfig as object,
      tiers: profile.tiers as object[],
      gatedContent: profile.gatedContent as object[],
      version: profile.version,
      updatedAt: BigInt(profile.updatedAt ?? Date.now()),
    },
  });
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
        { bio: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: limit,
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(toCompressedProfile);
}
