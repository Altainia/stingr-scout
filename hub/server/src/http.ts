import type { EventInfo, FormKind } from '@stingr/shared';
import type { Db } from './db';
import { currentEvent } from './store/events';

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function requireEvent(db: Db): EventInfo {
  const ev = currentEvent(db);
  if (!ev) throw new HttpError(409, 'No current event is selected. Choose one in Event setup first.');
  return ev;
}

export function parseKind(value: unknown): FormKind {
  if (value === 'match' || value === 'pit') return value;
  throw new HttpError(404, `Unknown form kind "${String(value)}"`);
}

export function bodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Expected a JSON object');
  return body as Record<string, unknown>;
}
