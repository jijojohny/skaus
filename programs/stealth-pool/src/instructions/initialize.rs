use anchor_lang::prelude::*;

use anchor_spl::token::TokenAccount;

use crate::errors::StealthPoolError;
use crate::state::*;

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = StealthPool::LEN,
        seeds = [b"stealth_pool", token_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, StealthPool>,

    #[account(
        init,
        payer = authority,
        space = MerkleRootHistory::LEN,
        seeds = [b"merkle_roots", pool.key().as_ref()],
        bump
    )]
    pub merkle_root_history: Account<'info, MerkleRootHistory>,

    /// CHECK: Validated by owner constraint — must be owned by the SPL Token program.
    #[account(
        owner = anchor_spl::token::Token::id()
    )]
    pub token_mint: AccountInfo<'info>,

    /// Token account that receives protocol fees on withdrawals.
    /// Must match the pool's token mint.
    #[account(
        constraint = fee_vault_account.mint == token_mint.key(),
    )]
    pub fee_vault_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializePool>,
    fee_bps: u16,
    min_deposit: u64,
    max_deposit: u64,
) -> Result<()> {
    require!(fee_bps <= 10_000, StealthPoolError::FeeTooHigh);
    require!(min_deposit > 0, StealthPoolError::DepositBelowMinimum);
    require!(max_deposit >= min_deposit, StealthPoolError::DepositBelowMinimum);

    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.authority.key();
    pool.token_mint = ctx.accounts.token_mint.key();
    pool.fee_bps = fee_bps;
    pool.min_deposit = min_deposit;
    pool.max_deposit = max_deposit;
    pool.total_deposits = 0;
    pool.total_withdrawals = 0;
    pool.deposit_count = 0;
    pool.withdrawal_count = 0;
    pool.current_merkle_index = 0;
    pool.paused = false;
    pool.bump = ctx.bumps.pool;
    pool.fee_vault = ctx.accounts.fee_vault_account.key();

    // Empty tree root — Poseidon hash of zero leaves at depth 20
    pool.merkle_root = [0u8; 32];

    let history = &mut ctx.accounts.merkle_root_history;
    history.pool = pool.key();
    history.roots = Vec::with_capacity(MAX_MERKLE_ROOTS);
    history.bump = ctx.bumps.merkle_root_history;

    msg!("Stealth pool initialized for mint: {}", pool.token_mint);
    msg!(
        "Config: fee={} bps, min_deposit={}, max_deposit={}, merkle_depth={}",
        fee_bps, min_deposit, max_deposit, MERKLE_TREE_DEPTH
    );

    Ok(())
}
