use anchor_lang::prelude::*;

use super::vk::VERIFYINGKEY;

const NUM_PUBLIC_INPUTS: usize = 5;

/// Reverse endianness within each 32-byte chunk.
fn change_endianness(bytes: &[u8]) -> Vec<u8> {
    let mut vec = Vec::new();
    for b in bytes.chunks(32) {
        for byte in b.iter().rev() {
            vec.push(*byte);
        }
    }
    vec
}

/// Build the public inputs for Groth16 verification.
///
/// The circuit expects 5 BN254 field elements (32 bytes big-endian each):
///   [0] merkle_root
///   [1] nullifier_hash
///   [2] recipient
///   [3] amount
///   [4] fee
pub fn build_public_inputs(
    merkle_root: &[u8; 32],
    nullifier_hash: &[u8; 32],
    recipient: &Pubkey,
    amount: u64,
    fee: u64,
) -> [[u8; 32]; NUM_PUBLIC_INPUTS] {
    let mut inputs = [[0u8; 32]; NUM_PUBLIC_INPUTS];
    inputs[0] = *merkle_root;
    inputs[1] = *nullifier_hash;
    inputs[2] = recipient.to_bytes();

    let mut amount_be = [0u8; 32];
    amount_be[24..32].copy_from_slice(&amount.to_be_bytes());
    inputs[3] = amount_be;

    let mut fee_be = [0u8; 32];
    fee_be[24..32].copy_from_slice(&fee.to_be_bytes());
    inputs[4] = fee_be;

    inputs
}

/// Verify a Groth16 proof on-chain.
///
/// When `devnet-mock` is active, bypasses verification for testing.
pub fn verify_groth16_proof(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]; NUM_PUBLIC_INPUTS],
) -> bool {
    #[cfg(feature = "devnet-mock")]
    {
        let _ = (proof_a, proof_b, proof_c, public_inputs);
        return true;
    }

    #[cfg(not(feature = "devnet-mock"))]
    {
        verify_proof_real(proof_a, proof_b, proof_c, public_inputs)
    }
}

#[cfg(not(feature = "devnet-mock"))]
fn verify_proof_real(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]; NUM_PUBLIC_INPUTS],
) -> bool {
    use groth16_solana::groth16::Groth16Verifier;
    use ark_bn254::g1::G1Affine;
    use ark_serialize::{CanonicalSerialize, CanonicalDeserialize, Compress, Validate};
    use core::ops::Neg;

    // Negate proof_a: deserialize, negate, serialize x/y individually, swap endianness
    let g1_a = match G1Affine::deserialize_with_mode(
        &*[&change_endianness(proof_a)[..], &[0u8][..]].concat(),
        Compress::No,
        Validate::Yes,
    ) {
        Ok(p) => p,
        Err(_) => {
            msg!("Failed to deserialize proof_a");
            return false;
        }
    };

    let neg_a = g1_a.neg();
    let mut proof_a_neg_buf = [0u8; 65];
    if neg_a.x.serialize_with_mode(&mut proof_a_neg_buf[..32], Compress::No).is_err() {
        msg!("Failed to serialize negated proof_a.x");
        return false;
    }
    if neg_a.y.serialize_with_mode(&mut proof_a_neg_buf[32..64], Compress::No).is_err() {
        msg!("Failed to serialize negated proof_a.y");
        return false;
    }

    let proof_a_final: [u8; 64] = match change_endianness(&proof_a_neg_buf[..64]).try_into() {
        Ok(v) => v,
        Err(_) => return false,
    };

    let proof_b_arr: [u8; 128] = *proof_b;
    let proof_c_arr: [u8; 64] = *proof_c;

    let mut verifier = match Groth16Verifier::new(
        &proof_a_final,
        &proof_b_arr,
        &proof_c_arr,
        public_inputs,
        &VERIFYINGKEY,
    ) {
        Ok(v) => v,
        Err(e) => {
            msg!("Groth16Verifier init failed: {:?}", e);
            return false;
        }
    };

    match verifier.verify() {
        Ok(true) => true,
        Ok(false) => {
            msg!("Groth16 proof invalid");
            false
        }
        Err(e) => {
            msg!("Groth16 verification error: {:?}", e);
            false
        }
    }
}
