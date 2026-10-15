import { type FormDef, validateFormDef } from '@stingr/shared';
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { bodyObject, HttpError, parseKind } from '../http';
import { discardDraft, getDraft, hasDraft, listForms, publishDraft, saveDraft } from '../store/forms';

export function formRoutes(app: FastifyInstance, ctx: HubContext): void {
  const kindParam = (params: unknown) => parseKind((params as { kind: string }).kind);

  app.get('/api/forms', async () => listForms(ctx.db));

  app.get('/api/forms/:kind/draft', async req => {
    const kind = kindParam(req.params);
    return { draft: getDraft(ctx.db, kind), isDraft: hasDraft(ctx.db, kind) };
  });

  app.put('/api/forms/:kind/draft', async req => {
    const kind = kindParam(req.params);
    const b = bodyObject(req.body);
    if (!Array.isArray(b.sections) || typeof b.assets !== 'object' || b.assets === null) {
      throw new HttpError(400, 'A form needs sections and assets');
    }
    const form = { ...(b as unknown as FormDef), kind, version: 0 };
    let check: ReturnType<typeof validateFormDef>;
    try {
      check = validateFormDef(form, listForms(ctx.db, kind));
    } catch {
      throw new HttpError(400, 'The form is malformed');
    }
    saveDraft(ctx.db, form, ctx.now());
    return check;
  });

  app.delete('/api/forms/:kind/draft', async req => {
    const kind = kindParam(req.params);
    discardDraft(ctx.db, kind);
    return { draft: getDraft(ctx.db, kind), isDraft: false };
  });

  app.post('/api/forms/:kind/publish', async (req, reply) => {
    const res = publishDraft(ctx.db, kindParam(req.params), ctx.now());
    return res.ok ? res : reply.status(422).send(res);
  });
}
