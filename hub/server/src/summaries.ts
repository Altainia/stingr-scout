import { allQuestions, estimatedPoints, type FormDef, type QuestionStat, questionStat, type ScoutRecord } from '@stingr/shared';

export interface TeamSummary {
  team: number;
  matchRecords: number;
  noShows: number;
  noShowPct: number | null;
  estPoints: number | null;
  estPointsBySection: Record<string, number | null>;
  stats: Record<string, QuestionStat>;
  pit: 'none' | 'done' | 'noshow';
}

function summarizeTeam(team: number, form: FormDef | null, recs: ScoutRecord[], pits: ScoutRecord[]): TeamSummary {
  const noShows = recs.filter(r => r.noShow).length;
  const est = form ? estimatedPoints(form, recs) : { total: null, bySection: {} };
  return {
    team,
    matchRecords: recs.length,
    noShows,
    noShowPct: recs.length ? noShows / recs.length : null,
    estPoints: est.total,
    estPointsBySection: est.bySection,
    stats: form ? Object.fromEntries(allQuestions(form).map(q => [q.key, questionStat(q, recs)])) : {},
    pit: pits.length === 0 ? 'none' : pits.some(p => !p.noShow) ? 'done' : 'noshow',
  };
}

export function buildTeamSummaries(teams: number[], matchForm: FormDef | null, matchRecords: ScoutRecord[], pitRecords: ScoutRecord[]): TeamSummary[] {
  const all = new Set([...teams, ...matchRecords.map(r => r.team), ...pitRecords.map(r => r.team)]);
  return [...all]
    .sort((a, b) => a - b)
    .map(team => summarizeTeam(team, matchForm, matchRecords.filter(r => r.team === team), pitRecords.filter(r => r.team === team)));
}
