import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { HttpError, requireEvent } from '../http';
import { checkScheduleMatch, parseScheduleCsv } from '../scheduleIo';
import { upsertEvent } from '../store/events';
import { addTeam, listSchedule, replaceSchedule } from '../store/schedule';
import { getSetting } from '../store/settings';
import { setTeamName } from '../store/teamNames';
import { fetchTbaEvent } from '../tba';

export function scheduleImportRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.put('/api/schedule', async req => {
    const ev = requireEvent(ctx.db);
    if (!Array.isArray(req.body)) throw new HttpError(400, 'Expected a list of matches');
    const checked = req.body.map(checkScheduleMatch);
    const problem = checked.find((c): c is string => typeof c === 'string');
    if (problem) throw new HttpError(400, problem);
    const matches = checked as Exclude<(typeof checked)[number], string>[];
    if (new Set(matches.map(m => m.matchKey)).size !== matches.length) throw new HttpError(400, 'A match appears twice');
    replaceSchedule(ctx.db, ev.key, matches);
    return listSchedule(ctx.db, ev.key);
  });

  app.post('/api/schedule/csv', async (req, reply) => {
    const ev = requireEvent(ctx.db);
    if (typeof req.body !== 'string') throw new HttpError(415, 'Send the schedule as text/csv');
    const { matches, errors } = parseScheduleCsv(req.body);
    if (errors.length) return reply.status(422).send({ errors });
    replaceSchedule(ctx.db, ev.key, matches);
    return { matches: matches.length };
  });

  app.post('/api/schedule/tba', async () => {
    const ev = requireEvent(ctx.db);
    const apiKey = getSetting(ctx.db, 'tba_key');
    if (!apiKey) throw new HttpError(400, 'Enter a TBA API key in Settings first');
    let data: Awaited<ReturnType<typeof fetchTbaEvent>>;
    try {
      data = await fetchTbaEvent(ev.key, apiKey, ctx.fetch);
    } catch (e) {
      throw new HttpError(502, (e as Error).message);
    }
    if (data.name) upsertEvent(ctx.db, { key: ev.key, name: data.name });
    for (const t of data.teams) addTeam(ctx.db, ev.key, t);
    for (const [t, name] of Object.entries(data.names)) setTeamName(ctx.db, Number(t), name); // keeps names TBA doesn't have
    // Before the schedule is released TBA returns no matches; never wipe an imported schedule with nothing.
    const scheduleReplaced = data.matches.length > 0;
    if (scheduleReplaced) replaceSchedule(ctx.db, ev.key, data.matches);
    return { matches: data.matches.length, teams: data.teams.length, scheduleReplaced };
  });
}
