import { type APIRequestContext, expect, request, test } from '@playwright/test';
import { encodeRecordQr, setAnswer } from '../shared/src/index';
import { matchForm, pitForm, record } from '../shared/test/fixtures';

let api: APIRequestContext;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  api = await request.newContext({ baseURL: 'http://localhost:5199' });
});

test.afterAll(async () => {
  await api.dispose();
});

test('sets up an event, Red side and schedule', async ({ page }) => {
  await page.goto('/hub/#/event');
  await page.getByLabel('Event key').fill('2027hub');
  await page.getByLabel('Event name').fill('Hub Regional');
  await page.getByRole('button', { name: 'Create event' }).click();
  const row = page.getByRole('listitem', { name: 'Hub Regional' });
  const use = row.getByRole('button', { name: 'Use this event' });
  if (await use.isVisible()) await use.click();
  await expect(row.getByText('Current')).toBeVisible();

  await page.getByRole('group', { name: 'Red alliance side' }).getByRole('button', { name: 'Red on our right' }).click();
  await expect(page.getByRole('button', { name: 'Red on our right' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('Schedule CSV').fill('1,5098,254,1678,118,2056,148\n2,971,3476,1323,6328,4414,2910');
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await expect(page.getByText('Imported 2 matches.')).toBeVisible();
  await expect(page.getByText('Teams (12)')).toBeVisible();
});

test('edits and publishes the match form', async ({ page }) => {
  // Start from the fixture form so records below have a matching version.
  for (const form of [matchForm(), pitForm()]) {
    expect((await api.put(`/api/forms/${form.kind}/draft`, { data: form })).ok()).toBe(true);
    expect((await api.post(`/api/forms/${form.kind}/publish`)).ok()).toBe(true);
  }
  await page.goto('/hub/#/forms/match');
  await expect(page.getByText(/Published version \d+ · no unpublished changes/)).toBeVisible();
  await page.getByRole('button', { name: 'Add question to Endgame' }).click();
  await page.getByLabel('Label').fill('Algae in net');
  await page.getByLabel('Points each').fill('4');
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/Published version \d+\. Tablets get it on their next sync\./)).toBeVisible();
  const forms = await (await api.get('/api/forms')).json();
  expect(forms.filter((f: { kind: string }) => f.kind === 'match').at(-1).sections[1].questions.at(-1)).toMatchObject({ key: 'algae_in_net', points: 4 }); // Endgame
});

test('reorders questions and sections by dragging', async ({ page }) => {
  // Tall enough that every section is on screen: Playwright can't scroll in the middle of a native drag.
  await page.setViewportSize({ width: 1280, height: 2400 });
  await page.goto('/hub/#/forms/match');
  await expect(page.getByText(/Published version \d+ · no unpublished changes/)).toBeVisible();
  const climbTime = page.getByRole('region', { name: 'Section Endgame' }).getByRole('listitem').filter({ hasText: 'Climb time' });
  await climbTime.dragTo(page.getByRole('region', { name: 'Section Auto' }).getByRole('listitem').first(), { targetPosition: { x: 20, y: 2 } });
  await page.getByRole('region', { name: 'Section Notes' }).getByTitle('Drag to reorder')
    .dragTo(page.getByRole('region', { name: 'Section Auto' }), { targetPosition: { x: 40, y: 4 } });
  const titles = page.getByLabel('Section title');
  await expect(titles).toHaveCount(3);
  expect(await titles.evaluateAll(els => els.map(e => (e as HTMLInputElement).value))).toEqual(['Notes', 'Auto', 'Endgame']);
  // Each drag restarts the autosave delay, so wait until the hub has the final order.
  const savedDraft = async () => (await (await api.get('/api/forms/match/draft')).json()).draft;
  await expect.poll(async () => (await savedDraft()).sections.map((s: { title: string }) => s.title)).toEqual(['Notes', 'Auto', 'Endgame']);
  expect((await savedDraft()).sections[1].questions[0].key).toBe('climb_time');
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('Changes discarded.')).toBeVisible();
});

test('shows synced records in coverage, teams and the team page', async ({ page }) => {
  const forms = await (await api.get('/api/forms')).json();
  const v1 = forms.find((f: { kind: string; version: number }) => f.kind === 'match');
  const f = { ...matchForm(), version: v1.version };
  const a = setAnswer(setAnswer(record(f, { eventKey: '2027hub', matchKey: 'qm1', slot: 'red1', team: 5098 }), 'auto_coral', 3), 'comments', 'Strong auto');
  const b = setAnswer(record(f, { eventKey: '2027hub', matchKey: 'qm1', slot: 'red2', team: 254 }), 'auto_coral', 1);
  expect((await api.post('/api/sync', { data: { device: { id: 'e2e', name: 'E2E tablet' }, records: [a, b] } })).ok()).toBe(true);

  await page.goto('/hub/#/coverage');
  await expect(page.getByLabel('Qual 1 Red 1')).toContainText('✓');
  await page.goto('/hub/#/teams');
  await expect(page.getByRole('link', { name: '5098' })).toBeVisible();
  await page.getByRole('link', { name: '5098' }).click();
  await expect(page.getByRole('heading', { name: 'Team 5098' })).toBeVisible();
  await expect(page.getByText('Strong auto').first()).toBeVisible();
});

test('stores a pasted QR code', async ({ page }) => {
  const forms = await (await api.get('/api/forms')).json();
  const v1 = forms.find((f: { kind: string }) => f.kind === 'match');
  const f = { ...matchForm(), version: v1.version };
  const [code] = await encodeRecordQr(f, record(f, { eventKey: '2027hub', matchKey: 'qm2', slot: 'blue1', team: 6328, scout: 'Cy' }));
  await page.goto('/hub/#/qr');
  await page.getByLabel('QR text').fill(code);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Stored: Qual 2 · Blue 1 · Team 6328 (Cy)')).toBeVisible();
});

test('downloads the match CSV', async ({ page }) => {
  await page.goto('/hub/#/data');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Match data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('2027hub-matches.csv');
});

test('fits a 1280×800 laptop screen without sideways scrolling', async ({ page }) => {
  // 1280×800 less the desktop panel and browser toolbars.
  await page.setViewportSize({ width: 1280, height: 650 });
  for (const path of ['', 'event', 'forms/match', 'forms/pit', 'coverage', 'teams', 'teams/5098', 'qr', 'data', 'settings']) {
    await page.goto(`/hub/#/${path}`);
    await expect(page.locator('main h1')).toBeVisible();
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll, `#/${path} scrolls sideways`).toBeLessThanOrEqual(client);
  }

  await page.goto('/hub/#/forms/match');
  await expect(page.getByText(/Published version \d+ · no unpublished changes/)).toBeVisible();
  const top = async (name: string) => (await page.getByRole('button', { name, exact: true }).boundingBox())!.y;
  expect(await top('Publish'), 'the form toolbar wraps').toBe(await top('Hide preview'));
  const auto = page.getByRole('region', { name: 'Section Auto' });
  const titleBox = (await auto.getByLabel('Section title').boundingBox())!;
  const deleteBox = (await auto.getByRole('button', { name: 'Delete section Auto' }).boundingBox())!;
  expect(deleteBox.y, "the section's delete button wraps below its title").toBeLessThan(titleBox.y + titleBox.height);
});
