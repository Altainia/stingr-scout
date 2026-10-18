import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { getSetting, setSetting } from './settings';

/** The hub's permanent id and its current season's id, created on first use. */
export function hubIdentity(db: Db): { hubId: string; seasonId: string } {
  let hubId = getSetting(db, 'hub_id');
  if (!hubId) setSetting(db, 'hub_id', (hubId = randomUUID()));
  let seasonId = getSetting(db, 'season_id');
  if (!seasonId) setSetting(db, 'season_id', (seasonId = randomUUID()));
  return { hubId, seasonId };
}

export function newSeasonId(db: Db): string {
  const id = randomUUID();
  setSetting(db, 'season_id', id);
  return id;
}
