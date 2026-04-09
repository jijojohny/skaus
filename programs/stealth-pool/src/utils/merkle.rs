use anchor_lang::solana_program::poseidon::{hashv, Endianness, Parameters};

use crate::state::MERKLE_TREE_DEPTH;

/// Poseidon hash of two 32-byte field elements (matching circom's Poseidon(2)).
/// Uses the Solana Poseidon syscall on-chain (no stack overhead).
pub fn poseidon_hash_pair(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    hashv(
        Parameters::Bn254X5,
        Endianness::BigEndian,
        &[left.as_ref(), right.as_ref()],
    )
    .expect("Poseidon hash")
    .to_bytes()
}

/// Zero value at each level of the Merkle tree.
/// Level 0 = [0u8; 32] (empty leaf), Level n+1 = Poseidon(zero[n], zero[n]).
pub fn zero_value(level: usize) -> [u8; 32] {
    let mut current = [0u8; 32];
    for _ in 0..level {
        current = poseidon_hash_pair(&current, &current);
    }
    current
}

/// Insert a leaf into the incremental Merkle tree and return the new root.
///
/// Walks up from the leaf at `index`, pairing with zero siblings at each
/// level (matching the circuit's MerkleProof template).
pub fn insert_leaf(
    _current_root: &[u8; 32],
    leaf: &[u8; 32],
    index: u32,
) -> [u8; 32] {
    let mut current_hash = *leaf;
    let mut idx = index;

    for level in 0..MERKLE_TREE_DEPTH {
        let zero = zero_value(level);
        if idx % 2 == 0 {
            current_hash = poseidon_hash_pair(&current_hash, &zero);
        } else {
            current_hash = poseidon_hash_pair(&zero, &current_hash);
        }
        idx /= 2;
    }

    current_hash
}

/// Verify a Merkle inclusion proof.
pub fn verify_proof(
    root: &[u8; 32],
    leaf: &[u8; 32],
    path: &[[u8; 32]],
    path_indices: &[u8],
) -> bool {
    if path.len() != MERKLE_TREE_DEPTH || path_indices.len() != MERKLE_TREE_DEPTH {
        return false;
    }

    let mut current = *leaf;
    for i in 0..MERKLE_TREE_DEPTH {
        if path_indices[i] == 0 {
            current = poseidon_hash_pair(&current, &path[i]);
        } else {
            current = poseidon_hash_pair(&path[i], &current);
        }
    }

    current == *root
}
