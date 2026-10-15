import { describe, expect, it } from 'vitest';
import { type AdbExec, AdbWatcher, parseAdbDevices } from '../src/adb';

function fakeAdb(responses: Record<string, string | Error>) {
  const calls: string[] = [];
  const exec: AdbExec = async args => {
    const cmd = args.join(' ');
    calls.push(cmd);
    const r = responses[cmd];
    if (r instanceof Error) throw r;
    if (r === undefined) throw new Error(`unexpected adb ${cmd}`);
    return r;
  };
  return { exec, calls };
}

const LISTING = [
  'List of devices attached',
  'G5NPCV000761Z8M        device usb:1-1 product:WW_P00C model:P00C device:P00C_2 transport_id:1',
  'ABC123                 unauthorized usb:1-2 transport_id:2',
  '',
].join('\n');

describe('parseAdbDevices', () => {
  it('reads serials and states', () => {
    expect(parseAdbDevices(LISTING)).toEqual([
      { serial: 'G5NPCV000761Z8M', state: 'device' },
      { serial: 'ABC123', state: 'unauthorized' },
    ]);
  });
  it('handles no devices', () => {
    expect(parseAdbDevices('List of devices attached\n\n')).toEqual([]);
  });
});

describe('AdbWatcher', () => {
  it('reverses the hub port for authorized tablets only', async () => {
    const { exec, calls } = fakeAdb({ devices: LISTING, '-s G5NPCV000761Z8M reverse tcp:5098 tcp:5098': '' });
    const status = await new AdbWatcher(exec, 5098).poll();
    expect(calls).toEqual(['devices', '-s G5NPCV000761Z8M reverse tcp:5098 tcp:5098']);
    expect(status).toEqual({
      available: true,
      devices: [
        { serial: 'G5NPCV000761Z8M', state: 'device', reversed: true },
        { serial: 'ABC123', state: 'unauthorized', reversed: false },
      ],
    });
  });

  it('explains how to install adb when it is missing', async () => {
    const missing = Object.assign(new Error('spawn adb ENOENT'), { code: 'ENOENT' });
    const status = await new AdbWatcher(fakeAdb({ devices: missing }).exec, 5098).poll();
    expect(status).toEqual({ available: false, devices: [], error: 'adb is not installed. Install it with: sudo apt install adb' });
  });

  it('reports a failed reverse on the device', async () => {
    const { exec } = fakeAdb({ devices: LISTING, '-s G5NPCV000761Z8M reverse tcp:5098 tcp:5098': new Error('device offline') });
    const status = await new AdbWatcher(exec, 5098).poll();
    expect(status.devices[0]).toEqual({ serial: 'G5NPCV000761Z8M', state: 'device', reversed: false, error: 'device offline' });
  });
});
