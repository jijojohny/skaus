import { FastifyInstance } from 'fastify';
import { createReadStream, existsSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { join, extname } from 'path';
import { randomBytes } from 'crypto';
import { config } from '../config';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const MAX_BYTES = 1 * 1024 * 1024; // 1 MB decoded

export async function mediaRoutes(app: FastifyInstance) {
  /**
   * POST /media/avatar
   *
   * Upload an avatar image. Body: { username, base64, contentType }
   * base64 is the raw base64 string (no data-URI prefix).
   * Returns: { url } pointing to GET /media/avatar/:username
   */
  app.post<{
    Body: { username: string; base64: string; contentType: string };
  }>(
    '/avatar',
    async (request, reply) => {
      const { username, base64, contentType } = request.body;

      if (!username || !/^[a-z0-9_-]{1,32}$/i.test(username)) {
        return reply.status(400).send({ error: 'Invalid username' });
      }

      const ext = ALLOWED_TYPES[contentType];
      if (!ext) {
        return reply.status(400).send({ error: 'contentType must be image/jpeg, image/png, or image/webp' });
      }

      let buf: Buffer;
      try {
        buf = Buffer.from(base64, 'base64');
      } catch {
        return reply.status(400).send({ error: 'Invalid base64 data' });
      }

      if (buf.byteLength > MAX_BYTES) {
        return reply.status(413).send({ error: 'Image must be under 1 MB after decoding' });
      }

      // Validate magic bytes for image type
      if (contentType === 'image/jpeg' && !(buf[0] === 0xff && buf[1] === 0xd8)) {
        return reply.status(400).send({ error: 'File does not match declared content type' });
      }
      if (contentType === 'image/png' && buf.slice(0, 4).toString('hex') !== '89504e47') {
        return reply.status(400).send({ error: 'File does not match declared content type' });
      }

      const avatarsDir = join(config.uploadsDir, 'avatars');
      await mkdir(avatarsDir, { recursive: true });

      const filename = `${username.toLowerCase()}-${randomBytes(4).toString('hex')}${ext}`;
      await writeFile(join(avatarsDir, filename), buf);

      const url = `${config.gatewayPublicUrl}/media/avatar/${filename}`;
      return reply.send({ url });
    },
  );

  /**
   * GET /media/avatar/:filename
   * Serve a stored avatar image.
   */
  app.get<{ Params: { filename: string } }>(
    '/avatar/:filename',
    async (request, reply) => {
      const { filename } = request.params;

      // Only allow safe filename characters to prevent path traversal
      if (!/^[a-z0-9_-]+\.(jpg|png|webp)$/i.test(filename)) {
        return reply.status(400).send({ error: 'Invalid filename' });
      }

      const filePath = join(config.uploadsDir, 'avatars', filename);
      if (!existsSync(filePath)) {
        return reply.status(404).send({ error: 'Not found' });
      }

      const ext = extname(filename).toLowerCase();
      const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
      reply.header('Content-Type', mimeMap[ext] || 'application/octet-stream');
      reply.header('Cache-Control', 'public, max-age=86400');
      return reply.send(createReadStream(filePath));
    },
  );
}
