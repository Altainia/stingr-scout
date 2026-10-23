import { allQuestions, estimatedPoints, summaryKind, type FormDef, type PointsEstimate, type QuestionStat, questionStat, type ScoutRecord, usableValues } from '@stingr/shared';

export interface TeamSummary {
  team: number;
  matchRecords: number;
  noShows: number;
  noShowPct: number | null;
  estPoints: number | null;
  estPointsBySection: Record<string, number | null>;
  stats: Record<string, QuestionStat>;
  /** pit questions summarized on Teams (a robot's measurements), from its newest pit record */
  pitStats: Record<string, QuestionStat>;
  pit: 'none' | 'done' | 'noshow';
}

function summarizeTeam(team: number, form: FormDef | null, recs: ScoutRecord[], pits: ScoutRecord[], pitForm: FormDef | null): TeamSummary {
  const newestPit = pits.filter(p => !p.noShow).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 1);
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
    pitStats: pitForm ? Object.fromEntries(allQuestions(pitForm).filter(q => summaryKind(q) === 'size').map(q => [q.key, questionStat(q, newestPit)])) : {},
    pit: pits.length === 0 ? 'none' : pits.some(p => !p.noShow) ? 'done' : 'noshow',
  };
}

export function buildTeamSummaries(teams: number[], matchForm: FormDef | null, matchRecords: ScoutRecord[], pitRecords: ScoutRecord[], pitForm: FormDef | null = null): TeamSummary[] {
  const all = new Set([...teams, ...matchRecords.map(r => r.team), ...pitRecords.map(r => r.team)]);
  return [...all]
    .sort((a, b) => a - b)
    .map(team => summarizeTeam(team, matchForm, matchRecords.filter(r => r.team === team), pitRecords.filter(r => r.team === team), pitForm));
}

export interface EventAverages {
  /** points per match across every team at the event, overall and by section */
  points: PointsEstimate;
  /** each numeric question's average per match across every team */
  questions: Record<string, number | null>;
}

/** The event-wide averages a team's charts are compared against. */
export function eventAverages(form: FormDef | null, records: ScoutRecord[]): EventAverages | null {
  if (!form) return null;
  const questions: Record<string, number | null> = {};
  for (const q of allQuestions(form)) {
    if (q.type !== 'counter' && q.type !== 'number' && q.type !== 'rating' && q.type !== 'timer') continue;
    const nums = usableValues(q, records).filter((v): v is number => typeof v === 'number');
    questions[q.key] = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  }
  return { points: estimatedPoints(form, records), questions };
}
