import { FastifyInstance } from 'fastify';
import { Connection } from '@solana/web3.js';
import { config } from '../config';
import { resolveUsername } from '../services/name-resolver';

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
