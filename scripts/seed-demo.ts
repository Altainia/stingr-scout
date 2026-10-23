// Dev helper: load a realistic demo event into a running hub, for trying things out.
// Usage: npm run demo [-- port]   (best on an empty hub: STINGR_DATA_DIR=$(mktemp -d) npm run hub)
//
// It loads an event, the match and pit forms, a 12-match schedule, team names, scouting records for the first 9
// matches (with missed answers, a robot not present, comments and field-map points), pit records, and alliance
// results with a "Balls in hopper" field. The same data every time (a fixed random seed).
import { deflateSync } from 'node:zlib';
import { markMissed, markNoShow, setAnswer, SLOTS, type ScoutRecord } from '../shared/src/index';
import { matchForm, pitForm, record } from '../shared/test/fixtures';

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
const existing = (await call('GET', '/api/summaries')) as { summaries: { matchRecords: number }[] };
if (existing.summaries.some(s => s.matchRecords > 0)) {
  console.log('The demo event already has records; loading them again would duplicate them. Start the hub on an empty data folder to reload.');
  process.exit(0);
}
const match = matchForm();
match.assets.field = fieldPng(600, 300);
const pit = pitForm();
pit.sections[0].questions.push({ key: 'frame', label: 'Frame size', type: 'dimensions', required: false, parts: ['length', 'width', 'height'] });
const published = (await call('GET', '/api/forms')) as { kind: string; version: number }[];
for (const form of [match, pit]) {
  if (published.some(f => f.kind === form.kind)) continue; // already there
  await call('PUT', `/api/forms/${form.kind}/draft`, form);
  await call('POST', `/api/forms/${form.kind}/publish`);
}
const versions = (await call('GET', '/api/forms')) as { kind: string; version: number }[];
const versionOf = (kind: string) => Math.max(...versions.filter(f => f.kind === kind).map(f => f.version));
const teams = [5098, 254, 1678, 118, 2056, 148, 971, 3476, 1323, 6328, 4414, 2910];
const rows = Array.from({ length: 12 }, (_, i) => [i + 1, ...[0, 1, 2, 3, 4, 5].map(j => teams[(i * 5 + j) % teams.length])].join(','));
await call('POST', '/api/schedule/csv', rows.join('\n'), 'text/csv');

// A fixed random sequence, so the demo is the same every time.
let seed = 5098;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const NAMES: Record<number, string> = {
  5098: 'Stingr', 254: 'The Cheesy Poofs', 1678: 'Citrus Circuits', 118: 'Robonauts', 2056: 'OP Robotics', 148: 'Robowranglers',
  971: 'Spartan Robotics', 3476: 'Code Orange', 1323: 'MadTown Robotics', 6328: 'Mechanical Advantage', 4414: 'HighTide', 2910: 'Jack in the Bot',
};
for (const [t, name] of Object.entries(NAMES)) await call('PUT', `/api/teams/${t}/name`, { name });

// Each team has its own strength; each match varies around it.
const skill = Object.fromEntries(teams.map((t, i) => [t, 0.25 + ((i * 7) % 12) / 14]));
const scouts = ['Ada', 'Ben', 'Cy', 'Di', 'Eve', 'Flo'];
const COMMENTS = [
  'Fast driver', 'Shallow climb, slow to line up.', 'Good defense on the far side.',
  'Drove very well in auto, picked up two coral from the station quickly, then defended on the far side for the rest of the match.',
  'Intake jammed twice in teleop; the drive team fixed it during the match by backing into the wall. Worth asking them about it in the pits.',
];
const schedule = (await call('GET', '/api/schedule')) as { matchKey: string; red: number[]; blue: number[] }[];
const played = schedule.slice(0, 9);
const records: ScoutRecord[] = [];
const allianceTotals: { matchKey: string; side: 'red' | 'blue'; strength: number }[] = [];
played.forEach((m, mi) => {
  const ts = [...m.red, ...m.blue];
  SLOTS.forEach((slot, i) => {
    const team = ts[i];
    const scout = scouts[(i + mi) % scouts.length];
    const k = skill[team] * (0.75 + rand() * 0.5);
    let r = record(match, { eventKey: '2027demo', matchKey: m.matchKey, slot, team, scout, formVersion: versionOf('match'), id: `demo-${m.matchKey}-${slot}` });
    if (team === 2056 && mi === 4) {
      records.push(markNoShow(r, new Date().toISOString())); // a robot that wasn't there
      return;
    }
    r = setAnswer(r, 'auto_leave', rand() < 0.4 + k / 2);
    r = setAnswer(r, 'auto_coral', Math.round(k * 7));
    r = setAnswer(r, 'start_pos', [{ x: 0.1 + rand() * 0.15, y: 0.15 + rand() * 0.7 }]);
    r = setAnswer(r, 'climb', k > 0.75 ? 'deep' : k > 0.45 ? 'shallow' : 'none');
    r = setAnswer(r, 'climb_time', Math.round((12 - k * 8 + rand() * 2) * 10) / 10);
    r = setAnswer(r, 'defense', Math.min(5, Math.max(1, Math.round(1 + rand() * 4))));
    r = setAnswer(r, 'zones', rand() < 0.5 ? ['near'] : ['near', 'far']);
    if (rand() < 0.3) r = setAnswer(r, 'comments', pick(COMMENTS));
    if (scout === 'Ben' && rand() < 0.75) r = markMissed(r, 'defense'); // Ben keeps missing this one
    if (rand() < 0.2) r = markMissed(r, 'climb_time'); // hard to time for everyone
    records.push(r);
  });
  for (const side of ['red', 'blue'] as const) allianceTotals.push({ matchKey: m.matchKey, side, strength: m[side].reduce((a, t) => a + skill[t], 0) });
});
for (let i = 0; i < records.length; i += 25) {
  await call('POST', '/api/sync', { device: { id: 'demo-tablet', name: 'Demo tablet' }, records: records.slice(i, i + 25) });
}

// Pit scouting for most teams.
const pits = teams.slice(0, 9).map((team, i) => {
  let r = record(pit, { eventKey: '2027demo', team, scout: scouts[i % scouts.length], formVersion: versionOf('pit'), id: `demo-pit-${team}`, matchKey: undefined, slot: undefined });
  r = setAnswer(r, 'drivetrain', i % 3 ? 'swerve' : 'tank');
  r = setAnswer(r, 'frame', { length: 26 + ((i * 5) % 9) + (i % 2) / 2, width: 24 + ((i * 7) % 8), height: 34 + ((i * 11) % 14) + (i % 4) / 4 });
  return setAnswer(r, 'weight_lb', 95 + ((i * 13) % 30));
});
await call('POST', '/api/sync', { device: { id: 'demo-tablet', name: 'Demo tablet' }, records: pits });

// Alliance results: a field for this year's game, and scores for the played matches.
await call('PUT', '/api/alliance-fields', [{ key: 'hopper', label: 'Balls in hopper' }]);
for (const a of allianceTotals) {
  await call('PUT', `/api/alliance/${a.matchKey}/${a.side}/score`, { value: Math.round(a.strength * 40 + rand() * 20) });
  await call('PUT', `/api/alliance/${a.matchKey}/${a.side}/hopper`, { value: Math.round(a.strength * 12 + rand() * 6) });
}

console.log(`Demo event loaded: 12 matches (9 played), ${records.length} match records, ${pits.length} pit records, team names and alliance results.`);
