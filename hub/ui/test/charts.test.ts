import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import MatchLineChart from '../src/components/MatchLineChart.svelte';
import CompareChart from '../src/components/CompareChart.svelte';
import PointsChart from '../src/components/PointsChart.svelte';

const SECTIONS = [{ id: 'auto', title: 'Auto' }, { id: 'endgame', title: 'Endgame' }];
const MATCHES = [
  { label: 'Qual 1', scout: 'Ada', state: 'ok' as const, sections: [4, 6] },
  { label: 'Qual 2', scout: 'Ben', state: 'ok' as const, sections: [8, 12] },
  { label: 'Qual 3', scout: 'Cy', state: 'missed' as const, sections: [null, null] },
  { label: 'Qual 4', scout: 'Di', state: 'noshow' as const, sections: [null, null] },
];

describe('PointsChart', () => {
  it('draws a stacked column per match, with gaps marked, a legend and the event average', () => {
    render(PointsChart, { matches: MATCHES, sections: SECTIONS, eventAverage: 14 });
    const chart = screen.getByRole('img', { name: /^Points per match/ });
    expect(chart.querySelectorAll('.segment')).toHaveLength(4); // two matches × two sections
    expect(within(chart).getByText('⚠')).toBeTruthy(); // missed: no value, not a zero
    expect(within(chart).getByText('✗')).toBeTruthy(); // robot not there
    expect(within(chart).getByText('Event avg 14')).toBeTruthy();
    const legend = screen.getByRole('list', { name: 'Sections' });
    expect(within(legend).getAllByRole('listitem').map(li => li.textContent?.trim())).toEqual(['Auto', 'Endgame', 'Event average']);
  });

  it('shows a match in a tooltip on hover or keyboard focus', async () => {
    render(PointsChart, { matches: MATCHES, sections: SECTIONS, eventAverage: 14 });
    await fireEvent.focus(screen.getByRole('button', { name: /Qual 2/ }));
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toContain('Qual 2');
    expect(tip.textContent).toContain('20 points');
    expect(tip.textContent).toMatch(/8\s*Auto/); // the value leads
    expect(tip.textContent).toContain('Ben');
  });

  it('has the same numbers as a table', async () => {
    render(PointsChart, { matches: MATCHES, sections: SECTIONS, eventAverage: 14 });
    const table = screen.getByRole('table', { name: 'Points by section' });
    const rows = within(table).getAllByRole('row').map(r => r.textContent);
    expect(rows[2]).toContain('Qual 2');
    expect(rows[2]).toContain('20');
    expect(rows[4]).toContain('not there');
  });
});

describe('PointsChart with alliance results', () => {
  const ALLIANCE = [
    { score: 87, opponent: 64 }, { score: 50, opponent: 71 }, { score: null, opponent: null }, { score: 40, opponent: 40 },
  ];

  it('draws the alliance score as a faint column behind each match, with W, L or T', () => {
    render(PointsChart, { matches: MATCHES, sections: SECTIONS, eventAverage: 14, alliance: ALLIANCE });
    const chart = screen.getByRole('img', { name: /^Points per match/ });
    expect(chart.querySelectorAll('.alliance-col')).toHaveLength(3);
    expect([...chart.querySelectorAll('text.result')].map(t => t.textContent)).toEqual(['W', 'L', 'T']);
    const legend = screen.getByRole('list', { name: 'Sections' });
    expect(within(legend).getByText('Alliance score')).toBeTruthy();
  });

  it('gives the alliance and opponents in the tooltip and the table', async () => {
    render(PointsChart, { matches: MATCHES, sections: SECTIONS, eventAverage: 14, alliance: ALLIANCE });
    await fireEvent.focus(screen.getByRole('button', { name: /Qual 1/ }));
    expect(screen.getByRole('tooltip').textContent).toMatch(/Alliance 87 · opponents 64 \(won\)/);
    const table = screen.getByRole('table', { name: 'Points by section' });
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toContain('Alliance');
  });
});

describe('MatchLineChart', () => {
  const values = [
    { label: 'Qual 1', scout: 'Ada', state: 'ok' as const, value: 2 },
    { label: 'Qual 2', scout: 'Ben', state: 'ok' as const, value: 5 },
    { label: 'Qual 3', scout: 'Cy', state: 'missed' as const, value: null },
    { label: 'Qual 4', scout: 'Di', state: 'ok' as const, value: 4 },
    { label: 'Qual 5', scout: 'Eve', state: 'noshow' as const, value: null },
  ];

  it('plots the known values, breaks the line at a gap, and marks it', () => {
    render(MatchLineChart, { title: 'Coral scored', matches: values, eventAverage: 3.5 });
    const chart = screen.getByRole('img', { name: /^Coral scored by match/ });
    expect(chart.querySelectorAll('circle.dot')).toHaveLength(3);
    expect(chart.querySelectorAll('path.line')).toHaveLength(2); // Qual 1–2, then Qual 4 on its own
    expect(within(chart).getByText('⚠')).toBeTruthy();
    expect(within(chart).getByText('✗')).toBeTruthy();
    expect(within(chart).getByText('Event avg 3.5')).toBeTruthy();
  });

  it('follows the arrow keys with a tooltip', async () => {
    render(MatchLineChart, { title: 'Coral scored', matches: values, eventAverage: 3.5 });
    const chart = screen.getByRole('img', { name: /^Coral scored by match/ });
    await fireEvent.focus(chart);
    expect(screen.getByRole('tooltip').textContent).toContain('Qual 1');
    await fireEvent.keyDown(chart, { key: 'ArrowRight' });
    await fireEvent.keyDown(chart, { key: 'ArrowRight' });
    const tip = screen.getByRole('tooltip').textContent ?? '';
    expect(tip).toContain('Qual 3');
    expect(tip).toContain('missed');
  });
});

describe('CompareChart', () => {
  const series = [
    { id: '5098', name: '5098 Stingr', slot: 1, matches: [
      { label: 'Qual 1', scout: 'Ada', state: 'ok' as const, value: 10 },
      { label: 'Qual 7', scout: 'Ben', state: 'ok' as const, value: 20 },
      { label: 'Qual 12', scout: 'Cy', state: 'ok' as const, value: 30 },
    ] },
    { id: '254', name: '254 The Cheesy Poofs', slot: 3, matches: [
      { label: 'Qual 2', scout: 'Di', state: 'ok' as const, value: 25 },
      { label: 'Qual 9', scout: 'Eve', state: 'noshow' as const, value: null },
    ] },
  ];

  it("draws each team's matches in order, with a legend and a label at each line's end", () => {
    render(CompareChart, { title: 'Points per match', series, eventAverage: 18 });
    const chart = screen.getByRole('img', { name: /^Points per match, compared/ });
    expect(chart.querySelectorAll('path.line')).toHaveLength(2);
    expect((chart.querySelector('path.line[data-team="254"]') as SVGElement).style.stroke).toBe('var(--chart-3)'); // its own colour
    expect([...chart.querySelectorAll('text.end-label')].map(t => t.textContent)).toEqual(['5098', '254']);
    expect(within(chart).getByText('3rd')).toBeTruthy(); // the x axis counts each team's matches
    expect(within(chart).getByText('✗')).toBeTruthy();
    expect(within(chart).getByText('Event avg 18')).toBeTruthy();
    const legend = screen.getByRole('list', { name: 'Teams' });
    expect(within(legend).getAllByRole('listitem').map(li => li.textContent?.trim())).toEqual(['5098 Stingr', '254 The Cheesy Poofs', 'Event average']);
  });

  it('lists every team at a point in the tooltip, with the match it was', async () => {
    render(CompareChart, { title: 'Points per match', series, eventAverage: 18 });
    const chart = screen.getByRole('img', { name: /^Points per match, compared/ });
    await fireEvent.focus(chart);
    await fireEvent.keyDown(chart, { key: 'ArrowRight' });
    const tip = screen.getByRole('tooltip').textContent ?? '';
    expect(tip).toContain('2nd match');
    expect(tip).toMatch(/20\s*5098 Stingr\s*Qual 7/);
    expect(tip).toMatch(/robot not there\s*254 The Cheesy Poofs\s*Qual 9/);
  });
});
