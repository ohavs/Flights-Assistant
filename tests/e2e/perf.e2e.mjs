// Planning tab with a long list (200 places): how long switching to the tab
// and changing the layout take. Not part of test:e2e — a measurement to run
// when the list rendering changes:  bash scripts/run-e2e.sh tests/e2e/perf.e2e.mjs
import { chromium } from 'playwright';

const DB = 'http://127.0.0.1:8080/v1/projects/demo-flights/databases/(default)/documents';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
page.setDefaultTimeout(20000);
// A phone is ~4x slower than this machine.
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('perf@example.com'));
await page.getByText('צור טיול ראשון').click();
await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('ארוך');
await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('ליסבון');
await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
await page.locator('.trip-card').waitFor();
await page.waitForTimeout(1500);

const trips = await (await fetch(`${DB}/trips`, { headers: admin })).json();
const tripId = trips.documents[0].name.split('/').pop();
const cats = ['אטרקציות ודברים לעשות', 'מסעדות ומקומות אכילה', 'מקומות לבקר', 'מידע כללי וטיפים'];
const writes = Array.from({ length: 200 }, (_, i) => ({
  update: {
    name: `projects/demo-flights/databases/(default)/documents/trips/${tripId}/planning/p${i}`,
    fields: {
      title: { stringValue: `מקום מספר ${i + 1}` },
      category: { stringValue: cats[i % cats.length] },
      ...(i % 7 === 0 ? { priority: { stringValue: 'must' } } : {}),
      ...(i % 9 === 0 ? { needsReservation: { booleanValue: true } } : {}),
    },
  },
}));
const r = await fetch(`${DB.replace('/documents', '')}/documents:commit`, { method: 'POST', headers: admin, body: JSON.stringify({ writes }) });
if (!r.ok) throw new Error(`seed failed ${r.status} ${await r.text()}`);

await page.locator('.trip-card').getByText('פתח טיול').click();
await page.getByText('טיסת הלוך').first().waitFor();
const t0 = Date.now();
await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
await page.getByText('מקום מספר 200').waitFor({ state: 'attached' });
const open = Date.now() - t0;

const t1 = Date.now();
await page.locator('[title="מיון ותצוגה"]').click();
await page.getByText('רשת', { exact: true }).click();
await page.waitForFunction(() => document.querySelectorAll('.plan-card').length >= 200);
const grid = Date.now() - t1;
console.log(`  200 places, CPU x4: open tab ${open}ms, switch to grid ${grid}ms`);
await browser.close();
