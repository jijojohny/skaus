use crate::errors::NameRegistryError;
use crate::state::*;
use anchor_lang::prelude::*;

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
