import { type APIRequestContext, expect, type Page, request, test } from '@playwright/test';
import { matchForm, pitForm } from '../shared/test/fixtures';

let api: APIRequestContext;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  api = await request.newContext({ baseURL: 'http://localhost:5199' });
  expect((await api.post('/api/events', { data: { key: '2027e2e', name: 'E2E Regional' } })).ok()).toBe(true);
  expect((await api.put('/api/events/current', { data: { key: '2027e2e' } })).ok()).toBe(true);
  for (const form of [matchForm(), pitForm()]) {
    expect((await api.put(`/api/forms/${form.kind}/draft`, { data: form })).ok()).toBe(true);
    expect((await api.post(`/api/forms/${form.kind}/publish`)).ok()).toBe(true);
  }
  const csv = '1,5098,2,3,4,5,6\n2,7,8,9,10,11,12';
  expect((await api.post('/api/schedule/csv', { headers: { 'content-type': 'text/csv' }, data: csv })).ok()).toBe(true);
});

test.afterAll(async () => {
  await api.dispose();
});

async function dismissSync(page: Page) {
  await expect(page.getByText('Sync complete — safe to unplug')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'OK' }).click();
}

/** A brand-new tablet: first sync, name it, enter the scout's name. */
async function firstLaunch(page: Page) {
  await page.goto('/');
  await dismissSync(page);
  await page.getByLabel('Tablet name').fill('Tablet 1');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByLabel('Your name').fill('Ada');
  await page.getByLabel('Your name').blur();
}

test('scouts a match and syncs it to the hub', async ({ page }) => {
  await firstLaunch(page);
  await expect(page.getByText('E2E Regional')).toBeVisible();
  await expect(page.getByLabel('Team')).toHaveValue('5098');
  await page.getByRole('button', { name: 'Start scouting' }).click();

  const coral = page.getByRole('region', { name: 'Coral scored' });
  await coral.getByRole('button', { name: 'plus' }).click();
  await coral.getByRole('button', { name: 'plus' }).click();
  await page.getByRole('button', { name: 'Endgame' }).click();
  await page.getByRole('region', { name: 'Climb' }).getByRole('button', { name: 'Deep' }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();

  await dismissSync(page);
  await expect(page.getByText('All synced ✓')).toBeVisible();
  const records = await (await api.get('/api/records?kind=match')).json();
  expect(records).toContainEqual(expect.objectContaining({
    team: 5098, matchKey: 'qm1', slot: 'red1', scout: 'Ada',
    answers: expect.objectContaining({ auto_coral: 2, climb: 'deep' }),
  }));
});

test('keeps working offline', async ({ page, context }) => {
  await firstLaunch(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // now controlled by the service worker
  await expect(page.getByRole('button', { name: 'Start scouting' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start scouting' })).toBeVisible();
  await expect(page.getByText('E2E Regional')).toBeVisible();
  await expect(page.getByLabel('Your name')).toHaveValue('Ada');
  await context.setOffline(false);
});

test('QR codes made on the tablet decode on the hub', async ({ page }) => {
  await firstLaunch(page);
  await page.getByRole('button', { name: 'Start scouting' }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('button', { name: 'Submit and mark as missed' }).click();
  await dismissSync(page);

  await page.getByRole('button', { name: 'Past records' }).click();
  await page.getByRole('button', { name: 'Show QR' }).first().click();
  const qr = page.locator('[data-qr-text]');
  await expect(qr.locator('svg')).toBeVisible();
  const text = await qr.getAttribute('data-qr-text');
  const res = await (await api.post('/api/qr', { data: { text } })).json();
  expect(res.status).toBe('duplicate'); // the same record already arrived over USB
});
