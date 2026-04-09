pragma circom 2.1.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/comparators.circom";

/*
 * SKAUS Withdrawal Circuit (Groth16)
 *
 * Proves that the prover:
 *   1. Knows a (secret, nullifier) pair committed in the Merkle tree
 *   2. The commitment hashes correctly via Poseidon
 *   3. The nullifier_hash is correctly derived
 *   4. The commitment is included in the Merkle tree at the given root
 *   5. The amount exceeds the fee (valid withdrawal)
 *
 * Public inputs:  merkle_root, nullifier_hash, recipient, amount, fee
 * Private inputs: secret, nullifier, merkle_path[DEPTH], path_indices[DEPTH]
 */

template MerkleProof(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;

    component hashers[depth];
    component indexBits[depth];

    signal intermediate[depth + 1];
    intermediate[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        indexBits[i] = IsZero();
        indexBits[i].in <== pathIndices[i];

        hashers[i] = Poseidon(2);

        // If pathIndices[i] == 0, hash(intermediate, pathElement)
        // If pathIndices[i] == 1, hash(pathElement, intermediate)
        hashers[i].inputs[0] <== intermediate[i] + (pathElements[i] - intermediate[i]) * (1 - indexBits[i].out);
        hashers[i].inputs[1] <== pathElements[i] + (intermediate[i] - pathElements[i]) * (1 - indexBits[i].out);

        intermediate[i + 1] <== hashers[i].out;
    }

    root <== intermediate[depth];
}

template Withdrawal(merkleDepth) {
    // Public inputs
    signal input merkleRoot;
    signal input nullifierHash;
    signal input recipient;
    signal input amount;
    signal input fee;

    // Private inputs (witness)
    signal input secret;
    signal input nullifier;
    signal input merklePath[merkleDepth];
    signal input pathIndices[merkleDepth];

    // 1. Compute commitment = Poseidon(secret, nullifier, amount)
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;
    commitmentHasher.inputs[2] <== amount;

    // 2. Compute nullifier hash = Poseidon(nullifier)
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;

    // 3. Verify nullifier hash matches public input
    nullifierHash === nullifierHasher.out;

    // 4. Verify Merkle inclusion proof
    component merkleProof = MerkleProof(merkleDepth);
    merkleProof.leaf <== commitmentHasher.out;
    for (var i = 0; i < merkleDepth; i++) {
        merkleProof.pathElements[i] <== merklePath[i];
        merkleProof.pathIndices[i] <== pathIndices[i];
    }

    // 5. Verify the root matches
    merkleRoot === merkleProof.root;

    // 6. Verify amount > fee (valid withdrawal amount)
    component amountCheck = GreaterThan(64);
    amountCheck.in[0] <== amount;
    amountCheck.in[1] <== fee;
    amountCheck.out === 1;

    // 7. Constrain recipient (prevents front-running by binding proof to specific recipient)
    signal recipientSquare;
    recipientSquare <== recipient * recipient;
}

// Instantiate with depth 20 (~1M leaves)
component main {public [merkleRoot, nullifierHash, recipient, amount, fee]} = Withdrawal(20);
