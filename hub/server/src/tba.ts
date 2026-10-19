import { compareMatchKeys, normalizeMatchKey, type ScheduleMatch } from '@stingr/shared';

export const TBA_BASE = 'https://www.thebluealliance.com/api/v3';

export interface TbaEventData { name: string | null; matches: ScheduleMatch[]; teams: number[]; names: Record<number, string> }

type TbaMatch = { key: string; alliances: { red: { team_keys: string[] }; blue: { team_keys: string[] } } };
const teamNumber = (key: string): number => Number(key.replace(/^frc/, '')) || 0;

export async function fetchTbaEvent(eventKey: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<TbaEventData> {
  const get = async (path: string): Promise<unknown> => {
    let res: Response;
    try {
      res = await fetchImpl(`${TBA_BASE}${path}`, {
        headers: { 'X-TBA-Auth-Key': apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error("Couldn't reach The Blue Alliance. Is this laptop online?");
    }
    if (res.status === 401) throw new Error('The Blue Alliance rejected the API key');
    if (res.status === 404) throw new Error(`The Blue Alliance has no event "${eventKey}"`);
    if (!res.ok) throw new Error(`The Blue Alliance returned HTTP ${res.status}`);
    return res.json();
  };

  const [event, matches, teams] = (await Promise.all([
    get(`/event/${eventKey}/simple`),
    get(`/event/${eventKey}/matches/simple`),
    get(`/event/${eventKey}/teams/simple`),
  ])) as [{ name?: string } | null, TbaMatch[] | null, { key: string; nickname?: string | null }[] | null];

  const trio = (keys: string[]) => [0, 1, 2].map(i => teamNumber(keys[i] ?? '')) as [number, number, number];
  const schedule: ScheduleMatch[] = [];
  for (const m of matches ?? []) {
    const key = normalizeMatchKey(m.key.slice(m.key.indexOf('_') + 1));
    if (key) schedule.push({ matchKey: key, red: trio(m.alliances.red.team_keys), blue: trio(m.alliances.blue.team_keys) });
  }
  schedule.sort((a, b) => compareMatchKeys(a.matchKey, b.matchKey));
  return {
    name: event?.name ?? null,
    matches: schedule,
    teams: (teams ?? []).map(t => teamNumber(t.key)).filter(n => n > 0).sort((a, b) => a - b),
    names: Object.fromEntries(
      (teams ?? []).filter(t => teamNumber(t.key) > 0 && t.nickname?.trim()).map(t => [teamNumber(t.key), (t.nickname as string).trim()]),
    ),
  };
}
