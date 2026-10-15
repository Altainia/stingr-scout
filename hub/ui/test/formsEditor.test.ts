import { allQuestions, type FormDef } from '@stingr/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it, type Mock, vi } from 'vitest';
import { matchForm } from '../../../shared/test/fixtures';
import FormsEditor from '../src/pages/FormsEditor.svelte';
import { fakeApi } from './helpers';

function editorApi(over: Parameters<typeof fakeApi>[0] = {}) {
  return fakeApi({
    draft: async () => ({ draft: structuredClone(matchForm(1)), isDraft: false }),
    forms: async () => [matchForm(1)],
    saveDraft: vi.fn(async () => ({ errors: [], warnings: [] })),
    ...over,
  });
}

async function addToggleToAuto() {
  await fireEvent.change(screen.getByLabelText('Type for new question in Auto'), { target: { value: 'toggle' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Add question to Auto' }));
}

describe('FormsEditor', () => {
  it('opens the latest published form', async () => {
    render(FormsEditor, { api: editorApi(), kind: 'match' });
    expect(await screen.findByText('Published version 1 · no unpublished changes')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Coral scored/ })).toBeTruthy();
  });

  it('starts empty when nothing exists yet', async () => {
    render(FormsEditor, { api: editorApi({ draft: async () => ({ draft: null, isDraft: false }), forms: async () => [] }), kind: 'pit' });
    expect(await screen.findByText('Nothing published yet')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Section Robot' })).toBeTruthy();
  });

  it('adds a question and saves the draft after a pause', async () => {
    const api = editorApi();
    render(FormsEditor, { api, kind: 'match' });
    await screen.findByText(/Published version 1/);
    await addToggleToAuto();
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('New question');
    expect(api.saveDraft).not.toHaveBeenCalled();
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1));
    const [kind, form] = (api.saveDraft as Mock).mock.lastCall as [string, FormDef];
    expect(kind).toBe('match');
    expect(allQuestions(form).find(q => q.key === 'new_question')).toMatchObject({ type: 'toggle' });
    expect(await screen.findByText(/Draft saved/)).toBeTruthy();
  });

  it('saves pending changes when leaving the page', async () => {
    const api = editorApi();
    const { unmount } = render(FormsEditor, { api, kind: 'match' });
    await screen.findByText(/Published version 1/);
    await addToggleToAuto();
    unmount();
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1));
  });

  it('shows what to fix when publishing fails', async () => {
    const publish = vi.fn(async () => ({ ok: false as const, errors: ['Question "x": label is empty'], warnings: [] }));
    render(FormsEditor, { api: editorApi({ publish }), kind: 'match' });
    await fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Question "x": label is empty')).toBeTruthy();
    expect(screen.getByText('Fix these before publishing:')).toBeTruthy();
  });

  it('publishes', async () => {
    const publish = vi.fn(async () => ({ ok: true as const, form: matchForm(2), warnings: [] }));
    render(FormsEditor, { api: editorApi({ publish }), kind: 'match' });
    await fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Published version 2. Tablets get it on their next sync.')).toBeTruthy();
  });

  it('locks keys that are in published data', async () => {
    render(FormsEditor, { api: editorApi(), kind: 'match' });
    await fireEvent.click(await screen.findByRole('button', { name: /^Coral scored/ }));
    expect((screen.getByLabelText('Key') as HTMLInputElement).disabled).toBe(true);
  });

  it('discards changes after confirming', async () => {
    const discardDraft = vi.fn(async () => ({ draft: matchForm(1), isDraft: false }));
    render(FormsEditor, { api: editorApi({ draft: async () => ({ draft: matchForm(0), isDraft: true }), discardDraft }), kind: 'match' });
    await fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    const dialog = screen.getByRole('dialog', { name: 'Discard unpublished changes?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(discardDraft).toHaveBeenCalledWith('match');
    expect(await screen.findByText('Changes discarded.')).toBeTruthy();
  });

  it('drags a question into another section', async () => {
    const api = editorApi();
    render(FormsEditor, { api, kind: 'match' });
    const row = (await screen.findByRole('button', { name: /^Coral scored/ })).closest('li')!;
    const notes = screen.getByRole('region', { name: 'Section Notes' });
    await fireEvent.dragStart(row);
    await fireEvent.dragOver(notes);
    await fireEvent.drop(notes);
    expect(within(notes).getByRole('button', { name: /^Coral scored/ })).toBeTruthy();
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalled());
  });

  it('drags a section to a new position', async () => {
    render(FormsEditor, { api: editorApi(), kind: 'match' });
    const auto = await screen.findByRole('region', { name: 'Section Auto' });
    const notes = screen.getByRole('region', { name: 'Section Notes' });
    await fireEvent.dragStart(within(notes).getByTitle('Drag to reorder'));
    await fireEvent.dragOver(auto); // upper half of Auto (jsdom reports zero-size boxes)
    await fireEvent.drop(auto);
    const titles = screen.getAllByLabelText('Section title').map(i => (i as HTMLInputElement).value);
    expect(titles).toEqual(['Notes', 'Auto', 'Endgame']);
  });

  it('asks before deleting a section that has questions', async () => {
    render(FormsEditor, { api: editorApi(), kind: 'match' });
    await fireEvent.click(await screen.findByRole('button', { name: 'Delete section Auto' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete section “Auto”?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('region', { name: 'Section Auto' })).toBeNull();
  });
});
