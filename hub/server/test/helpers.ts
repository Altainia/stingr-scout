import type { FormDef } from '@stingr/shared';
import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import { matchForm, pitForm } from '../../../shared/test/fixtures';
import { type AppOptions, buildApp } from '../src/app';
import { openDb } from '../src/db';

export const NOW = '2027-03-01T12:00:00.000Z';

export function makeApp(opts: Partial<AppOptions> = {}): Promise<FastifyInstance> {
  return buildApp({ db: openDb(':memory:'), appBuild: 'test-build', now: () => NOW, ...opts });
}

export async function publish(app: FastifyInstance, form: FormDef): Promise<FormDef> {
  const put = await app.inject({ method: 'PUT', url: `/api/forms/${form.kind}/draft`, payload: form });
  expect(put.statusCode).toBe(200);
  const pub = await app.inject({ method: 'POST', url: `/api/forms/${form.kind}/publish` });
  expect(pub.statusCode).toBe(200);
  return pub.json().form as FormDef;
}

export async function setupEvent(app: FastifyInstance, forms: FormDef[] = [matchForm(), pitForm()]): Promise<void> {
  const ev = await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027test', name: 'Test Event' } });
  expect(ev.statusCode).toBe(200);
  for (const f of forms) await publish(app, f);
}
