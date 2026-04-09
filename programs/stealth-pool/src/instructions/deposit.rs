use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::StealthPoolError;
use crate::state::*;
use crate::utils::merkle;

#[derive(Accounts)]
#[instruction(amount: u64, commitment: [u8; 32], encrypted_note: Vec<u8>)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"stealth_pool", pool.token_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, StealthPool>,

    #[account(
        mut,
        seeds = [b"merkle_roots", pool.key().as_ref()],
        bump = merkle_root_history.bump,
    )]
    pub merkle_root_history: Account<'info, MerkleRootHistory>,

    #[account(
        init,
        payer = depositor,
        space = DepositNote::space(encrypted_note.len()),
        seeds = [b"deposit_note", pool.key().as_ref(), &commitment],
        bump,
    )]
    pub deposit_note: Account<'info, DepositNote>,

    #[account(
        mut,
        constraint = depositor_token_account.mint == pool.token_mint,
        constraint = depositor_token_account.owner == depositor.key(),
    )]
    pub depositor_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = pool_token_account.mint == pool.token_mint,
    )]
    pub pool_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Deposit>,
    amount: u64,
    commitment: [u8; 32],
    encrypted_note: Vec<u8>,
) -> Result<()> {
    let pool = &ctx.accounts.pool;

    require!(!pool.paused, StealthPoolError::PoolPaused);
    require!(commitment != [0u8; 32], StealthPoolError::InvalidCommitment);
    require!(amount >= pool.min_deposit, StealthPoolError::DepositBelowMinimum);
    require!(amount <= pool.max_deposit, StealthPoolError::DepositExceedsMaximum);
    require!(encrypted_note.len() <= MAX_ENCRYPTED_NOTE_SIZE, StealthPoolError::NoteTooLarge);

    // Enforce fixed deposit tiers for anonymity set uniformity.
    // Each deposit must exactly match one of the predefined tiers
    // so all deposits in a tier are indistinguishable.
    let valid_tier = DEPOSIT_TIERS_USDC.contains(&amount)
        || DEPOSIT_TIERS_SOL.contains(&amount);
    require!(valid_tier, StealthPoolError::InvalidDepositTier);

    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.depositor_token_account.to_account_info(),
            to: ctx.accounts.pool_token_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    let pool = &mut ctx.accounts.pool;
    let leaf_index = pool.current_merkle_index;

    let new_root = merkle::insert_leaf(&pool.merkle_root, &commitment, leaf_index);
    pool.merkle_root = new_root;
    pool.current_merkle_index = leaf_index
        .checked_add(1)
        .ok_or(StealthPoolError::ArithmeticOverflow)?;
    pool.total_deposits = pool
        .total_deposits
        .checked_add(amount)
        .ok_or(StealthPoolError::ArithmeticOverflow)?;
    pool.deposit_count = pool
        .deposit_count
        .checked_add(1)
        .ok_or(StealthPoolError::ArithmeticOverflow)?;

    let history = &mut ctx.accounts.merkle_root_history;
    history.push_root(new_root);

    let clock = Clock::get()?;
    let note = &mut ctx.accounts.deposit_note;
    note.pool = pool.key();
    note.commitment = commitment;
    note.encrypted_note = encrypted_note;
    note.leaf_index = leaf_index;
    note.timestamp = clock.unix_timestamp;
    note.bump = ctx.bumps.deposit_note;

    msg!(
        "Deposit #{} — {} tokens into pool {}",
        pool.deposit_count,
        amount,
        pool.key()
    );

    Ok(())
}
