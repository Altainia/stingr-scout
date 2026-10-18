import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Home from '../src/screens/Home.svelte';
import { CONFIG, makeStore } from './helpers';

const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement).value;
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('Home', () => {
  it('groups everything for the next match in a "Match scouting" card, with pit scouting and past records beside it', async () => {
    const { store } = await makeStore();
    render(Home, { store });
    const match = screen.getByRole('region', { name: 'Match scouting' });
    for (const label of ['Match', 'Slot', 'Team']) expect(within(match).getByLabelText(label)).toBeTruthy();
    expect(within(match).getByRole('button', { name: 'Start scouting' })).toBeTruthy();
    expect(within(match).getByRole('button', { name: 'Robot not present' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Pit scouting' })).getByRole('button', { name: 'Pit scouting' })).toBeTruthy();
    const past = screen.getByRole('region', { name: 'Past records' });
    expect(within(past).getByText('0 on this tablet')).toBeTruthy();
    expect(within(past).getByRole('button', { name: 'Past records' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull(); // in the top bar now
    expect(screen.getByLabelText('Your name')).toBeTruthy();
    expect(screen.getByText('Scouting as')).toBeTruthy();
  });

  it("fills in the next match and the team for this tablet's slot", async () => {
    const { store } = await makeStore();
    render(Home, { store });
    expect(value('Match')).toBe('qm1');
    expect(value('Slot')).toBe('red1');
    expect(value('Team')).toBe('5098');
    await fireEvent.change(screen.getByLabelText('Slot'), { target: { value: 'blue1' } });
    expect(value('Team')).toBe('4');
  });

  it('starts scouting the chosen match, slot and team', async () => {
    const { store } = await makeStore();
    render(Home, { store });
    await fireEvent.click(button('Start scouting'));
    await waitFor(() => expect(store.screen).toEqual({ name: 'form' }));
    expect(store.draft?.rec).toMatchObject({ matchKey: 'qm1', slot: 'red1', team: 5098 });
  });

  it("needs the scout's name before starting", async () => {
    const { store } = await makeStore({ settings: { scout: '' } });
    render(Home, { store });
    expect(button('Start scouting').disabled).toBe(true);
    const name = screen.getByLabelText('Your name');
    await fireEvent.input(name, { target: { value: 'Bo' } });
    expect(button('Start scouting').disabled).toBe(false);
    await fireEvent.change(name);
    await waitFor(() => expect(store.settings.scout).toBe('Bo'));
  });

  it("lets the scout type a team the schedule doesn't have", async () => {
    const { store } = await makeStore();
    render(Home, { store });
    await fireEvent.change(screen.getByLabelText('Slot'), { target: { value: 'red2' } });
    expect(value('Team')).toBe('');
    expect(button('Start scouting').disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText('Team'), { target: { value: 'abc' } });
    expect(button('Start scouting').disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText('Team'), { target: { value: '254' } });
    expect(button('Start scouting').disabled).toBe(false);
    await fireEvent.click(button('Start scouting'));
    await waitFor(() => expect(store.draft?.rec).toMatchObject({ slot: 'red2', team: 254 }));
  });

  it('records a robot that is not present and moves to the next match', async () => {
    const { store } = await makeStore();
    render(Home, { store });
    await fireEvent.click(button('Robot not present'));
    const dialog = screen.getByRole('dialog', { name: 'Robot not present?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, mark as not present' }));
    await waitFor(() => expect(store.records).toHaveLength(1));
    expect(store.records[0].rec).toMatchObject({ noShow: true, matchKey: 'qm1', team: 5098 });
    await waitFor(() => expect(value('Match')).toBe('qm2'));
  });

  it('works without a schedule', async () => {
    const { store } = await makeStore({ config: { ...CONFIG, schedule: [] } });
    render(Home, { store });
    expect(value('Match number')).toBe('1');
    await fireEvent.input(screen.getByLabelText('Match number'), { target: { value: '12' } });
    await fireEvent.input(screen.getByLabelText('Team'), { target: { value: '254' } });
    await fireEvent.click(button('Start scouting'));
    await waitFor(() => expect(store.draft?.rec).toMatchObject({ matchKey: 'qm12', team: 254 }));
  });

  it('fills in the match once the first schedule arrives', async () => {
    const { store, db } = await makeStore({ config: null });
    render(Home, { store });
    expect(value('Match number')).toBe('1');
    await db.setKv('config', structuredClone(CONFIG));
    await store.reload();
    await waitFor(() => expect(value('Match')).toBe('qm1'));
    expect(value('Team')).toBe('5098');
  });

  it("keeps the scout's own match choice when a schedule arrives", async () => {
    const { store, db } = await makeStore({ config: { ...CONFIG, schedule: [] } });
    render(Home, { store });
    await fireEvent.input(screen.getByLabelText('Match number'), { target: { value: '12' } });
    await db.setKv('config', structuredClone(CONFIG));
    await store.reload();
    await waitFor(() => expect(value('Match')).toBe('__other'));
    expect(value('Match number')).toBe('12');
  });

  it('explains when nothing has been loaded from the hub', async () => {
    const { store } = await makeStore({ config: null });
    render(Home, { store });
    expect(screen.getByText(/Plug this tablet into the hub/)).toBeTruthy();
    expect(button('Start scouting').disabled).toBe(true);
  });

  it("can make the chosen slot this tablet's default", async () => {
    const { store } = await makeStore();
    render(Home, { store });
    await fireEvent.change(screen.getByLabelText('Slot'), { target: { value: 'blue3' } });
    await fireEvent.click(button("Make Blue 3 this tablet's default"));
    await waitFor(() => expect(store.settings.defaultSlot).toBe('blue3'));
  });
});
