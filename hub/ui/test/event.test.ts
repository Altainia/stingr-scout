import type { EventInfo } from '@stingr/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import EventSetup from '../src/pages/EventSetup.svelte';
import { fakeApi } from './helpers';

const HEART: EventInfo = { key: '2027mokc', name: 'Heartland', redSide: 'left' };
const BUCK: EventInfo = { key: '2027ohcl', name: 'Buckeye', redSide: 'left' };
const view = (current: EventInfo | null, events: EventInfo[] = current ? [current] : []) => ({ events, current });
const panels = { schedule: async () => [], settings: async () => ({ tbaKeySet: false }), teams: async () => [] as number[] };

describe('EventSetup', () => {
  it('creates an event', async () => {
    const createEvent = vi.fn(async () => view(HEART));
    render(EventSetup, { api: fakeApi({ ...panels, events: async () => view(null), createEvent }) });
    await screen.findByText('No events yet.');
    await fireEvent.input(screen.getByLabelText('Event key'), { target: { value: ' 2027MOKC ' } });
    await fireEvent.input(screen.getByLabelText('Event name'), { target: { value: 'Heartland' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(createEvent).toHaveBeenCalledWith({ key: '2027mokc', name: 'Heartland' });
    expect(await screen.findByText('Current')).toBeTruthy();
  });

  it('switches the current event', async () => {
    const setCurrentEvent = vi.fn(async () => view(BUCK, [BUCK, HEART]));
    render(EventSetup, { api: fakeApi({ ...panels, events: async () => view(HEART, [BUCK, HEART]), setCurrentEvent }) });
    const row = await screen.findByRole('listitem', { name: 'Buckeye' });
    await fireEvent.click(within(row).getByRole('button', { name: 'Use this event' }));
    expect(setCurrentEvent).toHaveBeenCalledWith('2027ohcl');
  });

  it('sets which side Red is on', async () => {
    const createEvent = vi.fn(async () => view({ ...HEART, redSide: 'right' }));
    render(EventSetup, { api: fakeApi({ ...panels, events: async () => view(HEART), createEvent }) });
    const group = await screen.findByRole('group', { name: 'Red alliance side' });
    expect(within(group).getByRole('button', { name: 'Red on our left' }).getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(within(group).getByRole('button', { name: 'Red on our right' }));
    expect(createEvent).toHaveBeenCalledWith({ key: '2027mokc', redSide: 'right' });
    await waitFor(() => expect(within(group).getByRole('button', { name: 'Red on our right' }).getAttribute('aria-pressed')).toBe('true'));
  });

  it('refreshes the team list after a schedule import', async () => {
    const teamLists = [[] as number[], [1, 2]];
    const teams = vi.fn(async () => teamLists.shift() ?? [1, 2]);
    render(EventSetup, {
      api: fakeApi({ ...panels, teams, events: async () => view(HEART), importScheduleCsv: async () => ({ matches: 1 }) }),
    });
    expect(await screen.findByText('Teams (0)')).toBeTruthy();
    await fireEvent.input(screen.getByLabelText('Schedule CSV'), { target: { value: '1,1,2,0,0,0,0' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    expect(await screen.findByText('Teams (2)')).toBeTruthy();
  });

  it('adds and removes teams', async () => {
    const addTeam = vi.fn(async () => [254, 5098]);
    const removeTeam = vi.fn(async () => [5098]);
    render(EventSetup, { api: fakeApi({ ...panels, teams: async () => [254], events: async () => view(HEART), addTeam, removeTeam }) });
    expect(await screen.findByText('Teams (1)')).toBeTruthy();
    await fireEvent.input(screen.getByLabelText('Add team'), { target: { value: 'frc5098' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addTeam).toHaveBeenCalledWith(5098);
    expect(await screen.findByText('Teams (2)')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Remove team 254' }));
    expect(removeTeam).toHaveBeenCalledWith(254);
  });
});
