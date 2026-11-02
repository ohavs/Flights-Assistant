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
await ctx.route('https://routes.googleapis.com/**', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  const m = Math.round(meters(point(body.origin), point(body.destination)));
  const secs = body.travelMode === 'WALK' ? Math.round(m / 1.3) : 300 + Math.round(m / 6);
  await route.fulfill({ json: { routes: [{ duration: `${secs}s`, distanceMeters: m }] } });
});
await ctx.route('https://places.googleapis.com/**', (route) =>
  route.fulfill({ json: { places: [{ location: { latitude: COLOSSEUM.lat, longitude: COLOSSEUM.lng } }] } }));
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
  if (await page.locator('.dp-chip').count() !== 3) throw new Error('not three days');
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
  // From the fountain: no "from" on the chip, it is the stop above.
  if (await toDinner.locator('.dp-leg-from').count()) throw new Error('says where from');
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
  await page.getByText('הוסף פעילות').click();
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
  await page.getByRole('button', { name: 'הוסף לתכנון שלי' }).click();
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
