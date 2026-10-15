import { matchLabel } from '@stingr/shared';

export const pct = (f: number | null | undefined): string => (f === null || f === undefined ? '—' : `${Math.round(f * 100)}%`);

export const num = (n: number | null | undefined, digits = 1): string =>
  n === null || n === undefined ? '—' : String(Number(n.toFixed(digits)));

export function ago(iso: string, now = Date.now()): string {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function slotLabel(slot: string | undefined): string {
  if (!slot) return '?';
  return `${slot.startsWith('red') ? 'Red' : 'Blue'} ${slot.slice(-1)}`;
}

export function recordLabel(r: { kind: string; matchKey?: string; slot?: string; team: number; scout: string }): string {
  const who = r.scout ? ` (${r.scout})` : '';
  return r.kind === 'pit' ? `Pit · Team ${r.team}${who}` : `${matchLabel(r.matchKey ?? '')} · ${slotLabel(r.slot)} · Team ${r.team}${who}`;
}
