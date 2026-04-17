import { FastifyInstance } from 'fastify';
import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from '../config';
import { resolveUsername } from '../services/name-resolver';
import { prisma } from '../db';

let connection: Connection;

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(config.solana.rpcUrl, 'confirmed');
  }
  return connection;
}

export async function nameRoutes(app: FastifyInstance) {
  /**
   * GET /names/:username
   *
   * Look up a registered name and return the full NameRecord data.
   */
  app.get<{ Params: { username: string } }>(
    '/:username',
    async (request, reply) => {
      const { username } = request.params;

      const resolved = await resolveUsername(getConnection(), username);

      if (!resolved) {
        return reply.status(404).send({
          error: 'Name not found',
          available: true,
          username,
        });
      }

      return reply.send({
        username,
        ...resolved,
        available: false,
      });
    },
  );

  /**
   * GET /names/:username/available
   *
   * Check if a name is available for registration.
   */
  app.get<{ Params: { username: string } }>(
    '/:username/available',
    async (request, reply) => {
      const { username } = request.params;

      if (!isValidName(username)) {
        return reply.status(400).send({
          available: false,
          error: 'Invalid name format',
        });
      }

      const resolved = await resolveUsername(getConnection(), username);

      return reply.send({
        username,
        available: resolved === null,
      });
    },
  );

  /**
   * POST /names/register
   *
   * Build a register_name transaction and return it as base64.
   * The authority must sign as a Signer on-chain, so the client
   * must sign with the user's wallet before submitting.
   *
   * Returns the serialized transaction (base64) for the client to
   * partially sign (authority) and submit. The relayer pre-signs as payer.
   *
   * If no relayer is configured, the user's wallet is used as payer too.
   */
  app.post<{
    Body: {
      username: string;
      authority: string;
      scanPubkey: string;
      spendPubkey: string;
    };
  }>(
    '/register',
    async (request, reply) => {
      const { username, authority, scanPubkey, spendPubkey } = request.body;

      if (!username || !authority || !scanPubkey || !spendPubkey) {
        return reply.status(400).send({ success: false, error: 'Missing required fields' });
      }

      if (!isValidName(username)) {
        return reply.status(400).send({ success: false, error: 'Invalid name format' });
      }

      const existing = await resolveUsername(getConnection(), username);
      if (existing) {
        return reply.status(409).send({ success: false, error: 'Name already taken' });
      }

      try {
        const { Keypair, Transaction, TransactionInstruction, SystemProgram } = await import('@solana/web3.js');
        const { createHash } = await import('crypto');

        const programId = new PublicKey(config.solana.nameRegistryProgramId);
        const conn = getConnection();

        const anchorDisc = createHash('sha256')
          .update('global:register_name')
          .digest()
          .slice(0, 8);

        const { buildPoseidon } = await import('circomlibjs');
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
        const nameHash = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          nameHash[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }

        // Persist username→nameHash early so returning users can resolve their
        // link on any device, even before the indexer picks up the on-chain tx.
        const nameHashB58 = bs58.encode(nameHash);
        try {
          await prisma.profile.upsert({
            where: { username },
            update: { nameHash: nameHashB58 },
            create: { username, nameHash: nameHashB58 },
          });
        } catch {}

        // Create the personal payment link entry so every registered user
        // has a queryable row in payment_requests from day one.
        try {
          const now = BigInt(Date.now());
          await prisma.paymentRequest.upsert({
            where: { username_slug: { username, slug: 'personal' } },
            update: {},
            create: {
              id: `personal-${username}`,
              creator: authority,
              username,
              slug: 'personal',
              amount: 0,
              token: 'USDC',
              memo: '',
              title: 'Personal',
              openAmount: true,
              expiresAt: null,
              maxPayments: 999999,
              depositPathIndex: 0,
              status: 'pending',
              views: 0,
              createdAt: now,
              updatedAt: now,
            },
          });
        } catch {}

        const [configPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('registry_config')],
          programId,
        );
        const [nameRecordPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('name'), Buffer.from(nameHash)],
          programId,
        );

        const authorityPubkey = new PublicKey(authority);
        const scanPubkeyBytes = bs58.decode(scanPubkey);
        const spendPubkeyBytes = bs58.decode(spendPubkey);

        const nameBuf = Buffer.from(username.toLowerCase().trim());
        const dataLen = 8 + 4 + nameBuf.length + 32 + 32 + 32 + 1;
        const regData = Buffer.alloc(dataLen);
        let offset = 0;

        anchorDisc.copy(regData, offset); offset += 8;
        regData.writeUInt32LE(nameBuf.length, offset); offset += 4;
        nameBuf.copy(regData, offset); offset += nameBuf.length;
        Buffer.from(nameHash).copy(regData, offset); offset += 32;
        Buffer.from(scanPubkeyBytes).copy(regData, offset); offset += 32;
        Buffer.from(spendPubkeyBytes).copy(regData, offset); offset += 32;
        regData.writeUInt8(1, offset); offset += 1;

        const configInfo = await conn.getAccountInfo(configPda);
        let feeTreasury = authorityPubkey;
        if (configInfo && configInfo.data.length >= 48) {
          feeTreasury = new PublicKey(configInfo.data.subarray(8, 40));
        }

        const hasRelayer = !!config.relayer.privateKey;
        let relayerKeypair: InstanceType<typeof Keypair> | null = null;
        let payerPubkey = authorityPubkey;

        if (hasRelayer) {
          relayerKeypair = Keypair.fromSecretKey(bs58.decode(config.relayer.privateKey));
          payerPubkey = relayerKeypair.publicKey;
          app.log.info(`Gas-sponsored registration: relayer=${payerPubkey.toBase58()} pays for user=${authority}`);
        } else {
          app.log.warn('No RELAYER_PRIVATE_KEY set — user must pay gas');
        }

        const keys = [
          { pubkey: configPda, isSigner: false, isWritable: true },
          { pubkey: nameRecordPda, isSigner: false, isWritable: true },
          { pubkey: feeTreasury, isSigner: false, isWritable: true },
          { pubkey: payerPubkey, isSigner: true, isWritable: true },
          { pubkey: authorityPubkey, isSigner: true, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ];

        const ix = new TransactionInstruction({ programId, keys, data: regData });
        const tx = new Transaction().add(ix);
        tx.feePayer = payerPubkey;
        tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

        if (relayerKeypair) {
          tx.partialSign(relayerKeypair);
        }

        const serializedTx = tx.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        }).toString('base64');

        return reply.send({
          success: true,
          transaction: serializedTx,
          nameRecord: nameRecordPda.toBase58(),
          requiresUserSignature: true,
          payerIsRelayer: hasRelayer,
        });
      } catch (err: any) {
        app.log.error(err, 'Name registration tx build failed');
        const errorMsg = err.message?.includes('already in use')
          ? 'Name already registered on-chain'
          : err.message || 'Registration failed';
        return reply.status(500).send({ success: false, error: errorMsg });
      }
    },
  );

  /**
   * GET /names/by-authority/:address
   *
   * Look up if a wallet address has any registered names.
   * Uses getProgramAccounts with a memcmp filter on the authority field
   * (authority is at offset 8 after the Anchor discriminator).
   */
  app.get<{ Params: { address: string } }>(
    '/by-authority/:address',
    async (request, reply) => {
      const { address } = request.params;

      try {
        new PublicKey(address);
      } catch {
        return reply.status(400).send({ error: 'Invalid address' });
      }

      try {
        const conn = getConnection();
        const programId = new PublicKey(config.solana.nameRegistryProgramId);

        const accounts = await conn.getProgramAccounts(programId, {
          filters: [
            { memcmp: { offset: 8, bytes: address } },
          ],
        });

        if (accounts.length === 0) {
          return reply.send({ registered: false, names: [] });
        }

        const names = await Promise.all(accounts.map(async (acc) => {
          const data = acc.account.data;
          const nameHashB58 = bs58.encode(data.subarray(40, 72));
          const scanPubkey = bs58.encode(data.subarray(72, 104));
          const spendPubkey = bs58.encode(data.subarray(104, 136));

          let username: string | null = null;
          try {
            const profile = await prisma.profile.findUnique({ where: { nameHash: nameHashB58 } });
            username = profile?.username ?? null;
          } catch {}

          return { pda: acc.pubkey.toBase58(), nameHash: nameHashB58, scanPubkey, spendPubkey, username };
        }));

        return reply.send({ registered: true, names });
      } catch (err: any) {
        return reply.send({ registered: false, names: [], error: err.message });
      }
    },
  );

  /**
   * GET /names/:username/deposit-paths
   *
   * List deposit paths for a registered name (off-chain indexed).
   * Returns the deposit_index from the NameRecord so clients know
   * how many paths exist.
   */
  app.get<{ Params: { username: string } }>(
    '/:username/deposit-paths',
    async (request, reply) => {
      const { username } = request.params;

      const resolved = await resolveUsername(getConnection(), username);

      if (!resolved) {
        return reply.status(404).send({ error: 'Name not found' });
      }

      return reply.send({
        username,
        depositIndex: resolved.depositIndex,
      });
    },
  );
}

function isValidName(name: string): boolean {
  if (name.length < 3 || name.length > 32) return false;
  if (name[0] === '_' || name[0] === '-') return false;
  return /^[a-z0-9_-]+$/.test(name);
}
