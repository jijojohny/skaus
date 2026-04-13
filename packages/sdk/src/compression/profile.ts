/**
 * ZK-compressed profile storage via Light Protocol v0.22.
 *
 * Architecture (planB.md §3):
 *   1. Profile bytes (Borsh-encoded) are stored directly in a compressed
 *      account's `data` field via the Light System Program `invoke` instruction.
 *   2. The account address is deterministic:
 *        seed = deriveAddressSeed(["skaus:profile:v1", owner_pubkey], LIGHT_SYSTEM_PROGRAM)
 *        address = deriveAddress(seed)  →  stable 32-byte PublicKey
 *   3. The hex-encoded address is stored in NameRecord.profile_cid on the
 *      name-registry (via `update_profile` instruction).
 *   4. Reads: `rpc.getCompressedAccount(bnAddress)` → current data from Photon.
 *   5. Updates: UTXO replace — consume old leaf, emit new leaf at same address.
 *
 * dataHash computation (must match on-chain verifier):
 *   dataHash = hashvToBn254FieldSizeBe([discriminator_bytes, body_bytes])
 */
import {
  createRpc,
  bn,
  deriveAddressSeed,
  deriveAddress,
  createCompressedAccountLegacy,
  packNewAddressParams,
  packCompressedAccounts,
  encodeInstructionDataInvoke,
  invokeAccountsLayout,
  toAccountMetas,
  buildAndSignTx,
  sendAndConfirmTx,
  defaultTestStateTreeAccounts,
  defaultStaticAccountsStruct,
  lightSystemProgram,
  hashvToBn254FieldSizeBe,
  TreeType,
  type Rpc,
  type NewAddressParams,
  type InstructionDataInvoke,
  type TreeInfo,
  type CompressedAccountWithMerkleContextLegacy,
  type CompressedAccountData,
} from '@lightprotocol/stateless.js';
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import type { CompressedProfile } from '@skaus/types';
import { encodeProfile, decodeProfile } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROFILE_SEED_PREFIX = Buffer.from('skaus:profile:v1');
const LIGHT_SYSTEM_PROGRAM_ID = new PublicKey(lightSystemProgram);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CompressionConfig {
  /** Solana RPC (also used as Photon endpoint on devnet if compressionUrl omitted). */
  rpcUrl: string;
  compressionUrl?: string;
  /** ZK prover endpoint. Required to generate validity proofs. */
  proverUrl?: string;
}

export interface CompressedAccountInfo {
  /**
   * Hex-encoded 32-byte compressed account ADDRESS (deterministic, stable).
   * Stored in NameRecord.profile_cid; used to look up the account on Photon.
   */
  hash: string;
  txSignature: string;
}

// ---------------------------------------------------------------------------
// RPC factory
// ---------------------------------------------------------------------------

export function buildRpc(cfg: CompressionConfig): Rpc {
  return createRpc(cfg.rpcUrl, cfg.compressionUrl ?? cfg.rpcUrl, cfg.proverUrl);
}

// ---------------------------------------------------------------------------
// Address derivation
// ---------------------------------------------------------------------------

/** Derive the seed bytes for a user's compressed profile address. */
export function deriveProfileAddressSeed(owner: PublicKey): Uint8Array {
  return deriveAddressSeed(
    [PROFILE_SEED_PREFIX, owner.toBytes()],
    LIGHT_SYSTEM_PROGRAM_ID,
  );
}

/** Derive the deterministic compressed account address for a profile. */
export function deriveProfileAddress(owner: PublicKey): PublicKey {
  return deriveAddress(deriveProfileAddressSeed(owner));
}

/** Hex-encode an owner's deterministic profile address (used as cache key). */
export function computeAccountHash(owner: PublicKey): string {
  return Buffer.from(deriveProfileAddress(owner).toBytes()).toString('hex');
}

// ---------------------------------------------------------------------------
// Internal: build CompressedAccountData
// ---------------------------------------------------------------------------

function buildAccountData(profileBytes: Buffer): CompressedAccountData {
  const disc = profileBytes.subarray(0, 8);
  const body = profileBytes.subarray(8);
  return {
    discriminator: Array.from(disc),
    data: Buffer.from(body),
    // Keccak-based hash truncated to BN254 field — must match on-chain computation.
    dataHash: Array.from(hashvToBn254FieldSizeBe([disc, body])),
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new compressed profile account on Light Protocol.
 *
 * Uses the Light System Program `invoke` instruction with:
 *   - newAddressParams: non-existence proof for the derived address
 *   - outputCompressedAccounts: the profile data as CompressedAccountData
 *
 * @returns The deterministic account address (hex) + tx signature.
 *          Pass the address to buildUpdateProfileTx to link it on-chain.
 */
export async function createCompressedProfile(
  rpc: Rpc,
  owner: Keypair,
  profile: CompressedProfile,
): Promise<CompressedAccountInfo> {
  const profileBytes = encodeProfile(profile);
  const addressSeed = deriveProfileAddressSeed(owner.publicKey);
  const address = deriveAddress(addressSeed);

  // Non-existence validity proof for the new address.
  const proofCtx = await rpc.getValidityProof([], [bn(address.toBytes())]);
  const addressTreeInfo = proofCtx.treeInfos[0];

  const newAddressParams: NewAddressParams = {
    seed: addressSeed,
    addressMerkleTreeRootIndex: proofCtx.rootIndices[0],
    addressMerkleTreePubkey: addressTreeInfo.tree,
    addressQueuePubkey: addressTreeInfo.queue,
  };

  let remainingAccounts: PublicKey[] = [];
  const { newAddressParamsPacked, remainingAccounts: rem1 } =
    packNewAddressParams([newAddressParams], remainingAccounts);
  remainingAccounts = rem1;

  // Build output compressed account with profile data payload.
  const outputAccount = createCompressedAccountLegacy(
    owner.publicKey,
    bn(0),
    buildAccountData(profileBytes),
    Array.from(address.toBytes()),
  );

  // State tree for output leaf storage.
  const stateTrees = defaultTestStateTreeAccounts();
  const stateTreeInfo: TreeInfo = {
    tree: stateTrees.merkleTree,
    queue: stateTrees.nullifierQueue,
    treeType: TreeType.StateV1,
    nextTreeInfo: null,
  };

  const packed = packCompressedAccounts(
    [],    // no input accounts (fresh create)
    [],    // no input root indices
    [outputAccount],
    stateTreeInfo,
    remainingAccounts,
  );
  remainingAccounts = packed.remainingAccounts;

  const ixData: InstructionDataInvoke = {
    proof: proofCtx.compressedProof,
    inputCompressedAccountsWithMerkleContext: packed.packedInputCompressedAccounts,
    outputCompressedAccounts: packed.packedOutputCompressedAccounts,
    relayFee: null,
    newAddressParams: newAddressParamsPacked,
    compressOrDecompressLamports: null,
    isCompress: false,
  };

  const ix = buildInvokeInstruction(owner.publicKey, remainingAccounts, ixData);
  const { blockhash } = await rpc.getLatestBlockhash();
  const tx = buildAndSignTx([ix], owner, blockhash);
  const txSignature = await sendAndConfirmTx(rpc, tx);

  return {
    hash: Buffer.from(address.toBytes()).toString('hex'),
    txSignature,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Fetch a compressed profile directly from the Photon indexer by its account
 * address (hex-encoded 32 bytes, stored in NameRecord.profile_cid).
 *
 * Returns null if the account does not exist.
 */
export async function readCompressedProfile(
  rpc: Rpc,
  hash: string,
): Promise<CompressedProfile | null> {
  const account = await rpc.getCompressedAccount(
    bn(Buffer.from(hash, 'hex')),  // address lookup (stable across updates)
    undefined,
  );

  if (!account?.data) return null;

  const disc = Buffer.from(account.data.discriminator);
  const body = Buffer.from(account.data.data);
  return decodeProfile(Buffer.concat([disc, body]));
}

// ---------------------------------------------------------------------------
// Update  (UTXO replace)
// ---------------------------------------------------------------------------

/**
 * Update a compressed profile: consume the current leaf, emit an updated one.
 *
 * The account address stays the same; only the data (and therefore the leaf
 * hash in the state tree) changes.
 *
 * @param currentHash  Hex-encoded address of the account to update.
 */
export async function updateCompressedProfile(
  rpc: Rpc,
  owner: Keypair,
  currentHash: string,
  updatedProfile: CompressedProfile,
): Promise<CompressedAccountInfo> {
  const profileBytes = encodeProfile(updatedProfile);
  const addressBN = bn(Buffer.from(currentHash, 'hex'));

  // Fetch current account state (needs its Merkle leaf hash for the input proof).
  const current = await rpc.getCompressedAccount(addressBN, undefined);
  if (!current) {
    throw new Error(`Compressed profile account not found: ${currentHash}`);
  }

  // Inclusion proof for the current leaf (proves it's in the state tree).
  const proofCtx = await rpc.getValidityProof([current.hash], []);

  let remainingAccounts: PublicKey[] = [];

  // Cast: CompressedAccountWithMerkleContext → CompressedAccountWithMerkleContextLegacy
  // (Legacy drops the `readOnly` boolean; all other fields are identical.)
  const inputLegacy = current as unknown as CompressedAccountWithMerkleContextLegacy;

  // Updated output at the same address.
  const outputAccount = createCompressedAccountLegacy(
    owner.publicKey,
    bn(0),
    buildAccountData(profileBytes),
    current.address ?? undefined,  // same address → deterministic key preserved
  );

  const packed = packCompressedAccounts(
    [inputLegacy],
    [proofCtx.rootIndices[0]],
    [outputAccount],
    undefined,  // SDK picks the output state tree
    remainingAccounts,
  );
  remainingAccounts = packed.remainingAccounts;

  const ixData: InstructionDataInvoke = {
    proof: proofCtx.compressedProof,
    inputCompressedAccountsWithMerkleContext: packed.packedInputCompressedAccounts,
    outputCompressedAccounts: packed.packedOutputCompressedAccounts,
    relayFee: null,
    newAddressParams: [],  // no new addresses (reusing existing)
    compressOrDecompressLamports: null,
    isCompress: false,
  };

  const ix = buildInvokeInstruction(owner.publicKey, remainingAccounts, ixData);
  const { blockhash } = await rpc.getLatestBlockhash();
  const tx = buildAndSignTx([ix], owner, blockhash);
  const txSignature = await sendAndConfirmTx(rpc, tx);

  // Address is unchanged; return the same hash.
  return { hash: currentHash, txSignature };
}

// ---------------------------------------------------------------------------
// Instruction builder
// ---------------------------------------------------------------------------

function buildInvokeInstruction(
  payer: PublicKey,
  remainingAccounts: PublicKey[],
  ixData: InstructionDataInvoke,
): TransactionInstruction {
  const staticAccounts = defaultStaticAccountsStruct();

  const accountMetas = invokeAccountsLayout({
    feePayer: payer,
    authority: payer,
    registeredProgramPda: staticAccounts.registeredProgramPda,
    noopProgram: staticAccounts.noopProgram,
    accountCompressionAuthority: staticAccounts.accountCompressionAuthority,
    accountCompressionProgram: staticAccounts.accountCompressionProgram,
    solPoolPda: null,
    decompressionRecipient: null,
    systemProgram: SystemProgram.programId,
  });

  return new TransactionInstruction({
    programId: LIGHT_SYSTEM_PROGRAM_ID,
    keys: [...accountMetas, ...toAccountMetas(remainingAccounts)],
    data: Buffer.from(encodeInstructionDataInvoke(ixData)),
  });
}
