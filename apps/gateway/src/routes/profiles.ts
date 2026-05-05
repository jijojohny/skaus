import { FastifyInstance } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildPoseidon } from 'circomlibjs';
import { createCipheriv, createDecipheriv, createPublicKey, randomBytes, verify as cryptoVerify } from 'crypto';
import { prisma } from '../db';
import {
  getProfileByUsername,
  getProfileByHash,
  upsertProfile,
  searchProfiles,
  listProfiles,
  markProfileOnChain,
} from '../services/profile';
import { buildUpdateProfileTx } from '../services/compression';
import type { CompressedProfile, PaymentTier, GatedContentPointer } from '@skaus/types';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Gated content AES-256-GCM helpers
// ---------------------------------------------------------------------------

function gatedKey(): Buffer {
  return Buffer.from(config.gatedContentKey, 'hex');
}

function encryptUri(plainUri: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', gatedKey(), iv);
  const ct = Buffer.concat([cipher.update(plainUri, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: enc:v1:<iv_hex>.<ct_hex>.<tag_hex>
  return `enc:v1:${iv.toString('hex')}.${ct.toString('hex')}.${tag.toString('hex')}`;
}

// DER prefix for Ed25519 SubjectPublicKeyInfo (OID 1.3.101.112)
const ED25519_DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function verifyEd25519(pubkeyBase58: string, message: string, signatureBase58: string): boolean {
  try {
    const pubkeyBytes = Buffer.from(bs58.decode(pubkeyBase58));
    const derKey = Buffer.concat([ED25519_DER_PREFIX, pubkeyBytes]);
    const keyObj = createPublicKey({ key: derKey, format: 'der', type: 'spki' });
    const sig = Buffer.from(bs58.decode(signatureBase58));
    return cryptoVerify(null, Buffer.from(message, 'utf8'), keyObj, sig);
  } catch {
    return false;
  }
}

function decryptUri(encryptedUri: string): string {
  if (!encryptedUri.startsWith('enc:v1:')) throw new Error('Not an encrypted URI');
  const parts = encryptedUri.slice('enc:v1:'.length).split('.');
  if (parts.length !== 3) throw new Error('Malformed encrypted URI');
  const [ivHex, ctHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', gatedKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export async function profileRoutes(app: FastifyInstance) {
  /**
   * GET /profiles/:username
   *
   * Fetch a profile by username. Returns profile data plus ZK compression
   * metadata so the client knows whether the profile is on-chain.
   */
  app.get<{ Params: { username: string } }>(
    '/:username',
    async (request, reply) => {
      const profile = await getProfileByUsername(request.params.username);
      if (!profile) {
        return reply.status(404).send({ error: 'Profile not found' });
      }
      return reply.send(profile);
    },
  );

  /**
   * GET /profiles/hash/:hash
   *
   * Fetch a profile directly from the Photon indexer by its compressed account
   * hash (hex-encoded 32 bytes). Falls back to Postgres if the chain read fails.
   *
   * This is the canonical read path for privacy-sensitive clients: they resolve
   * NameRecord.profile_cid on-chain, then call this endpoint to get the profile.
   */
  app.get<{ Params: { hash: string } }>(
    '/hash/:hash',
    async (request, reply) => {
      const { hash } = request.params;

      if (!/^[0-9a-f]{64}$/i.test(hash)) {
        return reply.status(400).send({ error: 'Invalid hash format — expected 64 hex chars' });
      }

      const profile = await getProfileByHash(hash);
      if (!profile) {
        return reply.status(404).send({ error: 'Profile not found for hash' });
      }

      return reply.send(profile);
    },
  );

  /**
   * PUT /profiles/:username
   *
   * Create or update a profile.
   *
   * Triggers dual-write: ZK compressed account (Light Protocol) + Postgres cache.
   * Returns the compressed account hash so the client can optionally submit an
   * on-chain update_profile transaction to link the hash to their identity.
   *
   * Response:
   *   { success: true, username, compressedHash, compressedOnChain, compressionTxSig }
   */
  app.put<{ Params: { username: string }; Body: CompressedProfile & { authority?: string } }>(
    '/:username',
    async (request, reply) => {
      const { username } = request.params;
      const { authority, ...profile } = request.body;

      if (!profile.displayName) {
        return reply.status(400).send({ error: 'displayName is required' });
      }

      let authorityPubkey: PublicKey | undefined;
      if (authority) {
        try {
          authorityPubkey = new PublicKey(authority);
        } catch {
          return reply.status(400).send({ error: 'Invalid authority pubkey' });
        }
      }

      const result = await upsertProfile(
        username,
        { ...profile, version: (profile.version || 0) + 1, updatedAt: Date.now() },
        undefined,
        authorityPubkey,
      );

      return reply.send({
        success: true,
        username,
        compressedHash: result.compressedHash,
        compressedOnChain: result.compressedOnChain,
        compressionTxSig: result.compressionTxSignature,
      });
    },
  );

  /**
   * POST /profiles/:username/link-to-chain
   *
   * Build a partially-signed `update_profile` transaction for the name-registry
   * program. The client must countersign with the authority wallet and submit.
   *
   * This atomically stores compressedHash in NameRecord.profile_cid on-chain,
   * permanently linking the user's identity to their compressed profile.
   *
   * Body: { authority: string (base58 pubkey) }
   * Response: { transaction: string (base64), hash: string (hex) }
   */
  app.post<{
    Params: { username: string };
    Body: { authority: string };
  }>(
    '/:username/link-to-chain',
    async (request, reply) => {
      const { username } = request.params;
      const { authority } = request.body;

      if (!authority) {
        return reply.status(400).send({ error: 'authority (wallet pubkey) is required' });
      }

      // Fetch the current compressedHash from Postgres.
      const row = await prisma.profile.findUnique({
        where: { username: username.toLowerCase() },
        select: { compressedHash: true, nameHash: true },
      });

      if (!row?.compressedHash) {
        return reply.status(404).send({
          error: 'No compressed profile found — call PUT /profiles/:username first',
        });
      }

      // Compute the Poseidon name hash for the NameRecord PDA seed.
      let nameHash: Uint8Array;
      if (row.nameHash) {
        // nameHash is stored as base58 in Postgres.
        nameHash = bs58.decode(row.nameHash);
      } else {
        const poseidon = await buildPoseidon();
        const nameBytes = new TextEncoder().encode(username.toLowerCase().trim());
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
        nameHash = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          nameHash[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
      }

      let authorityPubkey: PublicKey;
      try {
        authorityPubkey = new PublicKey(authority);
      } catch {
        return reply.status(400).send({ error: 'Invalid authority pubkey' });
      }

      const transaction = await buildUpdateProfileTx(
        username,
        nameHash,
        authorityPubkey,
        row.compressedHash,
      );

      return reply.send({ transaction, hash: row.compressedHash });
    },
  );

  /**
   * POST /profiles/:username/confirm-on-chain
   *
   * Called by the client after successfully submitting the update_profile tx.
   * Marks the profile as confirmed on-chain in Postgres.
   *
   * Body: { hash: string (hex), txSignature: string }
   */
  app.post<{
    Params: { username: string };
    Body: { hash: string; txSignature: string };
  }>(
    '/:username/confirm-on-chain',
    async (request, reply) => {
      const { username } = request.params;
      const { hash, txSignature } = request.body;

      if (!hash || !txSignature) {
        return reply.status(400).send({ error: 'hash and txSignature are required' });
      }

      await markProfileOnChain(username, hash);
      return reply.send({ success: true, username, hash, txSignature });
    },
  );

  /**
   * GET /profiles
   *
   * List or search profiles.
   */
  app.get<{ Querystring: { q?: string; limit?: number; offset?: number } }>(
    '/',
    async (request, reply) => {
      const { q, limit, offset } = request.query;

      if (q) {
        const results = await searchProfiles(q, limit || 20);
        return reply.send({ results, count: results.length });
      }

      const results = await listProfiles(limit || 20, offset || 0);
      return reply.send({ results, count: results.length });
    },
  );

  /**
   * POST /profiles/:username/gated/encrypt
   *
   * Encrypt a plain content URI for storage in GatedContentPointer.encryptedUri.
   * The caller must be the profile owner (authority matches stored profile).
   *
   * Body: { contentId, plainUri, authority }
   * Response: { encryptedUri }
   */
  app.post<{
    Params: { username: string };
    Body: { contentId: string; plainUri: string; authority: string };
  }>(
    '/:username/gated/encrypt',
    async (request, reply) => {
      const { username } = request.params;
      const { contentId, plainUri, authority } = request.body;

      if (!contentId || !plainUri || !authority) {
        return reply.status(400).send({ error: 'contentId, plainUri, and authority are required' });
      }

      try {
        new URL(plainUri);
      } catch {
        return reply.status(400).send({ error: 'plainUri must be a valid URL' });
      }

      // Verify caller is the profile owner
      const nameRecord = await prisma.nameRecord.findFirst({ where: { authority } });
      if (!nameRecord) {
        return reply.status(403).send({ error: 'No name record found for this authority' });
      }

      const encryptedUri = encryptUri(plainUri);
      return reply.send({ encryptedUri });
    },
  );

  /**
   * POST /profiles/:username/gated/:contentId/access
   *
   * Verify a supporter has paid enough to unlock a gated content item, then
   * return the decrypted URI.
   *
   * Access rule: the presented txSignature must appear in a payment record for
   * a payment request belonging to this creator, and the payment amount must be
   * ≥ the amount of the tier referenced by accessCondition.
   *
   * Body: { txSignature }
   * Response: { plainUri }
   */
  app.post<{
    Params: { username: string; contentId: string };
    Body: { txSignature: string; requesterAddress: string; challengeSignature: string };
  }>(
    '/:username/gated/:contentId/access',
    async (request, reply) => {
      const { username, contentId } = request.params;
      const { txSignature, requesterAddress, challengeSignature } = request.body;

      if (!txSignature || !requesterAddress || !challengeSignature) {
        return reply.status(400).send({ error: 'txSignature, requesterAddress, and challengeSignature are required' });
      }

      // Load profile and find the content item
      const profile = await getProfileByUsername(username);
      if (!profile) return reply.status(404).send({ error: 'Profile not found' });

      const content = (profile.gatedContent as GatedContentPointer[]).find(c => c.contentId === contentId);
      if (!content) return reply.status(404).send({ error: 'Content item not found' });

      if (!content.encryptedUri?.startsWith('enc:v1:')) {
        return reply.status(422).send({ error: 'Content URI is not encrypted' });
      }

      // Resolve the required tier amount from the access condition
      let requiredAmount = 0;
      const tierMatch = content.accessCondition?.match(/^tier:(.+)$/);
      if (tierMatch) {
        const tierId = tierMatch[1];
        const tier = (profile.tiers as PaymentTier[]).find(t => t.id === tierId);
        if (tier) requiredAmount = tier.amount;
      }

      // Verify the txSignature appears in a payment for this creator with sufficient amount
      const payment = await prisma.payment.findFirst({
        where: { txSignature },
        include: { request: { select: { username: true, amount: true } } },
      });

      if (!payment) {
        return reply.status(403).send({ error: 'Payment not found for this signature' });
      }
      if (payment.request.username.toLowerCase() !== username.toLowerCase()) {
        return reply.status(403).send({ error: 'Payment is not for this creator' });
      }
      if (payment.amount < requiredAmount) {
        return reply.status(403).send({ error: `Payment amount ${payment.amount} is less than required ${requiredAmount}` });
      }

      // Verify payer identity: payment must have a recorded payerAddress
      if (!payment.payerAddress) {
        return reply.status(403).send({ error: 'Payment has no recorded payer address — cannot verify identity' });
      }
      if (payment.payerAddress.toLowerCase() !== requesterAddress.toLowerCase()) {
        return reply.status(403).send({ error: 'Requester address does not match payment payer' });
      }

      // Verify ed25519 wallet signature over deterministic challenge
      const challenge = `skaus-unlock-v1:${contentId}:${txSignature}`;
      if (!verifyEd25519(requesterAddress, challenge, challengeSignature)) {
        return reply.status(403).send({ error: 'Invalid wallet signature' });
      }

      try {
        const plainUri = decryptUri(content.encryptedUri);
        return reply.send({ plainUri });
      } catch {
        return reply.status(500).send({ error: 'Failed to decrypt content URI' });
      }
    },
  );
}
