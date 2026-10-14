// The trip header's weather chip and "מידע חשוב" button, on every tab, and
// both their sheets; no currency converter. The weather needs the
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

const chip = page.locator('header button.weather-chip');
const info = page.locator('header button[aria-label="מידע חשוב"]');
for (const theme of ['light', 'dark']) {
  if (theme === 'dark') await page.locator('button[aria-label="עבור למצב כהה"]').click();
  await step(`${theme}: weather chip and info button in the header`, async () => {
    await chip.waitFor();
    await info.waitFor();
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
    await shot(`${theme}-info`);
    await page.locator('.modal-overlay button[aria-label="סגור"]').first().click();
    await page.locator('.modal-overlay').waitFor({ state: 'detached' });
  });
}

await step('the chip and the button are on every tab', async () => {
  for (const label of ['תכנון טיול', "צ'קליסט", 'הזמנות', 'הוצאות']) {
    await page.locator(`nav button.nav-item[aria-label="${label}"]`).click();
    await chip.waitFor({ timeout: 5000 });
    await info.waitFor({ timeout: 5000 });
  }
  await page.locator('nav button.nav-item[aria-label="טיסה ומלון"]').click();
  await page.getByText('טיסת הלוך').first().waitFor();
});

await step('no currency converter anywhere on the tab', async () => {
  const text = await page.locator('.app-content').innerText();
  if (/המרת מטבעות|ממיר/.test(text)) throw new Error('converter still on the tab');
});

await browser.close();
process.exit(failed ? 1 : 0);
