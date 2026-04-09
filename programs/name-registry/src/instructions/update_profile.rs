use anchor_lang::prelude::*;

use crate::errors::NameRegistryError;
use crate::state::*;

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    #[account(
        mut,
        constraint = name_record.authority == authority.key() @ NameRegistryError::Unauthorized,
        constraint = name_record.status == NameStatus::Active @ NameRegistryError::NameNotActive,
    )]
    pub name_record: Account<'info, NameRecord>,

    pub authority: Signer<'info>,
}

pub fn update_profile_handler(ctx: Context<UpdateProfile>, profile_cid: [u8; 32]) -> Result<()> {
    let record = &mut ctx.accounts.name_record;
    record.profile_cid = Some(profile_cid);
    record.updated_at = Clock::get()?.unix_timestamp;

    msg!("Profile updated: cid={:?}", &profile_cid[..4]);
    Ok(())
}
