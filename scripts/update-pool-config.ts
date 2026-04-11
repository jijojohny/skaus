/**
 * Read current pool config and update min_deposit for fine-grained tiers.
 *
 * Usage: npx tsx scripts/update-pool-config.ts
 *
 * Requires: SOLANA_RPC_URL (defaults to devnet) and the authority keypair
 * at ~/.config/solana/id.json
 */

import {
  Connection,
  PublicKey,
  Keypair,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const PROGRAM_ID = new PublicKey('EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq');
const TOKEN_MINT = new PublicKey(process.env.TOKEN_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

// New minimum: 0.01 USDC = 10_000 base units (6 decimals)
const NEW_MIN_DEPOSIT = 10_000n;

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  // Load authority keypair
  const keypairPath = process.env.KEYPAIR_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const secretKey = Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf-8')));
  const authority = Keypair.fromSecretKey(secretKey);
  console.log('Authority:', authority.publicKey.toBase58());

  // Derive pool PDA
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('stealth_pool'), TOKEN_MINT.toBuffer()],
    PROGRAM_ID,
  );
  console.log('Pool PDA:', poolPda.toBase58());

  // Read current pool state
  const poolAccount = await connection.getAccountInfo(poolPda);
  if (!poolAccount) {
    console.error('Pool account not found. Has the pool been initialized?');
    process.exit(1);
  }

  const data = poolAccount.data;
  // StealthPool layout after disc(8):
  //   authority(32) + token_mint(32) + fee_bps(2) + min_deposit(8) + max_deposit(8)
  const currentAuthority = new PublicKey(data.slice(8, 40));
  const currentMint = new PublicKey(data.slice(40, 72));
  const currentFeeBps = data.readUInt16LE(72);
  const currentMinDeposit = data.readBigUInt64LE(74);
  const currentMaxDeposit = data.readBigUInt64LE(82);

  console.log('\n--- Current Pool Config ---');
  console.log('Authority:', currentAuthority.toBase58());
  console.log('Token Mint:', currentMint.toBase58());
  console.log('Fee BPS:', currentFeeBps);
  console.log('Min Deposit:', currentMinDeposit.toString(), `(${Number(currentMinDeposit) / 1_000_000} USDC)`);
  console.log('Max Deposit:', currentMaxDeposit.toString(), `(${Number(currentMaxDeposit) / 1_000_000} USDC)`);

  if (currentMinDeposit <= NEW_MIN_DEPOSIT) {
    console.log(`\nMin deposit is already ${currentMinDeposit} (<= ${NEW_MIN_DEPOSIT}). No update needed.`);
    return;
  }

  if (currentAuthority.toBase58() !== authority.publicKey.toBase58()) {
    console.error(`\nAuthority mismatch! Pool authority is ${currentAuthority.toBase58()} but your key is ${authority.publicKey.toBase58()}`);
    process.exit(1);
  }

  // Build update_pool_config instruction
  // Anchor discriminator: sha256("global:update_pool_config")[0:8]
  const discriminator = createHash('sha256')
    .update('global:update_pool_config')
    .digest()
    .slice(0, 8);

  // Instruction data: discriminator(8) + Option<u16>(fee_bps) + Option<u64>(min_deposit) + Option<u64>(max_deposit)
  // Option encoding: 0x00 = None, 0x01 + value = Some
  const instructionData = Buffer.alloc(8 + 3 + 9 + 1);
  let offset = 0;

  // Discriminator
  discriminator.copy(instructionData, offset);
  offset += 8;

  // fee_bps: None
  instructionData.writeUInt8(0, offset);
  offset += 1;

  // Padding for Option<u16> None is just 1 byte (the discriminant)
  // Actually, Anchor serializes Option<u16> as: 1 byte (0=None, 1=Some) + 2 bytes if Some
  // And Option<u64> as: 1 byte + 8 bytes if Some

  // Let me rebuild this properly with correct Borsh serialization
  const parts: Buffer[] = [discriminator];

  // Option<u16> fee_bps = None
  parts.push(Buffer.from([0]));

  // Option<u64> min_deposit = Some(NEW_MIN_DEPOSIT)
  const minBuf = Buffer.alloc(9);
  minBuf.writeUInt8(1, 0); // Some
  minBuf.writeBigUInt64LE(NEW_MIN_DEPOSIT, 1);
  parts.push(minBuf);

  // Option<u64> max_deposit = None
  parts.push(Buffer.from([0]));

  const ixData = Buffer.concat(parts);

  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    data: ixData,
  });

  console.log(`\nUpdating min_deposit: ${currentMinDeposit} -> ${NEW_MIN_DEPOSIT} (${Number(NEW_MIN_DEPOSIT) / 1_000_000} USDC)`);

  const tx = new Transaction().add(instruction);
  const sig = await sendAndConfirmTransaction(connection, tx, [authority]);
  console.log('Transaction signature:', sig);

  // Verify
  const updatedAccount = await connection.getAccountInfo(poolPda);
  if (updatedAccount) {
    const newMin = updatedAccount.data.readBigUInt64LE(74);
    console.log(`\nVerified: min_deposit is now ${newMin} (${Number(newMin) / 1_000_000} USDC)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
