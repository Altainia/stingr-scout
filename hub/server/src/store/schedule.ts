import { compareMatchKeys, type ScheduleMatch } from '@stingr/shared';
import { type Db, tx } from '../db';

type MatchRow = { match_key: string; red1: number; red2: number; red3: number; blue1: number; blue2: number; blue3: number };

export function replaceSchedule(db: Db, eventKey: string, matches: ScheduleMatch[]): void {
  tx(db, () => {
    db.prepare('DELETE FROM matches WHERE event_key = ?').run(eventKey);
    const insert = db.prepare('INSERT INTO matches (event_key, match_key, red1, red2, red3, blue1, blue2, blue3) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const team = db.prepare('INSERT OR IGNORE INTO teams (event_key, team) VALUES (?, ?)');
    for (const m of matches) {
      insert.run(eventKey, m.matchKey, ...m.red, ...m.blue);
      for (const t of [...m.red, ...m.blue]) if (t > 0) team.run(eventKey, t);
    }
  });
}

export function listSchedule(db: Db, eventKey: string): ScheduleMatch[] {
  const rows = db.prepare('SELECT * FROM matches WHERE event_key = ?').all(eventKey) as unknown as MatchRow[];
  return rows
    .map(r => ({ matchKey: r.match_key, red: [r.red1, r.red2, r.red3], blue: [r.blue1, r.blue2, r.blue3] }) as ScheduleMatch)
    .sort((a, b) => compareMatchKeys(a.matchKey, b.matchKey));
}

export function listTeams(db: Db, eventKey: string): number[] {
  const rows = db.prepare('SELECT team FROM teams WHERE event_key = ? ORDER BY team').all(eventKey) as unknown as { team: number }[];
  return rows.map(r => r.team);
}

export function addTeam(db: Db, eventKey: string, team: number): void {
  db.prepare('INSERT OR IGNORE INTO teams (event_key, team) VALUES (?, ?)').run(eventKey, team);
}

export function removeTeam(db: Db, eventKey: string, team: number): void {
  db.prepare('DELETE FROM teams WHERE event_key = ? AND team = ?').run(eventKey, team);
}
