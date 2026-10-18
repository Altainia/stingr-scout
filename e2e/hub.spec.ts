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
  await page.getByLabel('Points each', { exact: true }).fill('4');
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

  // A selected question's highlight leaves room around its buttons, and labels line up on the left.
  const rows = auto.getByRole('listitem');
  await rows.first().getByRole('button').first().click();
  const rowBox = (await rows.first().boundingBox())!;
  const rowDelete = (await rows.first().getByRole('button', { name: /^Delete/ }).boundingBox())!;
  expect(rowBox.x + rowBox.width - (rowDelete.x + rowDelete.width), 'gap between the delete button and the highlight edge').toBeGreaterThanOrEqual(6);
  const textLeft = (i: number) => rows.nth(i).getByRole('button').first().evaluate(b => {
    const r = document.createRange();
    r.selectNodeContents(b);
    return r.getBoundingClientRect().left;
  });
  expect(await textLeft(2), 'question labels line up on the left').toBeCloseTo(await textLeft(0), 0);

  // A checkbox beside a dropdown sits level with the dropdown, not below it.
  const mid = async (label: string) => { const b = (await page.getByLabel(label, { exact: true }).boundingBox())!; return b.y + b.height / 2; };
  expect(Math.abs((await mid('Required')) - (await mid('Summary'))), 'Required is level with Summary').toBeLessThanOrEqual(2);
  const props = page.getByRole('region', { name: 'Question settings' });
  const requiredCaption = (await props.getByText('Required', { exact: true }).boundingBox())!.y;
  const summaryCaption = (await page.getByLabel('Summary', { exact: true }).locator('..').boundingBox())!.y; // the label, caption first
  expect(Math.abs(requiredCaption - summaryCaption), "Required's caption is level with Summary's").toBeLessThanOrEqual(2);
});

test("lays each type's small settings out in a grid: caption, then a narrow box", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  const cases: [string, string, string[]][] = [
    ['match', 'Coral scored', ['Min', 'Max', 'Step', 'Default', 'Points each']],
    ['match', 'Left starting zone', ['Default', 'Points for yes']],
    ['match', 'Climb', ['Show as']],
    ['match', 'Defense rating', ['Highest rating']],
    ['match', 'Start position', ['Points to mark']],
    ['pit', 'Weight (lb)', ['Min', 'Max']],
  ];
  for (const [kind, question, fields] of cases) {
    await page.goto(`/hub/#/forms/${kind}`);
    await page.locator('.outline').getByRole('button', { name: new RegExp(`^${question.replace(/[()]/g, '\\$&')} ·`) }).click();
    const own = page.getByRole('group', { name: /settings$/ });
    const lefts: number[] = [];
    const tops: number[] = [];
    const clearLefts: number[] = [];
    for (const field of fields) {
      const box = own.getByLabel(field, { exact: true });
      const control = (await box.boundingBox())!;
      const label = (await box.locator('xpath=ancestor::label[1]').boundingBox())!;
      const isSelect = await box.evaluate(e => e.tagName === 'SELECT');
      expect(control.width, `${question}: ${field} is narrow`).toBeLessThanOrEqual(isSelect ? 160 : 120); // a dropdown is as wide as its longest option
      expect(label.height, `${question}: ${field} is on the same line as its caption`).toBeLessThanOrEqual(control.height + 4);
      const clear = own.getByRole('button', { name: `Clear ${field}`, exact: true });
      if (await clear.count()) {
        const c = (await clear.boundingBox())!;
        expect(Math.abs(c.y + c.height / 2 - (control.y + control.height / 2)), `${question}: Clear ${field} is on its line`).toBeLessThanOrEqual(2);
        clearLefts.push(Math.round(c.x));
      }
      lefts.push(Math.round(control.x));
      tops.push(control.y);
    }
    // A grid: one field per line, boxes lined up.
    expect(new Set(lefts).size, `${question}: boxes line up`).toBe(1);
    expect(new Set(clearLefts).size, `${question}: Clear buttons line up`).toBeLessThanOrEqual(1);
    for (let i = 1; i < tops.length; i++) expect(tops[i], `${question}: ${fields[i]} is on its own line`).toBeGreaterThan(tops[i - 1] + 20);
  }
});

test('shows every remove and delete button in red', async ({ page }) => {
  const isRed = (name: RegExp) => page.getByRole('button', { name }).evaluateAll(buttons => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--red)';
    document.body.append(probe);
    const red = getComputedStyle(probe).color;
    probe.remove();
    return buttons.map(b => `${b.getAttribute('aria-label')}: ${getComputedStyle(b).color === red && getComputedStyle(b).borderColor === red}`);
  });
  const allRed = (labels: string[]) => {
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(l).toMatch(/: true$/);
  };

  await page.goto('/hub/#/forms/match');
  await expect(page.getByText(/Published version/)).toBeVisible();
  allRed(await isRed(/^Delete section /));
  allRed(await isRed(/^Delete (?!section )/));
  await page.locator('.outline').getByRole('button', { name: /^Climb ·/ }).click();
  allRed(await isRed(/^Remove option /));

  await page.goto('/hub/#/event');
  await expect(page.getByText('Teams (12)')).toBeVisible();
  allRed(await isRed(/^Remove match /));
  allRed(await isRed(/^Remove team /));
});

test('shows the problem count and its link level with each other, after Publish', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await page.goto('/hub/#/forms/match');
  await expect(page.getByText(/Published version/)).toBeVisible();
  await page.locator('.outline').getByRole('button', { name: /^Coral scored ·/ }).click();
  await page.getByLabel('Label', { exact: true }).fill(''); // a question needs a label
  const count = page.getByText(/^\d+ problems?$/);
  const link = page.getByRole('button', { name: 'Show problems' });
  await expect(link).toBeVisible();
  const c = (await count.boundingBox())!;
  const l = (await link.boundingBox())!;
  const p = (await page.getByRole('button', { name: 'Publish', exact: true }).boundingBox())!;
  expect(Math.abs(c.y + c.height / 2 - (l.y + l.height / 2)), 'count and link are level').toBeLessThanOrEqual(2);
  expect(Math.abs(c.y + c.height / 2 - (p.y + p.height / 2)), 'level with Publish too').toBeLessThanOrEqual(2);
  expect(c.x, 'after Publish').toBeGreaterThan(p.x + p.width);

  await page.getByRole('button', { name: 'Discard changes' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText(/no unpublished changes/)).toBeVisible();
});

test('keeps an info popup on screen at the right edge', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await page.goto('/hub/#/forms/match');
  await page.locator('.outline').getByRole('button', { name: /^Coral scored ·/ }).click();
  await page.getByRole('button', { name: 'About Summary' }).click();
  const pop = (await page.getByRole('dialog', { name: 'About Summary' }).boundingBox())!;
  expect(pop.x + pop.width, 'popup ends on screen').toBeLessThanOrEqual(1280);
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, 'the page does not scroll sideways').toBeLessThanOrEqual(client);
});

test('joins single-answer buttons, sizes the timer steadily, and shows it running after editing the time', async ({ page }) => {
  await page.goto('/hub/#/forms/match');
  const preview = page.getByRole('region', { name: 'Tablet preview' });
  const box = async (l: ReturnType<typeof page.locator>) => (await l.boundingBox())!;
  const checked: string[] = [];

  for (const tab of ['Auto', 'Endgame', 'Notes']) {
    await preview.getByRole('button', { name: tab, exact: true }).click();
    // Single answers (Yes / No, a rating, a choice shown as buttons): neighbouring buttons touch, sharing a border.
    for (const [left, right] of [['Yes', 'No'], ['1', '2'], ['None', 'Shallow']]) {
      const l = preview.getByRole('button', { name: left, exact: true });
      if (!(await l.count())) continue;
      const a = await box(l.first());
      const b = await box(preview.getByRole('button', { name: right, exact: true }).first());
      expect(b.x - (a.x + a.width), `${left} and ${right} touch`).toBeLessThanOrEqual(0);
      checked.push(left);
    }
    // Multi-select keeps its gap.
    const multi = preview.getByRole('button', { name: 'Far', exact: true });
    if (await multi.count()) {
      const near = await box(preview.getByRole('button', { name: 'Near', exact: true }));
      expect((await box(multi)).x - (near.x + near.width), 'multi-select buttons keep a gap').toBeGreaterThanOrEqual(6);
    }
    // Timer: Start and Stop are the same width; started from the time box, the running time shows.
    const start = preview.getByRole('button', { name: 'Start', exact: true });
    if (await start.count()) {
      const startWidth = (await box(start)).width;
      await preview.getByRole('button', { name: 'Edit time' }).click();
      await expect(preview.getByLabel('Seconds')).toBeFocused();
      await start.click();
      const stop = preview.getByRole('button', { name: 'Stop', exact: true });
      expect((await box(stop)).width, 'Start and Stop are the same width').toBe(startWidth);
      await expect(preview.getByRole('button', { name: 'Edit time' })).not.toHaveText('0.0 s');
      await stop.click();
    }
  }
  expect(checked.sort(), 'every kind of joined group was found').toEqual(['1', 'None', 'Yes']);
});
