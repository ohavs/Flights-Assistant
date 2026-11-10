// A place's own dates and hours in the schedule (8.93.0, the owner's ask):
// out of its dates it is grey in the place list and in "move to another
// day"; out of its hours the parts of the day and the clock times are
// grey, and a time picked before the place says why and can't be saved.
// Its activity shows the hours, and warns near the opening or the closing.
// Swapping days leaves it on its own date.
//   bash scripts/run-e2e.sh tests/e2e/eventhours.e2e.mjs
// Screenshots: .e2e/eventhours/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = `${process.argv[2] || '.e2e'}/eventhours`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let failed = 0, n = 0, theme = 'light';
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${out}/fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  }
}
const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${theme}-${name}.png` }); };

const DB = 'http://127.0.0.1:8080/v1/projects/demo-flights/databases/(default)/documents';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const value = (v) => v === null ? { nullValue: null }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'string' ? { stringValue: v }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : Array.isArray(v) ? { arrayValue: { values: v.map(value) } }
  : { mapValue: { fields: fields(v) } };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, value(v)]));
const put = (path, data) => fetch(`${DB}/${path}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: fields(data) }) })
  .then(r => { if (!r.ok) throw new Error(`${path}: ${r.status}`); });
const list = (coll) => fetch(`${DB}/trips/ev/${coll}?pageSize=300`, { headers: admin }).then(r => r.json()).then(j => j.documents || []);
async function until(fn, what) {
  for (let i = 0; i < 40; i++) { const v = await fn(); if (v) return v; await page.waitForTimeout(250); }
  throw new Error(`never: ${what}`);
}
const titlesOn = async (date) => {
  const day = (await list('days')).find(d => d.fields.date?.stringValue === date);
  return (day?.fields.activities?.arrayValue.values || []).map(v => v.mapValue.fields.title.stringValue).sort();
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify([...b].sort());

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
const me = await page.evaluate(() => window.__e2eSignIn('eventhours@example.com').then(c => c.user.uid));
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1200);

await put('trips/ev', {
  name: 'וינה', destination: 'וינה, אוסטריה', dates: '10.12.2026 - 12.12.2026',
  members: { [me]: 'owner' }, memberIds: [me],
});
const place = (id, title, extra = {}) => put(`trips/ev/planning/${id}`, {
  title, category: 'אטרקציות ודברים לעשות', address: '', visited: false, createdBy: me, addedBy: me, ...extra,
});
// Every day 10:00–20:00 on the 11th and the 12th; a concert on the 10th.
await place('m', 'שוק חג המולד', { event: { startDate: '2026-12-11', endDate: '2026-12-12', startTime: '10:00', endTime: '20:00' } });
await place('c', 'קונצרט', { event: { startDate: '2026-12-10', startTime: '20:00', endTime: '23:00' } });
await place('o', 'מוזיאון');
const act = (id, title, placeId, timeLabel, order) =>
  ({ id, title, placeId, timeLabel, order, address: '', description: '', category: 'אטרקציות ודברים לעשות', createdBy: me });
await put('trips/ev/days/d1', { title: 'יום 1', order: 1, date: '2026-12-10', activities: [act('a1', 'קונצרט', 'c', '22:30', 1)] });
await put('trips/ev/days/d2', { title: 'יום 2', order: 2, date: '2026-12-11', activities: [act('a2', 'שוק חג המולד', 'm', 'ערב', 1)] });
await put('trips/ev/days/d3', { title: 'יום 3', order: 3, date: '2026-12-12', activities: [act('a3', 'מוזיאון', 'o', 'בוקר', 1)] });

const sheet = () => page.locator('.modal-content').last();
const chip = (title) => page.locator(`.dp-chip[aria-label^="${title},"]`);
const card = (title) => page.locator('.dp-card', { hasText: title }).first();
const closeTop = async () => { await page.locator('.modal-overlay button[aria-label="סגור"]').last().click(); await page.waitForTimeout(350); };

await page.locator('.trip-card', { hasText: 'וינה' }).getByText('פתח טיול').click();
await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
await page.getByRole('tab', { name: /לוח זמנים/ }).click();

await step('the activity shows the hours, and warns near the closing', async () => {
  await chip('יום 1').click();
  await card('קונצרט').getByText('מסתיים ב־23:00').waitFor();
  await chip('יום 2').click();
  await card('שוק חג המולד').getByText('נסגר ב־20:00 · עד 12.12').waitFor();
  await shot('warn-closing');
  await card('שוק חג המולד').locator('.dp-card-main').click();
  await sheet().getByText('כל יום 10:00–20:00 · 11.12–12.12').waitFor();
  await shot('details');
  await closeTop();
});

await step('a place out of the day\'s dates is grey in the list, with why', async () => {
  await chip('יום 1').click();
  await page.locator('button.fab', { hasText: 'פעילות חדשה' }).click();
  await sheet().getByRole('button', { name: 'חיפוש מקום ברשימה' }).click();
  const market = sheet().getByRole('checkbox', { name: /שוק חג המולד/ });
  await market.waitFor();
  if (!(await market.isDisabled())) throw new Error('the market can be picked on the 10th');
  await market.getByText('לא ביום הזה: רק ב־11.12–12.12').waitFor();
  if (await sheet().getByRole('checkbox', { name: /מוזיאון/ }).isDisabled()) throw new Error('a place with no dates is grey');
  await shot('picker-grey');
  await closeTop();
  await closeTop();
});

await step('out of its hours: the parts of the day and the clock times are grey', async () => {
  await chip('יום 2').click();
  await page.locator('button.fab', { hasText: 'פעילות חדשה' }).click();
  await sheet().getByRole('button', { name: 'חיפוש מקום ברשימה' }).click();
  await sheet().getByRole('checkbox', { name: /שוק חג המולד/ }).click();
  await sheet().getByRole('button', { name: 'בחירה' }).click();
  await page.waitForTimeout(400);
  await sheet().locator('.act-place-when', { hasText: 'כל יום 10:00–20:00' }).waitFor();
  if (!(await sheet().locator('.act-part', { hasText: 'לילה' }).isDisabled())) throw new Error('night can be picked');
  if (await sheet().locator('.act-part', { hasText: 'בוקר' }).isDisabled()) throw new Error('morning is grey');
  await shot('parts-grey');
  await sheet().locator('.picker-field').click();
  const wheel = page.locator('.wheel[aria-label="שעה"]');
  await wheel.waitFor();
  if (!(await wheel.locator('.wheel-row.off', { hasText: /^21$/ }).count())) throw new Error('21 is not grey');
  if (await wheel.locator('.wheel-row.off', { hasText: /^12$/ }).count()) throw new Error('12 is grey');
  await shot('wheel-grey');
  await page.locator('.picker-card .btn-secondary').click();
  await page.waitForTimeout(300);
  await closeTop();
  // Leaving with something chosen asks first.
  const leave = page.getByRole('button', { name: /צא בלי לשמור|יציאה|סגור בלי/ });
  if (await leave.count()) await leave.first().click();
  await page.waitForTimeout(350);
});

await step('a time picked before the place: says why, and can\'t be saved', async () => {
  await chip('יום 3').click();
  await page.locator('button.fab', { hasText: 'פעילות חדשה' }).click();
  await sheet().locator('.act-part', { hasText: 'לילה' }).click();
  await sheet().getByRole('button', { name: 'חיפוש מקום ברשימה' }).click();
  await sheet().getByRole('checkbox', { name: /שוק חג המולד/ }).click();
  await sheet().getByRole('button', { name: 'בחירה' }).click();
  await page.waitForTimeout(400);
  await sheet().locator('.act-form-error', { hasText: 'רק בשעות 10:00–20:00' }).waitFor();
  if (!(await sheet().locator('.sheet-footer button[type="submit"]').isDisabled())) throw new Error('can be saved');
  await shot('form-refused');
  // Another time, and it saves, with its hours on it.
  await sheet().locator('.act-part', { hasText: 'לילה' }).click();
  await sheet().locator('.act-part', { hasText: 'צהריים' }).click();
  await sheet().locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  await card('שוק חג המולד').getByText('10:00–20:00 · יום אחרון').waitFor();
  await until(async () => same(await titlesOn('2026-12-12'), ['מוזיאון', 'שוק חג המולד']), 'saved');
  await shot('saved');
});

await step('moving to another day: out of its dates is grey', async () => {
  await chip('יום 2').click();
  await page.locator('button[aria-label="פעולות: שוק חג המולד"]').click();
  await sheet().getByText('העברה ליום אחר').click();
  const d1 = sheet().locator('.list-row', { hasText: 'יום 1' });
  await d1.waitFor();
  if (!(await d1.isDisabled())) throw new Error('can move to the 10th');
  await d1.getByText('לא אפשרי: רק ב־11.12–12.12').waitFor();
  if (await sheet().locator('.list-row', { hasText: 'יום 3' }).isDisabled()) throw new Error('the 12th is grey');
  await shot('move-grey');
  await closeTop();
  // The concert has no other day at all.
  await chip('יום 1').click();
  await page.locator('button[aria-label="פעולות: קונצרט"]').click();
  if (!(await sheet().getByRole('button', { name: /העברה ליום אחר/ }).isDisabled())) throw new Error('the concert can move');
  await sheet().getByText('אין יום אחר בתאריכים שלו (רק ב־10.12)').waitFor();
  await closeTop();
});

await step('swapping days leaves a place with dates on its own date', async () => {
  await chip('יום 1').click();
  await page.getByRole('button', { name: 'פעולות ליום' }).click();
  await sheet().getByText('החלפה עם יום אחר').click();
  await sheet().locator('.list-row', { hasText: 'יום 2' }).click();
  await page.locator('.toast', { hasText: 'האירועים נשארו בתאריך שלהם' }).waitFor();
  await until(async () => same(await titlesOn('2026-12-10'), ['קונצרט']), 'the concert stays on the 10th');
  await until(async () => same(await titlesOn('2026-12-11'), ['שוק חג המולד']), 'the market stays on the 11th');
  await shot('swapped');
});

await step('dark mode', async () => {
  theme = 'dark';
  await page.locator('button[aria-label="עבור למצב כהה"]').click();
  await chip('יום 3').click();
  await shot('day-3');
  await page.locator('button[aria-label="עבור למצב בהיר"]').click();
  theme = 'light';
});

if (errors.length) { console.log('  page errors:', errors); failed++; }
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('eventhours: all passed');
