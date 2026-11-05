// Locations and travel times keep themselves current (8.88.0): every place
// is located once and keeps it (`coords` with `fp`/`src`), and its time from
// the hotel is measured in the background and saved with where it went
// (`toAt`). Nothing is pressed: a new place, a short link that failed and
// then opened, a link changed on another phone, the hotel moved, a time
// saved before 8.88.0. In a steady state nothing is asked of the network.
//   bash scripts/run-e2e.sh tests/e2e/locations.e2e.mjs
// The Maps calls, the server that opens short links (openMapsLink, 8.89.0)
// and the short-link proxies are answered here.
// Output: <argv[2]>/locations/<nn>-<name>.png. Exits non-zero if a step fails.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = `${process.argv[2] || '.e2e'}/locations`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await ctx.addInitScript(() => { window.__e2eGmapsKey = 'e2e'; });

const CITY = { lat: 41.9028, lng: 12.4964 };      // רומא, איטליה
const HOTEL = { lat: 41.9009, lng: 12.5012 };
const HOTEL2 = { lat: 41.8800, lng: 12.4700 };
const NAMESAKE = { lat: 41.9200, lng: 12.4600 };  // what a search by the name finds
const LINKED = { lat: 41.8986, lng: 12.4769 };    // where the short link points
const SHARED = { lat: 41.8955, lng: 12.4823 };    // the place an iPhone's link names
const A = { lat: 41.8887, lng: 12.4776 };
const B = { lat: 41.9060, lng: 12.4823 };
const meters = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2
    + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
const near = (a, b) => !!a && !!b && meters(a, b) < 30;
// Google's id of the place shared from an iPhone (routes go to it, 8.90.0).
const SHARED_ID = 'ChIJtazza';
const point = (w) => {
  if (w?.placeId) return w.placeId === SHARED_ID ? { ...SHARED, placeId: w.placeId } : { address: '' };
  const ll = w?.location?.latLng;
  return ll ? { lat: ll.latitude, lng: ll.longitude } : { address: w?.address || '' };
};
const calls = { routes: [], places: [], proxy: 0, server: [] };
await ctx.route('https://routes.googleapis.com/**', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  const o = point(body.origin), d = point(body.destination);
  calls.routes.push({ o, d, mode: body.travelMode });
  const m = o.lat && d.lat ? Math.round(meters(o, d)) : 1500;
  const secs = body.travelMode === 'WALK' ? Math.round(m / 1.3) : 300 + Math.round(m / 6);
  await route.fulfill({ json: { routes: [{ duration: `${secs}s`, distanceMeters: m }] } });
});
await ctx.route('https://places.googleapis.com/**', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  calls.places.push(body.textQuery);
  const p = body.textQuery === 'רומא, איטליה' ? CITY : body.textQuery === 'Caffè Tazza, Via Roma 1, 00184 Roma' ? SHARED : NAMESAKE;
  await route.fulfill({ json: { places: [{
    ...(p === SHARED ? { id: SHARED_ID } : {}),
    location: { latitude: p.lat, longitude: p.lng },
    displayName: { text: 'Namesake' }, formattedAddress: 'Via Sbagliata 1',
  }] } });
});
// The server that opens short links: down at first, then up. A link
// shared from an iPhone leads to a name and address, not coordinates.
let serverUp = false;
await ctx.route('**/openMapsLink', async (route) => {
  const url = JSON.parse(route.request().postData() || '{}').data?.url || '';
  calls.server.push(url);
  if (!serverUp) return route.abort();
  const result = url.includes('g_st=ic')
    ? { url: 'https://maps.google.com/?q=Caff%C3%A8+Tazza', at: null, query: 'Caffè Tazza, Via Roma 1, 00184 Roma' }
    : { url: 'https://www.google.com/maps/place/X', at: `${LINKED.lat},${LINKED.lng}`, query: null };
  return route.fulfill({ json: { result } });
});
// The public proxies, tried only when the server can't be reached: down.
await ctx.route(/api\.allorigins\.win|corsproxy\.io|r\.jina\.ai/, async (route) => {
  calls.proxy++;
  return route.abort();
});

const page = await ctx.newPage();
page.setDefaultTimeout(10000);
page.on('dialog', d => d.accept());
const errors = [];
page.on('pageerror', e => errors.push(e.message));

let n = 0, failed = 0;
async function shot(name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` });
}
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${out}/fail-${String(n).padStart(2, '0')}-${name.replace(/\W+/g, '_')}.png` }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  }
}

const DB = 'http://127.0.0.1:8080/v1/projects/demo-flights/databases/(default)/documents';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const value = (v) => v === null ? { nullValue: null }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'string' ? { stringValue: v }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : Array.isArray(v) ? { arrayValue: { values: v.map(value) } }
  : { mapValue: { fields: fields(v) } };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, value(v)]));
// Only the fields given, as another phone's update would.
const patch = (path, data) => {
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  return fetch(`${DB}/${path}?${mask}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: fields(data) }) })
    .then(r => { if (!r.ok) throw new Error(`${path}: ${r.status}`); });
};
const plain = (v) => v == null ? null
  : 'stringValue' in v ? v.stringValue
  : 'integerValue' in v ? Number(v.integerValue)
  : 'doubleValue' in v ? v.doubleValue
  : 'booleanValue' in v ? v.booleanValue
  : 'nullValue' in v ? null
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]))
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(plain) : null;
const getPlace = (id) => fetch(`${DB}/trips/lc/planning/${id}`, { headers: admin }).then(r => r.json())
  .then(j => Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, plain(v)])));
const listLegs = () => fetch(`${DB}/trips/lc/legs?pageSize=300`, { headers: admin }).then(r => r.json()).then(j => j.documents || []);
async function until(fn, what, tries = 60) {
  for (let i = 0; i < tries; i++) { const v = await fn(); if (v) return v; await page.waitForTimeout(250); }
  throw new Error(`never: ${what}`);
}
const atText = (p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
const ptOf = (s) => { const [lat, lng] = String(s || '').split(',').map(Number); return { lat, lng }; };
const mapsAt = (p) => [{ label: 'מפה', url: `https://www.google.com/maps/place/x/@${p.lat},${p.lng},17z` }];

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
const me = await page.evaluate(() => window.__e2eSignIn('locations@example.com').then(c => c.user.uid));
await page.getByText('צור טיול ראשון').waitFor();

const hotelLink = (p) => `https://www.google.com/maps/@${p.lat},${p.lng},17z`;
await patch('trips/lc', {
  name: 'רומא', destination: 'רומא, איטליה', dates: '10.11.2026 - 12.11.2026',
  members: { [me]: 'owner' }, memberIds: [me],
  hotelDetails: { name: 'Hotel Roma', address: '', link: hotelLink(HOTEL) },
});
const place = (id, title, extra = {}) => patch(`trips/lc/planning/${id}`, {
  title, category: 'אטרקציות ודברים לעשות', address: '', links: [], visited: false, createdBy: me, addedBy: me, ...extra,
});
// A share from Google Maps: the short link is the address.
await place('q1', 'מקום בקישור קצר', { address: 'https://maps.app.goo.gl/lc1' });
await place('q2', 'מקום עם קישור', { links: mapsAt(A) });
// Saved before 8.88.0: coordinates with no fingerprint, a time with no `toAt`.
await place('q3', 'זמן ישן', {
  links: mapsAt(B), coords: { lat: B.lat, lng: B.lng },
  distances: { hotel: { walk: { duration: "41 דק'", seconds: 2460 }, transit: { duration: "45 דק'", seconds: 2700 }, fetchedAt: 1 } },
});

const toHotel = (p, from = HOTEL) => calls.routes.some(r => near(r.o, from) && near(r.d, p));
const open = async () => {
  await page.locator('.trip-card', { hasText: 'רומא' }).getByText('פתח טיול').click();
  await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
  await page.locator('.pstub-title', { hasText: 'מקום עם קישור' }).waitFor();
};
await open();

await step('every place located and measured from the hotel, without pressing anything', async () => {
  await until(async () => (await getPlace('q2')).coords?.src === 'link', 'q2 located by its link');
  const q2 = await getPlace('q2');
  if (!near(q2.coords, A)) throw new Error(`q2 at ${JSON.stringify(q2.coords)}`);
  await until(async () => (await getPlace('q2')).distances?.hotel?.toAt === atText(A), 'q2 measured to its location');
  if (!toHotel(A)) throw new Error('no route from the hotel to q2');
  // The short link didn't open: found by its name for now, and flagged.
  await until(async () => (await getPlace('q1')).coords?.src === 'title', 'q1 guessed by its name');
  const q1 = await getPlace('q1');
  if (!near(q1.coords, NAMESAKE) || q1.coords.name !== 'Namesake') throw new Error(`q1: ${JSON.stringify(q1.coords)}`);
  await until(async () => (await getPlace('q1')).distances?.hotel?.toAt === atText(NAMESAKE), 'q1 measured to the guess');
  await page.locator('.pstub-wrap', { hasText: 'מקום בקישור קצר' }).getByText('מיקום משוער').waitFor();
  if (await page.locator('.pstub-wrap', { hasText: 'מקום עם קישור' }).getByText('מיקום משוער').count()) throw new Error('a place by its link flagged');
  await page.locator('.pstub-title', { hasText: 'מקום בקישור קצר' }).click();
  await page.locator('.modal-content .dp-guess').getByText('Namesake, Via Sbagliata 1').waitFor();
  await shot('guess-sheet');
  await page.locator('.modal-overlay button[aria-label="סגור"]').last().click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
});

await step('a time saved before 8.88.0 is measured again, and the old one goes', async () => {
  await until(async () => (await getPlace('q3')).distances?.hotel?.toAt === atText(B), 'q3 measured again');
  const q3 = await getPlace('q3');
  if (q3.distances.hotel.walk.seconds === 2460) throw new Error('the old time stayed');
  if (q3.coords?.src !== 'link' || !q3.coords.fp) throw new Error(`q3 not located anew: ${JSON.stringify(q3.coords)}`);
  const stub = page.locator('.pstub-wrap', { hasText: 'זמן ישן' });
  await until(async () => !(await stub.innerText()).includes('41'), 'the old 41 minutes off the card');
  await shot('measured');
});

await step('the options say it keeps itself current; no "חשב ושמור מרחקים"', async () => {
  await page.locator('[title="מיון ותצוגה"]').click();
  await page.getByText('המיקומים וזמני ההגעה מתעדכנים לבד').waitFor();
  if (await page.getByText('חשב ושמור מרחקים').count()) throw new Error('the old button is still there');
  await shot('status');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
});

await step('next session: the short link opens, and the guess is replaced by it', async () => {
  serverUp = true;
  calls.routes.length = 0;
  await page.reload();
  await open();
  await until(async () => (await getPlace('q1')).coords?.src === 'link', 'q1 found by its link');
  const q1 = await getPlace('q1');
  if (!near(q1.coords, LINKED)) throw new Error(`q1 at ${JSON.stringify(q1.coords)}`);
  await until(async () => (await getPlace('q1')).distances?.hotel?.toAt === atText(LINKED), 'q1 measured to the link');
  if (!toHotel(LINKED)) throw new Error('no route from the hotel to the link');
  await until(async () => !(await page.locator('.pstub-wrap', { hasText: 'מקום בקישור קצר' }).getByText('מיקום משוער').count()), 'the flag gone');
});

await step('a link changed on another phone: found and measured again here', async () => {
  calls.routes.length = 0;
  await patch('trips/lc/planning/q2', { links: mapsAt(B) });
  await until(async () => near((await getPlace('q2')).coords, B), 'q2 found at its new link');
  await until(async () => (await getPlace('q2')).distances?.hotel?.toAt === atText(B), 'q2 measured to it');
  if (!toHotel(B)) throw new Error('no route to the new spot');
});

await step('the hotel moved: every time measured again from it', async () => {
  calls.routes.length = 0;
  await patch('trips/lc', { hotelDetails: { name: 'Hotel Roma', address: '', link: hotelLink(HOTEL2) } });
  for (const [id, p] of [['q1', LINKED], ['q2', B], ['q3', B]]) {
    await until(() => toHotel(p, HOTEL2), `${id} from the new hotel`);
    await until(async () => ptOf((await getPlace(id)).distances?.hotel?.origin).lat === HOTEL2.lat, `${id} saved from it`);
  }
});

await step('a place added with a short link (as a share from Google Maps): located and measured', async () => {
  const modal = () => page.locator('.modal-overlay').last();
  await page.locator('button.fab', { hasText: 'יעד חדש' }).click();
  await modal().getByPlaceholder('למשל: תצפית שקיעה בגבעה').fill('שיתוף מהמפה');
  await modal().getByPlaceholder('כתובת או קישור למפה').first().fill('https://maps.app.goo.gl/lc1');
  await modal().locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  const id = await until(async () => {
    const docs = await fetch(`${DB}/trips/lc/planning?pageSize=50`, { headers: admin }).then(r => r.json());
    const d = (docs.documents || []).find(x => x.fields.title?.stringValue === 'שיתוף מהמפה');
    return d && d.name.split('/').pop();
  }, 'the place saved');
  await until(async () => near((await getPlace(id)).coords, LINKED), 'located by the link');
  await until(async () => (await getPlace(id)).distances?.hotel?.toAt === atText(LINKED), 'measured');
});

await step('a link shared from an iPhone (a name and address): located by it, not flagged', async () => {
  await place('q4', 'שיתוף מאייפון', { address: 'https://maps.app.goo.gl/lc2?g_st=ic' });
  await until(async () => (await getPlace('q4')).coords?.src === 'link', 'q4 located by its link');
  if (!near((await getPlace('q4')).coords, SHARED)) throw new Error(`q4 at ${JSON.stringify((await getPlace('q4')).coords)}`);
  if (!calls.places.includes('Caffè Tazza, Via Roma 1, 00184 Roma')) throw new Error(`searched: ${calls.places.join(' | ')}`);
  // Its Google id kept, and the route goes to it, not to the road nearest its pin.
  if ((await getPlace('q4')).coords.pid !== SHARED_ID) throw new Error(`q4 pid: ${(await getPlace('q4')).coords.pid}`);
  await until(async () => (await getPlace('q4')).distances?.hotel?.toAt === `place_id:${SHARED_ID}`, 'q4 measured');
  if (!calls.routes.some(r => r.d.placeId === SHARED_ID)) throw new Error('q4 not routed by its id');
  await page.locator('.pstub-title', { hasText: 'שיתוף מאייפון' }).waitFor();
  if (await page.locator('.pstub-wrap', { hasText: 'שיתוף מאייפון' }).getByText('מיקום משוער').count()) throw new Error('flagged as a guess');
});

await step('a leg to a typed address is saved for the trip, and not measured again', async () => {
  await patch('trips/lc/days/d1', { title: 'יום 1', order: 1, date: '2026-11-10', activities: [
    { id: 'a1', title: 'מקום עם קישור', placeId: 'q2', timeLabel: 'בוקר', order: 1, address: '', description: '', category: 'אחר', createdBy: me },
    { id: 'a2', title: 'קפה', placeId: null, timeLabel: 'צהריים', order: 2, address: 'Via del Corso 1, Roma', description: '', category: 'אחר', createdBy: me },
  ] });
  await page.getByRole('tab', { name: /לוח זמנים/ }).click();
  await page.locator('.dp-chip').first().click();
  await until(async () => (await listLegs()).some(d => d.fields.to?.stringValue === 'Via del Corso 1, Roma'), 'the leg saved');
  calls.routes.length = 0;
  await page.reload();
  await page.locator('.trip-card', { hasText: 'רומא' }).getByText('פתח טיול').click();
  await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
  await page.getByRole('tab', { name: /לוח זמנים/ }).click();
  await page.locator('.dp-chip').first().click();
  await page.locator('.dp-leg', { hasText: 'מ־מקום עם קישור' }).locator('.dp-leg-walk').waitFor();
  await page.waitForTimeout(1500);
  const asked = calls.routes.filter(r => r.d.address === 'Via del Corso 1, Roma');
  if (asked.length) throw new Error(`measured again: ${asked.length}`);
});

await step('a steady state asks nothing of the network', async () => {
  calls.routes.length = 0;
  calls.places.length = 0;
  calls.proxy = 0;
  calls.server.length = 0;
  await page.reload();
  await open();
  await page.waitForTimeout(3000);
  if (calls.routes.length || calls.places.length || calls.proxy || calls.server.length) {
    throw new Error(`asked: ${calls.routes.length} routes, ${calls.places.length} searches (${calls.places.join(' | ')}), ${calls.proxy} proxy, ${calls.server.length} server`);
  }
});

if (errors.length) { failed++; console.log(`  FAIL  page errors: ${errors.slice(0, 3).join(' | ')}`); }
await browser.close();
console.log(failed ? `${failed} failed` : `  screenshots: ${out} (${n})`);
process.exit(failed ? 1 : 0);
