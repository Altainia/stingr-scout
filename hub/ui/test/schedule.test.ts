import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SchedulePanel from '../src/components/SchedulePanel.svelte';
import { fakeApi } from './helpers';

const QM1 = { matchKey: 'qm1', red: [1, 2, 3] as [number, number, number], blue: [4, 5, 6] as [number, number, number] };

describe('SchedulePanel', () => {
  it('offers The Blue Alliance only once a key is saved', async () => {
    render(SchedulePanel, { api: fakeApi({ schedule: async () => [], settings: async () => ({ tbaKeySet: false }) }) });
    expect(await screen.findByRole('link', { name: 'Settings' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download from The Blue Alliance' })).toBeNull();
  });

  it('downloads from The Blue Alliance', async () => {
    const schedule = vi.fn(async () => [QM1]);
    const fetchTba = vi.fn(async () => ({ matches: 72, teams: 40, scheduleReplaced: true }));
    render(SchedulePanel, { api: fakeApi({ schedule, settings: async () => ({ tbaKeySet: true }), fetchTba }) });
    await fireEvent.click(await screen.findByRole('button', { name: 'Download from The Blue Alliance' }));
    expect(await screen.findByText('Downloaded 72 matches and 40 teams from The Blue Alliance.')).toBeTruthy();
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('lists every problem in a bad CSV', async () => {
    const importScheduleCsv = vi.fn(async () => ({ errors: ['Line 2: "x" is not a match number or key', 'Line 3: "abc" is not a team number'] }));
    render(SchedulePanel, { api: fakeApi({ schedule: async () => [], settings: async () => ({ tbaKeySet: false }), importScheduleCsv }) });
    await fireEvent.input(await screen.findByLabelText('Schedule CSV'), { target: { value: '1,1,2,3,4,5,6\nx,1,2,3,4,5,6\n2,1,2,abc,4,5,6' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    expect(await screen.findByText('Line 2: "x" is not a match number or key')).toBeTruthy();
    expect(screen.getByText('Line 3: "abc" is not a team number')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('The schedule was not imported');
  });

  it('imports a good CSV', async () => {
    render(SchedulePanel, { api: fakeApi({ schedule: async () => [], settings: async () => ({ tbaKeySet: false }), importScheduleCsv: async () => ({ matches: 2 }) }) });
    await fireEvent.input(await screen.findByLabelText('Schedule CSV'), { target: { value: '1,1,2,3,4,5,6\n2,1,2,3,4,5,6' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    expect(await screen.findByText('Imported 2 matches.')).toBeTruthy();
  });

  it('edits the schedule by hand', async () => {
    const saveSchedule = vi.fn(async (m: unknown[]) => m as never);
    render(SchedulePanel, { api: fakeApi({ schedule: async () => [QM1], settings: async () => ({ tbaKeySet: false }), saveSchedule }) });
    await fireEvent.input(await screen.findByLabelText('Match 1 Red 1'), { target: { value: '9999' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add match' }));
    expect((screen.getByLabelText('Match 2') as HTMLInputElement).value).toBe('qm2');
    await fireEvent.input(screen.getByLabelText('Match 2 Blue 3'), { target: { value: 'frc254' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(saveSchedule).toHaveBeenCalledWith([
      { matchKey: 'qm1', red: [9999, 2, 3], blue: [4, 5, 6] },
      { matchKey: 'qm2', red: [0, 0, 0], blue: [0, 0, 254] },
    ]);
    expect(await screen.findByText('Saved 2 matches.')).toBeTruthy();
  });
});
