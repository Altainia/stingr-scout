import { execFile } from 'node:child_process';

export type AdbExec = (args: string[]) => Promise<string>;
/** transportId: adb's number for the USB connection. Some tablets all report the same serial, so this is how each is addressed. */
export type AdbListing = { serial: string; state: string; model?: string; transportId?: string };
export type AdbDevice = AdbListing & { reversed: boolean; error?: string };
export type AdbStatus = { available: boolean; devices: AdbDevice[]; error?: string };

/** System prompts some tablets show on every plug-in, covering the app. The watcher dismisses only these. */
export const USB_PROMPTS = ['com.android.settings.usb.USBChangeConfigDialog', 'UsbModeChooserActivity'];

/** Reads `adb devices -l` (or plain `adb devices`). */
export function parseAdbDevices(output: string): AdbListing[] {
  return output
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('List of devices') && !l.startsWith('*'))
    .map(l => {
      const [serial, state, ...rest] = l.split(/\s+/);
      const info = Object.fromEntries(rest.flatMap(p => { const i = p.indexOf(':'); return i > 0 ? [[p.slice(0, i), p.slice(i + 1)]] : []; }));
      return {
        serial, state: state ?? 'unknown',
        ...(info.model ? { model: info.model } : {}),
        ...(info.transport_id ? { transportId: info.transport_id } : {}),
      };
    });
}

/** The adb arguments that pick out one tablet: its USB connection when known (serials can repeat), else its serial. */
const target = (d: AdbListing): string[] => (d.transportId ? ['-t', d.transportId] : ['-s', d.serial]);

function adbErrorMessage(e: unknown): string {
  const err = e as NodeJS.ErrnoException | undefined;
  if (err?.code === 'ENOENT') return 'adb is not installed. Install it with: sudo apt install adb';
  return err?.message ?? String(e);
}

export class AdbWatcher {
  status: AdbStatus = { available: false, devices: [], error: 'Not checked yet' };
  private readonly exec: AdbExec;
  private readonly port: number;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(exec: AdbExec, port: number) {
    this.exec = exec;
    this.port = port;
  }

  /** List devices and (re-)apply `adb reverse` to every authorized one. Re-applying is cheap and survives replugs. */
  async poll(): Promise<AdbStatus> {
    if (this.polling) return this.status;
    this.polling = true;
    try {
      let out: string;
      try {
        out = await this.exec(['devices', '-l']);
      } catch (e) {
        this.status = { available: false, devices: [], error: adbErrorMessage(e) };
        return this.status;
      }
      const devices: AdbDevice[] = [];
      for (const d of parseAdbDevices(out)) {
        if (d.state !== 'device') {
          devices.push({ ...d, reversed: false });
          continue;
        }
        try {
          await this.exec([...target(d), 'reverse', `tcp:${this.port}`, `tcp:${this.port}`]);
          devices.push({ ...d, reversed: true });
          await this.dismissUsbPrompt(target(d));
        } catch (e) {
          devices.push({ ...d, reversed: false, error: adbErrorMessage(e) });
        }
      }
      this.status = { available: true, devices };
      return this.status;
    } finally {
      this.polling = false;
    }
  }

  private async dismissUsbPrompt(device: string[]): Promise<void> {
    try {
      const promptShowing = async () => {
        const focus = await this.exec([...device, 'shell', 'dumpsys window | grep mCurrentFocus']);
        return USB_PROMPTS.some(p => focus.includes(p));
      };
      // Check twice so Back is never sent to the app if the scout closed the prompt in the meantime.
      if ((await promptShowing()) && (await promptShowing())) {
        await this.exec([...device, 'shell', 'input', 'keyevent', 'KEYCODE_BACK']);
      }
    } catch {
      // The tablet may be mid-unplug, or grep found nothing; try again on the next poll.
    }
  }

  start(intervalMs = 2000): void {
    if (this.timer) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function nodeAdbExec(adbPath = 'adb'): AdbExec {
  return args => new Promise((resolve, reject) => {
    execFile(adbPath, args, { timeout: 5000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}
