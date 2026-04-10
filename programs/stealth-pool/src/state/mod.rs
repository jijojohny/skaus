use anchor_lang::prelude::*;

/// Number of recent Merkle roots to accept for withdrawals.
/// Allows deposits to be proven against slightly stale roots while new
/// deposits are being inserted. 100 roots at ~1 deposit/block ≈ ~50 seconds
/// of root staleness tolerance.
pub const MAX_MERKLE_ROOTS: usize = 100;

/// Depth of the incremental Merkle tree. 2^20 = 1,048,576 leaves.
/// At production scale with deposit tiers, this supports millions of
/// individual deposit notes before tree exhaustion.
pub const MERKLE_TREE_DEPTH: usize = 20;

/// Maximum size for the encrypted routing metadata attached to each deposit.
/// Contains ECDH ephemeral pubkey + ChaCha20-Poly1305 ciphertext wrapping
/// the secret, nullifier, and routing info for the recipient.
///
/// Breakdown: 32 (ephemeral pubkey) + 12 (nonce) + ~424 (worst-case
/// ciphertext) + 16 (auth tag) ≈ 484 bytes. 1024 provides safe headroom
/// for future field additions (viewing hints, routing tags, etc.).
pub const MAX_ENCRYPTED_NOTE_SIZE: usize = 1024;

pub const DEPOSIT_TIERS_USDC: [u64; 4] = [
    10_000_000,      // 10 USDC    (6 decimals)
    100_000_000,     // 100 USDC
    1_000_000_000,   // 1,000 USDC
    10_000_000_000,  // 10,000 USDC
];

pub const DEPOSIT_TIERS_SOL: [u64; 4] = [
    100_000_000,       // 0.1 SOL   (9 decimals)
    1_000_000_000,     // 1 SOL
    10_000_000_000,    // 10 SOL
    100_000_000_000,   // 100 SOL
];

// ---------------------------------------------------------------------------
// StealthPool — global pool state (one per token mint)
// ---------------------------------------------------------------------------

#[account]
pub struct StealthPool {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub fee_bps: u16,
    pub min_deposit: u64,
    pub max_deposit: u64,
    pub total_deposits: u64,
    pub total_withdrawals: u64,
    pub deposit_count: u64,
    pub withdrawal_count: u64,
    pub current_merkle_index: u32,
    pub paused: bool,
    /// Current Merkle root after the latest deposit insertion.
    pub merkle_root: [u8; 32],
    pub fee_vault: Pubkey,
    pub bump: u8,
}

impl StealthPool {
    pub const LEN: usize = 8   // discriminator
        + 32                    // authority
        + 32                    // token_mint
        + 2                     // fee_bps
        + 8                     // min_deposit
        + 8                     // max_deposit
        + 8                     // total_deposits
        + 8                     // total_withdrawals
        + 8                     // deposit_count
        + 8                     // withdrawal_count
        + 4                     // current_merkle_index
        + 1                     // paused
        + 32                    // merkle_root
        + 32                    // fee_vault
        + 1;                    // bump
}

// ---------------------------------------------------------------------------
// MerkleRootHistory — ring buffer of recent roots (separate account)
//
// Stored as a heap-allocated Vec to avoid SBF's 4KB stack frame limit.
// At 100 roots × 32 bytes = 3.2KB of data, well within Solana's 10MB
// account size limit.
// ---------------------------------------------------------------------------

#[account]
pub struct MerkleRootHistory {
    pub pool: Pubkey,
    /// Circular buffer of recent Merkle roots. When full, the oldest
    /// root is evicted. Withdrawals can prove against any root in this
    /// set to tolerate concurrent deposits.
    pub roots: Vec<[u8; 32]>,
    pub bump: u8,
}

impl MerkleRootHistory {
    pub const LEN: usize = 8   // discriminator
        + 32                    // pool
        + 4 + (32 * MAX_MERKLE_ROOTS) // roots vec (prefix + max capacity)
        + 1;                    // bump

    pub fn is_valid_root(&self, root: &[u8; 32], current_root: &[u8; 32]) -> bool {
        if *root == *current_root {
            return true;
        }
        self.roots.iter().any(|r| r == root)
    }

    pub fn push_root(&mut self, root: [u8; 32]) {
        if self.roots.len() >= MAX_MERKLE_ROOTS {
            self.roots.remove(0);
        }
        self.roots.push(root);
    }
}

// ---------------------------------------------------------------------------
// Nullifier — individual PDA per spent nullifier
//
// Production pattern: each nullifier_hash gets its own PDA account,
// seeded by [b"nullifier", pool, nullifier_hash]. Account existence
// proves the nullifier is spent. This scales to unlimited withdrawals
// with zero collision risk (unlike bitmap approaches).
//
// Trade-off: ~0.002 SOL rent per nullifier account. In production,
// use ZK Compression (Light Protocol) to store these as compressed
// state at ~$0.0001 per entry.
// ---------------------------------------------------------------------------

#[account]
pub struct SpentNullifier {
    pub pool: Pubkey,
    pub nullifier_hash: [u8; 32],
    pub spent_at: i64,
    pub bump: u8,
}

impl SpentNullifier {
    pub const LEN: usize = 8   // discriminator
        + 32                    // pool
        + 32                    // nullifier_hash
        + 8                     // spent_at
        + 1;                    // bump
}

// ---------------------------------------------------------------------------
// DepositNote — individual PDA per deposit commitment
// ---------------------------------------------------------------------------

#[account]
pub struct DepositNote {
    pub pool: Pubkey,
    pub commitment: [u8; 32],
    pub encrypted_note: Vec<u8>,
    pub leaf_index: u32,
    pub timestamp: i64,
    pub bump: u8,
}

impl DepositNote {
    pub fn space(note_len: usize) -> usize {
        8       // discriminator
        + 32    // pool
        + 32    // commitment
        + 4 + note_len // encrypted_note (vec prefix + data)
        + 4     // leaf_index
        + 8     // timestamp
        + 1     // bump
    }
}

// ---------------------------------------------------------------------------
// FeeVault — protocol fee accumulator
// ---------------------------------------------------------------------------

#[account]
pub struct FeeVault {
    pub pool: Pubkey,
    pub total_collected: u64,
    pub bump: u8,
}

impl FeeVault {
    pub const LEN: usize = 8 + 32 + 8 + 1;
}
