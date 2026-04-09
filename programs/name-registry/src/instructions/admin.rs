use anchor_lang::prelude::*;

use crate::errors::NameRegistryError;
use crate::state::*;

// ---------------------------------------------------------------------------
// UpdateRegistryConfig — update registration fee or treasury
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct UpdateRegistryConfig<'info> {
    #[account(
        mut,
        seeds = [b"registry_config"],
        bump = config.bump,
        constraint = config.authority == authority.key() @ NameRegistryError::Unauthorized,
    )]
    pub config: Account<'info, RegistryConfig>,

    pub authority: Signer<'info>,
}

pub fn update_config_handler(
    ctx: Context<UpdateRegistryConfig>,
    registration_fee: Option<u64>,
    fee_treasury: Option<Pubkey>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(fee) = registration_fee {
        config.registration_fee = fee;
    }
    if let Some(treasury) = fee_treasury {
        config.fee_treasury = treasury;
    }

    msg!("Registry config updated");
    Ok(())
}

// ---------------------------------------------------------------------------
// PauseRegistry
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct PauseRegistry<'info> {
    #[account(
        mut,
        seeds = [b"registry_config"],
        bump = config.bump,
        constraint = config.authority == authority.key() @ NameRegistryError::Unauthorized,
    )]
    pub config: Account<'info, RegistryConfig>,

    pub authority: Signer<'info>,
}

pub fn pause_handler(ctx: Context<PauseRegistry>) -> Result<()> {
    ctx.accounts.config.paused = true;
    msg!("Name registry paused");
    Ok(())
}

// ---------------------------------------------------------------------------
// UnpauseRegistry
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct UnpauseRegistry<'info> {
    #[account(
        mut,
        seeds = [b"registry_config"],
        bump = config.bump,
        constraint = config.authority == authority.key() @ NameRegistryError::Unauthorized,
    )]
    pub config: Account<'info, RegistryConfig>,

    pub authority: Signer<'info>,
}

pub fn unpause_handler(ctx: Context<UnpauseRegistry>) -> Result<()> {
    ctx.accounts.config.paused = false;
    msg!("Name registry unpaused");
    Ok(())
}

// ---------------------------------------------------------------------------
// SuspendName — admin can suspend a name (e.g., policy violation)
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct SuspendName<'info> {
    #[account(
        seeds = [b"registry_config"],
        bump = config.bump,
        constraint = config.authority == authority.key() @ NameRegistryError::Unauthorized,
    )]
    pub config: Account<'info, RegistryConfig>,

    #[account(mut)]
    pub name_record: Account<'info, NameRecord>,

    pub authority: Signer<'info>,
}

pub fn suspend_handler(ctx: Context<SuspendName>) -> Result<()> {
    ctx.accounts.name_record.status = NameStatus::Suspended;
    ctx.accounts.name_record.updated_at = Clock::get()?.unix_timestamp;
    msg!("Name suspended");
    Ok(())
}

// ---------------------------------------------------------------------------
// UnsuspendName — admin can reactivate a suspended name
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct UnsuspendName<'info> {
    #[account(
        seeds = [b"registry_config"],
        bump = config.bump,
        constraint = config.authority == authority.key() @ NameRegistryError::Unauthorized,
    )]
    pub config: Account<'info, RegistryConfig>,

    #[account(mut)]
    pub name_record: Account<'info, NameRecord>,

    pub authority: Signer<'info>,
}

pub fn unsuspend_handler(ctx: Context<UnsuspendName>) -> Result<()> {
    ctx.accounts.name_record.status = NameStatus::Active;
    ctx.accounts.name_record.updated_at = Clock::get()?.unix_timestamp;
    msg!("Name unsuspended");
    Ok(())
}
