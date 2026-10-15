import { compareMatchKeys, decodeRecordData, type FormKind, type ScoutRecord } from '@stingr/shared';
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { buildCoverage } from '../coverage';
import { bodyObject, HttpError, requireEvent } from '../http';
import { getForm, latestForm } from '../store/forms';
import { currentRecords } from '../store/records';
import { listSchedule, listTeams } from '../store/schedule';
import { buildTeamSummaries } from '../summaries';
import { ingestRecord } from '../sync';
import { parseTeam } from './event';

export function dataRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.post('/api/qr', async (req, reply) => {
    const { text } = bodyObject(req.body);
    if (typeof text !== 'string') throw new HttpError(400, 'Send { text } with the scanned QR text');
    const res = ctx.qr.add(text);
    if (res.status === 'invalid') return reply.status(422).send({ status: 'invalid', reason: res.reason });
    if (res.status === 'partial') return res;
    let rec: ScoutRecord;
    try {
      rec = await decodeRecordData(res.data, (kind: FormKind, version: number) => getForm(ctx.db, kind, version));
    } catch (e) {
      return reply.status(422).send({ status: 'invalid', reason: (e as Error).message });
    }
    const ingest = ingestRecord(ctx.db, rec, 'qr', ctx.now());
    if (!ingest.ok) return reply.status(422).send({ status: 'invalid', reason: ingest.reason });
    const { id, revision, kind, team, matchKey, slot, scout } = ingest.record;
    return { status: ingest.outcome === 'inserted' ? 'stored' : 'duplicate', record: { id, revision, kind, team, matchKey, slot, scout } };
  });

  app.get('/api/coverage', async () => {
    const ev = requireEvent(ctx.db);
    return buildCoverage(listSchedule(ctx.db, ev.key), currentRecords(ctx.db, ev.key, 'match'));
  });

  app.get('/api/summaries', async () => {
    const ev = requireEvent(ctx.db);
    const form = latestForm(ctx.db, 'match') ?? null;
    return {
      form,
      summaries: buildTeamSummaries(listTeams(ctx.db, ev.key), form, currentRecords(ctx.db, ev.key, 'match'), currentRecords(ctx.db, ev.key, 'pit')),
    };
  });

  app.get('/api/summaries/:team', async req => {
    const ev = requireEvent(ctx.db);
    const team = parseTeam((req.params as { team: string }).team);
    const matchForm = latestForm(ctx.db, 'match') ?? null;
    const matchRecords = currentRecords(ctx.db, ev.key, 'match')
      .filter(r => r.team === team)
      .sort((a, b) => compareMatchKeys(a.matchKey ?? '', b.matchKey ?? ''));
    const pitRecords = currentRecords(ctx.db, ev.key, 'pit').filter(r => r.team === team);
    const [summary] = buildTeamSummaries([team], matchForm, matchRecords, pitRecords);
    return { summary, matchForm, pitForm: latestForm(ctx.db, 'pit') ?? null, matchRecords, pitRecords };
  });
}
