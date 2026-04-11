/**
 * Initialize a new stealth pool for Circle's devnet USDC mint.
 *
 * Usage: npx tsx scripts/init-circle-pool.ts
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const PROGRAM_ID = new PublicKey('EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq');
const CIRCLE_USDC_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  // Load authority keypair
  const keypairPath = process.env.KEYPAIR_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const secretKey = Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf-8')));
  const authority = Keypair.fromSecretKey(secretKey);
  console.log('Authority:', authority.publicKey.toBase58());

  // Derive PDAs
  const [poolPda, poolBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('stealth_pool'), CIRCLE_USDC_DEVNET.toBuffer()],
    PROGRAM_ID,
  );
  const [merkleRootHistoryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('merkle_roots'), poolPda.toBuffer()],
    PROGRAM_ID,
  );

  console.log('Circle USDC mint:', CIRCLE_USDC_DEVNET.toBase58());
  console.log('Pool PDA:', poolPda.toBase58());
  console.log('Merkle Root History PDA:', merkleRootHistoryPda.toBase58());

  // Check if pool already exists
  const existing = await connection.getAccountInfo(poolPda);
  if (existing) {
    console.log('\nPool already exists! Reading config...');
    const d = existing.data;
    console.log('  Fee BPS:', d.readUInt16LE(72));
    console.log('  Min Deposit:', d.readBigUInt64LE(74).toString(), `(${Number(d.readBigUInt64LE(74)) / 1e6} USDC)`);
    console.log('  Max Deposit:', d.readBigUInt64LE(82).toString(), `(${Number(d.readBigUInt64LE(82)) / 1e6} USDC)`);
    return;
  }

  // Fee vault: authority's ATA for Circle USDC (receives protocol fees)
  const feeVaultAta = await getAssociatedTokenAddress(
    CIRCLE_USDC_DEVNET,
    authority.publicKey,
  );

  // Create fee vault ATA if it doesn't exist
  const feeVaultInfo = await connection.getAccountInfo(feeVaultAta);

  // Build initialize_pool instruction
  // Anchor discriminator: sha256("global:initialize_pool")[0:8]
  const discriminator = createHash('sha256')
    .update('global:initialize_pool')
    .digest()
    .slice(0, 8);

  // Params: fee_bps(u16) + min_deposit(u64) + max_deposit(u64)
  const FEE_BPS = 30;              // 0.3%
  const MIN_DEPOSIT = 10_000n;     // 0.01 USDC (smallest tier)
  const MAX_DEPOSIT = 10_000_000_000n; // 10,000 USDC (largest tier)

  const paramsBuf = Buffer.alloc(2 + 8 + 8);
  paramsBuf.writeUInt16LE(FEE_BPS, 0);
  paramsBuf.writeBigUInt64LE(MIN_DEPOSIT, 2);
  paramsBuf.writeBigUInt64LE(MAX_DEPOSIT, 10);

  const ixData = Buffer.concat([discriminator, paramsBuf]);

  // Accounts for InitializePool (from initialize.rs):
  //   0. pool             (init, mut)   — PDA ["stealth_pool", token_mint]
  //   1. merkle_root_history (init, mut) — PDA ["merkle_roots", pool]
  //   2. token_mint        (read)       — Circle USDC
  //   3. fee_vault_account (read)       — ATA for fee collection
  //   4. authority          (signer, mut) — payer
  //   5. system_program     (read)
  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: merkleRootHistoryPda, isSigner: false, isWritable: true },
      { pubkey: CIRCLE_USDC_DEVNET, isSigner: false, isWritable: false },
      { pubkey: feeVaultAta, isSigner: false, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: ixData,
  });

  const tx = new Transaction();

  // Create fee vault ATA if needed
  if (!feeVaultInfo) {
    console.log('\nCreating fee vault ATA...');
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey,
        feeVaultAta,
        authority.publicKey,
        CIRCLE_USDC_DEVNET,
      ),
    );
  }

  tx.add(instruction);

  console.log(`\nInitializing pool: fee=${FEE_BPS}bps, min=${Number(MIN_DEPOSIT)/1e6} USDC, max=${Number(MAX_DEPOSIT)/1e6} USDC`);

  const sig = await sendAndConfirmTransaction(connection, tx, [authority]);
  console.log('Transaction signature:', sig);

  // Verify
  const poolAccount = await connection.getAccountInfo(poolPda);
  if (poolAccount) {
    const d = poolAccount.data;
    console.log('\n=== New Pool Verified ===');
    console.log('Pool PDA:', poolPda.toBase58());
    console.log('Authority:', new PublicKey(d.slice(8, 40)).toBase58());
    console.log('Token Mint:', new PublicKey(d.slice(40, 72)).toBase58());
    console.log('Fee BPS:', d.readUInt16LE(72));
    console.log('Min Deposit:', Number(d.readBigUInt64LE(74)) / 1e6, 'USDC');
    console.log('Max Deposit:', Number(d.readBigUInt64LE(82)) / 1e6, 'USDC');
  }

  console.log('\n--- Update your .env ---');
  console.log(`NEXT_PUBLIC_TOKEN_MINT=${CIRCLE_USDC_DEVNET.toBase58()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
