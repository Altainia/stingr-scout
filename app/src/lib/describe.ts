import { type AnswerValue, isAnswered, type Point, type Question } from '@stingr/shared';

/** An answer as a short, readable value for the Review tab. Unanswered shows "—". */
export function describeAnswer(q: Question, v: AnswerValue | undefined): string {
  if (v === undefined || !isAnswered(v)) return '—';
  switch (q.type) {
    case 'toggle':
      return v === true ? 'Yes' : 'No';
    case 'choice':
      return q.options.find(o => o.value === v)?.label ?? String(v);
    case 'multi':
      return (v as string[]).map(x => q.options.find(o => o.value === x)?.label ?? x).join(', ');
    case 'timer':
      return `${(v as number).toFixed(1)} s`;
    case 'fieldmap': {
      const n = (v as Point[]).length;
      return `${n} point${n === 1 ? '' : 's'}`;
    }
    default:
      return String(v);
  }
}
