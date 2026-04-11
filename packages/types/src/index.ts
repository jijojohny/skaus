import { PublicKey } from '@solana/web3.js';

/**
 * Mirrors the on-chain StealthPool account (programs/stealth-pool/src/state/mod.rs).
 * Every field must match the Anchor IDL layout for correct deserialization.
 */
export interface PoolConfig {
  authority: PublicKey;
  tokenMint: PublicKey;
  feeBps: number;
  minDeposit: bigint;
  maxDeposit: bigint;
  totalDeposits: bigint;
  totalWithdrawals: bigint;
  depositCount: bigint;
  withdrawalCount: bigint;
  currentMerkleIndex: number;
  paused: boolean;
  merkleRoot: Uint8Array; // [u8; 32]
  feeVault: PublicKey;
  bump: number;
}

export interface DepositRequest {
  amount: bigint;
  commitment: Uint8Array;
  encryptedNote: Uint8Array;
  tokenMint: PublicKey;
}

export interface WithdrawalRequest {
  proofA: Uint8Array;
  proofB: Uint8Array;
  proofC: Uint8Array;
  nullifierHash: Uint8Array;
  recipient: PublicKey;
  amount: bigint;
  merkleRoot: Uint8Array;
}

export interface RelayRequest {
  proof: string;
  tokenMint: string;
  publicInputs: {
    merkleRoot: string;
    nullifierHash: string;
    recipient: string;
    amount: string;
    fee: string;
  };
}

export interface RelayResponse {
  txSignature: string;
  status: 'confirmed' | 'finalized' | 'failed';
  fee: string;
}

export interface PayLinkConfig {
  version: number;
  recipientMetaAddress: string;
  pool: string;
  network: 'mainnet-beta' | 'devnet' | 'localnet';
  amount: bigint | null;
  token: 'USDC' | 'SOL';
  memoEncrypted: string | null;
}

// ---------------------------------------------------------------------------
// Plan B — Identity & Discovery types
// ---------------------------------------------------------------------------

export interface NameRecord {
  authority: PublicKey;
  nameHash: Uint8Array;
  stealthMetaAddress: OnChainStealthMetaAddress;
  profileCid: Uint8Array | null;
  depositIndex: bigint;
  createdAt: bigint;
  updatedAt: bigint;
  status: NameStatus;
  bump: number;
}

export interface OnChainStealthMetaAddress {
  scanPubkey: Uint8Array;
  spendPubkey: Uint8Array;
  /** On-chain u8 (0-255). Must not exceed 255 when constructing transactions. */
  version: number;
}

/** Validate that a stealth meta-address version fits in a u8 (on-chain constraint). */
export function assertValidVersion(version: number): void {
  if (!Number.isInteger(version) || version < 0 || version > 255) {
    throw new RangeError(`StealthMetaAddress version must be 0-255, got ${version}`);
  }
}

export type NameStatus = 'active' | 'suspended' | 'expired';

export interface DepositPathRecord {
  nameRecord: PublicKey;
  pathIndex: bigint;
  label: string;
  createdAt: bigint;
  bump: number;
}

export interface CompressedProfile {
  displayName: string;
  bio: string;
  avatarUri: string;
  links: ProfileLink[];
  paymentConfig: PaymentConfig;
  tiers: PaymentTier[];
  gatedContent: GatedContentPointer[];
  version: number;
  updatedAt: number;
}

export interface ProfileLink {
  platform: string;
  url: string;
  verified: boolean;
}

export interface PaymentConfig {
  acceptedTokens: string[];
  suggestedAmounts: number[];
  customAmountEnabled: boolean;
  thankYouMessage: string;
}

export interface PaymentTier {
  id: string;
  name: string;
  amount: number;
  currency: string;
  benefits: string[];
  gateType: 'one-time' | 'recurring-hint';
}

export interface GatedContentPointer {
  contentId: string;
  encryptedUri: string;
  accessCondition: string;
  previewText: string;
}

export interface PaymentRequest {
  id: string;
  creator: string;
  amount: number;
  token: string;
  memo: string;
  expiresAt: number | null;
  maxPayments: number;
  depositPathIndex: bigint;
  status: PaymentRequestStatus;
  payments: PaymentRecord[];
  createdAt: number;
  updatedAt: number;
}

export type PaymentRequestStatus = 'pending' | 'partial' | 'paid' | 'expired' | 'cancelled';

export interface PaymentRecord {
  txSignature: string;
  amount: number;
  paidAt: number;
  depositorHint?: string;
}

export interface ProfileSearchParams {
  query: string;
  tags?: string[];
  sortBy?: 'relevance' | 'created' | 'popularity';
  limit?: number;
  offset?: number;
}

export interface ProfileSearchResult {
  name: string;
  displayName: string;
  bio: string;
  avatarUri: string;
}

// ---------------------------------------------------------------------------
// Plan A — Core Payment Rail constants
// ---------------------------------------------------------------------------

export const USDC_MINT_DEVNET = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
export const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/**
 * Power-of-10 USDC tiers (6 decimals). Covers 0.01–10,000 USDC.
 * Any cent-precise amount can be decomposed exactly.
 */
export const DEPOSIT_TIERS_USDC = [
  10_000n,             // 0.01  USDC
  100_000n,            // 0.1   USDC
  1_000_000n,          // 1     USDC
  10_000_000n,         // 10    USDC
  100_000_000n,        // 100   USDC
  1_000_000_000n,      // 1,000 USDC
  10_000_000_000n,     // 10,000 USDC
] as const;

/**
 * Power-of-10 SOL tiers (9 decimals). Covers 0.001–100 SOL.
 */
export const DEPOSIT_TIERS_SOL = [
  1_000_000n,          // 0.001 SOL
  10_000_000n,         // 0.01  SOL
  100_000_000n,        // 0.1   SOL
  1_000_000_000n,      // 1     SOL
  10_000_000_000n,     // 10    SOL
  100_000_000_000n,    // 100   SOL
] as const;

/** Smallest expressible deposit for each token type. */
export const MIN_DEPOSIT_USDC = DEPOSIT_TIERS_USDC[0]; // 0.01 USDC
export const MIN_DEPOSIT_SOL = DEPOSIT_TIERS_SOL[0];   // 0.001 SOL

/**
 * Split an arbitrary amount into fixed deposit tiers (greedy from largest).
 * Throws if the amount cannot be exactly represented by tiers.
 */
export function splitIntoTiers(amount: bigint, tiers: readonly bigint[]): bigint[] {
  const sorted = [...tiers].sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
  const result: bigint[] = [];
  let remaining = amount;

  for (const tier of sorted) {
    while (remaining >= tier) {
      result.push(tier);
      remaining -= tier;
    }
  }

  if (remaining > 0n) {
    throw new Error(`Amount ${amount} cannot be exactly split into tiers. Remainder: ${remaining}`);
  }

  return result;
}

/**
 * Split an amount into tiers, returning any sub-tier remainder separately
 * instead of throwing. Useful for validation UIs that need to show the
 * user why an amount isn't expressible (e.g., fractional cents).
 */
export function splitIntoTiersWithRemainder(
  amount: bigint,
  tiers: readonly bigint[],
): { deposits: bigint[]; remainder: bigint } {
  const sorted = [...tiers].sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
  const deposits: bigint[] = [];
  let remaining = amount;

  for (const tier of sorted) {
    while (remaining >= tier) {
      deposits.push(tier);
      remaining -= tier;
    }
  }

  return { deposits, remainder: remaining };
}
