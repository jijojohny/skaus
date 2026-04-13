/**
 * Borsh schema and serialization helpers for ZK-compressed profiles.
 *
 * Amounts are stored as u64 integer cents (×100) for deterministic
 * binary serialization. The conversion layer translates between the
 * CompressedProfile public interface (floating-point amounts) and the
 * on-chain representation (integer cents).
 */
import { serialize, deserialize } from 'borsh';
import type {
  CompressedProfile,
  ProfileLink,
  PaymentConfig,
  PaymentTier,
  GatedContentPointer,
} from '@skaus/types';

// ---------------------------------------------------------------------------
// Discriminator
// ---------------------------------------------------------------------------

/** 8-byte prefix: ASCII "profile\0" — identifies SKAUS profile accounts. */
export const PROFILE_DISCRIMINATOR = Buffer.from([
  0x70, 0x72, 0x6f, 0x66, 0x69, 0x6c, 0x65, 0x00,
]);

// ---------------------------------------------------------------------------
// Borsh v2 schema definition
// ---------------------------------------------------------------------------
// Amounts are stored as u64 integer cents (amount × 100) to keep
// serialization deterministic across environments.

export const COMPRESSED_PROFILE_SCHEMA = {
  struct: {
    displayName: 'string',
    bio: 'string',
    avatarUri: 'string',
    links: {
      array: {
        type: {
          struct: {
            platform: 'string',
            url: 'string',
            verified: 'bool',
          },
        },
      },
    },
    paymentConfig: {
      struct: {
        acceptedTokens: { array: { type: 'string' } },
        suggestedAmountsCents: { array: { type: 'u64' } },
        customAmountEnabled: 'bool',
        thankYouMessage: 'string',
      },
    },
    tiers: {
      array: {
        type: {
          struct: {
            id: 'string',
            name: 'string',
            amountCents: 'u64',
            currency: 'string',
            benefits: { array: { type: 'string' } },
            gateType: 'string',
          },
        },
      },
    },
    gatedContent: {
      array: {
        type: {
          struct: {
            contentId: 'string',
            encryptedUri: 'string',
            accessCondition: 'string',
            previewText: 'string',
          },
        },
      },
    },
    version: 'u32',
    updatedAt: 'u64',
  },
} as const;

// ---------------------------------------------------------------------------
// Wire-format types (amounts as BigInt cents)
// ---------------------------------------------------------------------------

interface SerializableLink {
  platform: string;
  url: string;
  verified: boolean;
}

interface SerializablePaymentConfig {
  acceptedTokens: string[];
  suggestedAmountsCents: bigint[];
  customAmountEnabled: boolean;
  thankYouMessage: string;
}

interface SerializableTier {
  id: string;
  name: string;
  amountCents: bigint;
  currency: string;
  benefits: string[];
  gateType: string;
}

interface SerializableGatedContent {
  contentId: string;
  encryptedUri: string;
  accessCondition: string;
  previewText: string;
}

export interface SerializableProfile {
  displayName: string;
  bio: string;
  avatarUri: string;
  links: SerializableLink[];
  paymentConfig: SerializablePaymentConfig;
  tiers: SerializableTier[];
  gatedContent: SerializableGatedContent[];
  version: number;
  updatedAt: bigint;
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function toCents(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}

function fromCents(cents: bigint): number {
  return Number(cents) / 100;
}

export function toSerializable(profile: CompressedProfile): SerializableProfile {
  return {
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUri: profile.avatarUri ?? '',
    links: profile.links.map((l): SerializableLink => ({
      platform: l.platform,
      url: l.url,
      verified: l.verified,
    })),
    paymentConfig: {
      acceptedTokens: profile.paymentConfig.acceptedTokens,
      suggestedAmountsCents: profile.paymentConfig.suggestedAmounts.map(toCents),
      customAmountEnabled: profile.paymentConfig.customAmountEnabled,
      thankYouMessage: profile.paymentConfig.thankYouMessage,
    },
    tiers: profile.tiers.map((t): SerializableTier => ({
      id: t.id,
      name: t.name,
      amountCents: toCents(t.amount),
      currency: t.currency,
      benefits: t.benefits,
      gateType: t.gateType,
    })),
    gatedContent: profile.gatedContent.map((g): SerializableGatedContent => ({
      contentId: g.contentId,
      encryptedUri: g.encryptedUri,
      accessCondition: g.accessCondition,
      previewText: g.previewText,
    })),
    version: profile.version,
    updatedAt: BigInt(profile.updatedAt),
  };
}

export function fromSerializable(raw: unknown): CompressedProfile {
  const s = raw as SerializableProfile;
  return {
    displayName: s.displayName,
    bio: s.bio,
    avatarUri: s.avatarUri,
    links: s.links.map((l): ProfileLink => ({
      platform: l.platform,
      url: l.url,
      verified: l.verified,
    })),
    paymentConfig: {
      acceptedTokens: s.paymentConfig.acceptedTokens,
      suggestedAmounts: s.paymentConfig.suggestedAmountsCents.map(fromCents),
      customAmountEnabled: s.paymentConfig.customAmountEnabled,
      thankYouMessage: s.paymentConfig.thankYouMessage,
    } satisfies PaymentConfig,
    tiers: s.tiers.map((t): PaymentTier => ({
      id: t.id,
      name: t.name,
      amount: fromCents(t.amountCents),
      currency: t.currency,
      benefits: t.benefits,
      gateType: t.gateType as PaymentTier['gateType'],
    })),
    gatedContent: s.gatedContent.map((g): GatedContentPointer => ({
      contentId: g.contentId,
      encryptedUri: g.encryptedUri,
      accessCondition: g.accessCondition,
      previewText: g.previewText,
    })),
    version: s.version,
    updatedAt: Number(s.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Encode / decode  (discriminator prefix + borsh body)
// ---------------------------------------------------------------------------

/**
 * Serialize a CompressedProfile to bytes:
 *   [8-byte discriminator] + [borsh-encoded body]
 */
export function encodeProfile(profile: CompressedProfile): Buffer {
  const body = serialize(COMPRESSED_PROFILE_SCHEMA, toSerializable(profile));
  return Buffer.concat([PROFILE_DISCRIMINATOR, Buffer.from(body)]);
}

/**
 * Deserialize bytes produced by encodeProfile back to CompressedProfile.
 * Throws if the discriminator is missing or incorrect.
 */
export function decodeProfile(data: Uint8Array): CompressedProfile {
  const buf = Buffer.from(data);

  if (buf.length < PROFILE_DISCRIMINATOR.length) {
    throw new Error('Account data too short — missing discriminator');
  }

  const disc = buf.subarray(0, PROFILE_DISCRIMINATOR.length);
  if (!disc.equals(PROFILE_DISCRIMINATOR)) {
    throw new Error('Account discriminator mismatch — not a SKAUS profile account');
  }

  const body = buf.subarray(PROFILE_DISCRIMINATOR.length);
  const raw = deserialize(COMPRESSED_PROFILE_SCHEMA, body);
  return fromSerializable(raw);
}
