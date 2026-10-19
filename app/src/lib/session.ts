import {
  compareMatchKeys, type FormDef, type FormKind, matchLabel, parseMatchKey, type ScheduleMatch,
  type ScoutRecord, type Slot, SLOTS,
} from '@stingr/shared';

export function slotLabel(slot: Slot): string {
  return `${slot.startsWith('red') ? 'Red' : 'Blue'} ${slot.slice(-1)}`;
}

export function latestForm(forms: FormDef[], kind: FormKind): FormDef | null {
  return forms.filter(f => f.kind === kind).reduce<FormDef | null>((best, f) => (!best || f.version > best.version ? f : best), null);
}

export function formVersion(forms: FormDef[], kind: FormKind, version: number): FormDef | null {
  return forms.find(f => f.kind === kind && f.version === version) ?? null;
}

export function teamFor(schedule: ScheduleMatch[], matchKey: string, slot: Slot): number | null {
  const m = schedule.find(x => x.matchKey === matchKey);
  if (!m) return null;
  const i = SLOTS.indexOf(slot);
  const team = i < 3 ? m.red[i] : m.blue[i - 3];
  return team > 0 ? team : null;
}

export function nextMatchKey(schedule: ScheduleMatch[], records: ScoutRecord[]): string {
  const done = records
    .filter(r => r.kind === 'match' && r.matchKey)
    .map(r => r.matchKey as string)
    .sort(compareMatchKeys);
  const last = done.at(-1);
  const keys = schedule.map(m => m.matchKey).sort(compareMatchKeys);
  if (keys.length) {
    if (!last) return keys[0];
    return keys.find(k => compareMatchKeys(k, last) > 0) ?? keys[keys.length - 1];
  }
  if (!last) return 'qm1';
  const p = parseMatchKey(last);
  return p?.level === 'qm' ? `qm${p.match + 1}` : last;
}

export function pitStatus(records: ScoutRecord[], team: number): PitStatus {
  const recs = records.filter(r => r.kind === 'pit' && r.team === team);
  if (recs.length === 0) return 'none';
  return recs.some(r => !r.noShow) ? 'done' : 'noshow';
}

export function pitTeams(configTeams: number[], extra: number[], records: ScoutRecord[]): number[] {
  const pit = records.filter(r => r.kind === 'pit').map(r => r.team);
  return [...new Set([...configTeams, ...extra, ...pit])].sort((a, b) => a - b);
}

export type PitStatus = 'none' | 'done' | 'noshow';
export interface PitView { search: string; show: 'all' | PitStatus; sort: 'number' | 'name' | 'status' }
const STATUS_ORDER: Record<PitStatus, number> = { none: 0, noshow: 1, done: 2 }; // still to do first

/** The pit list as the scout asked for it: filtered by status and a search on number or name, then sorted. */
export function arrangePitTeams<R extends { team: number; status: PitStatus }>(rows: R[], names: Record<number, string>, view: PitView): R[] {
  const q = view.search.trim().toLowerCase().replace(/^frc/, '');
  const byNumber = (a: R, b: R) => a.team - b.team;
  const compare = {
    number: byNumber,
    name: (a: R, b: R) => {
      const x = names[a.team];
      const y = names[b.team];
      if (x && y) return x.localeCompare(y) || byNumber(a, b);
      return x ? -1 : y ? 1 : byNumber(a, b); // unnamed teams last
    },
    status: (a: R, b: R) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byNumber(a, b),
  }[view.sort];
  return rows
    .filter(r => view.show === 'all' || r.status === view.show)
    .filter(r => !q || String(r.team).includes(q) || (names[r.team] ?? '').toLowerCase().includes(q))
    .toSorted(compare);
}

export function recordTitle(rec: ScoutRecord): string {
  if (rec.kind === 'pit') return `Pit · Team ${rec.team}`;
  return `${matchLabel(rec.matchKey ?? '')} · ${rec.slot ? slotLabel(rec.slot) : '?'} · Team ${rec.team}`;
}

export function parseTeamInput(text: string): number | null {
  const s = text.trim().replace(/^frc/i, '');
  if (!/^\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}
