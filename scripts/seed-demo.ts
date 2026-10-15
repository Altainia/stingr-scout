// Dev helper: load a demo event, forms and schedule into a running hub.
// Usage: npx tsx scripts/seed-demo.ts [port]
import { deflateSync } from 'node:zlib';
import { matchForm, pitForm } from '../shared/test/fixtures';

const base = `http://127.0.0.1:${process.argv[2] ?? 5098}`;

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A green field with a white centre line, red end on the left and blue on the right. */
function fieldPng(w: number, h: number): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const [r, g, b] = Math.abs(x - w / 2) < 2 ? [255, 255, 255] : x < w * 0.08 ? [198, 40, 40] : x > w * 0.92 ? [21, 101, 192] : [46, 125, 50];
      row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function call(method: string, path: string, body?: unknown, type = 'application/json'): Promise<unknown> {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': type },
    body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : String(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

await call('POST', '/api/events', { key: '2027demo', name: 'Demo Event' });
await call('PUT', '/api/events/current', { key: '2027demo' });
const match = matchForm();
match.assets.field = fieldPng(600, 300);
for (const form of [match, pitForm()]) {
  await call('PUT', `/api/forms/${form.kind}/draft`, form);
  await call('POST', `/api/forms/${form.kind}/publish`);
}
const teams = [5098, 254, 1678, 118, 2056, 148, 971, 3476, 1323, 6328, 4414, 2910];
const rows = Array.from({ length: 12 }, (_, i) => [i + 1, ...[0, 1, 2, 3, 4, 5].map(j => teams[(i * 5 + j) % teams.length])].join(','));
await call('POST', '/api/schedule/csv', rows.join('\n'), 'text/csv');
console.log('Demo event loaded: 12 matches, match and pit forms.');
