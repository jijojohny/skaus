use anchor_lang::prelude::*;

use crate::errors::StealthPoolError;
use crate::state::StealthPool;

#[derive(Accounts)]
pub struct UpdatePoolConfig<'info> {
    #[account(
        mut,
        seeds = [b"stealth_pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        has_one = authority @ StealthPoolError::Unauthorized,
    )]
    pub pool: Account<'info, StealthPool>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct PausePool<'info> {
    #[account(
        mut,
        seeds = [b"stealth_pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        has_one = authority @ StealthPoolError::Unauthorized,
    )]
    pub pool: Account<'info, StealthPool>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UnpausePool<'info> {
    #[account(
        mut,
        seeds = [b"stealth_pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        has_one = authority @ StealthPoolError::Unauthorized,
    )]
    pub pool: Account<'info, StealthPool>,

    pub authority: Signer<'info>,
}

pub fn update_config_handler(
    ctx: Context<UpdatePoolConfig>,
    fee_bps: Option<u16>,
    min_deposit: Option<u64>,
    max_deposit: Option<u64>,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    if let Some(fee) = fee_bps {
        require!(fee <= 10_000, StealthPoolError::FeeTooHigh);
        pool.fee_bps = fee;
    }

    if let Some(min) = min_deposit {
        pool.min_deposit = min;
    }

    if let Some(max) = max_deposit {
        pool.max_deposit = max;
    }

    // Post-update invariant: min must not exceed max
    require!(
        pool.max_deposit >= pool.min_deposit,
        StealthPoolError::DepositBelowMinimum
    );

    msg!("Pool config updated: fee={} bps, min={}, max={}", pool.fee_bps, pool.min_deposit, pool.max_deposit);
    Ok(())
}

pub fn pause_handler(ctx: Context<PausePool>) -> Result<()> {
    ctx.accounts.pool.paused = true;
    msg!("Pool paused");
    Ok(())
}

pub fn unpause_handler(ctx: Context<UnpausePool>) -> Result<()> {
    ctx.accounts.pool.paused = false;
    msg!("Pool unpaused");
    Ok(())
}

#[derive(Accounts)]
pub struct SetFeeVault<'info> {
    #[account(
        mut,
        seeds = [b"stealth_pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        has_one = authority @ StealthPoolError::Unauthorized,
    )]
    pub pool: Account<'info, StealthPool>,

    /// CHECK: Validated as a token account owned by the pool authority.
    /// Must be an ATA or token account for the pool's mint.
    pub fee_vault_account: AccountInfo<'info>,

    pub authority: Signer<'info>,
}

pub fn set_fee_vault_handler(ctx: Context<SetFeeVault>) -> Result<()> {
    ctx.accounts.pool.fee_vault = ctx.accounts.fee_vault_account.key();
    msg!("Fee vault set to: {}", ctx.accounts.pool.fee_vault);
    Ok(())
}
