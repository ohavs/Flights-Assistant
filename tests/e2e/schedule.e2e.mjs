// The schedule (8.73.0): a strip of days and one day as a timeline in
// time order, with the bookings, flights and hotel on their dates.
// Swapping two days trades their activities and says so; a booking, and
// an activity booked for that date, stay on it. Places are found by
// search, and a chosen place replaces typing its name and address, in the
// activity form and the booking form.
//   bash scripts/run-e2e.sh tests/e2e/schedule.e2e.mjs
// Screenshots: .e2e/schedule/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = `${process.argv[2] || '.e2e'}/schedule`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
// A fake Maps key (emulator builds only); the Routes calls are answered
// here from straight-line distances, as in travel.e2e.mjs.
await ctx.addInitScript(() => { window.__e2eGmapsKey = 'e2e'; });
const COLOSSEUM = { lat: 41.8902, lng: 12.4922 };
const meters = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2
    + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
const point = (w) => {
  const ll = w?.location?.latLng;
  return ll ? { lat: ll.latitude, lng: ll.longitude } : COLOSSEUM;
};
const routeLog = [];   // every route asked for: { o, d } points
await ctx.route('https://routes.googleapis.com/**', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  routeLog.push({ o: point(body.origin), d: point(body.destination) });
  const m = Math.round(meters(point(body.origin), point(body.destination)));
  const secs = body.travelMode === 'WALK' ? Math.round(m / 1.3) : 300 + Math.round(m / 6);
  await route.fulfill({ json: { routes: [{ duration: `${secs}s`, distanceMeters: m }] } });
});
// What a search by name finds (changed by a step below).
let placesAnswer = { location: { latitude: COLOSSEUM.lat, longitude: COLOSSEUM.lng } };
await ctx.route('https://places.googleapis.com/**', (route) =>
  route.fulfill({ json: { places: [placesAnswer] } }));
const at = (lat, lng) => [{ label: 'מפה', url: `https://www.google.com/maps/place/@${lat},${lng},17z` }];

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
const list = (coll) => fetch(`${DB}/trips/sc/${coll}?pageSize=300`, { headers: admin }).then(r => r.json()).then(j => j.documents || []);
async function until(fn, what) {
  for (let i = 0; i < 40; i++) { const v = await fn(); if (v) return v; await page.waitForTimeout(250); }
  throw new Error(`never: ${what}`);
}
// The activity titles of the day on a date, as stored.
const titlesOn = async (date) => {
  const day = (await list('days')).find(d => d.fields.date?.stringValue === date);
  return (day?.fields.activities?.arrayValue.values || []).map(v => v.mapValue.fields.title.stringValue).sort();
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify([...b].sort());

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
const me = await page.evaluate(() => window.__e2eSignIn('schedule@example.com').then(c => c.user.uid));
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1200);

const flight = (date, dep, from, to) => ({
  date, scheduledDep: dep, flightNumber: from.code === 'TLV' ? 'LY381' : 'LY382',
  depAirport: { code: from.code, city: from.city }, arrAirport: { code: to.code, city: to.city },
});
const TLV = { code: 'TLV', city: 'תל אביב' };
const FCO = { code: 'FCO', city: 'רומא' };
await put('trips/sc', {
  name: 'רומא', destination: 'רומא, איטליה', dates: '10.11.2026 - 12.11.2026',
  members: { [me]: 'owner' }, memberIds: [me],
  outboundFlightDetails: flight('2026-11-10', '07:30', TLV, FCO),
  returnFlightDetails: flight('2026-11-12', '18:00', FCO, TLV),
  hotelDetails: { name: 'Hotel Roma', address: '', link: 'https://www.google.com/maps/@41.9009,12.5012,17z', checkIn: '2026-11-10T15:00', checkOut: '2026-11-12T11:00' },
  plannerDaysFromFlight: { out: '2026-11-10', ret: '2026-11-12' },
});
const place = (id, title, category, extra = {}) => put(`trips/sc/planning/${id}`, {
  title, category, address: '', visited: false, createdBy: me, addedBy: me, ...extra,
});
await place('p1', 'הקולוסיאום', 'אטרקציות ודברים לעשות', { priority: 'must', address: 'Piazza del Colosseo, Roma' });
await place('p2', 'Da Enzo', 'מסעדות ומקומות אכילה', { needsReservation: true, links: at(41.8887, 12.4776) });
await place('p3', 'פונטנה די טרווי', 'מקומות לבקר', { links: at(41.9009, 12.4833) });
await place('p4', 'גלידה Giolitti', 'מסעדות ומקומות אכילה', { links: at(41.9010, 12.4767) });
const act = (id, title, placeId, timeLabel, order, category = 'אחר') =>
  ({ id, title, placeId, timeLabel, order, address: '', description: '', category, createdBy: me });
await put('trips/sc/days/d1', { title: 'יום 1', order: 1, date: '2026-11-10', activities: [
  act('a1', 'Da Enzo', 'p2', 'ערב', 1, 'מסעדות ומקומות אכילה'),
  act('a2', 'פונטנה די טרווי', 'p3', '17:30', 2, 'מקומות לבקר'),
] });
await put('trips/sc/days/d2', { title: 'יום 2', order: 2, date: '2026-11-11', activities: [
  act('a3', 'הקולוסיאום', 'p1', 'בוקר', 1, 'אטרקציות ודברים לעשות'),
] });
await put('trips/sc/days/d3', { title: 'יום 3', order: 3, date: '2026-11-12', activities: [] });
await put('trips/sc/bookings/b1', {
  title: 'Da Enzo', type: 'restaurant', placeId: 'p2', date: '2026-11-10', time: '20:30',
  people: 4, confirmation: 'RZ42', status: 'confirmed', createdBy: me, addedBy: me,
});
await put('trips/sc/bookings/b2', {
  title: 'סיור בוותיקן', type: 'tour', placeId: null, date: '2026-11-11', time: '13:00',
  people: 2, confirmation: 'VAT9', status: 'confirmed', createdBy: me, addedBy: me,
});

const sheet = () => page.locator('.modal-content').last();
const chip = (title) => page.locator(`.dp-chip[aria-label^="${title},"]`);
const card = (title) => page.locator('.dp-card', { hasText: title }).first();
// The titles on screen, top to bottom.
const shownOrder = () => page.locator('.dp-card .dp-card-title').allInnerTexts();

await page.locator('.trip-card', { hasText: 'רומא' }).getByText('פתח טיול').click();
await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
await page.getByRole('tab', { name: /לוח זמנים/ }).click();

await step('a strip of the trip\'s days', async () => {
  await page.locator('.dp-strip').waitFor();
  if (await page.locator('.dp-chip[role="tab"]').count() !== 3) throw new Error('not three days');
  await chip('יום 1').click();
  if (await chip('יום 1').getAttribute('aria-selected') !== 'true') throw new Error('not chosen');
});

await step('a day in time order, with the flight, the hotel and the booking', async () => {
  await card('Da Enzo').waitFor();
  const order = await shownOrder();
  const at = (t) => order.findIndex(x => x.includes(t));
  if (!(at('טיסה לרומא') < at('צ׳ק־אין') && at('צ׳ק־אין') < at('פונטנה די טרווי') && at('פונטנה די טרווי') < at('Da Enzo'))) {
    throw new Error(`order: ${order.join(' | ')}`);
  }
  // The booked restaurant is one row, with its booking's time and code.
  await card('Da Enzo').locator('.dp-stub', { hasText: 'RZ42' }).waitFor();
  if (await page.locator('.dp-card', { hasText: 'Da Enzo' }).count() !== 1) throw new Error('the booking shows twice');
  await page.locator('.dp-row', { has: card('Da Enzo') }).locator('.dp-time', { hasText: '20:30' }).waitFor();
  await shot('day-1');
});

await step('a booking with no place stands on its own date', async () => {
  await chip('יום 2').click();
  await card('סיור בוותיקן').locator('.dp-stub', { hasText: 'VAT9' }).waitFor();
  await card('הקולוסיאום').waitFor();
  await shot('day-2');
  await card('סיור בוותיקן').locator('.dp-card-main').click();
  await sheet().getByText('מספר אישור').waitFor();
  await shot('booking-details');
  await page.locator('.modal-overlay button[aria-label="סגור"]').last().click();
  await page.waitForTimeout(350);
});

await step('swapping two days: activities trade, the booking stays, a message says so', async () => {
  await chip('יום 1').click();
  await page.getByRole('button', { name: 'פעולות ליום' }).click();
  await sheet().getByText('החלפה עם יום אחר').click();
  await sheet().locator('.list-row', { hasText: 'יום 2' }).waitFor();
  await shot('swap-pick');
  await sheet().locator('.list-row', { hasText: 'יום 2' }).click();
  await page.locator('.toast', { hasText: 'הוחלפו' }).waitFor();
  await page.locator('.toast', { hasText: 'ההזמנות נשארו בתאריך שלהן' }).waitFor();
  // 10.11 now holds day 2's plan, and still the booked dinner and the flight.
  await card('הקולוסיאום').waitFor();
  await card('Da Enzo').waitFor();
  await card('טיסה לרומא').waitFor();
  if (await card('פונטנה די טרווי').count()) throw new Error('the fountain stayed');
  await shot('swapped');
  await until(async () => same(await titlesOn('2026-11-10'), ['Da Enzo', 'הקולוסיאום']), 'the 10th as stored');
  await until(async () => same(await titlesOn('2026-11-11'), ['פונטנה די טרווי']), 'the 11th as stored');
});

await step('undo from the message', async () => {
  await page.locator('.toast').getByRole('button', { name: 'ביטול' }).click();
  await page.locator('.toast', { hasText: 'ההחלפה בוטלה' }).waitFor();
  await until(async () => same(await titlesOn('2026-11-10'), ['Da Enzo', 'פונטנה די טרווי']), 'the 10th back');
  await until(async () => same(await titlesOn('2026-11-11'), ['הקולוסיאום']), 'the 11th back');
  await card('פונטנה די טרווי').waitFor();
});

await step('the way from the stop before, and another start in a tap', async () => {
  const toDinner = page.locator('.dp-leg-row').filter({ has: page.locator('.dp-leg-walk') })
    .and(page.locator('.dp-leg-row:has(+ .dp-row .dp-card:has-text("Da Enzo"))'));
  await toDinner.waitFor();
  // From the fountain, the stop above, and it says so (8.86.0).
  await toDinner.locator('.dp-leg-from', { hasText: 'מ־פונטנה די טרווי' }).waitFor();
  await page.locator('.dp-stats', { hasText: 'הליכה' }).waitFor();
  await shot('legs');
  await toDinner.locator('button.dp-leg').click();
  await sheet().getByText('יוצאים מ…').waitFor();
  await sheet().getByRole('radio', { name: /מהתחנה הקודמת/ }).waitFor();
  await shot('leg-from');
  await sheet().getByRole('radio', { name: /^המלון/ }).click();
  await toDinner.locator('.dp-leg-from', { hasText: 'מהמלון' }).waitFor();
  const d1 = await until(async () => {
    const d = (await list('days')).find(x => x.fields.date?.stringValue === '2026-11-10');
    const a = (d?.fields.activities?.arrayValue.values || []).map(v => v.mapValue.fields).find(f => f.id.stringValue === 'a1');
    return a?.travelFrom?.stringValue === 'hotel' && a;
  }, 'start saved');
  if (!d1) throw new Error('not saved');
});

await step('adding an activity: search the list; a place replaces typing its name', async () => {
  await chip('יום 3').click();
  await page.locator('button.fab', { hasText: 'פעילות חדשה' }).click();
  await sheet().getByText('הוספת פעילות ליום').waitFor();
  await sheet().getByPlaceholder('למשל: נסיעה ברכבת, ארוחת צהריים, ביקור במוזיאון').waitFor();
  await shot('activity-form');
  await sheet().getByRole('button', { name: 'חיפוש מקום ברשימה' }).click();
  await sheet().getByPlaceholder('חיפוש מקום ברשימה').fill('גלידה');
  await sheet().getByRole('checkbox', { name: /Giolitti/ }).waitFor();
  if (await sheet().getByRole('checkbox', { name: /הקולוסיאום/ }).count()) throw new Error('search did not filter');
  await shot('place-search');
  await sheet().getByRole('checkbox', { name: /Giolitti/ }).click();
  await sheet().getByRole('button', { name: 'בחירה' }).click();
  await page.waitForTimeout(400);
  await sheet().locator('.act-place', { hasText: 'גלידה Giolitti' }).waitFor();
  if (await sheet().getByPlaceholder('למשל: נסיעה ברכבת, ארוחת צהריים, ביקור במוזיאון').count()) throw new Error('name still typed');
  await sheet().locator('.act-part', { hasText: 'ערב' }).click();
  await shot('activity-form-place');
  await sheet().locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  await card('גלידה Giolitti').waitFor();
  const day = await until(async () => {
    const d = (await list('days')).find(x => x.fields.date?.stringValue === '2026-11-12');
    return (d?.fields.activities?.arrayValue.values || []).length === 1 && d;
  }, 'saved');
  const a = day.fields.activities.arrayValue.values[0].mapValue.fields;
  if (a.placeId?.stringValue !== 'p4' || a.timeLabel?.stringValue !== 'ערב') throw new Error('saved wrong');
  await shot('day-3');
});

await step('moving an activity to another day says where it went', async () => {
  await page.locator('button[aria-label="פעולות: גלידה Giolitti"]').click();
  await sheet().getByText('העברה ליום אחר').click();
  await sheet().locator('.list-row', { hasText: 'יום 2' }).click();
  await page.locator('.toast', { hasText: 'עבר ליום 2' }).waitFor();
  await until(async () => same(await titlesOn('2026-11-11'), ['גלידה Giolitti', 'הקולוסיאום']), 'moved');
  // A booked activity stays on its date: no moving it.
  await chip('יום 1').click();
  await page.locator('button[aria-label="פעולות: Da Enzo"]').click();
  if (!(await sheet().getByRole('button', { name: /העברה ליום אחר/ }).isDisabled())) throw new Error('a booked one can move');
  await page.locator('.modal-overlay button[aria-label="סגור"]').last().click();
  await page.waitForTimeout(350);
});

await step('my own plan: only mine, over the shared one dimmed, saved where only I read it', async () => {
  await chip('יום 1').click();
  await page.locator('.dp-mode').getByRole('radio', { name: 'שלי' }).click();
  await page.getByText('עוד לא תכננת כלום ליום הזה.', { exact: false }).waitFor();
  // The shared plan is still there, dimmed, with nothing to change on it.
  await page.locator('.dp-row.shared', { hasText: 'Da Enzo' }).waitFor();
  if (await page.locator('button[aria-label="פעולות: Da Enzo"]').count()) throw new Error('actions on the shared plan');
  await page.locator('button.fab', { hasText: 'פעילות חדשה' }).click();
  await sheet().getByText('רק את/ה רואה אותו').waitFor();
  await sheet().getByPlaceholder('למשל: נסיעה ברכבת, ארוחת צהריים, ביקור במוזיאון').fill('ריצת בוקר');
  await sheet().locator('.act-part', { hasText: 'בוקר' }).click();
  await sheet().locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  await page.locator('.dp-row:not(.shared)', { hasText: 'ריצת בוקר' }).waitFor();
  await page.locator('button[aria-label="פעולות: ריצת בוקר"]').waitFor();
  await shot('mine');
  const doc = await until(async () => {
    const r = await fetch(`${DB}/trips/sc/personal/${me}/days/2026-11-10`, { headers: admin }).then(x => x.json());
    return (r.fields?.activities?.arrayValue.values || []).length === 1 && r;
  }, 'saved in the personal plan');
  if (doc.fields.activities.arrayValue.values[0].mapValue.fields.title.stringValue !== 'ריצת בוקר') throw new Error('saved wrong');
  if ((await titlesOn('2026-11-10')).includes('ריצת בוקר')) throw new Error('in the shared plan');
  // Back to the shared plan: not there.
  await page.locator('.dp-mode').getByRole('radio', { name: 'משותף' }).click();
  await card('Da Enzo').waitFor();
  if (await page.getByText('ריצת בוקר').count()) throw new Error('shown in the shared plan');
});

await step('dark mode', async () => {
  theme = 'dark';
  await page.locator('button[aria-label="עבור למצב כהה"]').click();
  await shot('day-1');
  await page.locator('button[aria-label="עבור למצב בהיר"]').click();
  theme = 'light';
});

// 8.81.0: a day of the trip is never taken away. "ניקוי היום" takes out its
// activities, and the day stays with what is booked for it; a date with no
// day (taken away before) shows in the strip, and a tap brings it back.
await step('clearing a day keeps the day and its booking; undo brings the rest back', async () => {
  await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
  await page.getByRole('tab', { name: /לוח זמנים/ }).click();
  await chip('יום 1').click();
  await card('Da Enzo').waitFor();
  const before = await titlesOn('2026-11-10');
  if (before.length < 2) throw new Error(`nothing to clear: ${before.join()}`);
  await page.getByRole('button', { name: 'פעולות ליום' }).click();
  if (await sheet().getByText('מחיקת היום').count()) throw new Error('a day can still be deleted');
  if (await sheet().getByText('הסרת היום').count()) throw new Error('a trip date can be removed');
  await sheet().getByText('ניקוי היום').click();
  await page.getByRole('button', { name: 'נקה', exact: true }).click();
  await page.locator('.toast', { hasText: 'יום 1 נוקה' }).waitFor();
  await page.locator('.toast', { hasText: 'מה שהוזמן ליום הזה נשאר' }).waitFor();
  await until(async () => same(await titlesOn('2026-11-10'), ['Da Enzo']), 'only the booked one left');
  await card('Da Enzo').waitFor();
  await card('טיסה לרומא').waitFor();
  if (await page.locator('.dp-chip[role="tab"]').count() !== 3) throw new Error('a day went');
  await shot('cleared');
  await page.locator('.toast').getByRole('button', { name: 'ביטול' }).click();
  await until(async () => same(await titlesOn('2026-11-10'), before), 'all back');
});

await step('a date of the trip with no day shows as missing, and a tap brings it back', async () => {
  // Taken away by an older version.
  const d3 = (await list('days')).find(d => d.fields.date?.stringValue === '2026-11-12');
  await fetch(`http://127.0.0.1:8080/v1/${d3.name}`, { method: 'DELETE', headers: admin });
  const gap = page.locator('.dp-chip.missing');
  await gap.waitFor();
  if (await gap.getAttribute('aria-label') !== 'החזרת יום: ה׳ 12.11') throw new Error(await gap.getAttribute('aria-label'));
  await shot('missing-day');
  await gap.click();
  await page.locator('.toast', { hasText: 'חזר' }).waitFor();
  const back = await until(async () => (await list('days')).find(d => d.fields.date?.stringValue === '2026-11-12'), 'the day back');
  if (back.fields.title.stringValue !== 'יום 3') throw new Error(`title: ${back.fields.title.stringValue}`);
  await gap.waitFor({ state: 'detached' });
  if (await chip('יום 3').getAttribute('aria-selected') !== 'true') throw new Error('not shown');
  await card('צ׳ק־אאוט מהמלון').waitFor();
});

// 8.82.0: from morning to evening, the three parts picked; saved as one label.
await step('an activity over several parts of the day: morning to evening', async () => {
  await chip('יום 2').click();
  await page.locator('button[aria-label="פעולות: הקולוסיאום"]').click();
  await sheet().getByText('עריכה', { exact: true }).click();
  const part = (p) => sheet().locator('.act-part', { hasText: p });
  await part('צהריים').click();
  await part('ערב').click();
  for (const p of ['בוקר', 'צהריים', 'ערב']) {
    if (await part(p).getAttribute('aria-pressed') !== 'true') throw new Error(`${p} not on`);
  }
  await shot('parts-form');
  await sheet().locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  await until(async () => {
    const day = (await list('days')).find(d => d.fields.date?.stringValue === '2026-11-11');
    const a = (day?.fields.activities?.arrayValue.values || []).map(v => v.mapValue.fields)
      .find(f => f.title.stringValue === 'הקולוסיאום');
    return a?.timeLabel?.stringValue === 'בוקר–ערב';
  }, 'saved as one label');
  await card('הקולוסיאום').getByText('בוקר–ערב').waitFor();
  await shot('parts');
});

// 8.84.0: tapping an activity gives a note for this day only (not on the
// place) and "optional"; the card has no colour bar.
await step('an activity: a note for this day only, and optional', async () => {
  const colos = () => (async () => {
    const day = (await list('days')).find(d => d.fields.date?.stringValue === '2026-11-11');
    // The copy shown: the newest, the later one on a tie (dayOrder.js).
    return (day?.fields.activities?.arrayValue.values || []).map(v => v.mapValue.fields)
      .filter(f => f.title.stringValue === 'הקולוסיאום')
      .reduce((best, f) => (!best || Number(f.updatedAt?.integerValue || 0) >= Number(best.updatedAt?.integerValue || 0) ? f : best), null);
  })();
  const bar = await card('הקולוסיאום').evaluate(el => getComputedStyle(el, '::before').content);
  if (bar !== 'none' && bar !== 'normal') throw new Error(`a bar on the card: ${bar}`);
  await card('הקולוסיאום').locator('.dp-card-main').click();
  const note = sheet().getByLabel('הערה ליום הזה (רק כאן, לא במקום ברשימה)');
  await note.fill('להגיע לפני 10');
  await sheet().getByRole('switch', { name: /אופציונלית/ }).click();
  await until(async () => (await colos())?.optional?.booleanValue === true, 'optional saved');
  await until(async () => (await colos())?.description?.stringValue === 'להגיע לפני 10', 'note saved');
  await shot('activity-own');
  await sheet().getByRole('button', { name: 'סגור' }).first().click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  await card('הקולוסיאום').getByText('להגיע לפני 10').waitFor();
  await card('הקולוסיאום').getByText('אופציונלי', { exact: true }).waitFor();
  if (!(await card('הקולוסיאום').evaluate(el => el.classList.contains('optional')))) throw new Error('not dashed');
  const p1 = (await list('planning')).find(d => d.name.endsWith('/p1'));
  if (p1.fields.description?.stringValue === 'להגיע לפני 10') throw new Error('the note went on the place');
  // Off again: the field goes.
  await card('הקולוסיאום').locator('.dp-card-main').click();
  await sheet().getByRole('switch', { name: /אופציונלית/ }).click();
  await until(async () => !(await colos())?.optional, 'optional off');
  await sheet().getByRole('button', { name: 'סגור' }).first().click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
});

// 8.83.0: the FAB adds an activity; a day is added from the grey chip at the
// end of the strip, the day after the last, and its date can be changed.
await step('a day after the last one, from the end of the strip; then another date', async () => {
  if (await page.locator('button.fab', { hasText: 'יום חדש' }).count()) throw new Error('"new day" FAB still there');
  await page.locator('button.fab', { hasText: 'פעילות חדשה' }).waitFor();
  const next = page.locator('.dp-chip.next');
  if (await next.getAttribute('aria-label') !== 'הוספת יום: ו׳ 13.11') throw new Error(await next.getAttribute('aria-label'));
  await shot('next-day');
  await next.click();
  await page.locator('.toast', { hasText: 'נוסף' }).waitFor();
  const made = await until(async () => (await list('days')).find(d => d.fields.date?.stringValue === '2026-11-13'), 'the day added');
  if (made.fields.title.stringValue !== 'יום 4') throw new Error(`title: ${made.fields.title.stringValue}`);
  await until(async () => await chip('יום 4').getAttribute('aria-selected') === 'true', 'shown');
  await until(async () => await next.getAttribute('aria-label') === 'הוספת יום: ש׳ 14.11', 'the next one after it');

  await page.getByRole('button', { name: 'פעולות ליום' }).click();
  await sheet().getByText('שינוי תאריך').click();
  const dlg = page.locator('.picker-card');
  await dlg.waitFor();
  const cal = (n) => dlg.locator('.cal-day', { hasText: new RegExp(`^${n}$`) });
  if (!(await cal(12).isDisabled())) throw new Error('a date another day has can be picked');
  await cal(15).click();
  await shot('day-date');
  await dlg.getByRole('button', { name: 'בחירה' }).click();
  await page.locator('.toast', { hasText: 'עבר ל־' }).waitFor();
  await until(async () => (await list('days')).find(d => d.name.endsWith(made.name.split('/').pop()))?.fields.date?.stringValue === '2026-11-15', 'date saved');
  // 13 and 14 are now a gap between the days.
  await until(async () => await page.locator('.dp-chip.missing').count() === 2, 'the gap shows');
  await until(async () => await next.getAttribute('aria-label') === 'הוספת יום: ב׳ 16.11', 'next after the new date');
});

// 8.85.0: a toast shows the time it has left, and a swipe sends it away.
await step('a toast: a bar of the time left; swiped to the side, it goes', async () => {
  await page.locator('.dp-chip.next').click();
  const toast = page.locator('.toast', { hasText: 'נוסף' });
  await toast.waitFor();
  const bar = toast.locator('.toast-left i');
  const w0 = (await bar.boundingBox()).width;
  await page.waitForTimeout(1200);
  const w1 = (await bar.boundingBox()).width;
  if (!(w1 < w0 - 5)) throw new Error(`the bar doesn't empty: ${w0} -> ${w1}`);
  await shot('toast-left');
  const box = await toast.boundingBox();
  const y = box.y + box.height / 2;
  const x = box.x + box.width * 0.4;   // on the text, not the button
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 25, y);
  await page.mouse.up();
  await toast.waitFor({ state: 'detached', timeout: 2000 });
  // A short drag comes back, and stays.
  await page.locator('.dp-chip.next').click();
  const again = page.locator('.toast', { hasText: 'נוסף' });
  await again.waitFor();
  const b2 = await again.boundingBox();
  await page.mouse.move(b2.x + b2.width * 0.4, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width * 0.4 + 30, b2.y + b2.height / 2, { steps: 6 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(400);
  if (!(await again.count())) throw new Error('a short drag sent it away');
});

// 8.86.0: each leg says where it is from and is measured from there; a
// place with no address or link is found by its name, and what was found
// is shown, so a wrong guess is seen (the guard change found at another
// palace than the one meant).
await step('a leg is from the stop before it; a place found by name only is flagged', async () => {
  const PIETRO = { lat: 41.9022, lng: 12.4539 };
  const TREVI = { lat: 41.9009, lng: 12.4833 };
  placesAnswer = {
    location: { latitude: PIETRO.lat, longitude: PIETRO.lng },
    displayName: { text: 'Piazza San Pietro' }, formattedAddress: '00120 Città del Vaticano',
  };
  await place('p6', 'החלפת משמרות', 'אטרקציות ודברים לעשות');   // no address, no link
  await place('p7', 'פנתיאון', 'מקומות לבקר', { links: at(41.8986, 12.4769) });
  await put('trips/sc/days/d6', { title: 'יום המשמרות', order: 50, date: '2026-11-20', activities: [
    act('a61', 'פונטנה די טרווי', 'p3', 'בוקר', 1, 'מקומות לבקר'),
    act('a62', 'החלפת משמרות', 'p6', 'בוקר', 2, 'אטרקציות ודברים לעשות'),
    act('a63', 'פנתיאון', 'p7', 'בוקר', 3, 'מקומות לבקר'),
  ] });
  routeLog.length = 0;
  await chip('יום המשמרות').click();
  const leg = (to) => page.locator(`.dp-leg[aria-label="זמן הגעה אל ${to}, בחירת נקודת יציאה"]`);
  await leg('החלפת משמרות').getByText('מ־פונטנה די טרווי').waitFor();
  await leg('פנתיאון').getByText('מ־החלפת משמרות').waitFor();
  await leg('החלפת משמרות').locator('.dp-leg-guess').waitFor();
  await leg('פנתיאון').locator('.dp-leg-guess').waitFor();
  if (await leg('פונטנה די טרווי').locator('.dp-leg-guess').count()) throw new Error('a leg with no guess flagged');
  const near = (a, b) => meters(a, b) < 30;
  await until(async () => routeLog.some(r => near(r.o, TREVI) && near(r.d, PIETRO)), 'measured from the place before it');
  await until(async () => routeLog.some(r => near(r.o, PIETRO) && meters(r.d, { lat: 41.8986, lng: 12.4769 }) < 30), 'and on from there');
  // Besides the leg, only the place's own time from the hotel (its card's,
  // measured in the background since 8.88.0).
  const HOTEL = { lat: 41.9009, lng: 12.5012 };
  if (routeLog.some(r => near(r.d, PIETRO) && !near(r.o, TREVI) && !near(r.o, HOTEL))) throw new Error('measured to it from somewhere else');
  await shot('legs-from');
  await card('החלפת משמרות').locator('.dp-card-main').click();
  const guess = sheet().locator('.dp-guess');
  await guess.getByText('Piazza San Pietro, 00120 Città del Vaticano').waitFor();
  const href = await guess.getByRole('link', { name: 'איפה זה במפה' }).getAttribute('href');
  if (!href.includes('41.9022')) throw new Error(`map link: ${href}`);
  await shot('place-guess');
  await sheet().getByRole('button', { name: 'סגור' }).first().click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
});

// 8.87.0: free blocks between the activities: text, a checklist, a link;
// dragged by the handle anywhere in the day, or onto a day in the strip.
const dayDoc = async (date) => (await list('days')).find(d => d.fields.date?.stringValue === date);
const blocksOn = async (date) => ((await dayDoc(date))?.fields.activities?.arrayValue.values || [])
  .map(v => v.mapValue.fields).filter(f => f.block);
const shownKeys = () => page.locator('.dp-timeline [data-item]').evaluateAll(els => els.map(e => e.dataset.item));

await step('free blocks: a text, a checklist and a link, at the end of the day', async () => {
  await page.locator('.dp-block-add').getByRole('button', { name: /טקסט/ }).click();
  await page.getByLabel('טקסט', { exact: true }).fill('לקנות כרטיסים מראש');
  await page.locator('.dp-block-editor').getByRole('button', { name: 'סיום' }).click();
  await until(async () => (await blocksOn('2026-11-20')).some(b => b.text?.stringValue === 'לקנות כרטיסים מראש'), 'text saved');
  const keys = await shownKeys();
  if (!keys[keys.length - 1].startsWith('blk:')) throw new Error(`not at the end: ${keys.join()}`);

  await page.locator('.dp-block-add').getByRole('button', { name: /רשימה/ }).click();
  await page.getByLabel('כותרת הרשימה').fill('לקחת');
  await page.getByLabel('פריט 1').fill('מים');
  await page.getByLabel('פריט 1').press('Enter');
  await page.getByLabel('פריט 2').fill('כובע');
  await page.locator('.dp-block-editor').getByRole('button', { name: 'סיום' }).click();
  const list2 = page.locator('.dp-block.kind-check');
  await list2.getByText('0/2').waitFor();
  await list2.getByRole('checkbox', { name: 'מים' }).click();
  await list2.getByText('1/2').waitFor();
  await until(async () => {
    const b = (await blocksOn('2026-11-20')).find(x => x.block.stringValue === 'check');
    const items = (b?.items?.arrayValue.values || []).map(v => v.mapValue.fields);
    return items.length === 2 && items.find(i => i.text.stringValue === 'מים')?.done?.booleanValue === true;
  }, 'ticked on the server');

  await page.locator('.dp-block-add').getByRole('button', { name: /קישור/ }).click();
  await page.getByLabel('כתובת הקישור').fill('example.com/tickets');
  await page.getByLabel('שם הקישור').fill('כרטיסים');
  await page.locator('.dp-block-editor').getByRole('button', { name: 'סיום' }).click();
  const link = page.locator('.dp-block-link', { hasText: 'כרטיסים' });
  if (await link.getAttribute('href') !== 'https://example.com/tickets') throw new Error(await link.getAttribute('href'));
  // Not activities: the count says 3.
  await page.locator('.dp-stats').getByText('3 פעילויות').waitFor();
  await shot('blocks');
});

await step('free blocks: dragged by the handle between two activities, and onto another day', async () => {
  const text = page.locator('.dp-block-row', { hasText: 'לקנות כרטיסים מראש' });
  await text.scrollIntoViewIfNeeded();
  const grip = text.getByRole('button', { name: 'גרירת הבלוק' });
  const g = await grip.boundingBox();
  const mid = async (key) => { const b = await page.locator(`[data-item="${key}"]`).boundingBox(); return b.y + b.height / 2; };
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  const y = ((await mid('act:a62')) + (await mid('act:a63'))) / 2;
  await page.mouse.move(g.x + g.width / 2, y, { steps: 12 });
  await page.locator('.dp-row.drop-before').waitFor();
  await shot('block-drag');
  await page.mouse.up();
  await until(async () => {
    const k = await shownKeys();
    const i = k.findIndex(x => x.startsWith('blk:') && x !== undefined && k[k.indexOf(x) - 1] === 'act:a62');
    return i > 0 && k[i + 1] === 'act:a63';
  }, 'between the two');
  const b = (await blocksOn('2026-11-20')).find(x => x.text?.stringValue === 'לקנות כרטיסים מראש');
  if (b.after?.stringValue !== 'act:a62') throw new Error(`after: ${JSON.stringify(b.after)}`);

  // Onto another day in the strip: up to the top, the page scrolls there.
  const check = page.locator('.dp-block-row', { hasText: 'לקחת' });
  await check.scrollIntoViewIfNeeded();
  const g2 = await check.getByRole('button', { name: 'גרירת הבלוק' }).boundingBox();
  await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2);
  await page.mouse.down();
  await page.mouse.move(g2.x + g2.width / 2, 40, { steps: 10 });
  await page.waitForFunction(() => document.querySelector('.app-content').scrollTop === 0, null, { timeout: 8000 });
  const c = await chip('יום 6').boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 6 });
  await page.locator('.dp-chip.drop-target').waitFor();
  await shot('block-to-day');
  await page.mouse.up();
  await page.locator('.toast', { hasText: 'עבר ליום 6' }).waitFor();
  await until(async () => (await blocksOn('2026-11-17')).some(x => x.text?.stringValue === 'לקחת'), 'on the other day');
  if ((await blocksOn('2026-11-20')).some(x => x.text?.stringValue === 'לקחת')) throw new Error('still on its old day');
});

await step('a booking: search the places; a linked place replaces its name and address', async () => {
  await page.locator('nav button.nav-item[aria-label="הזמנות"]').click();
  await page.locator('button.fab', { hasText: 'הזמנה חדשה' }).click();
  await sheet().getByRole('button', { name: 'חיפוש מקום ברשימה' }).click();
  await sheet().getByPlaceholder('חיפוש מקום ברשימה').fill('קולו');
  await sheet().getByRole('radio', { name: /הקולוסיאום/ }).click();
  await page.waitForTimeout(400);
  await sheet().locator('.act-place', { hasText: 'הקולוסיאום' }).waitFor();
  if (await sheet().getByPlaceholder('למשל: ארוחת ערב ב-Costes').count()) throw new Error('name still typed');
  if (await sheet().getByPlaceholder('כתובת או קישור למפה').count()) throw new Error('address still typed');
  await sheet().getByPlaceholder('ABC123').fill('COL7');
  await shot('booking-form-place');
  await sheet().locator('.sheet-footer button[type="submit"]').click();
  const b = await until(async () => (await list('bookings')).find(d => d.fields.confirmation?.stringValue === 'COL7'), 'booking saved');
  if (b.fields.title?.stringValue !== 'הקולוסיאום' || b.fields.placeId?.stringValue !== 'p1') throw new Error('not from the place');
  if (b.fields.address?.stringValue !== 'Piazza del Colosseo, Roma') throw new Error('no address from the place');
});

if (errors.length) { console.log('  page errors:', errors); failed++; }
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('schedule: all passed');
