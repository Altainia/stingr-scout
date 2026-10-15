import { allQuestions } from './form';
import { checkRecord } from './record';
import type { AnswerValue, FormDef, FormKind, Point, Question, ScoutRecord, Slot } from './types';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

export function base45Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const n = bytes[i] * 256 + bytes[i + 1];
      out += ALPHABET[n % 45] + ALPHABET[Math.floor(n / 45) % 45] + ALPHABET[Math.floor(n / 2025)];
    } else {
      const n = bytes[i];
      out += ALPHABET[n % 45] + ALPHABET[Math.floor(n / 45)];
    }
  }
  return out;
}

export function base45Decode(text: string): Uint8Array {
  const vals = [...text].map(ch => {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error(`Invalid base45 character "${ch}"`);
    return v;
  });
  if (vals.length % 3 === 1) throw new Error('Invalid base45 length');
  const out: number[] = [];
  for (let i = 0; i < vals.length; i += 3) {
    if (i + 2 < vals.length) {
      const n = vals[i] + vals[i + 1] * 45 + vals[i + 2] * 2025;
      if (n > 0xffff) throw new Error('Invalid base45 group');
      out.push(n >> 8, n & 0xff);
    } else {
      const n = vals[i] + vals[i + 1] * 45;
      if (n > 0xff) throw new Error('Invalid base45 group');
      out.push(n);
    }
  }
  return new Uint8Array(out);
}

export const QR_FORMAT = 1;
export const QR_CHUNK_CHARS = 900;
export type FormLookup = (kind: FormKind, version: number) => FormDef | undefined;

type Payload = [
  format: number, kind: FormKind, formVersion: number, eventKey: string, matchKey: string | null,
  slot: Slot | null, team: number, scout: string, id: string, revision: number, noShow: number,
  deviceId: string, createdAt: string, updatedAt: string, photoIds: string[], values: unknown[], missed: number[],
];

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function packValue(q: Question, v: AnswerValue | undefined): unknown {
  if (v === undefined || v === null) return null;
  if (q.type === 'fieldmap' && Array.isArray(v)) return (v as Point[]).map(p => [round3(p.x), round3(p.y)]);
  return v;
}

function unpackValue(q: Question, v: unknown): AnswerValue {
  if (v === null || v === undefined) return null;
  if (q.type === 'fieldmap') return (v as [number, number][]).map(([x, y]) => ({ x, y }));
  return v as AnswerValue;
}

function recordToPayload(form: FormDef, rec: ScoutRecord): Payload {
  const qs = allQuestions(form);
  return [
    QR_FORMAT, rec.kind, rec.formVersion, rec.eventKey, rec.matchKey ?? null, rec.slot ?? null, rec.team,
    rec.scout, rec.id, rec.revision, rec.noShow ? 1 : 0, rec.deviceId, rec.createdAt, rec.updatedAt,
    rec.photoIds,
    rec.noShow ? [] : qs.map(q => packValue(q, rec.answers[q.key])),
    qs.flatMap((q, i) => (rec.missed.includes(q.key) ? [i] : [])),
  ];
}

function payloadToRecord(p: unknown, getForm: FormLookup): ScoutRecord {
  if (!Array.isArray(p) || p[0] !== QR_FORMAT || p.length !== 17) {
    throw new Error('Not a Stingr Scout QR code (or one from an incompatible version)');
  }
  const [, kind, formVersion, eventKey, matchKey, slot, team, scout, id, revision, noShow,
    deviceId, createdAt, updatedAt, photoIds, values, missed] = p as Payload;
  const form = getForm(kind, formVersion);
  if (!form) throw new Error(`This hub doesn't have ${kind} form version ${formVersion}`);
  const qs = allQuestions(form);
  const rec: ScoutRecord = {
    id, revision, kind, eventKey, formVersion,
    matchKey: matchKey ?? undefined,
    slot: slot ?? undefined,
    team, scout, deviceId,
    noShow: noShow === 1,
    answers: noShow === 1 ? {} : Object.fromEntries(qs.map((q, i) => [q.key, unpackValue(q, values[i])])),
    missed: missed.map(i => qs[i]?.key).filter((k): k is string => k !== undefined),
    photoIds, createdAt, updatedAt,
  };
  const errors = checkRecord(rec);
  if (errors.length) throw new Error(`Invalid record in QR code: ${errors.join('; ')}`);
  return rec;
}

async function pipeBytes(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  // A Response body rather than Blob.stream(): it exists everywhere this code runs, including jsdom in tests.
  const stream = new Response(bytes.slice()).body!.pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeRecordQr(form: FormDef, rec: ScoutRecord): Promise<string[]> {
  if (form.kind !== rec.kind || form.version !== rec.formVersion) throw new Error('Form does not match record');
  const json = JSON.stringify(recordToPayload(form, rec));
  const data = base45Encode(await pipeBytes(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
  const group = `${rec.id.replace(/[^0-9a-zA-Z]/g, '').slice(0, 8).toUpperCase()}.${rec.revision}`;
  const total = Math.max(1, Math.ceil(data.length / QR_CHUNK_CHARS));
  return Array.from({ length: total }, (_, i) =>
    `ST1:${group}:${i + 1}/${total}:${data.slice(i * QR_CHUNK_CHARS, (i + 1) * QR_CHUNK_CHARS)}`);
}

export interface QrChunk { group: string; part: number; total: number; data: string }

export function parseQrChunk(text: string): QrChunk | null {
  // Only strip line breaks: a trailing space can be real base45 data.
  const m = /^ST1:([0-9A-Z]{1,8}\.\d+):(\d+)\/(\d+):([\s\S]*)$/.exec(text.replace(/[\r\n]+$/, ''));
  if (!m) return null;
  const part = Number(m[2]);
  const total = Number(m[3]);
  if (total < 1 || part < 1 || part > total) return null;
  return { group: m[1], part, total, data: m[4] };
}

export type AssembleResult =
  | { status: 'partial'; group: string; have: number; total: number }
  | { status: 'complete'; group: string; data: string }
  | { status: 'invalid'; reason: string };

export class QrAssembler {
  private groups = new Map<string, { total: number; parts: Map<number, string> }>();

  add(text: string): AssembleResult {
    const c = parseQrChunk(text);
    if (!c) return { status: 'invalid', reason: 'Not a Stingr Scout QR code' };
    let g = this.groups.get(c.group);
    if (!g || g.total !== c.total) {
      g = { total: c.total, parts: new Map() };
      this.groups.set(c.group, g);
    }
    g.parts.set(c.part, c.data);
    if (g.parts.size < g.total) return { status: 'partial', group: c.group, have: g.parts.size, total: g.total };
    this.groups.delete(c.group);
    const parts = g.parts;
    const data = Array.from({ length: g.total }, (_, i) => parts.get(i + 1) ?? '').join('');
    return { status: 'complete', group: c.group, data };
  }
}

export async function decodeRecordData(data: string, getForm: FormLookup): Promise<ScoutRecord> {
  let payload: unknown;
  try {
    const bytes = await pipeBytes(base45Decode(data), new DecompressionStream('deflate-raw'));
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('QR data is corrupt');
  }
  return payloadToRecord(payload, getForm);
}
