import { FastifyInstance } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildPoseidon } from 'circomlibjs';
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
import type { CompressedProfile } from '@skaus/types';

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
  app.put<{ Params: { username: string }; Body: CompressedProfile }>(
    '/:username',
    async (request, reply) => {
      const { username } = request.params;
      const profile = request.body;

      if (!profile.displayName) {
        return reply.status(400).send({ error: 'displayName is required' });
      }

      const result = await upsertProfile(username, {
        ...profile,
        version: (profile.version || 0) + 1,
        updatedAt: Date.now(),
      });

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
}
