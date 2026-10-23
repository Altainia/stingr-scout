import type { FormKind } from '@stingr/shared';

export type Route =
  | { page: 'dashboard' }
  | { page: 'event' }
  | { page: 'forms'; kind: FormKind }
  | { page: 'coverage' }
  | { page: 'alliance' }
  | { page: 'teams' }
  | { page: 'team'; team: number; vs?: Compared[] }
  | { page: 'qr' }
  | { page: 'data' }
  | { page: 'settings' }
  | { page: 'notfound' };

/** A team shown beside another on its page, with the chart colour it keeps (2–4; 1 is the page's own team). */
export interface Compared { team: number; slot: number }
export const MAX_COMPARED = 3;

/** "254:2,118:3" (or "254,118" typed by hand): valid, different teams, at most three, one colour each. */
function parseCompared(text: string, self: number): Compared[] {
  const out: Compared[] = [];
  for (const part of text.split(',')) {
    const [t, c] = part.split(':');
    const team = /^\d{1,5}$/.test(t ?? '') ? Number(t) : 0;
    if (!team || team === self || out.some(o => o.team === team) || out.length >= MAX_COMPARED) continue;
    const free = [2, 3, 4].filter(n => !out.some(o => o.slot === n));
    const wanted = Number(c);
    out.push({ team, slot: free.includes(wanted) ? wanted : free[0] });
  }
  return out;
}

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.split('?');
  const [first, second, ...rest] = path.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (rest.length) return { page: 'notfound' };
  switch (first ?? '') {
    case '': return { page: 'dashboard' };
    case 'event': return second ? { page: 'notfound' } : { page: 'event' };
    case 'forms':
      if (second === undefined || second === 'match') return { page: 'forms', kind: 'match' };
      return second === 'pit' ? { page: 'forms', kind: 'pit' } : { page: 'notfound' };
    case 'coverage': return { page: 'coverage' };
    case 'alliance': return second ? { page: 'notfound' } : { page: 'alliance' };
    case 'teams':
      if (second === undefined) return { page: 'teams' };
      if (!/^\d{1,5}$/.test(second)) return { page: 'notfound' };
      {
        const team = Number(second);
        const vs = parseCompared(new URLSearchParams(query).get('vs') ?? '', team);
        return vs.length ? { page: 'team', team, vs } : { page: 'team', team };
      }
    case 'qr': return { page: 'qr' };
    case 'data': return { page: 'data' };
    case 'settings': return { page: 'settings' };
    default: return { page: 'notfound' };
  }
}

export function href(r: Route): string {
  switch (r.page) {
    case 'dashboard': case 'notfound': return '#/';
    case 'forms': return `#/forms/${r.kind}`;
    case 'team': return `#/teams/${r.team}${r.vs?.length ? `?vs=${r.vs.map(c => `${c.team}:${c.slot}`).join(',')}` : ''}`;
    default: return `#/${r.page}`;
  }
}
