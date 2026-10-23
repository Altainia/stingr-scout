import { type AllianceField, type AllianceMatch, type AllianceSide, compareMatchKeys, estimateShares, normalizeMatchKey } from '@stingr/shared';
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { type Db, tx } from '../db';
import { bodyObject, HttpError, requireEvent } from '../http';
import { ALLIANCE_FIELD_KEY, allianceFields, allianceValues, setAllianceFields, setAllianceValue } from '../store/alliance';
import { listSchedule } from '../store/schedule';
import { getSetting, setSetting } from '../store/settings';
import { fetchTbaResults } from '../tba';

const SIDES: AllianceSide[] = ['red', 'blue'];

/** Every scheduled match (and any match with results) with its alliances' teams and values. */
export function allianceMatches(db: Db, eventKey: string): AllianceMatch[] {
  const values = allianceValues(db, eventKey);
  const matches = new Map<string, AllianceMatch>();
  for (const m of listSchedule(db, eventKey)) {
    const v = values.get(m.matchKey);
    matches.set(m.matchKey, { matchKey: m.matchKey, red: { teams: [...m.red], values: v?.red ?? {} }, blue: { teams: [...m.blue], values: v?.blue ?? {} } });
  }
  for (const [key, v] of values) if (!matches.has(key)) matches.set(key, { matchKey: key, red: { teams: [], values: v.red }, blue: { teams: [], values: v.blue } });
  return [...matches.values()].sort((a, b) => compareMatchKeys(a.matchKey, b.matchKey));
}

/** Each team's estimated share of the score and of each field (null until it has enough results). */
export function allianceShares(matches: AllianceMatch[], fields: AllianceField[]): Record<string, Record<number, number | null>> {
  const out: Record<string, Record<number, number | null>> = {};
  for (const item of ['score', ...fields.map(f => f.key)]) {
    // Qualification matches only (playoff alliances aren't drawn at random), and only alliances of three different teams.
    const results = matches.filter(m => m.matchKey.startsWith('qm')).flatMap(m => SIDES
      .filter(s => m[s].teams.length === 3 && new Set(m[s].teams).size === 3 && m[s].teams.every(t => t > 0))
      .map(s => ({ teams: m[s].teams, value: m[s].values[item]?.value ?? null })));
    out[item] = Object.fromEntries(estimateShares(results));
  }
  return out;
}

function parseFields(body: unknown): AllianceField[] {
  if (!Array.isArray(body)) throw new HttpError(400, 'Send the list of alliance fields');
  const seen = new Set<string>();
  return body.map((raw, i) => {
    const f = bodyObject(raw);
    const key = typeof f.key === 'string' ? f.key.trim() : '';
    const label = typeof f.label === 'string' ? f.label.trim() : '';
    if (!ALLIANCE_FIELD_KEY.test(key) || key === 'score') throw new HttpError(400, `Field ${i + 1}: the key must start with a lowercase letter and use only a-z, 0-9 and _ (and can't be "score")`);
    if (seen.has(key)) throw new HttpError(400, `Field ${i + 1}: another field already uses the key "${key}"`);
    if (!label) throw new HttpError(400, `Field ${i + 1}: the label is empty`);
    seen.add(key);
    const tba = typeof f.tba === 'string' ? f.tba.trim() : '';
    return { key, label, ...(tba ? { tba } : {}) };
  });
}

export function allianceRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.get('/api/alliance', async () => {
    const ev = requireEvent(ctx.db);
    const fields = allianceFields(ctx.db);
    const matches = allianceMatches(ctx.db, ev.key);
    const items = getSetting(ctx.db, 'tba_breakdown_items');
    return { fields, matches, shares: allianceShares(matches, fields), tbaItems: items ? (JSON.parse(items) as string[]) : [] };
  });

  app.put('/api/alliance/:match/:alliance/:item', async req => {
    const ev = requireEvent(ctx.db);
    const params = req.params as { match: string; alliance: string; item: string };
    const { alliance, item } = params;
    const match = normalizeMatchKey(params.match);
    if (!match) throw new HttpError(400, `"${params.match}" isn't a match (for example qm12 or sf1m1)`);
    if (alliance !== 'red' && alliance !== 'blue') throw new HttpError(400, 'The alliance must be red or blue');
    if (item !== 'score' && !allianceFields(ctx.db).some(f => f.key === item)) throw new HttpError(400, `There is no alliance field "${item}"`);
    const value = bodyObject(req.body).value;
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new HttpError(400, 'The value must be a number, or null to clear it');
    setAllianceValue(ctx.db, ev.key, match, alliance, item, value, 'manual', ctx.now());
    return { ok: true };
  });

  app.post('/api/alliance/tba', async () => {
    const ev = requireEvent(ctx.db);
    const apiKey = getSetting(ctx.db, 'tba_key');
    if (!apiKey) throw new HttpError(400, 'Enter a TBA API key in Settings first');
    let data: Awaited<ReturnType<typeof fetchTbaResults>>;
    try {
      data = await fetchTbaResults(ev.key, apiKey, ctx.fetch);
    } catch (e) {
      throw new HttpError(502, (e as Error).message);
    }
    const fields = allianceFields(ctx.db);
    const existing = allianceValues(ctx.db, ev.key);
    let filled = 0;
    tx(ctx.db, () => {
      for (const m of data.played) {
        for (const side of SIDES) {
          const typed = (item: string) => existing.get(m.matchKey)?.[side][item]?.source === 'manual'; // a typed value wins
          const put = (item: string, value: number | undefined) => {
            if (value === undefined || typed(item)) return;
            setAllianceValue(ctx.db, ev.key, m.matchKey, side, item, value, 'tba', ctx.now());
            filled++;
          };
          put('score', m[side].score);
          for (const f of fields) if (f.tba) put(f.key, m[side].breakdown[f.tba]);
        }
      }
      setSetting(ctx.db, 'tba_breakdown_items', data.items.length ? JSON.stringify(data.items) : null);
    });
    return { played: data.played.length, filled };
  });

  app.get('/api/alliance-fields', async () => allianceFields(ctx.db));

  app.put('/api/alliance-fields', async req => {
    const fields = parseFields(req.body);
    setAllianceFields(ctx.db, fields);
    return allianceFields(ctx.db);
  });
}
