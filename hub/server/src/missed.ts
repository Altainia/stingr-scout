import { allQuestions, compareMatchKeys, type FormDef, type ScoutRecord, type Slot } from '@stingr/shared';

/** When a pattern of missed answers is worth pointing out. Guesses, kept together so they're easy to tune. */
export const MISSED_LIMITS = {
  /** A question is listed when it's missed in at least this share of matches… */
  questionRate: 0.15,
  /** …by at least this many different scouts (and still that often without the scout who missed it most). */
  questionScouts: 2,
  /** A scout is listed for a question only after this many of their matches asked it… */
  scoutMatches: 4,
  /** …when they missed it at least this often… */
  scoutRate: 0.3,
  /** …and at least this many times as often as the other scouts did. */
  scoutRatio: 2,
};

export interface MissedRef { matchKey: string; slot: Slot | null; team: number; scout: string }
export interface QuestionMisses {
  key: string; label: string; missed: number; total: number;
  /** different scouts who missed it, out of those who were asked it */
  scouts: number; scoutsAsked: number;
  matches: MissedRef[];
}
export interface ScoutMisses {
  scout: string; key: string; label: string; missed: number; total: number;
  othersMissed: number; othersTotal: number;
  matches: MissedRef[];
}
export interface MissedReport { questions: QuestionMisses[]; scouts: ScoutMisses[] }

const who = (name: string) => name.trim().toLowerCase(); // "Ada" and " ada " are the same scout
const ref = (r: ScoutRecord): MissedRef => ({ matchKey: r.matchKey ?? '', slot: r.slot ?? null, team: r.team, scout: r.scout.trim() });
const byMatch = (a: MissedRef, b: MissedRef) => compareMatchKeys(a.matchKey, b.matchKey);

/**
 * Questions scouts often miss, and scouts who miss a question much more than the others, from match records
 * (robots that weren't there are left out). A record counts for a question only if its form version asked it.
 */
export function buildMissedReport(records: ScoutRecord[], formOf: (version: number) => FormDef | undefined, latest: FormDef | null): MissedReport {
  if (!latest) return { questions: [], scouts: [] };
  const played = records.filter(r => r.kind === 'match' && !r.noShow);
  const asks = new Map<number, Set<string>>();
  const asked = (r: ScoutRecord, key: string) => {
    if (!asks.has(r.formVersion)) asks.set(r.formVersion, new Set(allQuestions(formOf(r.formVersion) ?? { ...latest, sections: [] }).map(q => q.key)));
    return asks.get(r.formVersion)!.has(key);
  };

  const questions: QuestionMisses[] = [];
  const scouts: ScoutMisses[] = [];
  for (const q of allQuestions(latest)) {
    const rel = played.filter(r => asked(r, q.key));
    if (!rel.length) continue;
    const missedRecs = rel.filter(r => r.missed.includes(q.key));
    const missers = new Set(missedRecs.map(r => who(r.scout)));
    const askedScouts = new Set(rel.map(r => who(r.scout)));
    // Hard for scouts in general, not just one: still missed often once the scout who missed it most is left out.
    const counts = new Map<string, number>();
    for (const r of missedRecs) counts.set(who(r.scout), (counts.get(who(r.scout)) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const rest = rel.filter(r => who(r.scout) !== top);
    const restRate = rest.length ? rest.filter(r => r.missed.includes(q.key)).length / rest.length : 0;
    if (missedRecs.length / rel.length >= MISSED_LIMITS.questionRate && missers.size >= MISSED_LIMITS.questionScouts
      && restRate >= MISSED_LIMITS.questionRate) {
      questions.push({
        key: q.key, label: q.label, missed: missedRecs.length, total: rel.length,
        scouts: missers.size, scoutsAsked: askedScouts.size, matches: missedRecs.map(ref).sort(byMatch),
      });
    }
    for (const s of askedScouts) {
      const mine = rel.filter(r => who(r.scout) === s);
      const others = rel.filter(r => who(r.scout) !== s);
      const mineMissed = mine.filter(r => r.missed.includes(q.key));
      const othersMissed = others.filter(r => r.missed.includes(q.key)).length;
      const rate = mineMissed.length / mine.length;
      if (mine.length < MISSED_LIMITS.scoutMatches || rate < MISSED_LIMITS.scoutRate || !others.length) continue;
      if (rate < MISSED_LIMITS.scoutRatio * (othersMissed / others.length)) continue;
      scouts.push({
        scout: mine[0].scout.trim(), key: q.key, label: q.label, missed: mineMissed.length, total: mine.length,
        othersMissed, othersTotal: others.length, matches: mineMissed.map(ref).sort(byMatch),
      });
    }
  }
  questions.sort((a, b) => b.missed / b.total - a.missed / a.total);
  scouts.sort((a, b) => b.missed / b.total - a.missed / a.total);
  return { questions, scouts };
}
