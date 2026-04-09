use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::NameRegistryError;
use crate::state::*;
use crate::utils::validation::{validate_name, validate_stealth_meta_address};

#[derive(Accounts)]
#[instruction(name: String, name_hash: [u8; 32])]
pub struct RegisterName<'info> {
    #[account(
        mut,
        seeds = [b"registry_config"],
        bump = config.bump,
        constraint = !config.paused @ NameRegistryError::RegistryPaused,
    )]
    pub config: Account<'info, RegistryConfig>,

    #[account(
        init,
        payer = payer,
        space = NameRecord::LEN,
        seeds = [b"name", name_hash.as_ref()],
        bump,
    )]
    pub name_record: Account<'info, NameRecord>,

    /// CHECK: Fee treasury receives registration fees. Validated against config.
    #[account(
        mut,
        constraint = fee_treasury.key() == config.fee_treasury @ NameRegistryError::Unauthorized,
    )]
    pub fee_treasury: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// The authority who will own this name (can be different from payer)
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn register_name_handler(
    ctx: Context<RegisterName>,
    name: String,
    name_hash: [u8; 32],
    stealth_meta_address: StealthMetaAddress,
) -> Result<()> {
    validate_name(&name)?;
    validate_stealth_meta_address(&stealth_meta_address)?;

    if ctx.accounts.config.registration_fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.fee_treasury.to_account_info(),
                },
            ),
            ctx.accounts.config.registration_fee,
        )?;
    }

    let clock = Clock::get()?;
    let record = &mut ctx.accounts.name_record;
    record.authority = ctx.accounts.authority.key();
    record.name_hash = name_hash;
    record.stealth_meta_address = stealth_meta_address;
    record.profile_cid = None;
    record.deposit_index = 0;
    record.created_at = clock.unix_timestamp;
    record.updated_at = clock.unix_timestamp;
    record.status = NameStatus::Active;
    record.bump = ctx.bumps.name_record;

    let config = &mut ctx.accounts.config;
    config.total_registrations = config
        .total_registrations
        .checked_add(1)
        .ok_or(NameRegistryError::DepositIndexOverflow)?;

    msg!("Name registered: hash={:?}", &name_hash[..4]);
    Ok(())
}
