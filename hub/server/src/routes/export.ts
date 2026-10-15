import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { matchesCsv, pitCsv, teamsCsv } from '../export';
import { HttpError, requireEvent } from '../http';
import { latestForm, listForms } from '../store/forms';
import { currentRecords } from '../store/records';
import { listTeams } from '../store/schedule';
import { buildTeamSummaries } from '../summaries';

export function exportRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.get('/api/export/:file', async (req, reply) => {
    const ev = requireEvent(ctx.db);
    const { file } = req.params as { file: string };
    let csv: string;
    switch (file) {
      case 'matches.csv':
        csv = matchesCsv(ev.key, listForms(ctx.db, 'match'), currentRecords(ctx.db, ev.key, 'match'));
        break;
      case 'pit.csv':
        csv = pitCsv(ev.key, listForms(ctx.db, 'pit'), currentRecords(ctx.db, ev.key, 'pit'));
        break;
      case 'teams.csv': {
        const form = latestForm(ctx.db, 'match') ?? null;
        const summaries = buildTeamSummaries(listTeams(ctx.db, ev.key), form, currentRecords(ctx.db, ev.key, 'match'), currentRecords(ctx.db, ev.key, 'pit'));
        csv = teamsCsv(summaries, form);
        break;
      }
      default:
        throw new HttpError(404, `Unknown export "${file}"`);
    }
    return reply
      .type('text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${ev.key}-${file}"`)
      .send(csv);
  });
}
