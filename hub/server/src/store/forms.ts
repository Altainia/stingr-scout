import { type FormDef, type FormKind, validateFormDef } from '@stingr/shared';
import { type Db, tx } from '../db';

type JsonRow = { json: string };
const parse = (row: JsonRow | undefined): FormDef | undefined => (row ? (JSON.parse(row.json) as FormDef) : undefined);

export function listForms(db: Db, kind?: FormKind): FormDef[] {
  const rows = (kind
    ? db.prepare('SELECT json FROM forms WHERE kind = ? ORDER BY version').all(kind)
    : db.prepare('SELECT json FROM forms ORDER BY kind, version').all()) as unknown as JsonRow[];
  return rows.map(r => JSON.parse(r.json) as FormDef);
}

export function getForm(db: Db, kind: FormKind, version: number): FormDef | undefined {
  return parse(db.prepare('SELECT json FROM forms WHERE kind = ? AND version = ?').get(kind, version) as unknown as JsonRow | undefined);
}

export function latestForm(db: Db, kind: FormKind): FormDef | undefined {
  return parse(db.prepare('SELECT json FROM forms WHERE kind = ? ORDER BY version DESC LIMIT 1').get(kind) as unknown as JsonRow | undefined);
}

export function hasDraft(db: Db, kind: FormKind): boolean {
  return db.prepare('SELECT 1 FROM form_drafts WHERE kind = ?').get(kind) !== undefined;
}

export function getDraft(db: Db, kind: FormKind): FormDef | null {
  const draft = parse(db.prepare('SELECT json FROM form_drafts WHERE kind = ?').get(kind) as unknown as JsonRow | undefined);
  return draft ?? latestForm(db, kind) ?? null;
}

export function saveDraft(db: Db, form: FormDef, now: string): void {
  db.prepare('INSERT INTO form_drafts (kind, json, updated_at) VALUES (?, ?, ?) ON CONFLICT (kind) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at')
    .run(form.kind, JSON.stringify({ ...form, version: 0 }), now);
}

export function discardDraft(db: Db, kind: FormKind): void {
  db.prepare('DELETE FROM form_drafts WHERE kind = ?').run(kind);
}

export type PublishResult =
  | { ok: true; form: FormDef; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

export function publishDraft(db: Db, kind: FormKind, now: string): PublishResult {
  const draft = parse(db.prepare('SELECT json FROM form_drafts WHERE kind = ?').get(kind) as unknown as JsonRow | undefined);
  if (!draft) return { ok: false, errors: ['There are no unpublished changes to publish'], warnings: [] };
  const earlier = listForms(db, kind);
  const form: FormDef = { ...draft, kind, version: (earlier.at(-1)?.version ?? 0) + 1 };
  const { errors, warnings } = validateFormDef(form, earlier);
  if (errors.length) return { ok: false, errors, warnings };
  tx(db, () => {
    db.prepare('INSERT INTO forms (kind, version, json, published_at) VALUES (?, ?, ?, ?)').run(kind, form.version, JSON.stringify(form), now);
    discardDraft(db, kind);
  });
  return { ok: true, form, warnings };
}
