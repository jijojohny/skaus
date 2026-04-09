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

export const USDC_MINT_DEVNET = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
export const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const DEPOSIT_TIERS_USDC = [
  10_000_000n,       // 10 USDC
  100_000_000n,      // 100 USDC
  1_000_000_000n,    // 1,000 USDC
  10_000_000_000n,   // 10,000 USDC
] as const;

export const DEPOSIT_TIERS_SOL = [
  100_000_000n,        // 0.1 SOL
  1_000_000_000n,      // 1 SOL
  10_000_000_000n,     // 10 SOL
  100_000_000_000n,    // 100 SOL
] as const;

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
