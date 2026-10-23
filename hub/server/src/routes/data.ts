import { compareMatchKeys, decodeRecordData, type FormKind, type ScoutRecord } from '@stingr/shared';
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { buildCoverage } from '../coverage';
import { buildMissedReport } from '../missed';
import { allianceFields } from '../store/alliance';
import { allianceMatches, allianceShares } from './alliance';
import { acknowledgeMissed, missedAcks, unacknowledgeMissed } from '../store/missedAcks';
import { bodyObject, HttpError, requireEvent } from '../http';
import { getForm, latestForm } from '../store/forms';
import { currentRecords } from '../store/records';
import { listSchedule, listTeams } from '../store/schedule';
import { buildTeamSummaries, eventAverages } from '../summaries';
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

  const missedReport = (eventKey: string) => buildMissedReport(
    currentRecords(ctx.db, eventKey, 'match'), v => getForm(ctx.db, 'match', v), latestForm(ctx.db, 'match') ?? null, missedAcks(ctx.db, eventKey),
  );

  app.get('/api/missed', async () => missedReport(requireEvent(ctx.db).key));

  app.post('/api/missed/:id/ack', async req => {
    const ev = requireEvent(ctx.db);
    const { id } = req.params as { id: string };
    const report = missedReport(ev.key);
    const concern = [...report.questions, ...report.scouts].find(c => c.id === id);
    if (!concern) throw new HttpError(404, 'That is not a current concern');
    acknowledgeMissed(ctx.db, ev.key, id, concern.missed, ctx.now());
    return missedReport(ev.key);
  });

  app.delete('/api/missed/:id/ack', async req => {
    const ev = requireEvent(ctx.db);
    unacknowledgeMissed(ctx.db, ev.key, (req.params as { id: string }).id);
    return missedReport(ev.key);
  });

  app.get('/api/summaries', async () => {
    const ev = requireEvent(ctx.db);
    const form = latestForm(ctx.db, 'match') ?? null;
    return {
      form,
      summaries: buildTeamSummaries(listTeams(ctx.db, ev.key), form, currentRecords(ctx.db, ev.key, 'match'), currentRecords(ctx.db, ev.key, 'pit')),
      scoreShares: allianceShares(allianceMatches(ctx.db, ev.key), [])['score'], // each team's estimated share of the alliance score
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
    const fields = allianceFields(ctx.db);
    const alliances = allianceMatches(ctx.db, ev.key);
    const byItem = allianceShares(alliances, fields);
    const mine = alliances.flatMap(m => (['red', 'blue'] as const).filter(s => m[s].teams.includes(team)).map(s => m[s].values));
    const allianceSharesForTeam = [{ key: 'score', label: 'Score' }, ...fields].map(f => ({
      item: f.key, label: f.label, value: byItem[f.key]?.[team] ?? null, results: mine.filter(v => v[f.key] !== undefined).length,
    }));
    return {
      summary, matchForm, pitForm: latestForm(ctx.db, 'pit') ?? null, matchRecords, pitRecords,
      eventAverages: eventAverages(matchForm, currentRecords(ctx.db, ev.key, 'match')), allianceShares: allianceSharesForTeam,
      allianceByMatch: Object.fromEntries(alliances.flatMap(m => (['red', 'blue'] as const).filter(s => m[s].teams.includes(team)).map(side => {
        const other = side === 'red' ? 'blue' : 'red';
        return [m.matchKey, {
          side, score: m[side].values.score?.value ?? null, opponent: m[other].values.score?.value ?? null,
          fields: Object.fromEntries(fields.map(f => [f.key, m[side].values[f.key]?.value ?? null])),
        }];
      }))),
    };
  });
}
