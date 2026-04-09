use anchor_lang::prelude::*;

use crate::errors::NameRegistryError;
use crate::state::*;
use crate::utils::validation::validate_stealth_meta_address;

#[derive(Accounts)]
pub struct RotateKeys<'info> {
    #[account(
        mut,
        constraint = name_record.authority == authority.key() @ NameRegistryError::Unauthorized,
        constraint = name_record.status == NameStatus::Active @ NameRegistryError::NameNotActive,
    )]
    pub name_record: Account<'info, NameRecord>,

    pub authority: Signer<'info>,
}

pub fn rotate_keys_handler(
    ctx: Context<RotateKeys>,
    new_stealth_meta_address: StealthMetaAddress,
) -> Result<()> {
    validate_stealth_meta_address(&new_stealth_meta_address)?;

    let record = &mut ctx.accounts.name_record;
    record.stealth_meta_address = new_stealth_meta_address;
    record.updated_at = Clock::get()?.unix_timestamp;

    msg!(
        "Keys rotated to version {}",
        new_stealth_meta_address.version
    );
    Ok(())
}
