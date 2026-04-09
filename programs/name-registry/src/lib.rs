use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("JAmSyEVzHNCTzC6BETuRQdwK1gLQYUFnzwiVKRVYqpdT");

#[program]
pub mod name_registry {
    use super::*;

    pub fn initialize_registry(
        ctx: Context<InitializeRegistry>,
        registration_fee: u64,
    ) -> Result<()> {
        instructions::initialize_registry::initialize_registry_handler(ctx, registration_fee)
    }

    pub fn register_name(
        ctx: Context<RegisterName>,
        name: String,
        name_hash: [u8; 32],
        stealth_meta_address: state::StealthMetaAddress,
    ) -> Result<()> {
        instructions::register_name::register_name_handler(ctx, name, name_hash, stealth_meta_address)
    }

    pub fn rotate_keys(
        ctx: Context<RotateKeys>,
        new_stealth_meta_address: state::StealthMetaAddress,
    ) -> Result<()> {
        instructions::rotate_keys::rotate_keys_handler(ctx, new_stealth_meta_address)
    }

    pub fn create_deposit_path(
        ctx: Context<CreateDepositPath>,
        label: String,
    ) -> Result<()> {
        instructions::create_deposit_path::create_deposit_path_handler(ctx, label)
    }

    pub fn update_profile(
        ctx: Context<UpdateProfile>,
        profile_cid: [u8; 32],
    ) -> Result<()> {
        instructions::update_profile::update_profile_handler(ctx, profile_cid)
    }

    pub fn update_registry_config(
        ctx: Context<UpdateRegistryConfig>,
        registration_fee: Option<u64>,
        fee_treasury: Option<Pubkey>,
    ) -> Result<()> {
        instructions::admin::update_config_handler(ctx, registration_fee, fee_treasury)
    }

    pub fn pause_registry(ctx: Context<PauseRegistry>) -> Result<()> {
        instructions::admin::pause_handler(ctx)
    }

    pub fn unpause_registry(ctx: Context<UnpauseRegistry>) -> Result<()> {
        instructions::admin::unpause_handler(ctx)
    }

    pub fn suspend_name(ctx: Context<SuspendName>) -> Result<()> {
        instructions::admin::suspend_handler(ctx)
    }

    pub fn unsuspend_name(ctx: Context<UnsuspendName>) -> Result<()> {
        instructions::admin::unsuspend_handler(ctx)
    }
}
