use anchor_lang::prelude::*;

#[error_code]
pub enum StealthPoolError {
    #[msg("Pool is currently paused")]
    PoolPaused,

    #[msg("Deposit amount is below the minimum")]
    DepositBelowMinimum,

    #[msg("Deposit amount exceeds the maximum")]
    DepositExceedsMaximum,

    #[msg("Invalid deposit amount — must match a fixed tier")]
    InvalidDepositTier,

    #[msg("Encrypted note exceeds maximum allowed size")]
    NoteTooLarge,

    #[msg("Nullifier has already been spent")]
    NullifierAlreadySpent,

    #[msg("Invalid ZK proof")]
    InvalidProof,

    #[msg("Merkle root is not recognized in recent history")]
    StaleOrInvalidMerkleRoot,

    #[msg("Withdrawal amount exceeds deposit minus fees")]
    InsufficientWithdrawalAmount,

    #[msg("Fee basis points exceeds maximum (10000)")]
    FeeTooHigh,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Invalid commitment — zero bytes not allowed")]
    InvalidCommitment,

    #[msg("Unauthorized — only pool authority can perform this action")]
    Unauthorized,
}
