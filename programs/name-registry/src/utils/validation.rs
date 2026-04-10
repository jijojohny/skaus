use crate::errors::NameRegistryError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::poseidon::{self, Endianness, Parameters};

/// Validate name format: 3-32 chars, [a-z0-9_-], cannot start with _ or -
pub fn validate_name(name: &str) -> Result<()> {
    require!(name.len() >= MIN_NAME_LENGTH, NameRegistryError::NameTooShort);
    require!(name.len() <= MAX_NAME_LENGTH, NameRegistryError::NameTooLong);

    let first = name.as_bytes()[0];
    require!(
        first != b'_' && first != b'-',
        NameRegistryError::InvalidNamePrefix
    );

    for &c in name.as_bytes() {
        let valid = c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_' || c == b'-';
        require!(valid, NameRegistryError::InvalidNameCharacters);
    }

    require!(!is_reserved_name(name), NameRegistryError::NameReserved);

    Ok(())
}

/// Validate stealth meta-address: pubkeys must not be all zeros
pub fn validate_stealth_meta_address(addr: &StealthMetaAddress) -> Result<()> {
    require!(
        addr.scan_pubkey != [0u8; 32],
        NameRegistryError::InvalidStealthMetaAddress
    );
    require!(
        addr.spend_pubkey != [0u8; 32],
        NameRegistryError::InvalidStealthMetaAddress
    );
    Ok(())
}

/// Recompute Poseidon(name_bytes) on-chain and verify it matches the
/// client-provided hash. Packs UTF-8 bytes into 31-byte LE chunks as
/// BN254 field elements, matching the client-side `hashName()` function.
pub fn verify_name_hash(name: &str, provided_hash: &[u8; 32]) -> Result<()> {
    let name_bytes = name.as_bytes();
    let mut chunks: Vec<[u8; 32]> = Vec::new();

    let mut i = 0;
    while i < name_bytes.len() {
        let end = core::cmp::min(i + 31, name_bytes.len());
        // Pack chunk bytes as a little-endian integer into a big-endian
        // 32-byte field element (mirrors the TypeScript BigInt LE packing).
        let mut be = [0u8; 32];
        for (j, &b) in name_bytes[i..end].iter().enumerate() {
            be[31 - j] = b;
        }
        chunks.push(be);
        i += 31;
    }

    let refs: Vec<&[u8]> = chunks.iter().map(|c| c.as_ref()).collect();
    let computed = poseidon::hashv(Parameters::Bn254X5, Endianness::BigEndian, &refs)
        .map_err(|_| error!(NameRegistryError::NameHashMismatch))?
        .to_bytes();

    require!(computed == *provided_hash, NameRegistryError::NameHashMismatch);
    Ok(())
}

fn is_reserved_name(name: &str) -> bool {
    const RESERVED: &[&str] = &[
        "admin",
        "skaus",
        "support",
        "help",
        "root",
        "system",
        "official",
        "mod",
        "moderator",
        "staff",
        "api",
        "app",
        "www",
        "mail",
        "null",
        "undefined",
        "test",
        "demo",
    ];
    RESERVED.contains(&name)
}
