import {
  allQuestions, type AnswerValue, compareMatchKeys, type FormDef, type Point, recordPoints,
  type ScoutRecord, type Slot, SLOTS, summaryKind,
} from '@stingr/shared';
import type { TeamSummary } from './summaries';

type Cell = string | number | boolean | null | undefined;

/** Spreadsheet apps treat text cells starting with these characters as formulas. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function formatAnswer(v: AnswerValue | undefined): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : `${(x as Point).x},${(x as Point).y}`)).join(';');
  return v;
}

const round2 = (n: number | null | undefined): number | null => (n === null || n === undefined ? null : Math.round(n * 100) / 100);
const pct = (f: number | null): number | null => (f === null ? null : Math.round(f * 1000) / 10);
const newest = (forms: FormDef[]): FormDef | undefined =>
  forms.reduce<FormDef | undefined>((best, f) => (!best || f.version > best.version ? f : best), undefined);

export function questionKeyColumns(forms: FormDef[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const f of [...forms].sort((a, b) => b.version - a.version)) {
    for (const q of allQuestions(f)) {
      if (!seen.has(q.key)) {
        seen.add(q.key);
        keys.push(q.key);
      }
    }
  }
  return keys;
}

export function matchesCsv(eventKey: string, forms: FormDef[], records: ScoutRecord[]): string {
  const latest = newest(forms);
  const keys = questionKeyColumns(forms);
  const header = ['event', 'match', 'slot', 'team', 'scout', 'device', 'no_show', 'est_points', 'missed', 'revision', 'updated_at', ...keys];
  const sorted = [...records].sort((a, b) =>
    compareMatchKeys(a.matchKey ?? '', b.matchKey ?? '') || SLOTS.indexOf(a.slot as Slot) - SLOTS.indexOf(b.slot as Slot));
  const rows = sorted.map(r => [
    eventKey, r.matchKey, r.slot, r.team, r.scout, r.deviceId, r.noShow,
    latest ? round2(recordPoints(latest, r)) : null,
    r.missed.join(';'), r.revision, r.updatedAt,
    ...keys.map(k => formatAnswer(r.answers[k])),
  ]);
  return toCsv(header, rows);
}

export function pitCsv(eventKey: string, forms: FormDef[], records: ScoutRecord[]): string {
  const keys = questionKeyColumns(forms);
  const header = ['event', 'team', 'scout', 'device', 'no_show', 'photos', 'missed', 'revision', 'updated_at', ...keys];
  const sorted = [...records].sort((a, b) => a.team - b.team || a.updatedAt.localeCompare(b.updatedAt));
  const rows = sorted.map(r => [
    eventKey, r.team, r.scout, r.deviceId, r.noShow, r.photoIds.length, r.missed.join(';'), r.revision, r.updatedAt,
    ...keys.map(k => formatAnswer(r.answers[k])),
  ]);
  return toCsv(header, rows);
}

type Column = { name: string; get: (s: TeamSummary) => Cell };

export function teamsCsv(summaries: TeamSummary[], form: FormDef | null): string {
  const cols: Column[] = [
    { name: 'team', get: s => s.team },
    { name: 'match_records', get: s => s.matchRecords },
    { name: 'no_shows', get: s => s.noShows },
    { name: 'no_show_pct', get: s => pct(s.noShowPct) },
    { name: 'est_points', get: s => round2(s.estPoints) },
    { name: 'pit', get: s => s.pit },
  ];
  if (form) {
    for (const sec of form.sections) cols.push({ name: `est_${sec.id}`, get: s => round2(s.estPointsBySection[sec.id]) });
    for (const q of allQuestions(form)) {
      const kind = summaryKind(q);
      if (kind === 'avg') {
        cols.push({ name: `${q.key}_avg`, get: s => { const st = s.stats[q.key]; return st?.kind === 'avg' ? round2(st.avg) : null; } });
        cols.push({ name: `${q.key}_max`, get: s => { const st = s.stats[q.key]; return st?.kind === 'avg' ? st.max : null; } });
      } else if (kind === 'pct') {
        cols.push({ name: `${q.key}_pct`, get: s => { const st = s.stats[q.key]; return st?.kind === 'pct' ? pct(st.pct) : null; } });
      } else if (kind === 'distribution' && (q.type === 'choice' || q.type === 'multi')) {
        for (const o of q.options) {
          cols.push({
            name: `${q.key}_${o.value}_pct`,
            get: s => { const st = s.stats[q.key]; return st?.kind === 'distribution' && st.n ? pct((st.counts[o.value] ?? 0) / st.n) : null; },
          });
        }
      }
    }
  }
  return toCsv(cols.map(c => c.name), summaries.map(s => cols.map(c => c.get(s))));
}
