import type {
  ChoiceQuestion, CounterQuestion, FieldMapQuestion, MultiQuestion, NumberQuestion, RatingQuestion,
  TextQuestion, TimerQuestion, ToggleQuestion,
} from '@stingr/shared';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfirmDialog from '../src/components/ConfirmDialog.svelte';
import QuestionCard from '../src/components/QuestionCard.svelte';
import Choice from '../src/components/questions/Choice.svelte';
import Counter from '../src/components/questions/Counter.svelte';
import FieldMap from '../src/components/questions/FieldMap.svelte';
import Multi from '../src/components/questions/Multi.svelte';
import NumberField from '../src/components/questions/NumberField.svelte';
import Rating from '../src/components/questions/Rating.svelte';
import TextField from '../src/components/questions/TextField.svelte';
import Timer from '../src/components/questions/Timer.svelte';
import Toggle from '../src/components/questions/Toggle.svelte';
import { tapToPoint } from '../src/lib/fieldmap';

const counter: CounterQuestion = { key: 'coral', label: 'Coral scored', type: 'counter', required: true, min: 0, max: 3, step: 1, default: 0 };
const toggle: ToggleQuestion = { key: 'leave', label: 'Left zone', type: 'toggle', required: true, default: false };
const choice: ChoiceQuestion = { key: 'climb', label: 'Climb', type: 'choice', required: true, display: 'buttons', options: [{ value: 'none', label: 'None' }, { value: 'deep', label: 'Deep' }] };
const dropdown: ChoiceQuestion = { ...choice, key: 'drive', label: 'Drivetrain', display: 'dropdown', options: [{ value: 'swerve', label: 'Swerve' }, { value: 'tank', label: 'Tank' }] };
const multi: MultiQuestion = { key: 'zones', label: 'Zones', type: 'multi', required: false, options: [{ value: 'near', label: 'Near' }, { value: 'far', label: 'Far' }] };
const number: NumberQuestion = { key: 'weight', label: 'Weight', type: 'number', required: false, integer: false, min: 0, max: 200 };
const text: TextQuestion = { key: 'notes', label: 'Notes', type: 'text', required: false, multiline: true };
const rating: RatingQuestion = { key: 'defense', label: 'Defense', type: 'rating', required: false, max: 5 };
const timer: TimerQuestion = { key: 'climb_time', label: 'Climb time', type: 'timer', required: false };
const map: FieldMapQuestion = { key: 'start', label: 'Start', type: 'fieldmap', required: false, assetId: 'field', maxPoints: 2, mirrorForRed: true };

const stubRect = (el: Element) => {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
};

describe('Counter', () => {
  it('steps within its limits', async () => {
    const onchange = vi.fn();
    render(Counter, { question: counter, value: 3, onchange });
    expect(screen.getByLabelText('value').textContent).toBe('3');
    expect((screen.getByLabelText('plus') as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(screen.getByLabelText('minus'));
    expect(onchange).toHaveBeenCalledWith(2);
  });
  it('starts from its default', async () => {
    const onchange = vi.fn();
    render(Counter, { question: counter, value: null, onchange });
    expect(screen.getByLabelText('value').textContent).toBe('0');
    expect((screen.getByLabelText('minus') as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(screen.getByLabelText('plus'));
    expect(onchange).toHaveBeenCalledWith(1);
  });
});

describe('Toggle', () => {
  it('shows and sets yes or no', async () => {
    const onchange = vi.fn();
    render(Toggle, { question: toggle, value: false, onchange });
    expect(screen.getByRole('button', { name: 'No' }).getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onchange).toHaveBeenCalledWith(true);
  });
});

describe('Choice', () => {
  it('picks an option and clears it when tapped again', async () => {
    const onchange = vi.fn();
    render(Choice, { question: choice, value: 'deep', onchange });
    expect(screen.getByRole('button', { name: 'Deep' }).getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(onchange).toHaveBeenLastCalledWith('none');
    await fireEvent.click(screen.getByRole('button', { name: 'Deep' }));
    expect(onchange).toHaveBeenLastCalledWith(null);
  });
  it('can be a dropdown', async () => {
    const onchange = vi.fn();
    render(Choice, { question: dropdown, value: null, onchange });
    const select = screen.getByLabelText('Drivetrain');
    await fireEvent.change(select, { target: { value: 'tank' } });
    expect(onchange).toHaveBeenLastCalledWith('tank');
    await fireEvent.change(select, { target: { value: '' } });
    expect(onchange).toHaveBeenLastCalledWith(null);
  });
});

describe('Multi', () => {
  it('toggles options in and out of the list', async () => {
    const onchange = vi.fn();
    render(Multi, { question: multi, value: ['near'], onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Far' }));
    expect(onchange).toHaveBeenLastCalledWith(['near', 'far']);
    await fireEvent.click(screen.getByRole('button', { name: 'Near' }));
    expect(onchange).toHaveBeenLastCalledWith([]);
  });
});

describe('NumberField', () => {
  it('reports numbers and blanks', async () => {
    const onchange = vi.fn();
    render(NumberField, { question: number, value: null, onchange });
    const input = screen.getByLabelText('Weight');
    await fireEvent.input(input, { target: { value: '12.5' } });
    expect(onchange).toHaveBeenLastCalledWith(12.5);
    await fireEvent.input(input, { target: { value: '' } });
    expect(onchange).toHaveBeenLastCalledWith(null);
  });
  it('warns about values outside the expected range', () => {
    render(NumberField, { question: number, value: 300, onchange: vi.fn() });
    expect(screen.getByText('Expected a number from 0 to 200')).toBeTruthy();
  });
});

describe('TextField', () => {
  it('reports what the scout types', async () => {
    const onchange = vi.fn();
    render(TextField, { question: text, value: null, onchange });
    await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'fast' } });
    expect(onchange).toHaveBeenLastCalledWith('fast');
  });
});

describe('Rating', () => {
  it('shows 1..max and clears when the chosen rating is tapped again', async () => {
    const onchange = vi.fn();
    render(Rating, { question: rating, value: 4, onchange });
    expect(screen.getAllByRole('button')).toHaveLength(5);
    await fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onchange).toHaveBeenLastCalledWith(2);
    await fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(onchange).toHaveBeenLastCalledWith(null);
  });
});

describe('Timer', () => {
  afterEach(() => vi.useRealTimers());

  it('adds up start/stop runs to a tenth of a second', async () => {
    vi.useFakeTimers();
    const onchange = vi.fn();
    const { rerender } = render(Timer, { question: timer, value: null, onchange });
    expect(screen.getByLabelText('Edit time').textContent).toBe('0.0 s');
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    vi.advanceTimersByTime(2500);
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onchange).toHaveBeenLastCalledWith(2.5);
    await rerender({ value: 2.5 });
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    vi.advanceTimersByTime(1000);
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onchange).toHaveBeenLastCalledWith(3.5);
  });

  it('resets and accepts a typed time', async () => {
    const onchange = vi.fn();
    render(Timer, { question: timer, value: 2.5, onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onchange).toHaveBeenLastCalledWith(null);
    await fireEvent.click(screen.getByLabelText('Edit time'));
    await fireEvent.change(screen.getByLabelText('Seconds'), { target: { value: '7' } });
    expect(onchange).toHaveBeenLastCalledWith(7);
  });
});

describe('FieldMap', () => {
  it('converts a tap position into field coordinates', () => {
    expect(tapToPoint(150, 80, { left: 100, top: 30, width: 200, height: 100 })).toEqual({ x: 0.25, y: 0.5 });
    expect(tapToPoint(500, -5, { left: 100, top: 30, width: 200, height: 100 })).toEqual({ x: 1, y: 0 });
    expect(tapToPoint(1, 1, { left: 0, top: 0, width: 3, height: 3 })).toEqual({ x: 0.333, y: 0.333 });
    expect(tapToPoint(5, 5, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('records taps for a blue scout as-is', async () => {
    const onchange = vi.fn();
    render(FieldMap, { question: map, value: null, onchange, slot: 'blue1', image: 'data:image/png;base64,x' });
    const img = screen.getByAltText('Field');
    stubRect(img);
    await fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(onchange).toHaveBeenLastCalledWith([{ x: 0.25, y: 0.25 }]);
  });

  it('mirrors taps for a red scout', async () => {
    const onchange = vi.fn();
    render(FieldMap, { question: map, value: null, onchange, slot: 'red1', image: 'data:image/png;base64,x' });
    const img = screen.getByAltText('Field');
    stubRect(img);
    await fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(onchange).toHaveBeenLastCalledWith([{ x: 0.75, y: 0.75 }]);
  });

  it('replaces the point when only one is allowed, and removes a tapped dot', async () => {
    const onchange = vi.fn();
    render(FieldMap, { question: { ...map, maxPoints: 1 }, value: [{ x: 0.1, y: 0.1 }], onchange, slot: 'blue1', image: 'x' });
    const img = screen.getByAltText('Field');
    stubRect(img);
    await fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(onchange).toHaveBeenLastCalledWith([{ x: 0.25, y: 0.25 }]);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove point 1' }));
    expect(onchange).toHaveBeenLastCalledWith([]);
  });

  it('ignores taps once the maximum is reached', async () => {
    const onchange = vi.fn();
    render(FieldMap, { question: map, value: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], onchange, slot: 'blue1', image: 'x' });
    const img = screen.getByAltText('Field');
    stubRect(img);
    await fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(onchange).not.toHaveBeenCalled();
  });
});

describe('QuestionCard', () => {
  it('shows the label, marks required questions and offers "I missed this"', async () => {
    const onmissed = vi.fn();
    render(QuestionCard, { question: counter, value: 1, missed: false, onchange: vi.fn(), onmissed, assets: {} });
    const card = screen.getByRole('region', { name: 'Coral scored' });
    expect(within(card).getByTitle('Required')).toBeTruthy();
    expect(within(card).getByLabelText('value').textContent).toBe('1');
    await fireEvent.click(within(card).getByRole('button', { name: 'I missed this' }));
    expect(onmissed).toHaveBeenCalledWith(true);
  });
  it('hides the input of a missed question and can undo', async () => {
    const onmissed = vi.fn();
    render(QuestionCard, { question: counter, value: null, missed: true, onchange: vi.fn(), onmissed, assets: {} });
    expect(screen.getByText('Marked as missed.')).toBeTruthy();
    expect(screen.queryByLabelText('plus')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onmissed).toHaveBeenCalledWith(false);
  });
});

describe('ConfirmDialog', () => {
  it('calls back for each choice', async () => {
    const onconfirm = vi.fn();
    const oncancel = vi.fn();
    render(ConfirmDialog, { title: 'Discard?', confirmLabel: 'Discard', cancelLabel: 'Keep', onconfirm, oncancel });
    expect(screen.getByRole('dialog', { name: 'Discard?' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(oncancel).toHaveBeenCalledTimes(1);
    expect(onconfirm).toHaveBeenCalledTimes(1);
  });
});
