// Without internet (on a plane, abroad without roaming), the app opens and
// everything in it works: what was saved shows, and what is added or changed
// is kept on the phone and reaches the server when the connection is back.
// Web app with its service worker, as a phone runs it; the Android app is
// the same code with its files on the phone.
//   bash scripts/run-e2e.sh tests/e2e/offline.e2e.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const DB = 'http://127.0.0.1:8080/v1/projects/demo-flights/databases/(default)/documents';
// The app from its own server, stopped before going offline: Chromium's
// offline mode does not cover the service worker's own requests, so only a
// server that is gone proves every file came from the phone.
const OUT = process.argv[2] || '.e2e';
const PORT = 5174;
const APP = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', 'preview', '--outDir', `${OUT}/dist`, '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const stopServer = () => { try { process.kill(-server.pid); } catch { /* already gone */ } };
process.on('exit', stopServer);
for (let i = 0; i < 60; i++) {
  if (await fetch(APP).then(r => r.ok, () => false)) break;
  await new Promise(r => setTimeout(r, 500));
}
const admin = { Authorization: 'Bearer owner' };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// The service worker is on here (other tests block it): it is what opens the app offline.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `.e2e/offline-fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
}
const tab = (label) => page.locator(`nav button.nav-item[aria-label="${label}"]`).click();
const card = (text) => page.locator('.list-card', { hasText: text }).first();
const closed = () => page.locator('.modal-overlay').first().waitFor({ state: 'detached', timeout: 5000 });
// Checklist categories start collapsed: open the one an item is in.
async function openCategory(name) {
  const toggle = page.locator('.app-content .section-header', { hasText: name }).first().locator('.section-header-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}
const TRIP = 'בלי אינטרנט בבודפשט';

await page.goto(APP);
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('offline@example.com'));
await page.getByText('צור טיול ראשון').click();
await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill(TRIP);
await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('בודפשט');
await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
await page.locator('.trip-card').getByText('פתח טיול').click();
await page.getByText('טיסת הלוך').first().waitFor();

// Something saved while online, to find again offline.
await tab('הוצאות');
await page.locator('button.fab', { hasText: 'הוצאה חדשה' }).click();
await page.getByPlaceholder('0.00').fill('42');
await page.getByPlaceholder('למשל: ארוחת ערב, כרטיסי כניסה...').fill('קפה ברשת');
await page.locator('.sheet-footer button[type="submit"]').click();
await card('קפה ברשת').waitFor();

// Every tab once, and the service worker in charge, as after a first visit.
for (const t of ['תכנון טיול', "צ'קליסט", 'הזמנות', 'טיסה ומלון']) {
  await tab(t);
  await page.waitForTimeout(500);
}
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
const trips = await (await fetch(`${DB}/trips?pageSize=300`, { headers: admin })).json();
const tripId = trips.documents.find(d => d.fields?.name?.stringValue === TRIP).name.split('/').pop();
// A flight number, so the flight can be refreshed (emulator only, one field path).
await fetch(`${DB}/trips/${tripId}?updateMask.fieldPaths=outboundFlightDetails.flightNumber`, {
  method: 'PATCH', headers: { ...admin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { outboundFlightDetails: { mapValue: { fields: { flightNumber: { stringValue: 'LY2371' } } } } } }),
});

async function openTrip() {
  const open = page.locator('.trip-card', { hasText: TRIP }).getByText('פתח טיול');
  await open.or(page.getByText('טיסת הלוך').first()).first().waitFor({ timeout: 20000 });
  if (await open.count()) await open.click();
  await page.getByText('טיסת הלוך').first().waitFor();
}

// A second trip, never opened on this phone, with an expense in it.
const ownerUid = (await (await fetch(`${DB}/trips/${tripId}`, { headers: admin })).json())
  .fields.memberIds.arrayValue.values[0].stringValue;
const TRIP2 = 'שוק בלי רשת';
await fetch(`${DB}/trips?documentId=trip_offline_2`, {
  method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: {
    name: { stringValue: TRIP2 }, destination: { stringValue: 'רומא' },
    members: { mapValue: { fields: { [ownerUid]: { stringValue: 'owner' } } } },
    memberIds: { arrayValue: { values: [{ stringValue: ownerUid }] } },
    createdAt: { stringValue: new Date().toISOString() },
  } }),
});
await fetch(`${DB}/trips/trip_offline_2/expenses?documentId=exp-market`, {
  method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: {
    amount: { integerValue: '7' }, currency: { stringValue: 'EUR' }, category: { stringValue: 'כללי' },
    description: { stringValue: 'מזכרת מהשוק' }, createdAt: { stringValue: new Date().toISOString() },
  } }),
});
// The list shows it: the app now keeps its data on the phone (App.jsx, offlineTrips).
await page.locator('.trip-card', { hasText: TRIP2 }).waitFor({ timeout: 20000 });
await page.waitForTimeout(3000);
const expenseId = ((await (await fetch(`${DB}/trips/${tripId}/expenses?pageSize=50`, { headers: admin })).json()).documents || [])
  .find(d => d.fields?.description?.stringValue === 'קפה ברשת').name.split('/').pop();

stopServer();
await new Promise(r => setTimeout(r, 500));
if (await fetch(APP).then(() => true, () => false)) throw new Error('the app server is still up');
await ctx.setOffline(true);

await step('offline, the app opens from the phone (a cold start) with the trip and what was saved', async () => {
  await page.reload();
  await openTrip();
  await tab('הוצאות');
  await card('קפה ברשת').waitFor();
});

await step('offline: a new expense', async () => {
  await page.locator('button.fab', { hasText: 'הוצאה חדשה' }).click();
  await page.getByPlaceholder('0.00').fill('18');
  await page.getByPlaceholder('למשל: ארוחת ערב, כרטיסי כניסה...').fill('מונית בלי רשת');
  await page.locator('.sheet-footer button[type="submit"]').click();
  await closed();
  await card('מונית בלי רשת').waitFor();
});

await step('offline: a new place to visit', async () => {
  await tab('תכנון טיול');
  await page.locator('button.fab', { hasText: 'יעד חדש' }).click();
  await page.locator('.modal-overlay').getByPlaceholder('למשל: תצפית שקיעה בגבעה').fill('מבצר בלי רשת');
  await page.locator('.modal-overlay .sheet-footer button[type="submit"]').click();
  await closed();
  await page.getByText('מבצר בלי רשת').first().waitFor();
});

await step('offline: a new checklist item', async () => {
  await tab("צ'קליסט");
  await page.locator('button.fab', { hasText: 'פריט חדש' }).click();
  await page.locator('.modal-overlay input.form-control').first().fill('מטען בלי רשת');
  await page.locator('.modal-overlay .sheet-footer button[type="submit"]').click();
  await closed();
  await openCategory('מסמכים וסידורים');
  await page.getByText('מטען בלי רשת').first().waitFor();
});

await step('offline: a new booking', async () => {
  await tab('הזמנות');
  await page.locator('button.fab', { hasText: 'הזמנה חדשה' }).click();
  await page.getByPlaceholder('למשל: ארוחת ערב ב-Costes').fill('סיור בלי רשת');
  await page.locator('.modal-overlay .sheet-footer button[type="submit"]').click();
  await closed();
  await card('סיור בלי רשת').waitFor();
});

await step('offline: the hotel', async () => {
  await tab('טיסה ומלון');
  await page.locator('button[title="ערוך פרטי מלון"]').click();
  await page.getByText('עריכת פרטי המלון').waitFor();
  await page.locator('.modal-content input.form-control').first().fill('מלון בלי רשת');
  await page.locator('.sheet-footer button[type="submit"]').click();
  await closed();
  await page.locator('.app-content').getByText('מלון בלי רשת').first().waitFor();
});

await step('offline, closing and opening the app again keeps all of it', async () => {
  await page.reload();
  await openTrip();
  await page.locator('.app-content').getByText('מלון בלי רשת').first().waitFor();
  await tab('הוצאות');
  await card('מונית בלי רשת').waitFor();
  await tab('הזמנות');
  await card('סיור בלי רשת').waitFor();
  await tab("צ'קליסט");
  await openCategory('מסמכים וסידורים');
  await page.getByText('מטען בלי רשת').first().waitFor();
  await tab('תכנון טיול');
  await page.getByText('מבצר בלי רשת').first().waitFor();
});

// A partner changes the expense's category (on the server) while this phone,
// offline, changes its amount: both must survive.
await step('offline: an expense edited offline keeps what a partner changed meanwhile', async () => {
  await fetch(`${DB}/trips/${tripId}/expenses/${expenseId}?updateMask.fieldPaths=category`, {
    method: 'PATCH', headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { category: { stringValue: 'תחבורה' } } }),
  });
  await tab('הוצאות');
  await card('קפה ברשת').locator('.list-card-title').tap();
  await page.getByPlaceholder('0.00').fill('45');
  await page.locator('.sheet-footer button[type="submit"]').click();
  await closed();
});

await step('offline: a trip never opened on this phone is all there', async () => {
  await page.reload();
  const open = page.locator('.trip-card', { hasText: TRIP2 }).getByText('פתח טיול');
  const back = page.locator('button[aria-label="חזרה לרשימת הטיולים"]');
  await open.or(page.getByText('טיסת הלוך').first()).first().waitFor({ timeout: 20000 });
  if (!(await open.count()) && await back.count()) await back.click();
  await open.click();
  await tab('הוצאות');
  await card('מזכרת מהשוק').waitFor();
  await page.reload();
  await openTrip();
});

await step('offline: refreshing the flight says there is no connection and keeps the saved one', async () => {
  await tab('טיסה ומלון');
  await page.locator('button[title="רענן מידע טיסה"]').first().click();
  await page.getByText('אין חיבור לאינטרנט. מוצג המידע השמור').first().waitFor();
  await page.locator('.app-content').getByText('LY2371').first().waitFor();
});

await step('offline: the trip exports to PDF', async () => {
  const settings = page.getByRole('dialog', { name: 'הגדרות' });
  await page.getByRole('button', { name: 'הגדרות', exact: true }).click();
  const group = settings.locator('.section-header-toggle', { hasText: 'ייצוא לקובץ' });
  if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click();
  const [d] = await Promise.all([page.waitForEvent('download'), settings.getByRole('button', { name: 'ייצוא ל-PDF' }).click()]);
  const head = await new Promise((resolve, reject) => {
    d.createReadStream().then(st => { st.once('data', c => { resolve(c.subarray(0, 5).toString()); st.destroy(); }); st.once('error', reject); }, reject);
  });
  if (head !== '%PDF-') throw new Error(`not a PDF: ${head}`);
  await page.keyboard.press('Escape');
  await closed().catch(() => {});
});

await ctx.setOffline(false);

await step('back online, everything reaches the server', async () => {
  const want = {
    expenses: ['description', 'מונית בלי רשת'],
    planning: ['title', 'מבצר בלי רשת'],
    checklist: ['text', 'מטען בלי רשת'],
    bookings: ['title', 'סיור בלי רשת'],
  };
  const missing = new Set(Object.keys(want).concat('hotel'));
  for (let i = 0; i < 60 && missing.size; i++) {
    await page.waitForTimeout(500);
    for (const [coll, [field, value]] of Object.entries(want)) {
      if (!missing.has(coll)) continue;
      const list = await (await fetch(`${DB}/trips/${tripId}/${coll}?pageSize=300`, { headers: admin })).json();
      if ((list.documents || []).some(d => d.fields?.[field]?.stringValue === value)) missing.delete(coll);
    }
    if (missing.has('hotel')) {
      const t = await (await fetch(`${DB}/trips/${tripId}`, { headers: admin })).json();
      if (t.fields?.hotelDetails?.mapValue?.fields?.name?.stringValue === 'מלון בלי רשת') missing.delete('hotel');
    }
  }
  if (missing.size) throw new Error(`not on the server: ${[...missing].join(', ')}`);
});

await step('back online, the offline edit and the partner\'s change are both on the server', async () => {
  let f = {};
  for (let i = 0; i < 40; i++) {
    f = (await (await fetch(`${DB}/trips/${tripId}/expenses/${expenseId}`, { headers: admin })).json()).fields || {};
    if (Number(f.amount?.integerValue ?? f.amount?.doubleValue) === 45) break;
    await page.waitForTimeout(500);
  }
  const amount = Number(f.amount?.integerValue ?? f.amount?.doubleValue);
  if (amount !== 45 || f.category?.stringValue !== 'תחבורה') throw new Error(`amount ${amount}, category ${f.category?.stringValue}`);
});

await browser.close();
process.exit(failed ? 1 : 0);
