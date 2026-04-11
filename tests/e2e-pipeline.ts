/**
 * End-to-end pipeline test: deposit → scan → withdraw
 *
 * Validates the full cryptographic data pipeline without requiring a
 * running Solana validator. Every transformation that connects deposit
 * to withdrawal is exercised and cross-checked:
 *
 *   1. Generate stealth keys (sender + recipient)
 *   2. Derive stealth address (ECDH shared secret)
 *   3. Compute Poseidon commitment (secret, nullifier, amount)
 *   4. Encrypt deposit note
 *   5. Decrypt deposit note (simulating recipient scan)
 *   6. Verify decrypted data matches originals
 *   7. Compute nullifier hash
 *   8. Build Merkle path (matching on-chain insert_leaf)
 *   9. Assemble circuit inputs
 *  10. Verify all public inputs are consistent
 */

import { expect } from 'chai';
import { randomBytes } from 'crypto';
import { PublicKey } from '@solana/web3.js';
import {
  generateStealthKeys,
  deriveStealthAddress,
  computeCommitment,
  computeNullifierHash,
  encryptNote,
  decryptNote,
} from '@skaus/crypto';
import type { DepositNoteData } from '@skaus/crypto';
import {
  DEPOSIT_TIERS_USDC,
  DEPOSIT_TIERS_SOL,
  splitIntoTiers,
  splitIntoTiersWithRemainder,
} from '@skaus/types';

const MERKLE_DEPTH = 20;

describe('e2e pipeline: deposit → scan → withdraw', () => {
  // Shared state across the pipeline steps
  let recipientKeys: { scanPrivkey: Uint8Array; scanPubkey: Uint8Array; spendPrivkey: Uint8Array; spendPubkey: Uint8Array };
  let secret: bigint;
  let nullifier: bigint;
  const amount = 100_000_000n; // 100 USDC
  const leafIndex = 5; // Simulate being the 6th deposit
  const tokenMint = 'C25DXFMAFWX3UuyHHJYQEvxpcc14kt2e92kbQ57tWeg';

  let commitment: Uint8Array;
  let encryptedNote: Uint8Array;
  let ephemeralPubkey: Uint8Array;
  let sharedSecret: Uint8Array;

  // -----------------------------------------------------------------------
  // Step 1-2: Key generation and stealth address derivation
  // -----------------------------------------------------------------------

  it('step 1: should generate stealth keys for recipient', () => {
    recipientKeys = generateStealthKeys();

    expect(recipientKeys.scanPubkey).to.have.length(32);
    expect(recipientKeys.spendPubkey).to.have.length(32);
    expect(recipientKeys.scanPrivkey).to.have.length(32);
    expect(recipientKeys.spendPrivkey).to.have.length(32);
  });

  it('step 2: should derive stealth address via ECDH', () => {
    const result = deriveStealthAddress(
      {
        scanPubkey: recipientKeys.scanPubkey,
        spendPubkey: recipientKeys.spendPubkey,
        version: 1,
      },
      0,
    );

    ephemeralPubkey = result.ephemeralPubkey;
    sharedSecret = result.sharedSecret;

    expect(ephemeralPubkey).to.have.length(32);
    expect(sharedSecret).to.have.length(32);
  });

  // -----------------------------------------------------------------------
  // Step 3: Commitment computation
  // -----------------------------------------------------------------------

  it('step 3: should compute Poseidon commitment', async () => {
    secret = BigInt('0x' + randomBytes(31).toString('hex'));
    nullifier = BigInt('0x' + randomBytes(31).toString('hex'));

    commitment = await computeCommitment(secret, nullifier, amount);
    expect(commitment).to.have.length(32);

    // Verify determinism
    const commitment2 = await computeCommitment(secret, nullifier, amount);
    expect(Buffer.from(commitment)).to.deep.equal(Buffer.from(commitment2));
  });

  // -----------------------------------------------------------------------
  // Step 4: Note encryption (sender side)
  // -----------------------------------------------------------------------

  it('step 4: should encrypt deposit note', () => {
    const noteData: DepositNoteData = {
      secret,
      nullifier,
      amount,
      tokenMint,
      ephemeralPubkey,
    };

    encryptedNote = encryptNote(noteData, sharedSecret);

    expect(encryptedNote.length).to.be.greaterThan(0);
    // Verify it fits within on-chain limit (1024 bytes after our fix)
    expect(encryptedNote.length).to.be.at.most(1024);
  });

  // -----------------------------------------------------------------------
  // Step 5-6: Note decryption (recipient scan) + verification
  // -----------------------------------------------------------------------

  it('step 5: should decrypt note and recover original data', () => {
    const decrypted = decryptNote(encryptedNote, recipientKeys.scanPrivkey);

    expect(decrypted.secret).to.equal(secret);
    expect(decrypted.nullifier).to.equal(nullifier);
    expect(decrypted.amount).to.equal(amount);
    expect(decrypted.tokenMint).to.equal(tokenMint);
  });

  it('step 6: decryption with wrong key should fail', () => {
    const wrongKey = randomBytes(32);
    expect(() => decryptNote(encryptedNote, wrongKey)).to.throw();
  });

  // -----------------------------------------------------------------------
  // Step 7: Nullifier hash computation
  // -----------------------------------------------------------------------

  it('step 7: should compute nullifier hash', async () => {
    const nullifierHash = await computeNullifierHash(nullifier);
    expect(nullifierHash).to.have.length(32);

    // Verify determinism
    const nullifierHash2 = await computeNullifierHash(nullifier);
    expect(Buffer.from(nullifierHash)).to.deep.equal(Buffer.from(nullifierHash2));

    // Verify different nullifier produces different hash
    const otherNullifier = BigInt('0x' + randomBytes(31).toString('hex'));
    const otherHash = await computeNullifierHash(otherNullifier);
    expect(Buffer.from(nullifierHash)).to.not.deep.equal(Buffer.from(otherHash));
  });

  // -----------------------------------------------------------------------
  // Step 8: Merkle path computation (matching on-chain insert_leaf)
  // -----------------------------------------------------------------------

  it('step 8: should compute Merkle path with zero siblings', async () => {
    const { buildPoseidon } = await import('circomlibjs');
    const poseidon = await buildPoseidon();

    const commitmentBigint = bytes32ToBigint(commitment);

    // Compute zero values at each level
    const zeros: bigint[] = [0n];
    for (let i = 1; i <= MERKLE_DEPTH; i++) {
      zeros.push(poseidon.F.toObject(poseidon([zeros[i - 1], zeros[i - 1]])));
    }

    // Build path (mirrors on-chain insert_leaf which uses zero siblings)
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let currentHash = commitmentBigint;
    let idx = leafIndex;

    for (let level = 0; level < MERKLE_DEPTH; level++) {
      pathElements.push(zeros[level]);
      pathIndices.push(idx & 1);

      if ((idx & 1) === 0) {
        currentHash = poseidon.F.toObject(poseidon([currentHash, zeros[level]]));
      } else {
        currentHash = poseidon.F.toObject(poseidon([zeros[level], currentHash]));
      }
      idx >>= 1;
    }

    const merkleRoot = currentHash;

    expect(pathElements).to.have.length(MERKLE_DEPTH);
    expect(pathIndices).to.have.length(MERKLE_DEPTH);
    expect(merkleRoot).to.not.equal(0n);

    // Verify proof: walk the path from leaf to root
    let verifyHash = commitmentBigint;
    for (let i = 0; i < MERKLE_DEPTH; i++) {
      if (pathIndices[i] === 0) {
        verifyHash = poseidon.F.toObject(poseidon([verifyHash, pathElements[i]]));
      } else {
        verifyHash = poseidon.F.toObject(poseidon([pathElements[i], verifyHash]));
      }
    }
    expect(verifyHash).to.equal(merkleRoot);

    // Verify path indices encode the leaf index
    let reconstructedIndex = 0;
    for (let i = 0; i < MERKLE_DEPTH; i++) {
      reconstructedIndex |= pathIndices[i] << i;
    }
    expect(reconstructedIndex).to.equal(leafIndex);
  });

  // -----------------------------------------------------------------------
  // Step 9-10: Circuit input assembly + consistency checks
  // -----------------------------------------------------------------------

  it('step 9: should assemble consistent circuit inputs', async () => {
    const { buildPoseidon } = await import('circomlibjs');
    const poseidon = await buildPoseidon();

    const commitmentBigint = bytes32ToBigint(commitment);
    const nullifierHashBytes = await computeNullifierHash(nullifier);
    const nullifierHashBigint = bytes32ToBigint(nullifierHashBytes);
    const recipientPubkey = PublicKey.unique();
    const recipientBigint = bytes32ToBigint(recipientPubkey.toBytes());
    const fee = (amount * 10n) / 10000n; // 10 bps

    // Compute Merkle root
    const zeros: bigint[] = [0n];
    for (let i = 1; i <= MERKLE_DEPTH; i++) {
      zeros.push(poseidon.F.toObject(poseidon([zeros[i - 1], zeros[i - 1]])));
    }

    let merkleRoot = commitmentBigint;
    let idx = leafIndex;
    for (let level = 0; level < MERKLE_DEPTH; level++) {
      if ((idx & 1) === 0) {
        merkleRoot = poseidon.F.toObject(poseidon([merkleRoot, zeros[level]]));
      } else {
        merkleRoot = poseidon.F.toObject(poseidon([zeros[level], merkleRoot]));
      }
      idx >>= 1;
    }

    // Assemble inputs as the circuit expects them
    const circuitInputs = {
      // Public
      merkleRoot: merkleRoot.toString(),
      nullifierHash: nullifierHashBigint.toString(),
      recipient: recipientBigint.toString(),
      amount: amount.toString(),
      fee: fee.toString(),
      // Private
      secret: secret.toString(),
      nullifier: nullifier.toString(),
      merklePath: new Array(MERKLE_DEPTH).fill('0'), // filled below
      pathIndices: new Array(MERKLE_DEPTH).fill('0'), // filled below
    };

    idx = leafIndex;
    for (let i = 0; i < MERKLE_DEPTH; i++) {
      circuitInputs.merklePath[i] = zeros[i].toString();
      circuitInputs.pathIndices[i] = (idx & 1).toString();
      idx >>= 1;
    }

    // Consistency check 1: commitment = Poseidon(secret, nullifier, amount)
    const recomputedCommitment = poseidon.F.toObject(
      poseidon([secret, nullifier, amount]),
    );
    expect(recomputedCommitment).to.equal(commitmentBigint);

    // Consistency check 2: nullifierHash = Poseidon(nullifier)
    const recomputedNullifierHash = poseidon.F.toObject(poseidon([nullifier]));
    expect(recomputedNullifierHash).to.equal(nullifierHashBigint);

    // Consistency check 3: amount > fee
    expect(amount > fee).to.be.true;

    // Consistency check 4: all inputs are non-zero
    expect(BigInt(circuitInputs.merkleRoot)).to.not.equal(0n);
    expect(BigInt(circuitInputs.nullifierHash)).to.not.equal(0n);
    expect(BigInt(circuitInputs.recipient)).to.not.equal(0n);
    expect(BigInt(circuitInputs.amount)).to.not.equal(0n);
    expect(BigInt(circuitInputs.secret)).to.not.equal(0n);
    expect(BigInt(circuitInputs.nullifier)).to.not.equal(0n);
  });

  // -----------------------------------------------------------------------
  // Step 10: Tier splitting round-trip
  // -----------------------------------------------------------------------

  it('step 10: should split round amounts into tiers', () => {
    const totalAmount = 250_000_000n; // 250 USDC
    const tiers = splitIntoTiers(totalAmount, [...DEPOSIT_TIERS_USDC]);

    const reconstructed = tiers.reduce((sum, t) => sum + t, 0n);
    expect(reconstructed).to.equal(totalAmount);

    for (const tier of tiers) {
      expect(DEPOSIT_TIERS_USDC).to.include(tier);
    }
  });

  // -----------------------------------------------------------------------
  // Step 11: Arbitrary amount splitting (fine-grained tiers)
  // -----------------------------------------------------------------------

  it('step 11: should split arbitrary amounts like 73.42 USDC exactly', () => {
    // 73.42 USDC = 73_420_000 base units (6 decimals)
    const arbitraryAmount = 73_420_000n;
    const tiers = splitIntoTiers(arbitraryAmount, [...DEPOSIT_TIERS_USDC]);

    const reconstructed = tiers.reduce((sum, t) => sum + t, 0n);
    expect(reconstructed).to.equal(arbitraryAmount);

    // Every tier must be a valid on-chain tier
    for (const tier of tiers) {
      expect(DEPOSIT_TIERS_USDC).to.include(tier);
    }

    // Verify the decomposition is correct:
    // 73.42 = 7×10 + 3×1 + 4×0.1 + 2×0.01
    const tens = tiers.filter((t) => t === 10_000_000n).length;
    const ones = tiers.filter((t) => t === 1_000_000n).length;
    const tenths = tiers.filter((t) => t === 100_000n).length;
    const cents = tiers.filter((t) => t === 10_000n).length;
    expect(tens).to.equal(7);
    expect(ones).to.equal(3);
    expect(tenths).to.equal(4);
    expect(cents).to.equal(2);
  });

  it('step 12: should split 0.01 USDC (minimum tier)', () => {
    const minAmount = 10_000n; // 0.01 USDC
    const tiers = splitIntoTiers(minAmount, [...DEPOSIT_TIERS_USDC]);

    expect(tiers).to.deep.equal([10_000n]);
  });

  it('step 13: should report remainder for sub-cent amounts', () => {
    // 0.005 USDC = 5000 base units — below smallest tier (10_000)
    const subCentAmount = 5_000n;
    const { deposits, remainder } = splitIntoTiersWithRemainder(subCentAmount, [...DEPOSIT_TIERS_USDC]);

    expect(deposits).to.have.length(0);
    expect(remainder).to.equal(5_000n);
  });

  it('step 14: should split arbitrary SOL amounts', () => {
    // 1.234 SOL = 1_234_000_000 base units (9 decimals)
    const solAmount = 1_234_000_000n;
    const tiers = splitIntoTiers(solAmount, [...DEPOSIT_TIERS_SOL]);

    const reconstructed = tiers.reduce((sum, t) => sum + t, 0n);
    expect(reconstructed).to.equal(solAmount);

    for (const tier of tiers) {
      expect(DEPOSIT_TIERS_SOL).to.include(tier);
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytes32ToBigint(bytes: Uint8Array): bigint {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return BigInt('0x' + (hex || '0'));
}
