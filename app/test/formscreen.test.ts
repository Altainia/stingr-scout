import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import FormScreen from '../src/screens/FormScreen.svelte';
import { makeStore } from './helpers';

async function openMatchForm() {
  const ctx = await makeStore();
  await ctx.store.startMatch({ matchKey: 'qm1', slot: 'red1', team: 5098 });
  render(FormScreen, { store: ctx.store });
  return ctx;
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('FormScreen', () => {
  it('shows the first section and saves every change', async () => {
    const { store, db } = await openMatchForm();
    expect(screen.getByRole('heading', { name: 'Qual 1 · Red 1 · Team 5098' })).toBeTruthy();
    const coral = screen.getByRole('region', { name: 'Coral scored' });
    await fireEvent.click(within(coral).getByLabelText('plus'));
    expect(store.draft?.rec.answers.auto_coral).toBe(1);
    await waitFor(async () => expect((await db.getKv('draft'))?.rec.answers.auto_coral).toBe(1));
  });

  it('lets the scout mark a question as missed', async () => {
    const { store } = await openMatchForm();
    const coral = screen.getByRole('region', { name: 'Coral scored' });
    await fireEvent.click(within(coral).getByRole('button', { name: 'I missed this' }));
    expect(within(coral).getByText('Marked as missed.')).toBeTruthy();
    expect(store.draft?.rec.missed).toEqual(['auto_coral']);
    expect(store.draft?.rec.answers.auto_coral).toBeNull();
  });

  it('asks before submitting with unanswered required questions', async () => {
    const { store } = await openMatchForm();
    await click('Review');
    expect(screen.getByText(/Not answered yet:/).textContent).toBe('Not answered yet: Climb');
    await click('Submit');
    const dialog = screen.getByRole('dialog', { name: 'Submit with missing answers?' });
    expect(within(dialog).getByText(/You didn't answer:/).textContent).toBe("You didn't answer: Climb.");
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Submit and mark as missed' }));
    await waitFor(() => expect(store.screen).toEqual({ name: 'home' }));
    expect(store.records[0]).toMatchObject({ sync: 'pending', rec: { missed: ['climb'] } });
  });

  it('jumps from the Review page to an unanswered question', async () => {
    await openMatchForm();
    await click('Review');
    await fireEvent.click(within(screen.getByText(/Not answered yet:/)).getByRole('button', { name: 'Climb' }));
    expect(screen.getByRole('button', { name: 'Endgame' }).getAttribute('aria-pressed')).toBe('true');
    const climb = screen.getByRole('region', { name: 'Climb' });
    expect(climb.classList.contains('flash')).toBe(true);
    expect(document.activeElement).toBe(climb);
  });

  it('jumps from the missing-answers dialog to an unanswered question', async () => {
    await openMatchForm();
    await click('Review');
    await click('Submit');
    const dialog = screen.getByRole('dialog', { name: 'Submit with missing answers?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Climb' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('region', { name: 'Climb' })).toBeTruthy();
  });

  it('submits straight away when everything required is answered', async () => {
    const { store } = await openMatchForm();
    await click('Endgame');
    await fireEvent.click(within(screen.getByRole('region', { name: 'Climb' })).getByRole('button', { name: 'Deep' }));
    await click('Review');
    await click('Submit');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(store.screen).toEqual({ name: 'home' }));
    expect(store.records[0].rec).toMatchObject({ missed: [], answers: { climb: 'deep' } });
  });

  it('summarizes every answer on the Review tab', async () => {
    await openMatchForm();
    await fireEvent.click(within(screen.getByRole('region', { name: 'Coral scored' })).getByLabelText('plus'));
    await fireEvent.click(within(screen.getByRole('region', { name: 'Left starting zone' })).getByRole('button', { name: 'Yes' }));
    await click('Review');
    const summary = screen.getByRole('region', { name: 'Your answers' });
    const answer = (label: string) => within(summary).getByText(label).nextElementSibling?.textContent;
    expect(answer('Coral scored')).toBe('1');
    expect(answer('Left starting zone')).toBe('Yes');
    expect(answer('Climb')).toBe('—');
    expect(answer('Start position')).toBe('—');
  });

  it('moves between sections with Next and Back', async () => {
    await openMatchForm();
    await click('Next ›');
    expect(screen.getByRole('region', { name: 'Climb' })).toBeTruthy();
    await click('‹ Back');
    expect(screen.getByRole('region', { name: 'Coral scored' })).toBeTruthy();
  });

  it('discards only after confirmation', async () => {
    const { store } = await openMatchForm();
    await click('Cancel');
    await click('Keep editing');
    expect(store.draft).not.toBeNull();
    await click('Cancel');
    await click('Discard');
    await waitFor(() => expect(store.draft).toBeNull());
    expect(store.records).toEqual([]);
  });

  it('shows and removes robot photos on a pit form', async () => {
    const { store } = await makeStore();
    await store.startPit(5098);
    await store.addPhoto(new Uint8Array([1]).buffer, 'image/jpeg');
    render(FormScreen, { store });
    await click('Review');
    expect(screen.getByAltText('Robot photo 1')).toBeTruthy();
    await click('Remove photo 1');
    await waitFor(() => expect(store.draft?.rec.photoIds).toEqual([]));
  });

  it('shows pit photos as tiles with their Remove button underneath, in a card after the warnings', async () => {
    const { store } = await makeStore();
    await store.startPit(5098);
    await store.addPhoto(new Uint8Array([1]).buffer, 'image/jpeg');
    await store.addPhoto(new Uint8Array([2]).buffer, 'image/jpeg');
    render(FormScreen, { store });
    await click('Review');
    const photos = screen.getByRole('region', { name: 'Robot photos' });
    expect(within(photos).getByText('2 photos')).toBeTruthy();
    const tiles = photos.querySelectorAll('figure');
    expect(tiles).toHaveLength(2);
    expect(within(tiles[1] as HTMLElement).getByRole('button', { name: 'Remove photo 2' })).toBeTruthy();
    const warning = screen.getByText(/Not answered yet:/);
    expect(warning.compareDocumentPosition(photos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // warning first
  });
});
