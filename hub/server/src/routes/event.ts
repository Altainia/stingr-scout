import type { Side } from '@stingr/shared';
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { bodyObject, HttpError, requireEvent } from '../http';
import { currentEvent, listEvents, setCurrentEvent, upsertEvent } from '../store/events';
import { addTeam, listSchedule, listTeams, removeTeam } from '../store/schedule';
import { getSetting, setSetting } from '../store/settings';

const EVENT_KEY_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;

export function parseTeam(value: unknown): number {
  const n = typeof value === 'string' ? Number(value.trim().replace(/^frc/i, '')) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 99999) throw new HttpError(400, 'Team must be a number from 1 to 99999');
  return n;
}

export function eventRoutes(app: FastifyInstance, ctx: HubContext): void {
  const eventsView = () => ({ events: listEvents(ctx.db), current: currentEvent(ctx.db) });

  app.get('/api/events', async () => eventsView());

  app.post('/api/events', async req => {
    const b = bodyObject(req.body);
    const key = typeof b.key === 'string' ? b.key.trim().toLowerCase() : '';
    if (!EVENT_KEY_RE.test(key)) {
      throw new HttpError(400, 'Event key must be 2-32 characters: lowercase letters, digits, - or _ (for example 2027ohcl)');
    }
    let redSide: Side | undefined;
    if (b.redSide !== undefined) {
      if (b.redSide !== 'left' && b.redSide !== 'right') throw new HttpError(400, "redSide must be 'left' or 'right'");
      redSide = b.redSide;
    }
    const existing = listEvents(ctx.db).find(e => e.key === key);
    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : existing?.name ?? key;
    upsertEvent(ctx.db, { key, name, redSide });
    if (!currentEvent(ctx.db)) setCurrentEvent(ctx.db, key);
    return eventsView();
  });

  app.put('/api/events/current', async req => {
    const key = String(bodyObject(req.body).key ?? '');
    if (!listEvents(ctx.db).some(e => e.key === key)) throw new HttpError(404, `Unknown event "${key}"`);
    setCurrentEvent(ctx.db, key);
    return eventsView();
  });

  app.get('/api/schedule', async () => listSchedule(ctx.db, requireEvent(ctx.db).key));

  app.get('/api/teams', async () => listTeams(ctx.db, requireEvent(ctx.db).key));

  app.post('/api/teams', async req => {
    const ev = requireEvent(ctx.db);
    addTeam(ctx.db, ev.key, parseTeam(bodyObject(req.body).team));
    return listTeams(ctx.db, ev.key);
  });

  app.delete('/api/teams/:team', async req => {
    const ev = requireEvent(ctx.db);
    removeTeam(ctx.db, ev.key, parseTeam((req.params as { team: string }).team));
    return listTeams(ctx.db, ev.key);
  });

  app.get('/api/settings', async () => ({ tbaKeySet: getSetting(ctx.db, 'tba_key') !== null }));

  app.put('/api/settings', async req => {
    const b = bodyObject(req.body);
    if (typeof b.tbaKey === 'string') setSetting(ctx.db, 'tba_key', b.tbaKey.trim() || null);
    return { tbaKeySet: getSetting(ctx.db, 'tba_key') !== null };
  });
}
