// The weather chip by the destination city on the outbound flight card,
// the "מידע חשוב" card under the hotel, both their sheets; the edit
// button at the bottom of the tab, not in the header; no currency
// converter. The weather needs the
// destination airport's coordinates (seeded into the emulator) and a
// forecast (served by a fake Open-Meteo response).
//   bash scripts/run-e2e.sh tests/e2e/flight.e2e.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = `${process.argv[2] || '.e2e'}/flight`;
mkdirSync(out, { recursive: true });
const DB = 'http://127.0.0.1:8080/v1/projects/demo-flights/databases/(default)/documents';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' })).newPage();
page.setDefaultTimeout(15000);
let failed = 0, n = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${out}/fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
}
const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };

// A fixed forecast: three days, 24 hours each.
const days = ['2026-10-14', '2026-10-15', '2026-10-16'];
await page.route('**/api.open-meteo.com/**', route => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({
    current: { temperature_2m: 21.4, weathercode: 2, windspeed_10m: 12, relative_humidity_2m: 58 },
    hourly: {
      time: days.flatMap(d => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`)),
      temperature_2m: Array.from({ length: 72 }, (_, i) => 14 + (i % 24) / 3),
      weathercode: Array.from({ length: 72 }, (_, i) => (i % 5 ? 1 : 61)),
      precipitation_probability: Array.from({ length: 72 }, (_, i) => (i % 5 ? 0 : 40)),
    },
    daily: {
      time: days, weathercode: [2, 61, 1],
      temperature_2m_max: [23, 19, 24], temperature_2m_min: [14, 13, 15],
      precipitation_probability_max: [5, 60, 10],
    },
  }),
}));

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('flight@example.com'));
await page.getByText('צור טיול ראשון').click();
await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('מזג אוויר ברומא');
await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('רומא');
await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
await page.locator('.trip-card').waitFor();
await page.waitForTimeout(1500);

// Destination airport with coordinates (emulator only, one field path).
// Other tests share the emulator: pick this test's trip by its name.
const trips = await (await fetch(`${DB}/trips?pageSize=300`, { headers: admin })).json();
const mine = trips.documents.find(d => d.fields?.name?.stringValue === 'מזג אוויר ברומא');
if (!mine) throw new Error('trip not found in the emulator');
const tripId = mine.name.split('/').pop();
const airport = { mapValue: { fields: {
  code: { stringValue: 'FCO' }, city: { stringValue: 'רומא' }, name: { stringValue: 'Fiumicino' },
  lat: { doubleValue: 41.8003 }, lng: { doubleValue: 12.2389 }, timezone: { stringValue: 'UTC +02:00' },
} } };
const r = await fetch(`${DB}/trips/${tripId}?updateMask.fieldPaths=outboundFlightDetails.arrAirport`, {
  method: 'PATCH', headers: admin,
  body: JSON.stringify({ fields: { outboundFlightDetails: { mapValue: { fields: { arrAirport: airport } } } } }),
});
if (!r.ok) throw new Error(`seed failed ${r.status}`);

await page.locator('.trip-card').getByText('פתח טיול').click();
await page.getByText('טיסת הלוך').first().waitFor();

const chip = page.locator('.app-content button.weather-chip');
const info = page.locator('.app-content button.info-card');
for (const theme of ['light', 'dark']) {
  if (theme === 'dark') await page.locator('button[aria-label="עבור למצב כהה"]').click();
  await step(`${theme}: weather by the destination city, info card on the tab`, async () => {
    await chip.waitFor();
    await info.waitFor();
    if (await page.locator('header button.weather-chip').count()) throw new Error('weather still in the header');
    if (await page.locator('header button[aria-label="מידע חשוב"]').count()) throw new Error('info still in the header');
    if (await page.locator('header button[aria-label*="ערוך"]').count()) throw new Error('edit still in the header');
    // Under the hotel, the last card of the tab.
    const last = await page.locator('.dashboard-grid > .glass-card').last().evaluate(el => el.classList.contains('info-card'));
    if (!last) throw new Error('info card is not under the hotel');
    await info.scrollIntoViewIfNeeded();
    await shot(`${theme}-info-card`);
    await page.locator('.app-content').evaluate(el => el.scrollTo(0, 0));
    const city = await chip.evaluate(el => el.closest('.route-city')?.innerText || '');
    if (!city.includes('רומא')) throw new Error(`chip is not by the destination city ("${city}")`);
    if (!/21°/.test(await chip.innerText())) throw new Error(`chip reads "${await chip.innerText()}"`);
    const fits = await page.locator('header').evaluate(h => {
      const t = h.querySelector('h1');
      return h.scrollWidth <= h.clientWidth + 1 && t.scrollWidth <= t.clientWidth + 1;
    });
    if (!fits) throw new Error('header overflows or the title is cut');
    if (await page.locator('.quick-row').count()) throw new Error('old quick row still on the tab');
    await shot(`${theme}-tab`);
  });
  await step(`${theme}: weather sheet`, async () => {
    await chip.click();
    await page.locator('.modal-overlay .weather-now-temp').waitFor();   // the trip has no dates, so no day strip
    await shot(`${theme}-weather`);
    await page.locator('.modal-overlay button[aria-label="סגור"]').click();
    await page.locator('.modal-overlay').waitFor({ state: 'detached' });
  });
  await step(`${theme}: info sheet`, async () => {
    await info.click();
    await page.locator('.modal-header', { hasText: 'מידע חשוב' }).waitFor();
    // The owner can edit from here: the sheet sees the trip's role.
    await page.locator('.modal-overlay').getByRole('button', { name: 'פריט חדש' }).waitFor({ timeout: 5000 });
    await shot(`${theme}-info`);
    await page.locator('.modal-overlay button[aria-label="סגור"]').first().click();
    await page.locator('.modal-overlay').waitFor({ state: 'detached' });
  });
}

await step('the edit button opens everything at once', async () => {
  await page.getByRole('button', { name: 'עריכת פרטים' }).click();
  await page.getByText('עריכת כל פרטי הנסיעה').waitFor();
  await page.locator('.modal-overlay button[aria-label="סגור"]').first().click();
  await page.getByText('עריכת כל פרטי הנסיעה').waitFor({ state: 'detached' });
});

await step('no currency converter anywhere on the tab', async () => {
  const text = await page.locator('.app-content').innerText();
  if (/המרת מטבעות|ממיר/.test(text)) throw new Error('converter still on the tab');
});

const tripDoc = async () => (await (await fetch(`${DB}/trips/${tripId}`, { headers: admin })).json()).fields;
const patch = (mask, fields) => fetch(`${DB}/trips/${tripId}?${mask.map(m => `updateMask.fieldPaths=${m}`).join('&')}`,
  { method: 'PATCH', headers: admin, body: JSON.stringify({ fields }) });

// A lookup that fails (here: over quota) used to fill the flight with made-up
// airports and times from a local "simulator", and save them.
await step('a refresh that fails leaves the saved flight as it is', async () => {
  await page.route('**/aerodatabox.p.rapidapi.com/**', route => route.fulfill({ status: 429, body: '' }));
  await patch(['outboundFlightDetails.flightNumber', 'outboundFlightDetails.scheduledDep'], { outboundFlightDetails: { mapValue: { fields: {
    flightNumber: { stringValue: 'LY315' }, scheduledDep: { stringValue: '08:10' },
  } } } });
  const refresh = page.locator('button[title="רענן מידע טיסה"]').first();
  await page.waitForFunction(() => {
    const b = document.querySelector('button[title="רענן מידע טיסה"]');
    return b && !b.disabled;
  }, null, { timeout: 5000 });
  await refresh.click();
  await page.waitForTimeout(1500);
  const f = (await tripDoc()).outboundFlightDetails.mapValue.fields;
  const got = [f.scheduledDep?.stringValue, f.arrAirport?.mapValue.fields.code.stringValue, f.lastRefreshed?.stringValue];
  if (got[0] !== '08:10' || got[1] !== 'FCO' || got[2]) throw new Error(`flight changed: ${JSON.stringify(got)}`);
});

// The form keeps every field of the trip, also the ones its scope hides.
// Saving wrote them all back, and undid what a partner changed meanwhile.
await step("saving the hotel keeps a partner's change made while the form was open", async () => {
  await page.locator('button[title="ערוך פרטי מלון"]').click();
  await page.getByText('עריכת פרטי המלון').waitFor();
  const r = await patch(['name'], { name: { stringValue: 'שם ששותף נתן' } });
  if (!r.ok) throw new Error(`partner write failed ${r.status}`);
  await page.locator('.modal-content input.form-control').first().fill('מלון חדש');
  await page.locator('.sheet-footer button[type="submit"]').click();
  await page.getByText('עריכת פרטי המלון').waitFor({ state: 'detached', timeout: 3000 });
  await page.waitForTimeout(1500);
  const t = await tripDoc();
  const got = [t.name.stringValue, t.hotelDetails.mapValue.fields.name.stringValue];
  if (got[0] !== 'שם ששותף נתן' || got[1] !== 'מלון חדש') throw new Error(`after save: ${JSON.stringify(got)}`);
});

// A link typed without https:// saves (the browser refused a type="url"
// field), and is kept with it.
await step('a hotel link without https:// saves, with https:// added', async () => {
  await page.locator('button[title="ערוך פרטי מלון"]').click();
  await page.getByText('עריכת פרטי המלון').waitFor();
  await page.getByPlaceholder('https://maps.google.com/...').fill('maps.app.goo.gl/hotel42');
  await page.locator('.sheet-footer button[type="submit"]').click();
  await page.getByText('עריכת פרטי המלון').waitFor({ state: 'detached', timeout: 3000 });
  await page.waitForTimeout(1500);
  const link = (await tripDoc()).hotelDetails.mapValue.fields.link?.stringValue;
  if (link !== 'https://maps.app.goo.gl/hotel42') throw new Error(`link: ${link}`);
});

// Offline (no reception at the airport), "שמור" still closes the form;
// the write waits in the local cache and the card shows it at once.
await step('saving hotel details offline closes the form', async () => {
  await page.context().setOffline(true);
  try {
    await page.locator('button[title="ערוך פרטי מלון"]').click();
    await page.getByText('עריכת פרטי המלון').waitFor();
    await page.locator('.modal-content input.form-control').first().fill('מלון אופליין');
    await page.locator('.sheet-footer button[type="submit"]').click();
    await page.getByText('עריכת פרטי המלון').waitFor({ state: 'detached', timeout: 3000 });
    await page.locator('.app-content').getByText('מלון אופליין').first().waitFor({ timeout: 3000 });
  } finally {
    await page.context().setOffline(false);
  }
});

// '2026-11-03' was read as midnight UTC: on a phone west of Greenwich, the
// evening before. Days made from the flight dates came out a day early.
await step('days made from the flight dates are those dates, in a US time zone too', async () => {
  await patch(['outboundFlightDetails.date', 'returnFlightDetails.date'], {
    outboundFlightDetails: { mapValue: { fields: { date: { stringValue: '2026-11-03' } } } },
    returnFlightDetails: { mapValue: { fields: { date: { stringValue: '2026-11-05' } } } },
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' });
  try {
    await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
    await page.locator('[role="tab"]', { hasText: 'לוח זמנים' }).click();
    await page.getByRole('button', { name: 'ייצר ימים לפי תאריכי הטיסה' }).click();
    let dates = [];
    for (let i = 0; i < 20 && dates.length < 3; i++) {
      await page.waitForTimeout(250);
      const list = await (await fetch(`${DB}/trips/${tripId}/days`, { headers: admin })).json();
      dates = (list.documents || []).map(d => d.fields.date.stringValue).sort();
    }
    if (dates.join() !== '2026-11-03,2026-11-04,2026-11-05') throw new Error(`days: ${dates.join() || 'none'}`);
    await page.getByText('ג׳ 03.11').first().waitFor();   // Tuesday, on the day's card
  } finally {
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: '' }).catch(() => {});
  }
});

await browser.close();
process.exit(failed ? 1 : 0);
