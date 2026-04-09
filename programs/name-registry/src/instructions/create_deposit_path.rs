use anchor_lang::prelude::*;

use crate::errors::NameRegistryError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(label: String)]
pub struct CreateDepositPath<'info> {
    #[account(
        mut,
        constraint = name_record.authority == authority.key() @ NameRegistryError::Unauthorized,
        constraint = name_record.status == NameStatus::Active @ NameRegistryError::NameNotActive,
    )]
    pub name_record: Account<'info, NameRecord>,

    #[account(
        init,
        payer = payer,
        space = DepositPath::space(label.len()),
        seeds = [
            b"deposit_path",
            name_record.key().as_ref(),
            &name_record.deposit_index.to_le_bytes(),
        ],
        bump,
    )]
    pub deposit_path: Account<'info, DepositPath>,

    pub authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn create_deposit_path_handler(ctx: Context<CreateDepositPath>, label: String) -> Result<()> {
    require!(
        label.len() <= MAX_LABEL_LENGTH,
        NameRegistryError::LabelTooLong
    );

    let record = &mut ctx.accounts.name_record;
    let current_index = record.deposit_index;

    record.deposit_index = current_index
        .checked_add(1)
        .ok_or(NameRegistryError::DepositIndexOverflow)?;
    record.updated_at = Clock::get()?.unix_timestamp;

    let path = &mut ctx.accounts.deposit_path;
    path.name_record = record.key();
    path.path_index = current_index;
    path.label = label;
    path.created_at = Clock::get()?.unix_timestamp;
    path.bump = ctx.bumps.deposit_path;

    msg!("Deposit path created: index={}", current_index);
    Ok(())
}
