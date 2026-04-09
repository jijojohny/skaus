import { Connection, PublicKey } from '@solana/web3.js';
import { decryptNote } from '@skaus/crypto';
import type { DepositNoteData } from '@skaus/crypto';
import { fetchDeposits } from './gateway';
import { config } from './config';

export interface ScannedDeposit {
  id: string;
  commitment: string;
  leafIndex: number;
  amount: bigint;
  token: string;
  timestamp: number;
  txSignature: string;
  noteData: DepositNoteData;
  status: 'available' | 'withdrawn';
}

/**
 * Scan for deposits belonging to the given scan keypair by querying
 * the gateway indexer and attempting trial decryption on each note.
 */
export async function scanForDeposits(
  scanPrivkey: Uint8Array,
): Promise<ScannedDeposit[]> {
  const deposits = await fetchDeposits();
  const found: ScannedDeposit[] = [];

  for (const dep of deposits) {
    try {
      const encryptedBytes = Uint8Array.from(
        Buffer.from(dep.encryptedNote, 'base64')
      );

      const noteData = decryptNote(encryptedBytes, scanPrivkey);

      found.push({
        id: dep.commitment,
        commitment: dep.commitment,
        leafIndex: dep.leafIndex,
        amount: noteData.amount,
        token: 'USDC',
        timestamp: dep.timestamp,
        txSignature: dep.txSignature,
        noteData,
        status: 'available',
      });
    } catch {
      // Decryption failed — deposit doesn't belong to us, skip
    }
  }

  return found;
}

/**
 * Scan deposits directly from on-chain DepositNote accounts.
 * More reliable than indexer for catching all deposits.
 */
export async function scanDepositsOnChain(
  connection: Connection,
  scanPrivkey: Uint8Array,
  poolPda: PublicKey,
): Promise<ScannedDeposit[]> {
  const programId = new PublicKey(config.programId);

  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { memcmp: { offset: 8, bytes: poolPda.toBase58() } },
    ],
  });

  const found: ScannedDeposit[] = [];

  for (const { account } of accounts) {
    try {
      const data = account.data;
      if (data.length < 8 + 32 + 32 + 4) continue;

      const commitment = Buffer.from(data.slice(40, 72)).toString('hex');
      const noteLen = data.readUInt32LE(72);
      if (data.length < 76 + noteLen + 4 + 8) continue;

      const encryptedNote = data.slice(76, 76 + noteLen);
      const leafIndex = data.readUInt32LE(76 + noteLen);
      const timestamp = Number(data.readBigInt64LE(76 + noteLen + 4));

      try {
        const noteData = decryptNote(encryptedNote, scanPrivkey);
        found.push({
          id: commitment,
          commitment,
          leafIndex,
          amount: noteData.amount,
          token: noteData.tokenMint.includes('So') ? 'SOL' : 'USDC',
          timestamp,
          txSignature: '',
          noteData,
          status: 'available',
        });
      } catch {
        // Not our deposit
      }
    } catch {
      // Skip malformed accounts
    }
  }

  return found;
}
