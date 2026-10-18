import { describe, expect, it } from 'vitest';
import { matchForm, pitForm } from '../../../shared/test/fixtures';
import { openDb } from '../src/db';
import { discardDraft, getDraft, getForm, hasDraft, latestForm, listForms, publishDraft, saveDraft } from '../src/store/forms';
import { setSetting } from '../src/store/settings';

const NOW = '2027-03-01T12:00:00.000Z';

describe('form storage', () => {
  it('starts empty', () => {
    const db = openDb(':memory:');
    expect(getDraft(db, 'match')).toBeNull();
    expect(listForms(db)).toEqual([]);
    expect(latestForm(db, 'match')).toBeUndefined();
  });

  it('publishes drafts as consecutive versions', () => {
    const db = openDb(':memory:');
    saveDraft(db, matchForm(), NOW);
    expect(hasDraft(db, 'match')).toBe(true);
    expect(publishDraft(db, 'match', NOW)).toEqual({ ok: true, form: matchForm(1), warnings: [] });
    expect(hasDraft(db, 'match')).toBe(false);
    expect(getDraft(db, 'match')).toEqual(matchForm(1));

    saveDraft(db, matchForm(7), NOW); // the version in a draft is ignored
    const second = publishDraft(db, 'match', NOW);
    expect(second.ok && second.form.version).toBe(2);
    expect(listForms(db, 'match').map(f => f.version)).toEqual([1, 2]);
    expect(getForm(db, 'match', 1)).toEqual(matchForm(1));
    expect(latestForm(db, 'match')?.version).toBe(2);
  });

  it('refuses to publish an invalid draft and keeps it', () => {
    const db = openDb(':memory:');
    saveDraft(db, { ...matchForm(), sections: [] }, NOW);
    expect(publishDraft(db, 'match', NOW)).toEqual({ ok: false, errors: ['Form has no questions'], warnings: [] });
    expect(listForms(db)).toEqual([]);
    expect(hasDraft(db, 'match')).toBe(true);
  });

  it('refuses to publish when there is no draft', () => {
    const db = openDb(':memory:');
    expect(publishDraft(db, 'pit', NOW)).toEqual({ ok: false, errors: ['There are no unpublished changes to publish'], warnings: [] });
  });

  it('discards a draft', () => {
    const db = openDb(':memory:');
    saveDraft(db, pitForm(), NOW);
    discardDraft(db, 'pit');
    expect(getDraft(db, 'pit')).toBeNull();
  });

  it('keeps match and pit forms separate', () => {
    const db = openDb(':memory:');
    saveDraft(db, pitForm(), NOW);
    publishDraft(db, 'pit', NOW);
    saveDraft(db, matchForm(), NOW);
    publishDraft(db, 'match', NOW);
    expect(listForms(db).map(f => `${f.kind}${f.version}`)).toEqual(['match1', 'pit1']);
  });

  it('keeps counting form versions after the published ones are gone', () => {
    const db = openDb(':memory:');
    setSetting(db, 'form_version_floor:match', '4');
    saveDraft(db, matchForm(), NOW);
    const res = publishDraft(db, 'match', NOW);
    expect(res.ok && res.form.version).toBe(5);
  });
});
