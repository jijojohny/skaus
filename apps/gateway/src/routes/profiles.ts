import { FastifyInstance } from 'fastify';
import {
  getProfileByUsername,
  upsertProfile,
  searchProfiles,
  listProfiles,
} from '../services/profile';
import type { CompressedProfile } from '@skaus/types';

export async function profileRoutes(app: FastifyInstance) {
  /**
   * GET /profiles/:username
   *
   * Fetch a profile by username.
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
   * PUT /profiles/:username
   *
   * Create or update a profile.
   */
  app.put<{ Params: { username: string }; Body: CompressedProfile }>(
    '/:username',
    async (request, reply) => {
      const { username } = request.params;
      const profile = request.body;

      if (!profile.displayName) {
        return reply.status(400).send({ error: 'displayName is required' });
      }

      await upsertProfile(username, {
        ...profile,
        version: (profile.version || 0) + 1,
        updatedAt: Date.now(),
      });

      return reply.send({ success: true, username });
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
