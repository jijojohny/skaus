use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::StealthPoolError;
use crate::state::*;
use crate::utils::verifier;

#[derive(Accounts)]
#[instruction(
    proof_a: [u8; 64],
    proof_b: [u8; 128],
    proof_c: [u8; 64],
    nullifier_hash: [u8; 32],
    recipient: Pubkey,
    amount: u64,
    merkle_root: [u8; 32],
)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"stealth_pool", pool.token_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, StealthPool>>,

    #[account(
        seeds = [b"merkle_roots", pool.key().as_ref()],
        bump = merkle_root_history.bump,
    )]
    pub merkle_root_history: Box<Account<'info, MerkleRootHistory>>,

    /// Created on first use — if this account already exists, Anchor's `init`
    /// will fail with "already in use", which is exactly the double-spend check.
    #[account(
        init,
        payer = relayer,
        space = SpentNullifier::LEN,
        seeds = [b"nullifier", pool.key().as_ref(), &nullifier_hash],
        bump,
    )]
    pub spent_nullifier: Box<Account<'info, SpentNullifier>>,

    #[account(
        mut,
        constraint = pool_token_account.mint == pool.token_mint,
    )]
    pub pool_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = recipient_token_account.mint == pool.token_mint,
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = fee_token_account.mint == pool.token_mint,
        constraint = fee_token_account.key() == pool.fee_vault @ StealthPoolError::Unauthorized,
    )]
    pub fee_token_account: Box<Account<'info, TokenAccount>>,

    /// Anyone can submit a withdrawal (relayer pattern). The ZK proof is
    /// the authorization — the relayer just pays gas and deducts a fee.
    #[account(mut)]
    pub relayer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Withdraw>,
    proof_a: [u8; 64],
    proof_b: [u8; 128],
    proof_c: [u8; 64],
    nullifier_hash: [u8; 32],
    recipient: Pubkey,
    amount: u64,
    merkle_root: [u8; 32],
) -> Result<()> {
    let pool = &ctx.accounts.pool;

    require!(!pool.paused, StealthPoolError::PoolPaused);

    // Validate Merkle root is recognized (current or recent)
    let history = &ctx.accounts.merkle_root_history;
    require!(
        history.is_valid_root(&merkle_root, &pool.merkle_root),
        StealthPoolError::StaleOrInvalidMerkleRoot
    );

    // Double-spend protection: if `spent_nullifier` PDA init succeeds,
    // this nullifier has never been spent. If it already exists, Anchor
    // rejects the transaction before we reach this point.

    // Calculate protocol fee
    let fee = (amount as u128)
        .checked_mul(pool.fee_bps as u128)
        .ok_or(StealthPoolError::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(StealthPoolError::ArithmeticOverflow)? as u64;

    let payout = amount
        .checked_sub(fee)
        .ok_or(StealthPoolError::InsufficientWithdrawalAmount)?;

    // Build public inputs and verify Groth16 proof
    let public_inputs = verifier::build_public_inputs(
        &merkle_root,
        &nullifier_hash,
        &recipient,
        amount,
        fee,
    );

    require!(
        verifier::verify_groth16_proof(&proof_a, &proof_b, &proof_c, &public_inputs),
        StealthPoolError::InvalidProof
    );

    // Record the spent nullifier
    let clock = Clock::get()?;
    let spent = &mut ctx.accounts.spent_nullifier;
    spent.pool = pool.key();
    spent.nullifier_hash = nullifier_hash;
    spent.spent_at = clock.unix_timestamp;
    spent.bump = ctx.bumps.spent_nullifier;

    // Transfer payout to recipient (PDA-signed)
    let mint_key = ctx.accounts.pool.token_mint;
    let seeds = &[
        b"stealth_pool".as_ref(),
        mint_key.as_ref(),
        &[ctx.accounts.pool.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let transfer_to_recipient = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.pool_token_account.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_to_recipient, payout)?;

    // Transfer fee to protocol vault
    if fee > 0 {
        let transfer_fee = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_token_account.to_account_info(),
                to: ctx.accounts.fee_token_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_fee, fee)?;
    }

    // Update pool accounting
    let pool = &mut ctx.accounts.pool;
    pool.total_withdrawals = pool
        .total_withdrawals
        .checked_add(amount)
        .ok_or(StealthPoolError::ArithmeticOverflow)?;
    pool.withdrawal_count = pool
        .withdrawal_count
        .checked_add(1)
        .ok_or(StealthPoolError::ArithmeticOverflow)?;

    msg!(
        "Withdrawal #{}: {} tokens to {}, fee: {}",
        pool.withdrawal_count,
        payout,
        recipient,
        fee
    );

    Ok(())
}
