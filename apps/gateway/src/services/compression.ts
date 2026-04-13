/**
 * Gateway-side ZK compression service for profiles.
 *
 * Role separation:
 *   - The gateway's relayer keypair pays for and signs compressed account
 *     creation/update on Light Protocol (it becomes the account owner).
 *   - After a compressed account is created, the gateway builds an
 *     `update_profile` instruction (name-registry program) so the user can
 *     sign it with their wallet and atomically link the hash to their identity.
 *
 * Feature flag:
 *   ZK_COMPRESSION_ENABLED=false  →  skip Light Protocol calls entirely;
 *   only Postgres is written to. Useful in local dev without a Photon node.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { createHash } from 'node:crypto';
import bs58 from 'bs58';
import type { CompressedProfile } from '@skaus/types';
import {
  buildRpc,
  createCompressedProfile,
  readCompressedProfile,
  updateCompressedProfile,
  computeAccountHash,
  type CompressionConfig,
  type CompressedAccountInfo,
} from '@skaus/sdk';
import type { Rpc } from '@lightprotocol/stateless.js';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Singleton RPC
// ---------------------------------------------------------------------------

let _rpc: Rpc | null = null;

function getRpc(): Rpc {
  if (_rpc === null) {
    const cfg: CompressionConfig = {
      rpcUrl: config.compression.rpcUrl,
      proverUrl: config.compression.proverUrl,
    };
    _rpc = buildRpc(cfg);
  }
  return _rpc as Rpc;
}

// ---------------------------------------------------------------------------
// Relayer keypair (gateway signer / payer for compressed accounts)
// ---------------------------------------------------------------------------

let _relayerKeypair: Keypair | null = null;

function getRelayerKeypair(): Keypair | null {
  if (_relayerKeypair) return _relayerKeypair;
  if (!config.relayer.privateKey) return null;
  _relayerKeypair = Keypair.fromSecretKey(bs58.decode(config.relayer.privateKey));
  return _relayerKeypair;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ProfileCompressionResult {
  /** Hex-encoded 32-byte hash stored in NameRecord.profile_cid. */
  hash: string;
  /** True when the compressed account was actually written on-chain. */
  onChain: boolean;
  /** tx sig if written on-chain; null if ZK compression is disabled or failed. */
  txSignature: string | null;
}

/**
 * Create or update a compressed profile account on Light Protocol.
 *
 * @param username       Human-readable username (for logging).
 * @param profile        Profile data to compress.
 * @param existingHash   Current hash if updating an existing account; null for create.
 */
export async function compressProfile(
  username: string,
  profile: CompressedProfile,
  existingHash: string | null,
): Promise<ProfileCompressionResult> {
  const relayer = getRelayerKeypair();

  // Stable local hash — the deterministic compressed account address derived
  // from the relayer's pubkey. Used as Postgres cache key even when ZK
  // compression is disabled.
  const localHash = computeAccountHash(
    relayer?.publicKey ?? PublicKey.default,
  );

  if (!config.compression.enabled) {
    return { hash: localHash, onChain: false, txSignature: null };
  }

  if (!relayer) {
    console.warn(`[compression] No relayer keypair — skipping on-chain compression for ${username}`);
    return { hash: localHash, onChain: false, txSignature: null };
  }

  try {
    const rpc = getRpc();
    let result: CompressedAccountInfo;

    if (existingHash) {
      result = await updateCompressedProfile(rpc, relayer, existingHash, profile);
    } else {
      result = await createCompressedProfile(rpc, relayer, profile);
    }

    return { hash: result.hash, onChain: true, txSignature: result.txSignature };
  } catch (err) {
    // Light Protocol failures must not break profile saves — Postgres is the
    // fallback source of truth. Log and continue.
    console.error(`[compression] Failed to compress profile for ${username}:`, err);
    return { hash: localHash, onChain: false, txSignature: null };
  }
}

/**
 * Fetch a profile directly from the Photon indexer by its compressed account hash.
 * Returns null if ZK compression is disabled or the account isn't found.
 */
export async function fetchProfileFromChain(hash: string): Promise<CompressedProfile | null> {
  if (!config.compression.enabled) return null;

  try {
    return await readCompressedProfile(getRpc(), hash);
  } catch (err) {
    console.error(`[compression] Failed to read compressed account ${hash}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Build update_profile transaction for client signing
// ---------------------------------------------------------------------------

/**
 * Build a serialized `update_profile` transaction for the name-registry program.
 *
 * The transaction updates NameRecord.profile_cid on-chain to the given hash,
 * linking the user's identity to their compressed profile account.
 *
 * The user's wallet must sign as the `authority` on the NameRecord.
 * The gateway's relayer signs as `payer` (covers transaction fee).
 *
 * Returns base64-encoded partially-signed transaction for the client to
 * countersign and submit.
 *
 * @param username   Lowercase username (e.g. "alice")
 * @param nameHash   Poseidon hash of the name (on-chain PDA seed)
 * @param authority  User's wallet public key
 * @param hash       32-byte hex compressed account hash to store
 */
export async function buildUpdateProfileTx(
  username: string,
  nameHash: Uint8Array,
  authority: PublicKey,
  hash: string,
): Promise<string> {
  const relayer = getRelayerKeypair();
  const nameRegistryProgramId = new PublicKey(config.solana.nameRegistryProgramId);
  const connection = new Connection(config.solana.rpcUrl, 'confirmed');

  // Derive NameRecord PDA: seeds = ["name", name_hash_bytes]
  const [nameRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('name'), Buffer.from(nameHash)],
    nameRegistryProgramId,
  );

  // Instruction discriminator: sha256("global:update_profile")[0..8]
  const discriminator = createHash('sha256')
    .update('global:update_profile')
    .digest()
    .subarray(0, 8);

  // profile_cid is 33 bytes on-chain: 1-byte Option discriminant + 32-byte hash
  const hashBytes = Buffer.from(hash, 'hex');
  if (hashBytes.length !== 32) {
    throw new Error(`profile_cid hash must be 32 bytes, got ${hashBytes.length}`);
  }
  const profileCidData = Buffer.concat([
    Buffer.from([1]),   // Option::Some discriminant
    hashBytes,
  ]);

  const data = Buffer.concat([discriminator, profileCidData]);

  const ix = new TransactionInstruction({
    programId: nameRegistryProgramId,
    keys: [
      { pubkey: nameRecordPda, isSigner: false, isWritable: true },
      { pubkey: authority,      isSigner: true,  isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: relayer?.publicKey ?? authority });
  tx.add(ix);

  // Relayer pre-signs as payer (covers fee). User still needs to sign as authority.
  if (relayer) {
    tx.partialSign(relayer);
  }

  return tx.serialize({ requireAllSignatures: false }).toString('base64');
}
