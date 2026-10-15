import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { HttpError } from '../http';
import { getPhoto, putPhoto } from '../store/photos';
import { handleSync, parseSyncRequest } from '../sync';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function syncRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.get('/api/ping', async () => ({ hub: 'stingr-scout', appBuild: ctx.appBuild }));

  app.post('/api/sync', async req => {
    const parsed = parseSyncRequest(req.body);
    if (typeof parsed === 'string') throw new HttpError(400, parsed);
    return handleSync(ctx.db, parsed, ctx.appBuild, ctx.now());
  });

  app.put('/api/photos/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { recordId } = req.query as { recordId?: string };
    const mime = (req.headers['content-type'] ?? '').split(';')[0].trim();
    if (!PHOTO_TYPES.includes(mime)) throw new HttpError(415, 'Photos must be JPEG, PNG or WebP');
    if (!recordId) throw new HttpError(400, 'recordId is required');
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'The photo is empty');
    putPhoto(ctx.db, id, recordId, mime, req.body as Buffer, ctx.now());
    return reply.status(204).send();
  });

  app.get('/api/photos/:id', async (req, reply) => {
    const photo = getPhoto(ctx.db, (req.params as { id: string }).id);
    if (!photo) throw new HttpError(404, 'No such photo');
    return reply.type(photo.mime).header('cache-control', 'max-age=31536000, immutable').send(Buffer.from(photo.data));
  });
}
