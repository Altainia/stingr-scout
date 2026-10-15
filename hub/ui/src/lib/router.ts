import type { FormKind } from '@stingr/shared';

export type Route =
  | { page: 'dashboard' }
  | { page: 'event' }
  | { page: 'forms'; kind: FormKind }
  | { page: 'coverage' }
  | { page: 'teams' }
  | { page: 'team'; team: number }
  | { page: 'qr' }
  | { page: 'data' }
  | { page: 'settings' }
  | { page: 'notfound' };

export function parseRoute(hash: string): Route {
  const [first, second, ...rest] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (rest.length) return { page: 'notfound' };
  switch (first ?? '') {
    case '': return { page: 'dashboard' };
    case 'event': return second ? { page: 'notfound' } : { page: 'event' };
    case 'forms':
      if (second === undefined || second === 'match') return { page: 'forms', kind: 'match' };
      return second === 'pit' ? { page: 'forms', kind: 'pit' } : { page: 'notfound' };
    case 'coverage': return { page: 'coverage' };
    case 'teams':
      if (second === undefined) return { page: 'teams' };
      return /^\d{1,5}$/.test(second) ? { page: 'team', team: Number(second) } : { page: 'notfound' };
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
    case 'team': return `#/teams/${r.team}`;
    default: return `#/${r.page}`;
  }
}
