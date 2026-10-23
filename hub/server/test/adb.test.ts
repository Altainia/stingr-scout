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

const FOCUS = '-t 1 shell dumpsys window | grep mCurrentFocus';
const BACK = '-t 1 shell input keyevent KEYCODE_BACK';
const REVERSE = '-t 1 reverse tcp:5098 tcp:5098';

const LISTING = [
  'List of devices attached',
  'G5NPCV000761Z8M        device usb:1-1 product:WW_P00C model:P00C device:P00C_2 transport_id:1',
  'ABC123                 unauthorized usb:1-2 transport_id:2',
  '',
].join('\n');

describe('parseAdbDevices', () => {
  it('reads serials and states', () => {
    expect(parseAdbDevices(LISTING)).toEqual([
      { serial: 'G5NPCV000761Z8M', state: 'device', model: 'P00C', transportId: '1' },
      { serial: 'ABC123', state: 'unauthorized', transportId: '2' },
    ]);
  });
  it('reads a plain listing too', () => {
    expect(parseAdbDevices('List of devices attached\nG5N\tdevice\n')).toEqual([{ serial: 'G5N', state: 'device' }]);
  });
  it('handles no devices', () => {
    expect(parseAdbDevices('List of devices attached\n\n')).toEqual([]);
  });
});

describe('AdbWatcher', () => {
  it('reverses the hub port for authorized tablets only', async () => {
    const { exec, calls } = fakeAdb({
      'devices -l': LISTING,
      [REVERSE]: '',
      [FOCUS]: '  mCurrentFocus=Window{1 u0 com.example/.Main}',
    });
    const status = await new AdbWatcher(exec, 5098).poll();
    expect(calls).toEqual(['devices -l', REVERSE, FOCUS]);
    expect(status).toEqual({
      available: true,
      devices: [
        { serial: 'G5NPCV000761Z8M', state: 'device', model: 'P00C', transportId: '1', reversed: true },
        { serial: 'ABC123', state: 'unauthorized', transportId: '2', reversed: false },
      ],
    });
  });

  it('dismisses the USB file-transfer prompt that covers the app', async () => {
    const { exec, calls } = fakeAdb({
      'devices -l': LISTING,
      [REVERSE]: '',
      [FOCUS]: '  mCurrentFocus=Window{940dbf0 u0 com.android.settings/com.android.settings.usb.USBChangeConfigDialog}',
      [BACK]: '',
    });
    await new AdbWatcher(exec, 5098).poll();
    expect(calls).toContain(BACK);
  });

  it('does not press Back if the prompt closed before it could', async () => {
    const prompt = '  mCurrentFocus=Window{940dbf0 u0 com.android.settings/com.android.settings.usb.USBChangeConfigDialog}';
    const app = '  mCurrentFocus=Window{3a60e2b u0 com.android.chrome/org.chromium.chrome.browser.webapps.WebappActivity}';
    const focusAnswers = [prompt, app]; // the scout closes the prompt between the two checks
    const calls: string[] = [];
    const exec: AdbExec = async args => {
      const cmd = args.join(' ');
      calls.push(cmd);
      if (cmd === 'devices -l') return LISTING;
      if (cmd === FOCUS) return focusAnswers.shift() ?? app;
      return '';
    };
    await new AdbWatcher(exec, 5098).poll();
    expect(calls).not.toContain(BACK);
  });

  it('keeps polling when the focus check fails', async () => {
    const { exec } = fakeAdb({ 'devices -l': LISTING, [REVERSE]: '', [FOCUS]: new Error('exit 1') });
    const status = await new AdbWatcher(exec, 5098).poll();
    expect(status.devices[0]).toMatchObject({ reversed: true });
  });

  it('explains how to install adb when it is missing', async () => {
    const missing = Object.assign(new Error('spawn adb ENOENT'), { code: 'ENOENT' });
    const status = await new AdbWatcher(fakeAdb({ 'devices -l': missing }).exec, 5098).poll();
    expect(status).toEqual({ available: false, devices: [], error: 'adb is not installed. Install it with: sudo apt install adb' });
  });

  it('reports a failed reverse on the device', async () => {
    const { exec } = fakeAdb({ 'devices -l': LISTING, [REVERSE]: new Error('device offline') });
    const status = await new AdbWatcher(exec, 5098).poll();
    expect(status.devices[0]).toEqual({ serial: 'G5NPCV000761Z8M', state: 'device', model: 'P00C', transportId: '1', reversed: false, error: 'device offline' });
  });

  it('links each of two tablets that report the same serial, by their USB connection', async () => {
    const twins = [
      'List of devices attached',
      '0123456789ABCDEF       device usb:1-1 product:WW_P00C model:P00C device:P00C_2 transport_id:7',
      '0123456789ABCDEF       device usb:1-2 product:WW_P00C model:P00C device:P00C_2 transport_id:9',
      '',
    ].join('\n');
    const calls: string[] = [];
    const exec: AdbExec = async args => {
      const cmd = args.join(' ');
      calls.push(cmd);
      if (cmd.includes('-s 0123456789ABCDEF')) throw new Error("adb: more than one device/emulator");
      return cmd === 'devices -l' ? twins : '';
    };
    const status = await new AdbWatcher(exec, 5098).poll();
    expect(calls).toContain('-t 7 reverse tcp:5098 tcp:5098');
    expect(calls).toContain('-t 9 reverse tcp:5098 tcp:5098');
    expect(status.devices.map(d => d.reversed)).toEqual([true, true]);
  });

  it('falls back to the serial when adb gives no transport id', async () => {
    const { exec, calls } = fakeAdb({
      'devices -l': 'List of devices attached\nG5N\tdevice\n',
      '-s G5N reverse tcp:5098 tcp:5098': '',
      '-s G5N shell dumpsys window | grep mCurrentFocus': '',
    });
    await new AdbWatcher(exec, 5098).poll();
    expect(calls).toContain('-s G5N reverse tcp:5098 tcp:5098');
  });
});
