use anchor_lang::prelude::*;

#[error_code]
pub enum NameRegistryError {
    #[msg("Name is too short — minimum 3 characters")]
    NameTooShort,

    #[msg("Name is too long — maximum 32 characters")]
    NameTooLong,

    #[msg("Name contains invalid characters — only [a-z0-9_-] allowed")]
    InvalidNameCharacters,

    #[msg("Name cannot start with underscore or hyphen")]
    InvalidNamePrefix,

    #[msg("Name is reserved and cannot be registered")]
    NameReserved,

    #[msg("Name is already registered")]
    NameAlreadyRegistered,

    #[msg("Name record is not active")]
    NameNotActive,

    #[msg("Unauthorized — only the name authority can perform this action")]
    Unauthorized,

    #[msg("Registry is currently paused")]
    RegistryPaused,

    #[msg("Invalid stealth meta-address — pubkeys cannot be zero")]
    InvalidStealthMetaAddress,

    #[msg("Label is too long — maximum 64 characters")]
    LabelTooLong,

    #[msg("Deposit path index overflow")]
    DepositIndexOverflow,

    #[msg("Name hash mismatch — computed hash does not match provided hash")]
    NameHashMismatch,
}
