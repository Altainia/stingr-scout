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
const map: FieldMapQuestion = { key: 'start', label: 'Start', type: 'fieldmap', required: false, assetId: 'field', maxPoints: 2, redSide: 'left' };

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
  const names = () => screen.getAllByRole('button').map(b => b.textContent);
  const pressed = () => screen.getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent);

  it('shows and sets yes or no', async () => {
    const onchange = vi.fn();
    render(Toggle, { question: toggle, value: false, onchange });
    expect(pressed()).toEqual(['No']);
    await fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onchange).toHaveBeenCalledWith(true);
  });

  it('offers only Yes and No when an answer is required, with neither chosen until the scout picks', () => {
    render(Toggle, { question: toggle, value: null, onchange: vi.fn() }); // required
    expect(names()).toEqual(['Yes', 'No']);
    expect(pressed()).toEqual([]);
  });

  it('adds "No answer" when the question is optional, chosen while it is unanswered', async () => {
    const onchange = vi.fn();
    render(Toggle, { question: { ...toggle, required: false }, value: null, onchange });
    expect(names()).toEqual(['Yes', 'No', 'No answer']);
    expect(pressed()).toEqual(['No answer']);
    await fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onchange).toHaveBeenLastCalledWith(true);
    await fireEvent.click(screen.getByRole('button', { name: 'No answer' }));
    expect(onchange).toHaveBeenLastCalledWith(null);
  });
});

describe('Choice', () => {
  const names = () => screen.getAllByRole('button').map(b => b.textContent);
  const pressed = () => screen.getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent);

  it('picks an option; tapping the chosen one again keeps it', async () => {
    const onchange = vi.fn();
    render(Choice, { question: choice, value: 'deep', onchange }); // required
    expect(names()).toEqual(['None', 'Deep']);
    expect(pressed()).toEqual(['Deep']);
    await fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(onchange).toHaveBeenLastCalledWith('none');
    onchange.mockClear();
    await fireEvent.click(screen.getByRole('button', { name: 'Deep' }));
    expect(onchange).not.toHaveBeenCalled();
  });

  it('adds "No answer" when the question is optional', async () => {
    const onchange = vi.fn();
    render(Choice, { question: { ...choice, required: false }, value: 'deep', onchange });
    expect(names()).toEqual(['None', 'Deep', 'No answer']);
    await fireEvent.click(screen.getByRole('button', { name: 'No answer' }));
    expect(onchange).toHaveBeenLastCalledWith(null);
  });

  it('can be a dropdown; a required one says "Choose…" only until something is picked', async () => {
    const onchange = vi.fn();
    const { rerender } = render(Choice, { question: dropdown, value: null, onchange }); // required
    const select = screen.getByLabelText('Drivetrain') as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual(['Choose…', 'Swerve', 'Tank']);
    await fireEvent.change(select, { target: { value: 'tank' } });
    expect(onchange).toHaveBeenLastCalledWith('tank');
    await rerender({ question: dropdown, value: 'tank', onchange });
    expect([...select.options].map(o => o.textContent)).toEqual(['Swerve', 'Tank']);
  });

  it('offers "No answer" in an optional dropdown', async () => {
    const onchange = vi.fn();
    render(Choice, { question: { ...dropdown, required: false }, value: 'tank', onchange });
    const select = screen.getByLabelText('Drivetrain') as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual(['No answer', 'Swerve', 'Tank']);
    await fireEvent.change(select, { target: { value: '' } });
    expect(onchange).toHaveBeenLastCalledWith(null);
  });
});

describe('options with the same value (possible in a draft being edited)', () => {
  it('still render instead of crashing', () => {
    const dup = { ...choice, options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'Also A' }] };
    render(Choice, { question: dup, value: null, onchange: vi.fn() });
    render(Multi, { question: { ...multi, options: dup.options }, value: [], onchange: vi.fn() });
    expect(screen.getAllByRole('button', { name: 'Also A' })).toHaveLength(2);
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
  const names = () => screen.getAllByRole('button').map(b => b.textContent);

  it('shows 1..max, and "No answer" when optional; tapping the chosen rating again keeps it', async () => {
    const onchange = vi.fn();
    render(Rating, { question: rating, value: 4, onchange }); // optional
    expect(names()).toEqual(['1', '2', '3', '4', '5', 'No answer']);
    await fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onchange).toHaveBeenLastCalledWith(2);
    onchange.mockClear();
    await fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'No answer' }));
    expect(onchange).toHaveBeenLastCalledWith(null);
  });

  it('offers only the ratings when an answer is required', () => {
    render(Rating, { question: { ...rating, required: true }, value: null, onchange: vi.fn() });
    expect(names()).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('button groups', () => {
  it('joins the buttons of single answers into one bar, and keeps multi-select buttons apart', () => {
    const groupOf = (name: string) => screen.getByRole('button', { name }).parentElement!;
    render(Rating, { question: rating, value: null, onchange: vi.fn() });
    expect(groupOf('3').classList.contains('segmented')).toBe(true);
    render(Toggle, { question: toggle, value: null, onchange: vi.fn() });
    expect(groupOf('Yes').classList.contains('segmented')).toBe(true);
    render(Choice, { question: choice, value: null, onchange: vi.fn() });
    expect(groupOf('Deep').classList.contains('segmented')).toBe(true);
    render(Multi, { question: multi, value: null, onchange: vi.fn() });
    expect(groupOf('Far').classList.contains('segmented')).toBe(false);
  });
});

describe('the keyboard Done key', () => {
  it('closes the keyboard from a number or one-line text box, keeping the answer', async () => {
    for (const [component, question, typed] of [[NumberField, number, '12'], [TextField, { ...text, multiline: false }, 'fast']] as const) {
      const onchange = vi.fn();
      const { unmount } = render(component as typeof NumberField, { question: question as never, value: null, onchange });
      const box = screen.getByLabelText(question.label) as HTMLInputElement;
      expect(box.getAttribute('enterkeyhint')).toBe('done');
      box.focus();
      await fireEvent.input(box, { target: { value: typed } });
      await fireEvent.keyDown(box, { key: 'Enter' });
      expect(document.activeElement).not.toBe(box); // keyboard goes away with the focus
      expect(onchange).toHaveBeenLastCalledWith(question.type === 'number' ? 12 : 'fast');
      unmount();
    }
  });

  it('keeps Enter as a new line in a several-line text box', async () => {
    render(TextField, { question: text, value: null, onchange: vi.fn() }); // multiline
    const box = screen.getByLabelText(text.label);
    box.focus();
    await fireEvent.keyDown(box, { key: 'Enter' });
    expect(document.activeElement).toBe(box);
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

  it('goes back to the time when the box loses focus, even if nothing was changed', async () => {
    render(Timer, { question: timer, value: 2.5, onchange: vi.fn() });
    await fireEvent.click(screen.getByLabelText('Edit time'));
    const box = screen.getByLabelText('Seconds');
    expect(document.activeElement).toBe(box); // ready to type
    await fireEvent.blur(box);
    expect(screen.getByLabelText('Edit time').textContent).toBe('2.5 s');
  });

  it('keeps the time when Escape is pressed in the box', async () => {
    const onchange = vi.fn();
    render(Timer, { question: timer, value: 2.5, onchange });
    await fireEvent.click(screen.getByLabelText('Edit time'));
    const box = screen.getByLabelText('Seconds') as HTMLInputElement;
    await fireEvent.input(box, { target: { value: '9' } });
    await fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.getByLabelText('Edit time').textContent).toBe('2.5 s');
    expect(onchange).not.toHaveBeenCalled();
  });

  it('shows the time running when started from the box', async () => {
    vi.useFakeTimers();
    render(Timer, { question: timer, value: 2, onchange: vi.fn() });
    await fireEvent.click(screen.getByLabelText('Edit time'));
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(screen.getByLabelText('Edit time').textContent).toBe('3.0 s');
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
    render(FieldMap, { question: map, value: null, onchange, rotated: false, image: 'data:image/png;base64,x' });
    const img = screen.getByAltText('Field');
    stubRect(img);
    await fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(onchange).toHaveBeenLastCalledWith([{ x: 0.25, y: 0.25 }]);
  });

  it('shows the field rotated and stores taps in the image frame when rotated', async () => {
    const onchange = vi.fn();
    render(FieldMap, { question: map, value: null, onchange, rotated: true, image: 'data:image/png;base64,x' });
    const img = screen.getByAltText('Field');
    stubRect(img);
    await fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(onchange).toHaveBeenLastCalledWith([{ x: 0.75, y: 0.75 }]);
    expect(img.style.transform).toBe('rotate(180deg)');
  });

  it('replaces the point when only one is allowed, and removes a tapped dot', async () => {
    const onchange = vi.fn();
    render(FieldMap, { question: { ...map, maxPoints: 1 }, value: [{ x: 0.1, y: 0.1 }], onchange, rotated: false, image: 'x' });
    const img = screen.getByAltText('Field');
    stubRect(img);
    await fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(onchange).toHaveBeenLastCalledWith([{ x: 0.25, y: 0.25 }]);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove point 1' }));
    expect(onchange).toHaveBeenLastCalledWith([]);
  });

  it('ignores taps once the maximum is reached', async () => {
    const onchange = vi.fn();
    render(FieldMap, { question: map, value: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], onchange, rotated: false, image: 'x' });
    const img = screen.getByAltText('Field');
    stubRect(img);
    await fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(onchange).not.toHaveBeenCalled();
  });
});

describe('QuestionCard', () => {
  it('shows the label, marks required questions and offers "I missed this"', async () => {
    const onmissed = vi.fn();
    render(QuestionCard, { question: counter, value: 1, missed: false, onchange: vi.fn(), onmissed, assets: {}, venueRedSide: 'left' });
    const card = screen.getByRole('region', { name: 'Coral scored' });
    expect(within(card).getByTitle('Required')).toBeTruthy();
    expect(within(card).getByLabelText('value').textContent).toBe('1');
    await fireEvent.click(within(card).getByRole('button', { name: 'I missed this' }));
    expect(onmissed).toHaveBeenCalledWith(true);
  });
  it('hides the input of a missed question and can undo', async () => {
    const onmissed = vi.fn();
    render(QuestionCard, { question: counter, value: null, missed: true, onchange: vi.fn(), onmissed, assets: {}, venueRedSide: 'left' });
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

  const open = () => {
    const onconfirm = vi.fn();
    const oncancel = vi.fn();
    render(ConfirmDialog, { title: 'Delete?', confirmLabel: 'Delete', cancelLabel: 'Keep it', onconfirm, oncancel });
    return { onconfirm, oncancel, dialog: screen.getByRole('dialog', { name: 'Delete?' }) };
  };

  it('cancels on Escape', async () => {
    const { oncancel, onconfirm } = open();
    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(oncancel).toHaveBeenCalledTimes(1);
    expect(onconfirm).not.toHaveBeenCalled();
  });

  it('cancels on a click outside the dialog, but not on one inside or a drag that ends outside', async () => {
    const { oncancel, dialog } = open();
    const backdrop = dialog.parentElement!;
    await fireEvent.pointerDown(dialog);
    await fireEvent.click(backdrop); // a drag from inside to outside
    await fireEvent.pointerDown(dialog);
    await fireEvent.click(dialog);
    expect(oncancel).not.toHaveBeenCalled();
    await fireEvent.pointerDown(backdrop);
    await fireEvent.click(backdrop);
    expect(oncancel).toHaveBeenCalledTimes(1);
  });

  it('starts on the safe button, and Enter never confirms', async () => {
    const { onconfirm } = open();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep it' }));
    const confirm = screen.getByRole('button', { name: 'Delete' });
    confirm.focus();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    confirm.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true); // the browser won't turn it into a click
    expect(onconfirm).not.toHaveBeenCalled();
  });
});
