/**
 * Initialize a stealth pool on devnet for a given token mint.
 *
 * Usage:
 *   npx tsx scripts/init-pool-devnet.ts [--mint <TOKEN_MINT_ADDRESS>]
 *
 * If no mint is specified, creates a new test token mint.
 */

import * as anchor from '@coral-xyz/anchor';
import {
  Keypair,
  PublicKey,
  Connection,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const PROGRAM_ID = new PublicKey(
  process.env.STEALTH_POOL_PROGRAM_ID || 'EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq'
);

async function main() {
  const args = process.argv.slice(2);
  const mintArg = args.indexOf('--mint');
  let tokenMintAddress = mintArg !== -1 ? args[mintArg + 1] : null;

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const walletPath = process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );

  console.log('Authority:', walletKeypair.publicKey.toBase58());
  console.log('Program:  ', PROGRAM_ID.toBase58());

  // Check balance
  const balance = await connection.getBalance(walletKeypair.publicKey);
  console.log('Balance:  ', balance / LAMPORTS_PER_SOL, 'SOL');

  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log('Requesting airdrop...');
    const sig = await connection.requestAirdrop(walletKeypair.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  let tokenMint: PublicKey;
  if (tokenMintAddress) {
    tokenMint = new PublicKey(tokenMintAddress);
    console.log('Using existing mint:', tokenMint.toBase58());
  } else {
    console.log('Creating test token mint (6 decimals)...');
    tokenMint = await createMint(
      connection,
      walletKeypair,
      walletKeypair.publicKey,
      null,
      6
    );
    console.log('Test mint created:', tokenMint.toBase58());
  }

  // Derive PDAs
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('stealth_pool'), tokenMint.toBuffer()],
    PROGRAM_ID
  );

  const [merkleRootHistoryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('merkle_roots'), poolPda.toBuffer()],
    PROGRAM_ID
  );

  console.log('Pool PDA: ', poolPda.toBase58());
  console.log('Merkle History PDA:', merkleRootHistoryPda.toBase58());

  // Create fee vault token account
  const feeVaultAta = await getAssociatedTokenAddress(tokenMint, walletKeypair.publicKey);
  try {
    await createAssociatedTokenAccount(
      connection,
      walletKeypair,
      tokenMint,
      walletKeypair.publicKey
    );
    console.log('Fee vault ATA created:', feeVaultAta.toBase58());
  } catch {
    console.log('Fee vault ATA already exists:', feeVaultAta.toBase58());
  }

  // Build initialize instruction
  // Anchor discriminator: first 8 bytes of sha256("global:<fn_name>")
  const { createHash } = await import('crypto');
  const discriminator = createHash('sha256')
    .update('global:initialize_pool')
    .digest()
    .slice(0, 8);

  const feeBps = 30; // 0.3%
  const minDeposit = 10_000_000; // 10 USDC (smallest tier)
  const maxDeposit = 10_000_000_000; // 10,000 USDC (largest tier)

  const data = Buffer.alloc(8 + 2 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeUInt16LE(feeBps, 8);
  data.writeBigUInt64LE(BigInt(minDeposit), 10);
  data.writeBigUInt64LE(BigInt(maxDeposit), 18);

  const keys = [
    { pubkey: poolPda, isSigner: false, isWritable: true },
    { pubkey: merkleRootHistoryPda, isSigner: false, isWritable: true },
    { pubkey: tokenMint, isSigner: false, isWritable: false },
    { pubkey: feeVaultAta, isSigner: false, isWritable: false },
    { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
    { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
  ];

  const ix = new anchor.web3.TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  });

  const tx = new anchor.web3.Transaction().add(ix);
  tx.feePayer = walletKeypair.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(walletKeypair);

  console.log('\nSending initialize transaction...');
  try {
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('Pool initialized! Signature:', sig);
  } catch (err: any) {
    if (err.message?.includes('already in use')) {
      console.log('Pool already initialized for this mint.');
    } else {
      throw err;
    }
  }

  console.log('\n--- Pool Configuration ---');
  console.log('  Program ID:    ', PROGRAM_ID.toBase58());
  console.log('  Token Mint:    ', tokenMint.toBase58());
  console.log('  Pool PDA:      ', poolPda.toBase58());
  console.log('  Fee Vault:     ', feeVaultAta.toBase58());
  console.log('  Fee BPS:       ', feeBps);
  console.log('  Min Deposit:   ', minDeposit);
  console.log('  Max Deposit:   ', maxDeposit);
  console.log('  Merkle Depth:  ', 20);
}

main().catch(console.error);
