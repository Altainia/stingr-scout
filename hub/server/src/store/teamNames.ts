import type { Db } from '../db';

/** Sets a team's name; an empty name removes it. */
export function setTeamName(db: Db, team: number, name: string): void {
  const n = name.trim();
  if (n) db.prepare('INSERT INTO team_names (team, name) VALUES (?, ?) ON CONFLICT (team) DO UPDATE SET name = excluded.name').run(team, n);
  else db.prepare('DELETE FROM team_names WHERE team = ?').run(team);
}

/** team → name, for the given teams (all known names when none are given). */
export function teamNames(db: Db, teams?: number[]): Record<number, string> {
  const rows = db.prepare('SELECT team, name FROM team_names ORDER BY team').all() as unknown as { team: number; name: string }[];
  const wanted = teams ? new Set(teams) : null;
  return Object.fromEntries(rows.filter(r => !wanted || wanted.has(Number(r.team))).map(r => [Number(r.team), r.name]));
}
