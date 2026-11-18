// A place's opening hours every week (8.96.0, the owner's ask): on a day
// it is closed it is grey in the place list, out of its hours the parts of
// the day and the clock times are grey, and its activity warns near the
// closing. The place form sets them by hand (a switch a day, a break, "לכל
// הימים") or from Google. And the flight days are marked on the calendars.
//   bash scripts/run-e2e.sh tests/e2e/openhours.e2e.mjs
// Screenshots: .e2e/openhours/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = `${process.argv[2] || '.e2e'}/openhours`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await ctx.addInitScript(() => { window.__e2eGmapsKey = 'e2e'; });
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
const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };

// Google: every search finds "g1" at the same spot; its details have hours.
const calls = { details: 0 };
await ctx.route('https://routes.googleapis.com/**', (route) => route.fulfill({ json: { routes: [{ duration: '600s', distanceMeters: 800 }] } }));
await ctx.route('https://places.googleapis.com/**', async (route) => {
  if (route.request().method() === 'GET') {
    calls.details++;
    // The gallery: Google knows it, with no hours.
    if (route.request().url().includes('/places/g2')) return route.fulfill({ json: { displayName: { text: 'Galerie' } } });
    const day = (d, from, to) => ({ open: { day: d, hour: from, minute: 0 }, close: { day: d, hour: to, minute: 0 } });
    return route.fulfill({ json: {
      displayName: { text: 'Café Central' },
      regularOpeningHours: { periods: [day(0, 10, 18), ...[1, 2, 3, 4, 5, 6].map(d => day(d, 8, 22))] },
    } });
  }
  if (/Graben|גלריה/.test(route.request().postData() || '')) {
    return route.fulfill({ json: { places: [{ id: 'g2', location: { latitude: 48.2, longitude: 16.37 }, displayName: { text: 'Galerie' }, formattedAddress: 'Graben 1' }] } });
  }
  return route.fulfill({ json: { places: [{ id: 'g1', location: { latitude: 48.2104, longitude: 16.3655 }, displayName: { text: 'Café Central' }, formattedAddress: 'Herrengasse 14' }] } });
});

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
const plain = (v) => v == null ? null
  : 'stringValue' in v ? v.stringValue
  : 'integerValue' in v ? Number(v.integerValue)
  : 'booleanValue' in v ? v.booleanValue
  : 'nullValue' in v ? null
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]))
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(plain) : null;
const getPlace = (id) => fetch(`${DB}/trips/oh/planning/${id}`, { headers: admin }).then(r => r.json())
  .then(j => Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, plain(v)])));
async function until(fn, what) {
  for (let i = 0; i < 40; i++) { const v = await fn(); if (v) return v; await page.waitForTimeout(250); }
  throw new Error(`never: ${what}`);
}

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
const me = await page.evaluate(() => window.__e2eSignIn('openhours@example.com').then(c => c.user.uid));
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1200);

// Flights on Saturday the 12th and Wednesday the 16th of December.
await put('trips/oh', {
  name: 'וינה', destination: 'וינה, אוסטריה', dates: '12.12.2026 - 16.12.2026',
  members: { [me]: 'owner' }, memberIds: [me],
  outboundFlightDetails: { date: '2026-12-12', flightNumber: 'LY361' },
  returnFlightDetails: { date: '2026-12-16', flightNumber: 'LY362' },
});
const place = (id, title, extra = {}) => put(`trips/oh/planning/${id}`, {
  title, category: 'אטרקציות ודברים לעשות', address: '', visited: false, createdBy: me, addedBy: me, ...extra,
});
// The museum: Sunday to Thursday 09–17, Friday 09–13, closed on Saturday.
const nineToFive = [{ from: '09:00', to: '17:00' }];
await place('m', 'מוזיאון', { openHours: { 0: nineToFive, 1: nineToFive, 2: nineToFive, 3: nineToFive, 4: nineToFive, 5: [{ from: '09:00', to: '13:00' }], 6: [] } });
await place('r', 'מסעדה');
await place('k', 'קפה', { address: 'Herrengasse 14, Wien' });
const act = (id, title, placeId, timeLabel, order) =>
  ({ id, title, placeId, timeLabel, order, address: '', description: '', category: 'אטרקציות ודברים לעשות', createdBy: me });
await put('trips/oh/days/d1', { title: 'יום 1', order: 1, date: '2026-12-12', activities: [] });
await put('trips/oh/days/d2', { title: 'יום 2', order: 2, date: '2026-12-13', activities: [act('a1', 'מוזיאון', 'm', '16:30', 1)] });
await put('trips/oh/days/d3', { title: 'יום 3', order: 3, date: '2026-12-18', activities: [] });

const sheet = () => page.locator('.modal-content').last();
const topModal = () => page.locator('.modal-overlay').last();
const chip = (title) => page.locator(`.dp-chip[aria-label^="${title},"]`);
const card = (title) => page.locator('.dp-card', { hasText: title }).first();
const plan = (t) => page.locator('.plan-card', { has: page.locator('.pstub-title', { hasText: t }) });
const closeTop = async () => { await page.locator('.modal-overlay button[aria-label="סגור"]').last().click(); await page.waitForTimeout(350); };
const leave = async () => {
  const b = page.getByRole('button', { name: /צא בלי לשמור|יציאה|סגור בלי/ });
  if (await b.count()) await b.first().click();
  await page.waitForTimeout(350);
};

await page.locator('.trip-card', { hasText: 'וינה' }).getByText('פתח טיול').click();
await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
await plan('מוזיאון').waitFor();
await page.getByRole('tab', { name: /לוח זמנים/ }).click();

await step('an activity warns near the closing, and its details say the day\'s hours', async () => {
  await chip('יום 2').click();
  await card('מוזיאון').getByText('נסגר ב־17:00').waitFor();
  await shot('warn-closing');
  await card('מוזיאון').locator('.dp-card-main').click();
  await sheet().getByText('שעות פעילות ביום ראשון: 09:00–17:00').waitFor();
  await closeTop();
});

await step('on a day it is closed, the place is grey in the list, with why', async () => {
  await chip('יום 1').click();
  await page.locator('button.fab', { hasText: 'פעילות חדשה' }).click();
  await sheet().getByRole('button', { name: 'חיפוש מקום ברשימה' }).click();
  const museum = sheet().getByRole('checkbox', { name: /מוזיאון/ });
  await museum.waitFor();
  if (!(await museum.isDisabled())) throw new Error('the museum can be picked on Saturday');
  await museum.getByText('לא ביום הזה: סגור ביום שבת').waitFor();
  if (await sheet().getByRole('checkbox', { name: /מסעדה/ }).isDisabled()) throw new Error('a place with no hours is grey');
  await shot('closed-day-grey');
  await closeTop();
  await closeTop();
});

await step('out of its hours: the parts of the day and the clock times are grey', async () => {
  await chip('יום 3').click();
  await page.locator('button.fab', { hasText: 'פעילות חדשה' }).click();
  await sheet().getByRole('button', { name: 'חיפוש מקום ברשימה' }).click();
  await sheet().getByRole('checkbox', { name: /מוזיאון/ }).click();
  await sheet().getByRole('button', { name: 'בחירה' }).click();
  await page.waitForTimeout(400);
  await sheet().locator('.act-place-when', { hasText: 'שעות פעילות ביום שישי: 09:00–13:00' }).waitFor();
  if (!(await sheet().locator('.act-part', { hasText: 'ערב' }).isDisabled())) throw new Error('evening can be picked');
  if (await sheet().locator('.act-part', { hasText: 'בוקר' }).isDisabled()) throw new Error('morning is grey');
  await shot('parts-grey');
  await sheet().locator('.picker-field').first().click();
  const wheel = page.locator('.wheel[aria-label="שעה"]');
  await wheel.waitFor();
  if (!(await wheel.locator('.wheel-row.off', { hasText: /^14$/ }).count())) throw new Error('14 is not grey');
  if (await wheel.locator('.wheel-row.off', { hasText: /^10$/ }).count()) throw new Error('10 is grey');
  await shot('wheel-grey');
  await page.locator('.picker-card .btn-secondary').click();
  await page.waitForTimeout(300);
  await closeTop();
  await leave();
});

await page.getByRole('tab', { name: 'מקומות' }).click();

await step('the place form: hours by hand, a break, "לכל הימים", a closed day', async () => {
  await plan('מסעדה').click();
  await topModal().getByText('עריכה', { exact: true }).click();
  await topModal().getByText('עריכת פריט תכנון').waitFor();
  const box = topModal().locator('.place-hours');
  await box.getByRole('button', { name: 'הוספה ידנית' }).click();
  await box.locator('.hours-day').nth(6).waitFor();
  await box.getByRole('button', { name: 'הפסקה ביום שני' }).click();
  if (await box.locator('.hours-day[data-day="1"] .hours-chip').count() !== 2) throw new Error('no break on Monday');
  await shot('form-break');
  await box.getByRole('button', { name: 'השעות של ראשון לכל הימים' }).click();
  if (await box.locator('.hours-day[data-day="1"] .hours-chip').count() !== 1) throw new Error('"לכל הימים" did not copy');
  await box.getByRole('switch', { name: 'פתוח ביום שבת' }).click();
  await box.locator('.hours-day[data-day="6"]', { hasText: 'סגור' }).waitFor();
  // A range opens the time picker.
  await box.locator('.hours-day[data-day="5"] .hours-chip').click();
  await page.locator('.picker-card').waitFor();
  await page.locator('.picker-card .btn-secondary').click();
  await shot('form-hours');
  await topModal().locator('.sheet-footer button[type="submit"]').click();
  const saved = await until(async () => { const p = await getPlace('r'); return p.openHours ? p : null; }, 'hours saved');
  const want = JSON.stringify({ from: '09:00', to: '17:00' });
  for (let d = 0; d < 6; d++) {
    if (JSON.stringify(saved.openHours[d]) !== `[${want}]`) throw new Error(`day ${d}: ${JSON.stringify(saved.openHours[d])}`);
  }
  if (JSON.stringify(saved.openHours[6]) !== '[]') throw new Error(`Saturday: ${JSON.stringify(saved.openHours[6])}`);
  await page.waitForTimeout(400);
  if (!(await page.locator('.modal-overlay').count())) await plan('מסעדה').click();
  const week = topModal().locator('.hours-week');
  await week.waitFor();
  const text = (await week.innerText()).replace(/\s+/g, ' ').trim();
  if (!text.includes('א׳–ו׳ 09:00–17:00') || !text.includes('ש׳ סגור')) throw new Error(`details: ${text}`);
  await shot('details-week');
  await closeTop();
});

await step('"מלא מגוגל" fills the week from Google', async () => {
  await plan('קפה').click();
  await topModal().getByText('עריכה', { exact: true }).click();
  await topModal().getByText('עריכת פריט תכנון').waitFor();
  const box = topModal().locator('.place-hours');
  await box.getByRole('button', { name: 'מלא מגוגל' }).click();
  await box.getByText('מולא מגוגל (Café Central). אפשר לערוך.').waitFor();
  if ((await box.locator('.hours-day[data-day="0"] .hours-chip').innerText()).trim() !== '10:00–18:00') throw new Error('Sunday');
  if ((await box.locator('.hours-day[data-day="3"] .hours-chip').innerText()).trim() !== '08:00–22:00') throw new Error('Wednesday');
  await shot('from-google');
  await topModal().locator('.sheet-footer button[type="submit"]').click();
  const saved = await until(async () => { const p = await getPlace('k'); return p.openHours ? p : null; }, 'hours saved');
  if (JSON.stringify(saved.openHours[0]) !== JSON.stringify([{ from: '10:00', to: '18:00' }])) throw new Error(`Sunday: ${JSON.stringify(saved.openHours[0])}`);
  if (!calls.details) throw new Error('Google was not asked');
  await page.waitForTimeout(400);
  if (await page.locator('.modal-overlay').count()) await closeTop();
});

await step('the flight days are marked on the calendar', async () => {
  await plan('מסעדה').click();
  await topModal().getByText('עריכה', { exact: true }).click();
  await topModal().locator('.place-when .picker-field').first().click();
  const cal = page.locator('.picker-card .cal');
  await cal.waitFor();
  // It opens on this month: to December 2026, forward or back.
  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const [m, y] = (await cal.locator('.cal-month').innerText()).trim().split(' ');
  const away = (2026 * 12 + 11) - (Number(y) * 12 + MONTHS.indexOf(m));
  for (let i = 0; i < Math.abs(away); i++) await cal.getByRole('button', { name: away > 0 ? 'החודש הבא' : 'החודש הקודם' }).click();
  await cal.locator('.cal-month', { hasText: 'דצמבר 2026' }).waitFor();
  const flights = await cal.locator('.cal-day.is-flight').allInnerTexts();
  if (flights.map(t => t.trim()).join(',') !== '12,16') throw new Error(`flight days: ${flights.join(',')}`);
  await cal.locator('.cal-legend', { hasText: 'טיסת הלוך 12.12 · טיסת חזור 16.12' }).waitFor();
  await shot('calendar-flights');
  await page.locator('.picker-card .btn-secondary').click();
  await page.waitForTimeout(300);
  await closeTop();
  await leave();
});

await step('"מלא שעות פעילות מגוגל" fills every place with none, and leaves the rest', async () => {
  await place('g', 'גלריה', { address: 'Graben 1, Wien' });
  await place('b', 'בר');
  const open = async () => {
    await page.locator('button[aria-label="מיון ותצוגה"]').click();
    return sheet().locator('.hours-fill-all');
  };
  let btn = await open();
  // The gallery and the bar: the others have their hours from before.
  await btn.getByText('ל־2 מקומות בלי שעות').waitFor();
  await btn.click();
  await sheet().locator('.hours-fill-result', { hasText: 'מולאו שעות למקום אחד. למקום אחד אין שעות בגוגל' }).waitFor();
  await btn.getByText('אין עוד מה למלא מגוגל').waitFor();
  if (!(await btn.isDisabled())) throw new Error('nothing left, and it can still be tapped');
  await sheet().locator('.hours-fill-result').scrollIntoViewIfNeeded();
  await shot('fill-all');
  const bar = await until(async () => { const x = await getPlace('b'); return x.openHours ? x : null; }, 'the bar\'s hours');
  if (JSON.stringify(bar.openHours[3]) !== JSON.stringify([{ from: '08:00', to: '22:00' }])) throw new Error(`bar: ${JSON.stringify(bar.openHours[3])}`);
  if ((await getPlace('g')).openHours) throw new Error('the gallery got hours Google does not have');
  // Hours typed by hand stay.
  if (JSON.stringify((await getPlace('r')).openHours[6]) !== '[]') throw new Error('the restaurant\'s own hours changed');
  if (JSON.stringify((await getPlace('m')).openHours[5]) !== JSON.stringify([{ from: '09:00', to: '13:00' }])) throw new Error('the museum\'s own hours changed');
  await closeTop();
});

await step('hours taken off by hand are not filled again for the whole list', async () => {
  await page.waitForTimeout(400);
  await plan('בר').click();
  await topModal().getByText('עריכה', { exact: true }).click();
  await topModal().getByText('עריכת פריט תכנון').waitFor();
  await topModal().locator('.place-hours').getByRole('button', { name: 'בלי שעות פעילות' }).click();
  await topModal().locator('.sheet-footer button[type="submit"]').click();
  const off = await until(async () => { const x = await getPlace('b'); return x.hoursOff ? x : null; }, 'the bar marked hoursOff');
  if (off.openHours) throw new Error(`the bar still has hours: ${JSON.stringify(off.openHours)}`);
  await page.waitForTimeout(400);
  if (await page.locator('.modal-overlay').count()) await closeTop();
  await page.locator('button[aria-label="מיון ותצוגה"]').click();
  const btn = sheet().locator('.hours-fill-all');
  await btn.getByText('מקום אחד שהסרתם ממנו שעות לא ימולא').waitFor();
  if (!(await btn.isDisabled())) throw new Error('the bar would be filled again');
  await btn.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await shot('fill-all-skips-removed');
  await closeTop();
  // Hours put back by hand lift the mark.
  await plan('בר').click();
  await topModal().getByText('עריכה', { exact: true }).click();
  await topModal().locator('.place-hours').getByRole('button', { name: 'מלא מגוגל' }).click();
  await topModal().locator('.place-hours').getByText(/מולא מגוגל/).waitFor();
  await topModal().locator('.sheet-footer button[type="submit"]').click();
  await until(async () => { const x = await getPlace('b'); return x.openHours && !x.hoursOff; }, 'hoursOff lifted');
  await page.waitForTimeout(400);
  if (await page.locator('.modal-overlay').count()) await closeTop();
});

if (errors.length) { console.log('  page errors:', errors); failed++; }
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
