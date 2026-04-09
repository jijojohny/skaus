use anchor_lang::prelude::*;

pub const MAX_NAME_LENGTH: usize = 32;
pub const MIN_NAME_LENGTH: usize = 3;
pub const MAX_LABEL_LENGTH: usize = 64;
pub const MAX_DEPOSIT_PATHS: u64 = 1_000_000;

// ---------------------------------------------------------------------------
// NameRecord — PDA per registered @name.skaus identity
// Seeds: ["name", Poseidon(lowercase(name))]
// ---------------------------------------------------------------------------

#[account]
pub struct NameRecord {
    pub authority: Pubkey,
    pub name_hash: [u8; 32],
    pub stealth_meta_address: StealthMetaAddress,
    /// Pointer to the ZK-compressed profile account (None if no profile set)
    pub profile_cid: Option<[u8; 32]>,
    /// Monotonic counter for generating unique per-link deposit paths
    pub deposit_index: u64,
    pub created_at: i64,
    pub updated_at: i64,
    pub status: NameStatus,
    pub bump: u8,
}

impl NameRecord {
    pub const LEN: usize = 8   // discriminator
        + 32                    // authority
        + 32                    // name_hash
        + StealthMetaAddress::LEN // stealth_meta_address
        + 1 + 32               // profile_cid (Option<[u8; 32]>)
        + 8                     // deposit_index
        + 8                     // created_at
        + 8                     // updated_at
        + 1                     // status (enum variant)
        + 1;                    // bump
}

// ---------------------------------------------------------------------------
// StealthMetaAddress — scan + spend pubkeys for stealth address derivation
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub struct StealthMetaAddress {
    pub scan_pubkey: [u8; 32],
    pub spend_pubkey: [u8; 32],
    pub version: u8,
}

impl StealthMetaAddress {
    pub const LEN: usize = 32 + 32 + 1;
}

// ---------------------------------------------------------------------------
// NameStatus — lifecycle state for registered names
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum NameStatus {
    Active,
    Suspended,
    Expired,
}

// ---------------------------------------------------------------------------
// DepositPath — per-link deposit derivation record
// Seeds: ["deposit_path", name_record, path_index (u64 LE bytes)]
// ---------------------------------------------------------------------------

#[account]
pub struct DepositPath {
    pub name_record: Pubkey,
    pub path_index: u64,
    pub label: String,
    pub created_at: i64,
    pub bump: u8,
}

impl DepositPath {
    pub fn space(label_len: usize) -> usize {
        8       // discriminator
        + 32    // name_record
        + 8     // path_index
        + 4 + label_len // label (borsh string: 4-byte len + data)
        + 8     // created_at
        + 1     // bump
    }
}

// ---------------------------------------------------------------------------
// RegistryConfig — global registry configuration (singleton PDA)
// Seeds: ["registry_config"]
// ---------------------------------------------------------------------------

#[account]
pub struct RegistryConfig {
    pub authority: Pubkey,
    /// Optional registration fee in lamports (0 = free)
    pub registration_fee: u64,
    /// Treasury that receives registration fees
    pub fee_treasury: Pubkey,
    pub total_registrations: u64,
    pub paused: bool,
    pub bump: u8,
}

impl RegistryConfig {
    pub const LEN: usize = 8   // discriminator
        + 32                    // authority
        + 8                     // registration_fee
        + 32                    // fee_treasury
        + 8                     // total_registrations
        + 1                     // paused
        + 1;                    // bump
}
