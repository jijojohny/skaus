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

describe('stealth-pool', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const authority = provider.wallet as anchor.Wallet;
  let tokenMint: PublicKey;
  let poolPda: PublicKey;
  let poolBump: number;
  let merkleRootHistoryPda: PublicKey;

  const programId = new PublicKey('EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq');
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

    [poolPda, poolBump] = PublicKey.findProgramAddressSync(
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
      console.log('Pool PDA:', poolPda.toBase58());
      console.log('Token Mint:', tokenMint.toBase58());
      console.log('Merkle Root History:', merkleRootHistoryPda.toBase58());

      expect(poolPda).to.not.be.null;
      expect(merkleRootHistoryPda).to.not.be.null;
    });
  });

  describe('commitment scheme', () => {
    it('should generate valid commitment from secret, nullifier, and amount', () => {
      const secret = randomBytes(32);
      const nullifier = randomBytes(32);
      const amount = BigInt(100_000_000);

      const { createHash } = require('crypto');
      const hasher = createHash('sha256');
      hasher.update(secret);
      hasher.update(nullifier);
      hasher.update(Buffer.from(amount.toString()));
      const commitment = hasher.digest();

      expect(commitment.length).to.equal(32);
      expect(commitment.every((b: number) => b === 0)).to.be.false;

      console.log('Commitment:', commitment.toString('hex').slice(0, 32) + '...');
    });

    it('should produce different commitments for different inputs', () => {
      const { createHash } = require('crypto');

      const hash1 = createHash('sha256').update(randomBytes(32)).digest();
      const hash2 = createHash('sha256').update(randomBytes(32)).digest();

      expect(hash1).to.not.deep.equal(hash2);
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

      const amount = 250_000_000n; // 250 USDC
      const tiers = splitIntoTiers(amount, TIERS);

      const total = tiers.reduce((sum, t) => sum + t, 0n);
      expect(total).to.equal(amount);

      const count100 = tiers.filter(t => t === 100_000_000n).length;
      const count10 = tiers.filter(t => t === 10_000_000n).length;
      expect(count100).to.equal(2);
      expect(count10).to.equal(5);

      console.log('Split $250 USDC:', tiers.map(t => `${Number(t) / 1_000_000} USDC`));
    });

    it('should reject amounts that do not fit tiers exactly', () => {
      const TIERS = [10_000_000n, 100_000_000n];

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

      expect(() => splitIntoTiers(15_000_000n, TIERS)).to.throw('Remainder');
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

      // Different nullifiers must produce different PDAs
      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());

      // Same nullifier must produce the same PDA (deterministic)
      const [pda1_again] = PublicKey.findProgramAddressSync(
        [Buffer.from('nullifier'), poolPda.toBuffer(), nullifier1],
        programId
      );
      expect(pda1.toBase58()).to.equal(pda1_again.toBase58());

      console.log('Nullifier PDA derivation: deterministic + collision-free');
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

      // Same nullifier in different pools should NOT collide
      expect(pda_real.toBase58()).to.not.equal(pda_fake.toBase58());

      console.log('Nullifier PDAs are pool-scoped: OK');
    });
  });

  describe('merkle tree', () => {
    it('should compute deterministic roots', () => {
      const { createHash } = require('crypto');

      function hashPair(left: Buffer, right: Buffer): Buffer {
        return createHash('sha256').update(Buffer.concat([left, right])).digest();
      }

      const leaf1 = randomBytes(32);
      const leaf2 = randomBytes(32);

      const root1 = hashPair(leaf1, leaf2);
      const root2 = hashPair(leaf1, leaf2);
      expect(root1).to.deep.equal(root2);

      // Different order should produce different root
      const root3 = hashPair(leaf2, leaf1);
      expect(root3).to.not.deep.equal(root1);
    });

    it('should verify merkle inclusion proof', () => {
      const { createHash } = require('crypto');

      function hashPair(left: Buffer, right: Buffer): Buffer {
        return createHash('sha256').update(Buffer.concat([left, right])).digest();
      }

      // Build a tiny 2-level tree
      const leaf0 = randomBytes(32);
      const leaf1 = randomBytes(32);
      const leaf2 = randomBytes(32);
      const leaf3 = randomBytes(32);

      const node01 = hashPair(leaf0, leaf1);
      const node23 = hashPair(leaf2, leaf3);
      const root = hashPair(node01, node23);

      // Prove leaf0 is at index 0
      const path = [leaf1, node23];
      let current = leaf0;
      current = hashPair(current, path[0]); // hash with sibling at level 0
      current = hashPair(current, path[1]); // hash with sibling at level 1
      expect(current).to.deep.equal(root);
    });
  });

  describe('stealth address derivation', () => {
    it('should produce consistent shared secrets', () => {
      const { createHash } = require('crypto');
      const nacl = require('tweetnacl');

      // Simulate ECDH key exchange
      const senderKeypair = nacl.box.keyPair();
      const recipientKeypair = nacl.box.keyPair();

      // Sender computes shared secret
      const senderShared = nacl.box.before(recipientKeypair.publicKey, senderKeypair.secretKey);

      // Recipient computes shared secret
      const recipientShared = nacl.box.before(senderKeypair.publicKey, recipientKeypair.secretKey);

      expect(Buffer.from(senderShared)).to.deep.equal(Buffer.from(recipientShared));
      console.log('ECDH shared secret match: OK');
    });
  });
});
