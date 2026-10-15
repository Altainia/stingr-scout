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

export function pitStatus(records: ScoutRecord[], team: number): 'none' | 'done' | 'noshow' {
  const recs = records.filter(r => r.kind === 'pit' && r.team === team);
  if (recs.length === 0) return 'none';
  return recs.some(r => !r.noShow) ? 'done' : 'noshow';
}

export function pitTeams(configTeams: number[], extra: number[], records: ScoutRecord[]): number[] {
  const pit = records.filter(r => r.kind === 'pit').map(r => r.team);
  return [...new Set([...configTeams, ...extra, ...pit])].sort((a, b) => a - b);
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
