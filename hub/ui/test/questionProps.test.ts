import type { FormDef } from '@stingr/shared';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { matchForm } from '../../../shared/test/fixtures';
import Preview from '../src/components/Preview.svelte';
import QuestionProps from '../src/components/QuestionProps.svelte';
import { addQuestion, emptyForm } from '../src/lib/formEdit';

function setup(form: FormDef, si: number, qi: number, locked: string[] = []) {
  const onchange = vi.fn();
  render(QuestionProps, { form, si, qi, lockedKeys: new Set(locked), lockedOptions: new Map(), onchange });
  const last = () => onchange.mock.lastCall![0] as FormDef;
  return { onchange, q: () => last().sections[si].questions[qi] };
}

describe('QuestionProps', () => {
  it("edits a counter's settings", async () => {
    const { q } = setup(matchForm(), 0, 1); // auto_coral
    await fireEvent.input(screen.getByLabelText('Points each'), { target: { value: '5' } });
    expect(q()).toMatchObject({ key: 'auto_coral', points: 5 });
    await fireEvent.input(screen.getByLabelText('Max'), { target: { value: '12' } });
    expect(q()).toMatchObject({ max: 12 });
    await fireEvent.input(screen.getByLabelText('Max'), { target: { value: '' } });
    expect(q()).not.toHaveProperty('max', 12);
  });

  it('uses the same field names as the problem messages, with Key beside Label and Type', () => {
    setup(matchForm(), 0, 1);
    expect(screen.getByLabelText('Min')).toBeTruthy();
    expect(screen.getByLabelText('Default')).toBeTruthy();
    const row = screen.getByLabelText('Label').closest('.row');
    expect(screen.getByLabelText('Type').closest('.row')).toBe(row);
    expect(screen.getByLabelText('Key').closest('.row')).toBe(row);
  });

  it("groups a question's own settings apart from those every question has", () => {
    setup(matchForm(), 0, 1); // auto_coral, a counter
    const own = screen.getByRole('group', { name: 'Counter (+/−) settings' });
    for (const name of ['Min', 'Max', 'Step', 'Default', 'Points each']) expect(within(own).getByLabelText(name)).toBeTruthy();
    for (const name of ['Label', 'Type', 'Key', 'Help text', 'Required', 'Summary']) expect(within(own).queryByLabelText(name)).toBeNull();
  });

  it('clears a setting that may be blank', async () => {
    const form = matchForm();
    const coral = form.sections[0].questions[1];
    if (coral.type !== 'counter') throw new Error('fixture changed');
    coral.max = 12;
    const { q } = setup(form, 0, 1); // auto_coral: max 12, 4 points each
    await fireEvent.click(screen.getByRole('button', { name: 'Clear Max' }));
    expect(q()).not.toHaveProperty('max');
    expect(q()).toMatchObject({ points: 4 });
    await fireEvent.click(screen.getByRole('button', { name: 'Clear Points each' }));
    expect(q()).not.toHaveProperty('points');
  });

  it('offers to clear exactly the settings that may be blank, greyed out while they are', () => {
    const cases: [number, number, string[]][] = [[0, 1, ['Max', 'Points each']], [0, 0, ['Points for yes']]];
    for (const [si, qi, names] of cases) {
      const { unmount } = render(QuestionProps, { form: matchForm(), si, qi, lockedKeys: new Set(), lockedOptions: new Map(), onchange: vi.fn() });
      const own = screen.getByRole('group', { name: /settings$/ });
      expect(within(own).queryAllByRole('button', { name: /^Clear / }).map(b => b.getAttribute('aria-label'))).toEqual(names.map(n => `Clear ${n}`));
      unmount();
    }
    render(QuestionProps, { form: matchForm(), si: 0, qi: 1, lockedKeys: new Set(), lockedOptions: new Map(), onchange: vi.fn() });
    expect((screen.getByRole('button', { name: 'Clear Max' }) as HTMLButtonElement).disabled).toBe(true); // no max set
    expect((screen.getByRole('button', { name: 'Clear Points each' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('names the settings group after the type, even when the type has nothing to set', () => {
    const form = addQuestion(emptyForm('match'), 0, 'timer', 'Climb time');
    setup(form, 0, 0);
    expect(within(screen.getByRole('group', { name: 'Timer settings' })).getByText(/stopwatch/)).toBeTruthy();
  });

  it('keeps small settings compact instead of stretching across the panel', () => {
    setup(matchForm(), 1, 0); // climb: Show as
    expect(screen.getByLabelText('Show as').closest('.fields')).not.toBeNull(); // the caption-and-box grid
  });

  it('explains each Summary choice in a popup beside the Summary caption', async () => {
    setup(matchForm(), 0, 1); // auto_coral, a counter
    expect(screen.queryByRole('dialog', { name: 'About Summary' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'About Summary' }));
    const pop = screen.getByRole('dialog', { name: 'About Summary' });
    for (const choice of ['Average and max', 'List of answers', "Don't summarize"]) {
      expect(within(pop).getByText(choice)).toBeTruthy();
    }
    expect(pop.textContent).toContain('For this Counter (+/−) question, the default is Average and max.');
    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'About Summary' })).toBeNull();
  });

  it("offers only the summaries that work for the question's type", () => {
    const optionsFor = (si: number, qi: number) => {
      const { unmount } = render(QuestionProps, { form: matchForm(), si, qi, lockedKeys: new Set(), lockedOptions: new Map(), onchange: vi.fn() });
      const names = [...(screen.getByLabelText('Summary') as HTMLSelectElement).options].map(o => o.textContent);
      unmount();
      return names;
    };
    expect(optionsFor(2, 0)).toEqual(['Default (Average and max)', 'List of answers', "Don't summarize"]); // rating
    expect(optionsFor(0, 0)).toEqual(['Default (Percent yes)', "Don't summarize"]); // yes / no
    expect(optionsFor(0, 2)).toEqual(['Default (Field map plot)', "Don't summarize"]); // field map
  });

  it('shows a summary that does not fit the type, marked so it can be changed', () => {
    const form = matchForm();
    form.sections[2].questions[0].summary = 'scatter'; // a rating
    setup(form, 2, 0);
    const select = screen.getByLabelText('Summary') as HTMLSelectElement;
    expect(select.selectedOptions[0].textContent).toBe("Field map plot (doesn't work for this type)");
  });

  it('explains only the summaries this type offers', async () => {
    setup(matchForm(), 0, 0); // yes / no
    await fireEvent.click(screen.getByRole('button', { name: 'About Summary' }));
    const pop = screen.getByRole('dialog', { name: 'About Summary' });
    expect([...pop.querySelectorAll('dt')].map(d => d.textContent)).toEqual(['Percent yes', "Don't summarize"]);
  });

  it('closes an info popup when clicking elsewhere or on its button again', async () => {
    setup(matchForm(), 0, 1);
    const button = screen.getByRole('button', { name: 'About Summary' });
    await fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await fireEvent.click(button);
    expect(screen.queryByRole('dialog', { name: 'About Summary' })).toBeNull();
    await fireEvent.click(button);
    await fireEvent.click(document.body);
    expect(screen.queryByRole('dialog', { name: 'About Summary' })).toBeNull();
  });

  it('explains what a key is in a popup instead of under the field', async () => {
    setup(matchForm(), 0, 1);
    expect(screen.queryByText(/column name in exports/)).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'About Key' }));
    expect(within(screen.getByRole('dialog', { name: 'About Key' })).getByText(/column name in exports/)).toBeTruthy();
  });

  it("still says why a locked key can't change", () => {
    setup(matchForm(), 0, 1, ['auto_coral']);
    expect(screen.getByText("The key is in published data, so it can't change.")).toBeTruthy();
  });

  it('locks a key that is in published data', async () => {
    const { q } = setup(matchForm(), 0, 1, ['auto_coral']);
    expect((screen.getByLabelText('Key') as HTMLInputElement).disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'Coral pieces' } });
    expect(q()).toMatchObject({ label: 'Coral pieces', key: 'auto_coral' });
  });

  it('lets the key follow the label of a new question', async () => {
    const { q } = setup(addQuestion(emptyForm('match'), 0, 'counter'), 0, 0);
    await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'Algae removed' } });
    expect(q()).toMatchObject({ label: 'Algae removed', key: 'algae_removed' });
  });

  it("clears an option's points", async () => {
    const { q } = setup(matchForm(), 1, 0); // climb: 0, 6, 12 points
    await fireEvent.click(screen.getByRole('button', { name: 'Clear option 2 points' }));
    const climb = q();
    const options = climb.type === 'choice' ? climb.options : [];
    expect(options[1]).not.toHaveProperty('points');
    expect(options.map(o => o.points)).toEqual([0, undefined, 12]);
  });

  it("greys out an option's Clear button while it has no points", () => {
    const form = matchForm();
    const climb = form.sections[1].questions[0];
    if (climb.type !== 'choice') throw new Error('fixture changed');
    delete climb.options[0].points;
    setup(form, 1, 0);
    expect((screen.getByRole('button', { name: 'Clear option 1 points' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Clear option 2 points' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('edits options and their points', async () => {
    const { q } = setup(matchForm(), 1, 0); // climb
    await fireEvent.input(screen.getByLabelText('Option 2 points'), { target: { value: '7' } });
    expect(q()).toMatchObject({ options: [{ value: 'none' }, { value: 'shallow', points: 7 }, { value: 'deep' }] });
    await fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    const climb = q();
    expect(climb.type === 'choice' ? climb.options : []).toHaveLength(4);
  });

  it('switches the question type', async () => {
    const { q } = setup(matchForm(), 0, 1);
    await fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'toggle' } });
    expect(q()).toMatchObject({ key: 'auto_coral', type: 'toggle', default: false });
  });

  it('sets which side Red is on in a field image', async () => {
    const { q } = setup(matchForm(), 0, 2); // start_pos
    const group = screen.getByRole('group', { name: 'Red side of this image' });
    await fireEvent.click(within(group).getByRole('button', { name: 'Red on the right' }));
    expect(q()).toMatchObject({ redSide: 'right' });
  });

  it('refuses field images over 2 MB', async () => {
    const { onchange } = setup(matchForm(), 0, 2);
    const big = new File([new Uint8Array(3 * 1024 * 1024)], 'field.png', { type: 'image/png' });
    await fireEvent.change(screen.getByLabelText('Field image file'), { target: { files: [big] } });
    expect(await screen.findByText('Use a smaller image (under 2 MB).')).toBeTruthy();
    expect(onchange).not.toHaveBeenCalled();
  });
});

describe('Preview', () => {
  it('shows the form as the tablet will, section by section', async () => {
    render(Preview, { form: matchForm() });
    const preview = screen.getByRole('region', { name: 'Tablet preview' });
    const coral = within(preview).getByRole('region', { name: 'Coral scored' });
    await fireEvent.click(within(coral).getByLabelText('plus'));
    expect(within(coral).getByLabelText('value').textContent).toBe('1');
    await fireEvent.click(within(preview).getByRole('button', { name: 'Endgame' }));
    expect(within(preview).getByRole('region', { name: 'Climb' })).toBeTruthy();
  });
});
