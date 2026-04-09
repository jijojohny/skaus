use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq");

#[program]
pub mod stealth_pool {
    use super::*;

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        fee_bps: u16,
        min_deposit: u64,
        max_deposit: u64,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, fee_bps, min_deposit, max_deposit)
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        amount: u64,
        commitment: [u8; 32],
        encrypted_note: Vec<u8>,
    ) -> Result<()> {
        instructions::deposit::handler(ctx, amount, commitment, encrypted_note)
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        nullifier_hash: [u8; 32],
        recipient: Pubkey,
        amount: u64,
        merkle_root: [u8; 32],
    ) -> Result<()> {
        instructions::withdraw::handler(
            ctx,
            proof_a,
            proof_b,
            proof_c,
            nullifier_hash,
            recipient,
            amount,
            merkle_root,
        )
    }

    pub fn update_pool_config(
        ctx: Context<UpdatePoolConfig>,
        fee_bps: Option<u16>,
        min_deposit: Option<u64>,
        max_deposit: Option<u64>,
    ) -> Result<()> {
        instructions::admin::update_config_handler(ctx, fee_bps, min_deposit, max_deposit)
    }

    pub fn pause_pool(ctx: Context<PausePool>) -> Result<()> {
        instructions::admin::pause_handler(ctx)
    }

    pub fn unpause_pool(ctx: Context<UnpausePool>) -> Result<()> {
        instructions::admin::unpause_handler(ctx)
    }

    pub fn set_fee_vault(ctx: Context<SetFeeVault>) -> Result<()> {
        instructions::admin::set_fee_vault_handler(ctx)
    }
}
