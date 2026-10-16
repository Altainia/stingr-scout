import { isAnswered } from './record';
import type { AnswerValue, Point, Question } from './types';

/** An answer as a short, readable value. Unanswered shows "—".
 *  Answers recorded under an older type of the question (its key kept, its type changed) are shown as they are. */
export function describeAnswer(q: Question, v: AnswerValue | undefined): string {
  if (v === undefined || !isAnswered(v)) return '—';
  const plain = () => (Array.isArray(v) ? v.map(x => (typeof x === 'object' ? `${x.x},${x.y}` : String(x))).join(', ') : String(v));
  switch (q.type) {
    case 'toggle':
      return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : plain();
    case 'choice':
      return typeof v === 'string' ? q.options.find(o => o.value === v)?.label ?? v : plain();
    case 'multi':
      return Array.isArray(v) && v.every(x => typeof x === 'string')
        ? (v as string[]).map(x => q.options.find(o => o.value === x)?.label ?? x).join(', ')
        : plain();
    case 'timer':
      return typeof v === 'number' ? `${v.toFixed(1)} s` : plain();
    case 'fieldmap': {
      if (!Array.isArray(v) || v.some(p => typeof p !== 'object')) return plain();
      const n = (v as Point[]).length;
      return `${n} point${n === 1 ? '' : 's'}`;
    }
    default:
      return plain();
  }
}
