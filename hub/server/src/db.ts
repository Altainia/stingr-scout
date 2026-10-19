import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE events (key TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE matches (
    event_key TEXT NOT NULL, match_key TEXT NOT NULL,
    red1 INTEGER NOT NULL, red2 INTEGER NOT NULL, red3 INTEGER NOT NULL,
    blue1 INTEGER NOT NULL, blue2 INTEGER NOT NULL, blue3 INTEGER NOT NULL,
    PRIMARY KEY (event_key, match_key)
  );
  CREATE TABLE teams (event_key TEXT NOT NULL, team INTEGER NOT NULL, PRIMARY KEY (event_key, team));
  CREATE TABLE forms (
    kind TEXT NOT NULL, version INTEGER NOT NULL, json TEXT NOT NULL, published_at TEXT NOT NULL,
    PRIMARY KEY (kind, version)
  );
  CREATE TABLE form_drafts (kind TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE records (
    id TEXT NOT NULL, revision INTEGER NOT NULL, kind TEXT NOT NULL, event_key TEXT NOT NULL,
    team INTEGER NOT NULL, match_key TEXT, slot TEXT, json TEXT NOT NULL,
    received_at TEXT NOT NULL, via TEXT NOT NULL,
    PRIMARY KEY (id, revision)
  );
  CREATE INDEX records_by_event ON records (event_key, kind);
  CREATE TABLE photos (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, received_at TEXT NOT NULL);
  CREATE TABLE devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, last_sync_at TEXT);
  `,
  `ALTER TABLE events ADD COLUMN red_side TEXT NOT NULL DEFAULT 'left';`,
  // Each time an event is set up it gets a new instance id, so records of a deleted event can't join a new one with the same key.
  `ALTER TABLE events ADD COLUMN instance TEXT NOT NULL DEFAULT '';
   UPDATE events SET instance = lower(hex(randomblob(16))) WHERE instance = '';`,
  // Team names belong to the team, not an event, so they carry over between events and seasons.
  `CREATE TABLE team_names (team INTEGER PRIMARY KEY, name TEXT NOT NULL);`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function schemaVersion(db: Db): number {
  return (db.prepare('PRAGMA user_version').get() as unknown as { user_version: number }).user_version;
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  for (let v = schemaVersion(db); v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}
