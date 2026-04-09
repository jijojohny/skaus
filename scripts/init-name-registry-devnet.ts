/**
 * Initialize the name registry on devnet and optionally register a test name.
 *
 * Usage:
 *   npx tsx scripts/init-name-registry-devnet.ts [--register <name>]
 */

import * as anchor from '@coral-xyz/anchor';
import {
  Keypair,
  PublicKey,
  Connection,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

const PROGRAM_ID = new PublicKey(
  process.env.NAME_REGISTRY_PROGRAM_ID || 'JAmSyEVzHNCTzC6BETuRQdwK1gLQYUFnzwiVKRVYqpdT'
);

function anchorDiscriminator(name: string): Buffer {
  return createHash('sha256')
    .update(`global:${name}`)
    .digest()
    .slice(0, 8);
}

async function main() {
  const args = process.argv.slice(2);
  const registerIdx = args.indexOf('--register');
  const nameToRegister = registerIdx !== -1 ? args[registerIdx + 1] : null;

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const walletPath = process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );

  console.log('Authority:', walletKeypair.publicKey.toBase58());
  console.log('Program:  ', PROGRAM_ID.toBase58());

  const balance = await connection.getBalance(walletKeypair.publicKey);
  console.log('Balance:  ', balance / LAMPORTS_PER_SOL, 'SOL');

  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log('Requesting airdrop...');
    const sig = await connection.requestAirdrop(walletKeypair.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  // 1. Initialize Registry Config
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('registry_config')],
    PROGRAM_ID,
  );

  console.log('\nRegistry Config PDA:', configPda.toBase58());

  const initDiscriminator = anchorDiscriminator('initialize_registry');
  const registrationFee = 0n; // Free registration for devnet

  const initData = Buffer.alloc(8 + 8);
  initDiscriminator.copy(initData, 0);
  initData.writeBigUInt64LE(registrationFee, 8);

  const initKeys = [
    { pubkey: configPda, isSigner: false, isWritable: true },
    { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
    { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
  ];

  const initIx = new anchor.web3.TransactionInstruction({
    programId: PROGRAM_ID,
    keys: initKeys,
    data: initData,
  });

  const initTx = new anchor.web3.Transaction().add(initIx);
  initTx.feePayer = walletKeypair.publicKey;
  initTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  initTx.sign(walletKeypair);

  console.log('Sending initialize_registry...');
  try {
    const sig = await connection.sendRawTransaction(initTx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('Registry initialized! Signature:', sig);
  } catch (err: any) {
    if (err.message?.includes('already in use')) {
      console.log('Registry already initialized.');
    } else {
      throw err;
    }
  }

  // 2. Optionally register a name
  if (nameToRegister) {
    console.log(`\nRegistering name: ${nameToRegister}`);

    const nameHash = await computeNameHash(nameToRegister);
    console.log('Name hash:', Buffer.from(nameHash).toString('hex').slice(0, 16) + '...');

    const [nameRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('name'), Buffer.from(nameHash)],
      PROGRAM_ID,
    );

    console.log('NameRecord PDA:', nameRecordPda.toBase58());

    // Generate stealth keys for test
    const scanPrivkey = Keypair.generate();
    const spendPrivkey = Keypair.generate();

    const regDiscriminator = anchorDiscriminator('register_name');

    // Serialize: discriminator + name (borsh string: 4-byte len + data) + name_hash (32) + stealth_meta_address (32+32+1)
    const nameBytes = Buffer.from(nameToRegister);
    const dataLen = 8 + 4 + nameBytes.length + 32 + 32 + 32 + 1;
    const regData = Buffer.alloc(dataLen);
    let offset = 0;

    regDiscriminator.copy(regData, offset); offset += 8;
    regData.writeUInt32LE(nameBytes.length, offset); offset += 4;
    nameBytes.copy(regData, offset); offset += nameBytes.length;
    Buffer.from(nameHash).copy(regData, offset); offset += 32;
    scanPrivkey.publicKey.toBuffer().copy(regData, offset); offset += 32;
    spendPrivkey.publicKey.toBuffer().copy(regData, offset); offset += 32;
    regData.writeUInt8(1, offset); offset += 1;

    const regKeys = [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: nameRecordPda, isSigner: false, isWritable: true },
      { pubkey: walletKeypair.publicKey, isSigner: false, isWritable: true }, // fee_treasury = authority
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },  // payer
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: false }, // authority
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
    ];

    const regIx = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      keys: regKeys,
      data: regData,
    });

    const regTx = new anchor.web3.Transaction().add(regIx);
    regTx.feePayer = walletKeypair.publicKey;
    regTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    regTx.sign(walletKeypair);

    console.log('Sending register_name...');
    try {
      const sig = await connection.sendRawTransaction(regTx.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      console.log(`Name "${nameToRegister}" registered! Signature:`, sig);
    } catch (err: any) {
      if (err.message?.includes('already in use')) {
        console.log(`Name "${nameToRegister}" already registered.`);
      } else {
        throw err;
      }
    }

    console.log('\n--- Registration ---');
    console.log('  Name:         ', nameToRegister);
    console.log('  NameRecord:   ', nameRecordPda.toBase58());
    console.log('  Scan Pubkey:  ', scanPrivkey.publicKey.toBase58());
    console.log('  Spend Pubkey: ', spendPrivkey.publicKey.toBase58());
  }

  console.log('\n--- Registry Configuration ---');
  console.log('  Program ID:       ', PROGRAM_ID.toBase58());
  console.log('  Config PDA:       ', configPda.toBase58());
  console.log('  Registration Fee: ', Number(registrationFee), 'lamports');
}

async function computeNameHash(name: string): Promise<Uint8Array> {
  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();

  const nameBytes = new TextEncoder().encode(name.toLowerCase().trim());
  const chunks: bigint[] = [];
  for (let i = 0; i < nameBytes.length; i += 31) {
    let val = 0n;
    for (let j = 0; j < 31 && i + j < nameBytes.length; j++) {
      val |= BigInt(nameBytes[i + j]) << BigInt(j * 8);
    }
    chunks.push(val);
  }

  const hash = poseidon(chunks);
  const value = poseidon.F.toObject(hash);
  const hex = value.toString(16).padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

main().catch(console.error);
