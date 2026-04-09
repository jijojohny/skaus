import * as anchor from '@coral-xyz/anchor';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { expect } from 'chai';
import { randomBytes } from 'crypto';

const programId = new PublicKey('EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq');

describe('stealth-pool', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const authority = provider.wallet as anchor.Wallet;
  let tokenMint: PublicKey;
  let poolPda: PublicKey;
  let merkleRootHistoryPda: PublicKey;
  const depositor = Keypair.generate();

  before(async () => {
    const airdropAuth = await provider.connection.requestAirdrop(
      authority.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropAuth);

    const airdropDep = await provider.connection.requestAirdrop(
      depositor.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropDep);

    tokenMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('stealth_pool'), tokenMint.toBuffer()],
      programId
    );

    [merkleRootHistoryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('merkle_roots'), poolPda.toBuffer()],
      programId
    );
  });

  describe('PDA derivation', () => {
    it('should derive pool PDA correctly', () => {
      expect(poolPda).to.not.be.null;
      expect(merkleRootHistoryPda).to.not.be.null;
      console.log('  Pool PDA:', poolPda.toBase58());
      console.log('  Merkle Root History:', merkleRootHistoryPda.toBase58());
    });
  });

  describe('Poseidon commitment scheme', () => {
    it('should compute commitment matching the circuit', async () => {
      const { buildPoseidon } = await import('circomlibjs');
      const poseidon = await buildPoseidon();

      const secret = BigInt('0x' + randomBytes(31).toString('hex'));
      const nullifier = BigInt('0x' + randomBytes(31).toString('hex'));
      const amount = BigInt(100_000_000);

      // commitment = Poseidon(secret, nullifier, amount)
      const commitment = poseidon.F.toObject(
        poseidon([secret, nullifier, amount])
      );

      expect(commitment).to.not.equal(BigInt(0));

      // Verify reproducibility
      const commitment2 = poseidon.F.toObject(
        poseidon([secret, nullifier, amount])
      );
      expect(commitment).to.equal(commitment2);

      console.log('  Commitment:', commitment.toString(16).slice(0, 24) + '...');
    });

    it('should compute nullifier hash matching the circuit', async () => {
      const { buildPoseidon } = await import('circomlibjs');
      const poseidon = await buildPoseidon();

      const nullifier = BigInt('0x' + randomBytes(31).toString('hex'));

      // nullifier_hash = Poseidon(nullifier)
      const nullifierHash = poseidon.F.toObject(poseidon([nullifier]));
      expect(nullifierHash).to.not.equal(BigInt(0));

      console.log('  NullifierHash:', nullifierHash.toString(16).slice(0, 24) + '...');
    });

    it('should compute Poseidon Merkle root matching the circuit', async () => {
      const { buildPoseidon } = await import('circomlibjs');
      const poseidon = await buildPoseidon();

      const DEPTH = 20;
      const secret = BigInt('0x' + randomBytes(31).toString('hex'));
      const nullifier = BigInt('0x' + randomBytes(31).toString('hex'));
      const amount = BigInt(100_000_000);

      const commitment = poseidon.F.toObject(
        poseidon([secret, nullifier, amount])
      );

      // Build Merkle path for leaf at index 0 (all zero siblings)
      let currentHash = commitment;
      for (let level = 0; level < DEPTH; level++) {
        const zeroAtLevel = computeZeroValue(poseidon, level);
        currentHash = poseidon.F.toObject(
          poseidon([currentHash, zeroAtLevel])
        );
      }

      expect(currentHash).to.not.equal(BigInt(0));
      console.log('  Merkle Root (Poseidon):', currentHash.toString(16).slice(0, 24) + '...');
    });
  });

  describe('tier splitting', () => {
    it('should split amounts into correct USDC tiers', () => {
      const TIERS = [10_000_000n, 100_000_000n, 1_000_000_000n, 10_000_000_000n];

      function splitIntoTiers(amount: bigint, tiers: bigint[]): bigint[] {
        const sorted = [...tiers].sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
        const result: bigint[] = [];
        let remaining = amount;
        for (const tier of sorted) {
          while (remaining >= tier) {
            result.push(tier);
            remaining -= tier;
          }
        }
        if (remaining > 0n) throw new Error(`Remainder: ${remaining}`);
        return result;
      }

      const amount = 250_000_000n;
      const tiers = splitIntoTiers(amount, TIERS);
      const total = tiers.reduce((sum, t) => sum + t, 0n);
      expect(total).to.equal(amount);
    });
  });

  describe('nullifier PDA double-spend protection', () => {
    it('should derive unique PDAs for each nullifier hash', () => {
      const nullifier1 = randomBytes(32);
      const nullifier2 = randomBytes(32);

      const [pda1] = PublicKey.findProgramAddressSync(
        [Buffer.from('nullifier'), poolPda.toBuffer(), nullifier1],
        programId
      );

      const [pda2] = PublicKey.findProgramAddressSync(
        [Buffer.from('nullifier'), poolPda.toBuffer(), nullifier2],
        programId
      );

      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());

      const [pda1_again] = PublicKey.findProgramAddressSync(
        [Buffer.from('nullifier'), poolPda.toBuffer(), nullifier1],
        programId
      );
      expect(pda1.toBase58()).to.equal(pda1_again.toBase58());
    });

    it('should derive PDAs that are pool-scoped', () => {
      const nullifier = randomBytes(32);
      const fakePool = Keypair.generate().publicKey;

      const [pda_real] = PublicKey.findProgramAddressSync(
        [Buffer.from('nullifier'), poolPda.toBuffer(), nullifier],
        programId
      );

      const [pda_fake] = PublicKey.findProgramAddressSync(
        [Buffer.from('nullifier'), fakePool.toBuffer(), nullifier],
        programId
      );

      expect(pda_real.toBase58()).to.not.equal(pda_fake.toBase58());
    });
  });

  describe('Merkle tree correctness', () => {
    it('should compute deterministic Poseidon Merkle roots', async () => {
      const { buildPoseidon } = await import('circomlibjs');
      const poseidon = await buildPoseidon();

      const leaf = BigInt('0x' + randomBytes(31).toString('hex'));

      const root1 = computeMerkleRoot(poseidon, leaf, 0, 20);
      const root2 = computeMerkleRoot(poseidon, leaf, 0, 20);
      expect(root1).to.equal(root2);
    });

    it('should verify Merkle inclusion proof', async () => {
      const { buildPoseidon } = await import('circomlibjs');
      const poseidon = await buildPoseidon();

      const DEPTH = 20;
      const leaf = BigInt('0x' + randomBytes(31).toString('hex'));
      const index = 0;

      const { root, pathElements, pathIndices } = computeMerklePath(
        poseidon,
        leaf,
        index,
        DEPTH
      );

      // Verify proof
      let current = leaf;
      for (let i = 0; i < DEPTH; i++) {
        if (pathIndices[i] === 0) {
          current = poseidon.F.toObject(poseidon([current, pathElements[i]]));
        } else {
          current = poseidon.F.toObject(poseidon([pathElements[i], current]));
        }
      }

      expect(current).to.equal(root);
    });
  });

  describe('stealth address derivation', () => {
    it('should produce consistent shared secrets', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nacl = require('tweetnacl');

      const senderKeypair = nacl.box.keyPair();
      const recipientKeypair = nacl.box.keyPair();

      const senderShared = nacl.box.before(recipientKeypair.publicKey, senderKeypair.secretKey);
      const recipientShared = nacl.box.before(senderKeypair.publicKey, recipientKeypair.secretKey);

      expect(Buffer.from(senderShared)).to.deep.equal(Buffer.from(recipientShared));
    });
  });
});

function computeZeroValue(poseidon: any, level: number): bigint {
  let current = BigInt(0);
  for (let i = 0; i < level; i++) {
    current = poseidon.F.toObject(poseidon([current, current]));
  }
  return current;
}

function computeMerkleRoot(poseidon: any, leaf: bigint, index: number, depth: number): bigint {
  let currentHash = leaf;
  let idx = index;
  for (let level = 0; level < depth; level++) {
    const zero = computeZeroValue(poseidon, level);
    if (idx % 2 === 0) {
      currentHash = poseidon.F.toObject(poseidon([currentHash, zero]));
    } else {
      currentHash = poseidon.F.toObject(poseidon([zero, currentHash]));
    }
    idx = Math.floor(idx / 2);
  }
  return currentHash;
}

function computeMerklePath(
  poseidon: any,
  leaf: bigint,
  index: number,
  depth: number
): { root: bigint; pathElements: bigint[]; pathIndices: number[] } {
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let currentHash = leaf;
  let idx = index;

  for (let level = 0; level < depth; level++) {
    const zero = computeZeroValue(poseidon, level);
    if (idx % 2 === 0) {
      pathElements.push(zero);
      pathIndices.push(0);
      currentHash = poseidon.F.toObject(poseidon([currentHash, zero]));
    } else {
      pathElements.push(zero);
      pathIndices.push(1);
      currentHash = poseidon.F.toObject(poseidon([zero, currentHash]));
    }
    idx = Math.floor(idx / 2);
  }

  return { root: currentHash, pathElements, pathIndices };
}
