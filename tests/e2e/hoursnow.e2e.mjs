// Opening hours right now (8.98.0, the owner's ask): while the trip is on,
// every place card says how it stands at the phone's clock ("פתוח עד",
// "נסגר בעוד 40 דק׳", "נפתח ב־"), and a place closed for the rest of the
// day is grey with when it opens next. Before the trip: the day's hours.
//   bash scripts/run-e2e.sh tests/e2e/hoursnow.e2e.mjs
// Screenshots: .e2e/hoursnow/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = `${process.argv[2] || '.e2e'}/hoursnow`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', timezoneId: 'UTC' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let failed = 0, n = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${out}/fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  }
}
const shot = async (name, opts = {}) => { await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png`, ...opts }); };

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

// Tuesday 15.12.2026, 21:00: the trip (flights on the 12th and the 16th) is on.
await page.clock.setFixedTime(new Date('2026-12-15T21:00:00Z'));
await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
const me = await page.evaluate(() => window.__e2eSignIn('hoursnow@example.com').then(c => c.user.uid));
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1200);

await put('trips/hn', {
  name: 'וינה', destination: 'וינה, אוסטריה', dates: '12.12.2026 - 16.12.2026',
  members: { [me]: 'owner' }, memberIds: [me],
  outboundFlightDetails: { date: '2026-12-12', flightNumber: 'LY361' },
  returnFlightDetails: { date: '2026-12-16', flightNumber: 'LY362' },
});
const every = (...r) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [String(d), r]));
const place = (id, title, category, extra = {}) => put(`trips/hn/planning/${id}`, {
  title, category, address: '', visited: false, createdBy: me, addedBy: me, ...extra,
});
const ATT = 'אטרקציות ודברים לעשות', FOOD = 'אוכל ומסעדות';
// Sun–Thu 09–17: closed since 17:00, opens tomorrow.
await place('m', 'מוזיאון ההיסטוריה', ATT, { openHours: { ...every({ from: '09:00', to: '17:00' }), 5: [{ from: '09:00', to: '13:00' }], 6: [] } });
// Closes at 21:40: in 40 minutes.
await place('r', 'מסעדת שניצל', FOOD, { openHours: every({ from: '12:00', to: '15:00' }, { from: '18:00', to: '21:40' }) });
// Open past midnight.
await place('b', 'בר על הגג', FOOD, { openHours: every({ from: '20:00', to: '02:00' }) });
// Opens later tonight.
await place('j', 'מועדון ג׳אז', ATT, { openHours: every({ from: '22:30', to: '03:00' }) });
// Closed on Tuesdays.
await place('g', 'גלריה', ATT, { openHours: { ...every({ from: '10:00', to: '18:00' }), 2: [] } });
// No hours: nothing on its card. Visited: neither.
await place('p', 'פארק העיר', ATT);
await place('v', 'קפה מוצרט', FOOD, { visited: true, openHours: every({ from: '08:00', to: '23:00' }) });

const plan = (t) => page.locator('.plan-card', { hasText: t }).first();
const hours = (t) => plan(t).locator('.plan-hours');
const expectHours = async (t, text) => {
  await hours(t).first().waitFor();
  const got = (await hours(t).first().innerText()).trim();
  if (got !== text) throw new Error(`${t}: "${got}", not "${text}"`);
};
const grey = (t) => plan(t).evaluate(el => !!el.closest('.closed-now'));
const layout = async (label) => {
  await page.locator('button[aria-label="מיון ותצוגה"]').click();
  await page.locator('.modal-content').last().getByText(label, { exact: true }).click();
  await page.locator('.modal-overlay button[aria-label="סגור"]').last().click();
  await page.waitForTimeout(400);
};

await page.locator('.trip-card', { hasText: 'וינה' }).getByText('פתח טיול').click();
await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
await plan('מוזיאון').waitFor();

await step('during the trip: every card says how its place stands now', async () => {
  await expectHours('מסעדת שניצל', 'נסגר בעוד 40 דק׳');
  await expectHours('בר על הגג', 'פתוח עד 02:00');
  await expectHours('מועדון ג׳אז', 'נפתח ב־22:30');
  await expectHours('מוזיאון', 'סגור עכשיו · נפתח מחר ב־09:00');
  await expectHours('גלריה', 'סגור היום · נפתח מחר ב־10:00');
  if (await hours('פארק העיר').count()) throw new Error('a place with no hours has a pill');
  if (await hours('קפה מוצרט').count()) throw new Error('a visited place has a pill');
  // Closed for the rest of the day: grey. The rest are not.
  if (!(await grey('מוזיאון')) || !(await grey('גלריה'))) throw new Error('a closed place is not grey');
  for (const t of ['מסעדת שניצל', 'בר על הגג', 'מועדון ג׳אז', 'פארק העיר']) if (await grey(t)) throw new Error(`${t} is grey`);
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.app-content')?.scrollTo(0, 0); });
  await shot('stub');
  await plan('בר על הגג').evaluate(el => el.closest('.plan-group')?.scrollIntoView({ block: 'start' }));
  await shot('stub-food');
});

await step('the details: how it stands now, over the week', async () => {
  await plan('מסעדת שניצל').click();
  const now = page.locator('.modal-content').last().locator('.hours-now');
  await now.waitFor();
  if ((await now.innerText()).trim() !== 'נסגר בעוד 40 דק׳ (ב־21:40)') throw new Error(await now.innerText());
  await now.scrollIntoViewIfNeeded();
  await shot('details');
  await page.locator('.modal-overlay button[aria-label="סגור"]').last().click();
  await page.waitForTimeout(350);
});

await step('the compact list and the grid say it too', async () => {
  await layout('קומפקטי');
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.app-content')?.scrollTo(0, 0); });
  await expectHours('מסעדת שניצל', 'נסגר בעוד 40 דק׳');
  if (!(await grey('מוזיאון'))) throw new Error('not grey in the compact list');
  await shot('compact');
  await layout('רשת');
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.app-content')?.scrollTo(0, 0); });
  await expectHours('בר על הגג', 'פתוח עד 02:00');
  // A tile is narrow: the status, without when it opens.
  await expectHours('מוזיאון', 'סגור עכשיו');
  if (!(await grey('גלריה'))) throw new Error('not grey in the grid');
  await shot('grid');
  await layout('עמודת זמן');
});

await step('dark', async () => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.app-content')?.scrollTo(0, 0); });
  await shot('stub-dark');
  await page.emulateMedia({ colorScheme: 'light' });
});

await step('before the trip: the day\'s hours, nothing grey', async () => {
  // Tuesday 1.12.2026, at noon.
  await page.clock.setFixedTime(new Date('2026-12-01T12:00:00Z'));
  await page.reload();
  const card = page.locator('.trip-card', { hasText: 'וינה' });
  const tab = page.locator('nav button.nav-item[aria-label="תכנון טיול"]');
  await card.or(tab).first().waitFor();
  if (await card.count()) await card.getByText('פתח טיול').click();
  await tab.click();
  await expectHours('מוזיאון', 'היום 09:00–17:00');
  await expectHours('מסעדת שניצל', 'היום 12:00–15:00, 18:00–21:40');
  await expectHours('גלריה', 'סגור היום');
  if (await grey('מוזיאון') || await grey('גלריה')) throw new Error('grey before the trip');
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.app-content')?.scrollTo(0, 0); });
  await shot('before-trip');
});

if (errors.length) { console.log('  page errors:', errors); failed++; }
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
