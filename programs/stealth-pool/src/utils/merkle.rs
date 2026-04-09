use anchor_lang::solana_program::keccak;

use crate::state::MERKLE_TREE_DEPTH;

/// Zero values for each level of the Merkle tree.
/// Level 0 = keccak256(0), Level n+1 = keccak256(zero[n] || zero[n])
/// Used for empty subtrees.
pub fn zero_value(level: usize) -> [u8; 32] {
    let mut current = [0u8; 32];
    for _ in 0..level {
        current = hash_pair(&current, &current);
    }
    current
}

pub fn hash_pair(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut input = [0u8; 64];
    input[..32].copy_from_slice(left);
    input[32..].copy_from_slice(right);
    keccak::hash(&input).to_bytes()
}

/// Simplified incremental Merkle tree insert.
/// In production this would use Poseidon hash and ZK Compression for state.
/// For MVP, we compute a new root by hashing the new leaf into the tree
/// at the given index position.
pub fn insert_leaf(
    current_root: &[u8; 32],
    leaf: &[u8; 32],
    index: u32,
) -> [u8; 32] {
    let _ = current_root; // Full implementation tracks filled subtrees
    let mut current_hash = *leaf;
    let mut idx = index;

    for level in 0..MERKLE_TREE_DEPTH {
        let zero = zero_value(level);
        if idx % 2 == 0 {
            current_hash = hash_pair(&current_hash, &zero);
        } else {
            current_hash = hash_pair(&zero, &current_hash);
        }
        idx /= 2;
    }

    current_hash
}

/// Verify a Merkle proof that `leaf` is at position `index` in the tree
/// with the given `root`.
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
            current = hash_pair(&current, &path[i]);
        } else {
            current = hash_pair(&path[i], &current);
        }
    }

    current == *root
}
