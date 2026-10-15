import { describe, expect, it } from 'vitest';
import { base45Decode, base45Encode, decodeRecordData, encodeRecordQr, parseQrChunk, QrAssembler } from '../src/qr';
import { markMissed, markNoShow, setAnswer } from '../src/record';
import type { FormDef, FormKind, ScoutRecord } from '../src/types';
import { matchForm, pitForm, record } from './fixtures';

const forms: FormDef[] = [matchForm(), pitForm()];
const lookup = (kind: FormKind, version: number) => forms.find(f => f.kind === kind && f.version === version);
const ALNUM = /^[0-9A-Z $%*+\-./:]+$/;

async function roundTrip(form: FormDef, rec: ScoutRecord) {
  const chunks = await encodeRecordQr(form, rec);
  const asm = new QrAssembler();
  let res = asm.add(chunks[0]);
  for (const c of chunks.slice(1)) res = asm.add(c);
  if (res.status !== 'complete') throw new Error(`expected complete, got ${res.status}`);
  return { chunks, decoded: await decodeRecordData(res.data, lookup) };
}

describe('base45', () => {
  const enc = (s: string) => base45Encode(new TextEncoder().encode(s));
  it.each([['AB', 'BB8'], ['Hello!!', '%69 VD92EX0'], ['base-45', 'UJCLQE7W581']])('%s ↔ %s', (plain, coded) => {
    expect(enc(plain)).toBe(coded);
    expect(new TextDecoder().decode(base45Decode(coded))).toBe(plain);
  });
  it('rejects invalid input', () => {
    expect(() => base45Decode('GGW')).toThrow();
    expect(() => base45Decode('a')).toThrow();
    expect(() => base45Decode('A')).toThrow();
  });
});

describe('record QR codes', () => {
  it('round-trips a filled match record in one code', async () => {
    const f = matchForm();
    let r = record(f, { id: '6f1c2b9e-0d4a-4c1e-9a7b-3e2f1d0c9b8a' });
    r = setAnswer(r, 'auto_coral', 3);
    r = setAnswer(r, 'climb', 'deep');
    r = setAnswer(r, 'start_pos', [{ x: 0.25, y: 0.5 }]);
    r = setAnswer(r, 'zones', ['near', 'far']);
    r = setAnswer(r, 'comments', 'Fast, "great" driver');
    r = markMissed(r, 'defense');
    const { chunks, decoded } = await roundTrip(f, r);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatch(/^ST1:6F1C2B9E\.1:1\/1:/);
    expect(chunks[0]).toMatch(ALNUM);
    expect(decoded).toEqual(r);
  });

  it('round-trips a pit no-show', async () => {
    const f = pitForm();
    const r = markNoShow(record(f), '2027-03-01T11:00:00.000Z');
    expect((await roundTrip(f, r)).decoded).toEqual(r);
  });

  it('splits a large record into parts that can arrive in any order', async () => {
    let seed = 1;
    const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    const text = Array.from({ length: 4000 }, () => 'abcdefghijklmnopqrstuvwxyz '[Math.floor(rand() * 27)]).join('');
    const f = matchForm();
    const r = setAnswer(record(f), 'comments', text);
    const chunks = await encodeRecordQr(f, r);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c).toMatch(ALNUM);

    const asm = new QrAssembler();
    const reversed = [...chunks].reverse();
    for (const c of reversed.slice(0, -1)) expect(asm.add(c).status).toBe('partial');
    expect(asm.add(reversed[0])).toMatchObject({ status: 'partial', have: chunks.length - 1 }); // duplicate part
    const done = asm.add(reversed[reversed.length - 1]);
    if (done.status !== 'complete') throw new Error('expected complete');
    expect(await decodeRecordData(done.data, lookup)).toEqual(r);
  });

  it('rejects codes that are not ours', () => {
    expect(new QrAssembler().add('https://example.com')).toEqual({ status: 'invalid', reason: 'Not a Stingr Scout QR code' });
    expect(parseQrChunk('ST1:ABC.1:3/2:XX')).toBeNull();
  });

  it('explains when the hub lacks the form version', async () => {
    const f2 = matchForm(2);
    const chunks = await encodeRecordQr(f2, record(f2));
    const res = new QrAssembler().add(chunks[0]);
    if (res.status !== 'complete') throw new Error('expected complete');
    await expect(decodeRecordData(res.data, lookup)).rejects.toThrow("This hub doesn't have match form version 2");
  });

  it('rejects corrupt data', async () => {
    await expect(decodeRecordData('ZZZZ', lookup)).rejects.toThrow('QR data is corrupt');
  });
});
