use anchor_lang::prelude::*;

use crate::state::RegistryConfig;

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = authority,
        space = RegistryConfig::LEN,
        seeds = [b"registry_config"],
        bump
    )]
    pub config: Account<'info, RegistryConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_registry_handler(
    ctx: Context<InitializeRegistry>,
    registration_fee: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.registration_fee = registration_fee;
    config.fee_treasury = ctx.accounts.authority.key();
    config.total_registrations = 0;
    config.paused = false;
    config.bump = ctx.bumps.config;

    msg!("Name registry initialized: fee={} lamports", registration_fee);
    Ok(())
}
