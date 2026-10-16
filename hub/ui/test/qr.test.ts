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

describe('createRepeatFilter.forget', () => {
  it('lets a code through again after it is forgotten', () => {
    const isRepeat = createRepeatFilter();
    isRepeat('A', 0);
    isRepeat.forget('A');
    expect(isRepeat('A', 500)).toBe(false);
  });
});

describe('QrScan camera', () => {
  it('turns the camera off if the page is left while the camera is still starting', async () => {
    let resolve!: (stop: () => void) => void;
    const stopped = vi.fn();
    const scanner = vi.fn(() => new Promise<() => void>(r => { resolve = r; }));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({}) } });
    try {
      const { unmount } = render(QrScan, { api: fakeApi(), scanner });
      await fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
      unmount(); // e.g. the mentor clicks another page while the browser asks for camera permission
      resolve(stopped);
      await vi.waitFor(() => expect(stopped).toHaveBeenCalled());
    } finally {
      delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    }
  });

  it('tries a code again if sending it failed', async () => {
    let onText!: (text: string) => void;
    const scanner = vi.fn(async (_video: HTMLVideoElement, cb: (text: string) => void) => { onText = cb; return () => {}; });
    let calls = 0;
    const qr = vi.fn(async () => {
      if (++calls === 1) throw new Error("Can't reach the hub server. Is it still running?");
      return { status: 'stored' as const, record: { id: 'r', revision: 1, kind: 'match' as const, team: 5098, matchKey: 'qm1', slot: 'red1', scout: 'Ada' } };
    });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({}) } });
    try {
      render(QrScan, { api: fakeApi({ qr }), scanner });
      await fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
      onText('ST1:A');
      expect(await screen.findByText(/Can't reach the hub server/)).toBeTruthy();
      onText('ST1:A'); // still in view on a later frame
      await vi.waitFor(() => expect(qr).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('Stored: Qual 1 · Red 1 · Team 5098 (Ada)')).toBeTruthy();
    } finally {
      delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    }
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
