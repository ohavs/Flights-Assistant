// An alert near a place (8.100.0, the owner's ask): a switch on the place,
// then how near. The location is asked for at once, "all the time" with an
// explanation; Android then watches the places itself (geofences). The web
// app has no geofences: window.__e2eNear stands in for Android and keeps
// what it was handed (`fences`).
//   bash scripts/run-e2e.sh tests/e2e/nearplaces.e2e.mjs
// Screenshots: .e2e/nearplaces/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { locationFp } from '../../src/lib/placeLocation.js';

const out = `${process.argv[2] || '.e2e'}/nearplaces`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  window.__e2eNear = { status: { location: 'prompt', background: 'prompt' }, grant: true, fences: [], asked: [] };
});
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
const near = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__e2eNear)));
async function until(fn, what) {
  for (let i = 0; i < 40; i++) { const v = await fn(); if (v) return v; await page.waitForTimeout(250); }
  throw new Error(`never: ${what}`);
}

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
const me = await page.evaluate(() => window.__e2eSignIn('near@example.com').then(c => c.user.uid));
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1200);

await put('trips/nr', {
  name: 'וינה', destination: 'וינה, אוסטריה', dates: '12.12.2026 - 16.12.2026',
  members: { [me]: 'owner' }, memberIds: [me],
  outboundFlightDetails: { date: '2026-12-12', flightNumber: 'LY361' },
  returnFlightDetails: { date: '2026-12-16', flightNumber: 'LY362' },
});
const nine = [{ from: '09:00', to: '17:00' }];
const museum = {
  title: 'מוזיאון', category: 'אטרקציות ודברים לעשות', address: 'Museumsplatz 1, Wien', visited: false, createdBy: me, addedBy: me,
  openHours: { 0: nine, 1: nine, 2: nine, 3: nine, 4: nine, 5: nine, 6: [] },
};
museum.coords = { lat: 48.2034, lng: 16.3592, fp: locationFp(museum), src: 'address', pid: 'g1' };
await put('trips/nr/planning/m', museum);
// No address, no link, not located: nothing to watch yet.
await put('trips/nr/planning/r', { title: 'מסעדה', category: 'אוכל', address: '', visited: false, createdBy: me, addedBy: me });

const topModal = () => page.locator('.modal-overlay').last();
const plan = (t) => page.locator('.plan-card', { has: page.locator('.pstub-title', { hasText: t }) });
const closeTop = async () => { await page.locator('.modal-overlay button[aria-label="סגור"]').last().click(); await page.waitForTimeout(350); };
const box = () => topModal().locator('.place-near');
const sw = () => box().getByRole('switch', { name: /התראה בקרבת מקום/ });

await page.locator('.trip-card', { hasText: 'וינה' }).getByText('פתח טיול').click();
await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
await plan('מוזיאון').waitFor();

await step('a place has a switch for an alert near it, off', async () => {
  await plan('מוזיאון').click();
  await sw().waitFor();
  if ((await sw().getAttribute('aria-checked')) !== 'false') throw new Error('on before it was turned on');
  await box().getByText('הודעה כשתתקרבו למקום').waitFor();
  await box().scrollIntoViewIfNeeded();
  await shot('switch-off');
});

await step('on: the location is asked for, and the radius is 300 m', async () => {
  await sw().click();
  await box().getByText('כשתהיו במרחק 300 מ׳ ממנו').waitFor();
  const radii = await box().getByRole('radio').allInnerTexts();
  if (radii.join(',') !== '150 מ׳,300 מ׳,500 מ׳,1 ק״מ,2 ק״מ') throw new Error(`radii: ${radii}`);
  if ((await box().getByRole('radio', { name: '300 מ׳' }).getAttribute('aria-checked')) !== 'true') throw new Error('300 m not picked');
  const nr = await until(async () => { const x = await near(); return x.fences.length ? x : null; }, 'a fence handed to Android');
  if (!nr.asked.includes('location')) throw new Error('the location was not asked for');
  if (nr.asked.includes('background')) throw new Error('"all the time" asked with no explanation');
  // "All the time": explained, with a button.
  await box().getByText('כדי שההתראה תגיע גם כשהאפליקציה סגורה, בחרו "אפשר כל הזמן" במיקום.').waitFor();
  await box().scrollIntoViewIfNeeded();
  await shot('switch-on-ask-always');
});

await step('a radius picked is what Android watches, with the place\'s text', async () => {
  await box().getByRole('radio', { name: '1 ק״מ' }).click();
  await box().getByText('כשתהיו במרחק 1 ק״מ ממנו').waitFor();
  const f = await until(async () => { const x = await near(); return x.fences[0]?.radius === 1000 ? x.fences[0] : null; }, 'radius 1000');
  if (f.id !== 'nr/m' || f.tripId !== 'nr' || f.placeId !== 'm') throw new Error(`ids: ${JSON.stringify(f)}`);
  if (f.lat !== 48.2034 || f.lng !== 16.3592) throw new Error(`spot: ${f.lat},${f.lng}`);
  if (f.title !== 'אתם ליד מוזיאון' || f.body !== 'פחות מ־1 ק״מ ממכם') throw new Error(`text: ${f.title} / ${f.body}`);
  if (f.hours?.[1] !== 'פתוח היום 09:00–17:00' || f.hours?.[6] !== 'סגור היום') throw new Error(`hours: ${JSON.stringify(f.hours)}`);
  // It ends the day after the trip (the return on the 16th): midnight into the 18th.
  const end = new Date(f.until);
  if (end.getDate() !== 18 || end.getMonth() !== 11) throw new Error(`until: ${end}`);
});

await step('"all the time" allowed: the note says it works closed and offline', async () => {
  await box().getByRole('button', { name: 'אפשר מיקום כל הזמן' }).click();
  await box().getByText('הטלפון בודק לבד לפי GPS, גם כשהאפליקציה סגורה ובלי אינטרנט.').waitFor();
  if (!(await near()).asked.includes('background')) throw new Error('"all the time" was not asked for');
  await box().scrollIntoViewIfNeeded();
  await shot('switch-on-ready');
  await closeTop();
});

await step('the card says so, with the radius', async () => {
  await plan('מוזיאון').locator('[title="התראה בקרבת מקום"]', { hasText: '1 ק״מ' }).waitFor();
  await shot('card-tag');
});

await step('a place with no location yet cannot be turned on', async () => {
  await plan('מסעדה').click();
  await sw().waitFor();
  if (!(await sw().isDisabled())) throw new Error('turns on with no spot');
  await box().getByText('אפשר אחרי שיימצא מיקום למקום').waitFor();
  await closeTop();
});

await step('visited: paused, and Android no longer watches it', async () => {
  await put('trips/nr/planning/m', { ...museum, visited: true });
  await until(async () => (await near()).fences.length === 0, 'the fence dropped');
  await plan('מוזיאון').click();
  await box().getByText('מושהית: סימנתם שביקרתם כאן').waitFor();
  await closeTop();
  await put('trips/nr/planning/m', museum);
  await until(async () => (await near()).fences.length === 1, 'the fence back');
});

await step('off: gone from Android and from the card', async () => {
  await plan('מוזיאון').click();
  await sw().click();
  await until(async () => (await near()).fences.length === 0, 'the fence removed');
  if ((await sw().getAttribute('aria-checked')) !== 'false') throw new Error('still on');
  await closeTop();
  if (await plan('מוזיאון').locator('[title="התראה בקרבת מקום"]').count()) throw new Error('the tag stayed');
});

if (errors.length) { console.log('  page errors:', errors); failed++; }
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
