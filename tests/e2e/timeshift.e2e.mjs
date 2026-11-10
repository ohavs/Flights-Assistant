// A new time that moves what comes after (8.95.0, the owner's ask): a
// switch in the form, off until turned on, with what moves and what stays
// (a booking's time). Departure times to switch between: chips on the
// card; a tap moves the activity and everything after it, and back again.
//   bash scripts/run-e2e.sh tests/e2e/timeshift.e2e.mjs
// Screenshots: .e2e/timeshift/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = `${process.argv[2] || '.e2e'}/timeshift`;
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
const list = (coll) => fetch(`${DB}/trips/ts/${coll}?pageSize=300`, { headers: admin }).then(r => r.json()).then(j => j.documents || []);
async function until(fn, what) {
  for (let i = 0; i < 40; i++) { const v = await fn(); if (v) return v; await page.waitForTimeout(250); }
  throw new Error(`never: ${what}`);
}

// The day's times as saved: { title: timeLabel }.
const times = async () => {
  const day = (await list('days')).find(d => d.fields.date?.stringValue === '2026-12-20');
  return Object.fromEntries((day?.fields.activities?.arrayValue.values || [])
    .map(v => v.mapValue.fields).map(f => [f.title.stringValue, f.timeLabel?.stringValue || '']));
};
const timesAre = (want) => until(async () => {
  const got = await times();
  return Object.entries(want).every(([k, v]) => got[k] === v) && got;
}, JSON.stringify(want));

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
const me = await page.evaluate(() => window.__e2eSignIn('timeshift@example.com').then(c => c.user.uid));
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1200);

await put('trips/ts', {
  name: 'וינה', destination: 'וינה, אוסטריה', dates: '20.12.2026 - 21.12.2026',
  members: { [me]: 'owner' }, memberIds: [me],
});
const act = (id, title, timeLabel, order) =>
  ({ id, title, placeId: null, timeLabel, order, address: '', description: '', category: 'אטרקציות ודברים לעשות', createdBy: me });
await put('trips/ts/days/d1', {
  title: 'יום בוינה', order: 1, date: '2026-12-20', activities: [
    act('a1', 'יציאה מהמלון', '07:10–07:25', 1),
    act('a2', 'רכבת לוינה', '07:40–10:20', 2),
    act('a3', 'Stephansplatz', '10:30–12:15', 3),
    act('a4', 'קפה Demel', '12:30–13:30', 4),
    act('a5', 'Five Guys', '12:30–13:30', 5),
    act('a6', 'רכבת חזרה', '18:00–20:40', 6),
  ],
});
// A booking with its own time stays where it is.
await put('trips/ts/bookings/b1', { title: 'קונצרט', type: 'other', date: '2026-12-20', time: '16:00', status: 'confirmed', createdBy: me, addedBy: me });

const sheet = () => page.locator('.modal-content').last();
const card = (title) => page.locator('.dp-card', { hasText: title }).first();
const edit = async (title) => {
  await page.locator(`button[aria-label="פעולות: ${title}"]`).click();
  await sheet().getByText('עריכה', { exact: true }).click();
  await page.waitForTimeout(400);
};
// Picks the hour in a time picker (the minutes stay as they open).
const pickHour = async (field, hh) => {
  await field.click();
  await page.locator('.wheel[aria-label="שעה"] .wheel-row').filter({ hasText: new RegExp(`^${hh}$`) }).nth(4).click();
  await page.getByRole('button', { name: 'בחירה', exact: true }).click();
  await page.waitForTimeout(300);
};

await page.locator('.trip-card', { hasText: 'וינה' }).getByText('פתח טיול').click();
await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
await page.getByRole('tab', { name: /לוח זמנים/ }).click();
await card('יציאה מהמלון').waitFor();

await step('a new time: the switch moves what comes after, only when on', async () => {
  await edit('יציאה מהמלון');
  if (await sheet().locator('.act-shift').count()) throw new Error('the switch shows before a change');
  await pickHour(sheet().locator('.act-time .picker-field').first(), '08');
  const sw = sheet().getByRole('switch', { name: /לחשב את השעות שאחרי/ });
  await sw.waitFor();
  await sheet().locator('.act-shift', { hasText: '5 פעילויות, שעה מאוחר יותר' }).waitFor();
  if (await sw.getAttribute('aria-checked') !== 'false') throw new Error('the switch starts on');
  await sw.click();
  await sheet().locator('.act-shift-list li', { hasText: 'רכבת לוינה' }).getByText('08:40–11:20').waitFor();
  await sheet().locator('.act-shift-stay', { hasText: 'קונצרט' }).waitFor();
  await shot('form-switch');
  await sheet().getByRole('button', { name: 'שמור' }).click();
  await timesAre({
    'יציאה מהמלון': '08:10–08:25', 'רכבת לוינה': '08:40–11:20', Stephansplatz: '11:30–13:15',
    'קפה Demel': '13:30–14:30', 'Five Guys': '13:30–14:30', 'רכבת חזרה': '19:00–21:40',
  });
  await card('רכבת לוינה').waitFor();
  await page.locator('.dp-row', { hasText: 'רכבת לוינה' }).locator('.dp-time', { hasText: '08:40' }).waitFor();
  const concert = await (await fetch(`${DB}/trips/ts/bookings/b1`, { headers: admin })).json();
  if (concert.fields.time.stringValue !== '16:00') throw new Error('the booking moved');
});

await step('a longer visit moves only what starts after it ends', async () => {
  await edit('קפה Demel');
  await pickHour(sheet().locator('.act-time .picker-field').nth(1), '15');
  await sheet().locator('.act-shift', { hasText: 'פעילות אחת, שעה מאוחר יותר' }).waitFor();
  await sheet().getByRole('switch', { name: /לחשב את השעות שאחרי/ }).click();
  await sheet().getByRole('button', { name: 'שמור' }).click();
  await timesAre({ 'קפה Demel': '13:30–15:30', 'Five Guys': '13:30–14:30', 'רכבת חזרה': '20:00–22:40' });
});

await step('without the switch, only its own time changes', async () => {
  await edit('רכבת חזרה');
  await pickHour(sheet().locator('.act-time .picker-field').first(), '19');
  await sheet().getByRole('button', { name: 'שמור' }).click();
  await timesAre({ 'רכבת חזרה': '19:00–21:40', 'קפה Demel': '13:30–15:30' });
});

await step('departure times to switch between: chips on the card', async () => {
  await edit('יציאה מהמלון');
  await pickHour(sheet().locator('.act-alts .picker-field'), '07');
  await sheet().locator('.act-alt', { hasText: '07:10' }).waitFor();
  await pickHour(sheet().locator('.act-alts .picker-field'), '09');
  await sheet().locator('.act-alt', { hasText: '09:10' }).waitFor();
  await shot('form-options');
  await sheet().getByRole('button', { name: 'שמור' }).click();
  const radios = card('יציאה מהמלון').getByRole('radio');
  await until(async () => (await radios.count()) === 3, 'three options');
  if (await card('יציאה מהמלון').getByRole('radio', { name: '08:10' }).getAttribute('aria-checked') !== 'true') throw new Error('08:10 is not on');
  await shot('card-options');
  await card('יציאה מהמלון').getByRole('radio', { name: '07:10' }).click();
  await page.locator('.toast', { hasText: '5 פעילויות זזו שעה מוקדם יותר' }).waitFor();
  await timesAre({
    'יציאה מהמלון': '07:10–07:25', 'רכבת לוינה': '07:40–10:20', Stephansplatz: '10:30–12:15',
    'קפה Demel': '12:30–14:30', 'Five Guys': '12:30–13:30', 'רכבת חזרה': '18:00–20:40',
  });
  await card('יציאה מהמלון').getByRole('radio', { name: '07:10', checked: true }).waitFor();
  await shot('card-switched');
  // And on to the latest; back again leaves it all as it was.
  await card('יציאה מהמלון').getByRole('radio', { name: '09:10' }).click();
  await timesAre({ 'יציאה מהמלון': '09:10–09:25', 'רכבת לוינה': '09:40–12:20', 'רכבת חזרה': '20:00–22:40' });
  await card('יציאה מהמלון').getByRole('radio', { name: '07:10' }).click();
  await timesAre({
    'יציאה מהמלון': '07:10–07:25', 'רכבת לוינה': '07:40–10:20', Stephansplatz: '10:30–12:15',
    'קפה Demel': '12:30–14:30', 'Five Guys': '12:30–13:30', 'רכבת חזרה': '18:00–20:40',
  });
});

await step('dark mode', async () => {
  theme = 'dark';
  await page.locator('button[aria-label="עבור למצב כהה"]').click();
  await shot('card-options');
  await edit('יציאה מהמלון');
  await sheet().locator('.act-alts').scrollIntoViewIfNeeded();
  await shot('form-options');
  await page.locator('.modal-overlay button[aria-label="סגור"]').last().click();
  await page.locator('button[aria-label="עבור למצב בהיר"]').click();
  theme = 'light';
});

if (errors.length) { console.log('  page errors:', errors); failed++; }
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('timeshift: all passed');
