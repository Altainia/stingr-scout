import { decodeRecordData, encodeRecordQr, type FormKind, QrAssembler } from '@stingr/shared';
import { expect, it } from 'vitest';
import { matchForm, record } from '../../shared/test/fixtures';

it('encodes and decodes QR codes in a browser-like environment', async () => {
  const f = matchForm();
  const r = record(f);
  const [code] = await encodeRecordQr(f, r);
  const res = new QrAssembler().add(code);
  if (res.status !== 'complete') throw new Error('expected one complete code');
  expect(await decodeRecordData(res.data, (kind: FormKind, v: number) => (kind === 'match' && v === 1 ? f : undefined))).toEqual(r);
});
