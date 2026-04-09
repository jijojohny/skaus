import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config';
import bs58 from 'bs58';

const NAME_SEED = 'name';

export interface ResolvedName {
  authority: string;
  nameHash: string;
  stealthMetaAddress: {
    scanPubkey: string;
    spendPubkey: string;
    version: number;
  };
  profileCid: string | null;
  depositIndex: number;
  status: 'active' | 'suspended' | 'expired';
}

/**
 * Resolve a name hash to its on-chain NameRecord data.
 *
 * Falls back to the mock registry when the on-chain lookup fails
 * (e.g., localnet without the name-registry program deployed).
 */
export async function resolveNameHash(
  connection: Connection,
  nameHash: Uint8Array,
): Promise<ResolvedName | null> {
  const programId = new PublicKey(config.solana.nameRegistryProgramId);

  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(NAME_SEED), Buffer.from(nameHash)],
    programId,
  );

  try {
    const accountInfo = await connection.getAccountInfo(pda);
    if (!accountInfo || !accountInfo.data) {
      return null;
    }
    return deserializeNameRecord(accountInfo.data);
  } catch (err) {
    return null;
  }
}

/**
 * Resolve by username using Poseidon hash.
 * Requires circomlibjs to be available.
 */
export async function resolveUsername(
  connection: Connection,
  username: string,
): Promise<ResolvedName | null> {
  try {
    const nameHash = await hashNamePoseidon(username.toLowerCase().trim());
    return resolveNameHash(connection, nameHash);
  } catch {
    return resolveMockUsername(username);
  }
}

/**
 * Deserialize NameRecord from raw account data (Anchor layout).
 *
 * Layout (after 8-byte discriminator):
 *   authority:              32 bytes (Pubkey)
 *   name_hash:              32 bytes
 *   stealth_meta_address:   65 bytes (32 + 32 + 1)
 *   profile_cid:            1 + 32 bytes (Option<[u8;32]>)
 *   deposit_index:          8 bytes (u64 LE)
 *   created_at:             8 bytes (i64 LE)
 *   updated_at:             8 bytes (i64 LE)
 *   status:                 1 byte (enum)
 *   bump:                   1 byte
 */
function deserializeNameRecord(data: Buffer): ResolvedName {
  let offset = 8; // skip discriminator

  const authority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const nameHash = data.subarray(offset, offset + 32);
  offset += 32;

  const scanPubkey = data.subarray(offset, offset + 32);
  offset += 32;
  const spendPubkey = data.subarray(offset, offset + 32);
  offset += 32;
  const version = data[offset];
  offset += 1;

  const hasProfileCid = data[offset] === 1;
  offset += 1;
  let profileCid: string | null = null;
  if (hasProfileCid) {
    profileCid = bs58.encode(data.subarray(offset, offset + 32));
  }
  offset += 32;

  const depositIndex = Number(data.readBigUInt64LE(offset));
  offset += 8;

  offset += 8; // created_at
  offset += 8; // updated_at

  const statusByte = data[offset];
  const statusMap: Record<number, 'active' | 'suspended' | 'expired'> = {
    0: 'active',
    1: 'suspended',
    2: 'expired',
  };

  return {
    authority: authority.toBase58(),
    nameHash: bs58.encode(nameHash),
    stealthMetaAddress: {
      scanPubkey: bs58.encode(scanPubkey),
      spendPubkey: bs58.encode(spendPubkey),
      version,
    },
    profileCid,
    depositIndex,
    status: statusMap[statusByte] ?? 'active',
  };
}

async function hashNamePoseidon(name: string): Promise<Uint8Array> {
  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();

  const nameBytes = new TextEncoder().encode(name);
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

function resolveMockUsername(username: string): ResolvedName | null {
  const mocks: Record<string, ResolvedName> = {
    alice: {
      authority: '11111111111111111111111111111111',
      nameHash: 'mock',
      stealthMetaAddress: {
        scanPubkey: 'mock_scan_pubkey_alice',
        spendPubkey: 'mock_spend_pubkey_alice',
        version: 1,
      },
      profileCid: null,
      depositIndex: 0,
      status: 'active',
    },
    bob: {
      authority: '11111111111111111111111111111111',
      nameHash: 'mock',
      stealthMetaAddress: {
        scanPubkey: 'mock_scan_pubkey_bob',
        spendPubkey: 'mock_spend_pubkey_bob',
        version: 1,
      },
      profileCid: null,
      depositIndex: 0,
      status: 'active',
    },
  };
  return mocks[username.toLowerCase()] || null;
}
