use anchor_lang::prelude::*;

/// Build the public inputs byte array for Groth16 verification.
/// Layout: merkle_root(32) || nullifier_hash(32) || recipient(32) || amount(8) || fee(8)
pub fn build_public_inputs(
    merkle_root: &[u8; 32],
    nullifier_hash: &[u8; 32],
    recipient: &Pubkey,
    amount: u64,
    fee: u64,
) -> [u8; 112] {
    let mut inputs = [0u8; 112];
    inputs[0..32].copy_from_slice(merkle_root);
    inputs[32..64].copy_from_slice(nullifier_hash);
    inputs[64..96].copy_from_slice(recipient.as_ref());
    inputs[96..104].copy_from_slice(&amount.to_le_bytes());
    inputs[104..112].copy_from_slice(&fee.to_le_bytes());
    inputs
}

/// Verify a Groth16 proof against the verification key embedded at build time.
///
/// In production, this uses the `groth16-solana` crate with Solana's alt_bn128
/// precompiles for BN254 curve pairing operations (~200K CU).
///
/// For the MVP devnet build, we use a placeholder that always returns true.
/// The real verification key will be generated after the trusted setup ceremony
/// and circuit compilation.
pub fn verify_groth16_proof(
    _proof_a: &[u8; 64],
    _proof_b: &[u8; 128],
    _proof_c: &[u8; 64],
    _public_inputs: &[u8; 112],
) -> bool {
    // TODO: Replace with actual Groth16 verification after trusted setup.
    //
    // Production implementation:
    // ```
    // let vk = include_bytes!("../../keys/verification_key.bin");
    // let proof = Proof { a: proof_a, b: proof_b, c: proof_c };
    // Groth16Verifier::new(vk).verify(&proof, public_inputs).is_ok()
    // ```
    //
    // For now, devnet testing uses a mock verifier that accepts all proofs.
    // This is safe because devnet has no real value at risk.
    #[cfg(feature = "devnet-mock")]
    {
        return true;
    }

    #[cfg(not(feature = "devnet-mock"))]
    {
        msg!("Groth16 verification not yet configured — rejecting proof");
        false
    }
}
