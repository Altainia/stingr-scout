import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { QrResult } from '../src/lib/api';
import { createRepeatFilter } from '../src/lib/qrScan';
import QrScan from '../src/pages/QrScan.svelte';
import { fakeApi } from './helpers';

describe('createRepeatFilter', () => {
  it('ignores the same code seen again within 3 seconds', () => {
    const isRepeat = createRepeatFilter();
    expect(isRepeat('A', 0)).toBe(false);
    expect(isRepeat('A', 1000)).toBe(true);
    expect(isRepeat('B', 1500)).toBe(false);
    expect(isRepeat('A', 3500)).toBe(true); // still in view: 2.5 s since it was last seen
    expect(isRepeat('A', 7000)).toBe(false);
  });
});

async function paste(text: string) {
  await fireEvent.input(screen.getByLabelText('QR text'), { target: { value: text } });
  await fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
}

describe('QrScan', () => {
  it('stores pasted codes and reports each result', async () => {
    const results: QrResult[] = [
      { status: 'partial', group: 'ABC.1', have: 1, total: 3 },
      { status: 'stored', record: { id: 'r', revision: 1, kind: 'match', team: 5098, matchKey: 'qm1', slot: 'red1', scout: 'Ada' } },
      { status: 'invalid', reason: 'Not a Stingr Scout QR code' },
    ];
    const qr = vi.fn(async () => results.shift()!);
    render(QrScan, { api: fakeApi({ qr }) });
    await paste('  ST1:ABC.1:1/3:DATA \n');
    expect(qr).toHaveBeenCalledWith('ST1:ABC.1:1/3:DATA ');
    await paste('ST1:...');
    await paste('hello');
    const log = screen.getByRole('list', { name: 'Scan results' });
    const items = within(log).getAllByRole('listitem').map(li => li.textContent);
    expect(items).toEqual([
      'Not stored: Not a Stingr Scout QR code',
      'Stored: Qual 1 · Red 1 · Team 5098 (Ada)',
      'Got part 1 of 3. Keep scanning the other codes.',
    ]);
  });

  it('explains when no camera can be used', async () => {
    render(QrScan, { api: fakeApi() });
    await fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    expect(screen.getByRole('alert').textContent).toContain("This browser can't use a camera here");
  });
});
