import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PitList from '../src/screens/PitList.svelte';
import { makeStore } from './helpers';

const row = (team: number) => screen.getByRole('listitem', { name: `Team ${team}` });

describe('PitList', () => {
  it('lists teams with their pit status and starts scouting one', async () => {
    const { store } = await makeStore();
    render(PitList, { store });
    expect(screen.getAllByRole('listitem')).toHaveLength(11);
    expect(within(row(5098)).getByText('Not scouted')).toBeTruthy();
    await fireEvent.click(within(row(5098)).getByRole('button', { name: 'Scout' }));
    await waitFor(() => expect(store.screen).toEqual({ name: 'form' }));
    expect(store.draft?.rec).toMatchObject({ kind: 'pit', team: 5098 });
  });

  it('marks a team not present after confirming, and can undo it', async () => {
    const { store } = await makeStore();
    render(PitList, { store });
    await fireEvent.click(within(row(5098)).getByRole('button', { name: 'Not present' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Yes, not present' }));
    await waitFor(() => expect(within(row(5098)).getByText('Team not present')).toBeTruthy());
    await fireEvent.click(within(row(5098)).getByRole('button', { name: 'Undo / scout anyway' }));
    await waitFor(() => expect(store.draft?.rec).toMatchObject({ kind: 'pit', team: 5098, revision: 2, noShow: false }));
  });

  it('adds a team by hand', async () => {
    const { store } = await makeStore();
    render(PitList, { store });
    await fireEvent.input(screen.getByLabelText('Add a team'), { target: { value: '254' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(row(254)).toBeTruthy());
  });

  it("asks for the scout's name first", async () => {
    const { store } = await makeStore({ settings: { scout: '' } });
    render(PitList, { store });
    expect(screen.getByText('Enter your name on the home screen first.')).toBeTruthy();
    expect((within(row(5098)).getByRole('button', { name: 'Scout' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows team names, and finds, filters and sorts teams, remembering the choice', async () => {
    const { store } = await makeStore();
    await store.pitNoShow(3);
    const { unmount } = render(PitList, { store });
    expect(within(row(5098)).getByText('Stingr')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All 11' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Not present 1' }));
    expect(screen.getAllByRole('listitem').map(li => li.getAttribute('aria-label'))).toEqual(['Team 3']);
    await fireEvent.click(screen.getByRole('button', { name: 'All 11' }));
    await fireEvent.input(screen.getByLabelText('Find a team'), { target: { value: 'sting' } });
    expect(screen.getAllByRole('listitem').map(li => li.getAttribute('aria-label'))).toEqual(['Team 5098']);
    await fireEvent.input(screen.getByLabelText('Find a team'), { target: { value: '' } });
    await fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'name' } });
    expect(screen.getAllByRole('listitem')[0].getAttribute('aria-label')).toBe('Team 5098'); // the only named team comes first
    unmount();
    render(PitList, { store }); // back from a form: the same view
    expect((screen.getByLabelText('Sort') as HTMLSelectElement).value).toBe('name');
  });

  it('says when nothing matches', async () => {
    const { store } = await makeStore();
    render(PitList, { store });
    await fireEvent.input(screen.getByLabelText('Find a team'), { target: { value: '7777' } });
    expect(screen.getByText('No teams match.')).toBeTruthy();
  });
});
