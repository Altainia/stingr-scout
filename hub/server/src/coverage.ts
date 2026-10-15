import { compareMatchKeys, type ScheduleMatch, type ScoutRecord, type Slot, SLOTS } from '@stingr/shared';

export type CellStatus = 'empty' | 'noshow' | 'ok' | 'missed';
export interface CoverageCell { team: number; status: CellStatus; recordIds: string[] }
export interface CoverageRow { matchKey: string; scheduled: boolean; cells: Record<Slot, CoverageCell> }

const RANK: Record<CellStatus, number> = { empty: 0, noshow: 1, ok: 2, missed: 3 };

function emptyCells(teams: number[]): Record<Slot, CoverageCell> {
  return Object.fromEntries(SLOTS.map((s, i) => [s, { team: teams[i] ?? 0, status: 'empty', recordIds: [] as string[] }])) as unknown as Record<Slot, CoverageCell>;
}

export function buildCoverage(schedule: ScheduleMatch[], records: ScoutRecord[]): CoverageRow[] {
  const rows = new Map<string, CoverageRow>();
  for (const m of schedule) rows.set(m.matchKey, { matchKey: m.matchKey, scheduled: true, cells: emptyCells([...m.red, ...m.blue]) });
  for (const r of records) {
    if (r.kind !== 'match' || !r.matchKey || !r.slot) continue;
    let row = rows.get(r.matchKey);
    if (!row) {
      row = { matchKey: r.matchKey, scheduled: false, cells: emptyCells([]) };
      rows.set(r.matchKey, row);
    }
    const cell = row.cells[r.slot];
    if (!row.scheduled && cell.team === 0) cell.team = r.team;
    cell.recordIds.push(r.id);
    const status: CellStatus = r.noShow ? 'noshow' : r.missed.length ? 'missed' : 'ok';
    if (RANK[status] > RANK[cell.status]) cell.status = status;
  }
  return [...rows.values()].sort((a, b) => compareMatchKeys(a.matchKey, b.matchKey));
}
