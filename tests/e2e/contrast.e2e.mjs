// Text that has to be read stays readable in both themes: the Google
// sign-in button, the confirm dialog's button and the date picker's
// selected day. Also: back closes
// the picker and leaves the sheet under it open.
//   bash scripts/run-e2e.sh tests/e2e/contrast.e2e.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
page.setDefaultTimeout(15000);
let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `.e2e/contrast-fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
}

// WCAG contrast between an element's text and the first opaque background
// behind it. Measured once its colour transitions have settled: read
// mid-transition, a just-picked day is half way between two colours.
const contrast = (loc) => loc.evaluate(async (el) => {
  await Promise.all(el.getAnimations({ subtree: false }).map(a => a.finished.catch(() => {})));
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  };
  let n = el, bg = null;
  while (n) { bg = parse(getComputedStyle(n).backgroundColor); if (bg && bg.a > 0.5) break; n = n.parentElement; }
  const fg = parse(getComputedStyle(el).color);
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const a = lum(fg), b = lum(bg || { r: 255, g: 255, b: 255 });
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
});
const expectReadable = async (loc, what) => {
  const c = await contrast(loc);
  if (c < 3) throw new Error(`${what}: contrast ${c.toFixed(2)} < 3`);
  return c;
};

// The sign-in button: white with light text in dark mode (8.23.0) left
// "התחבר עם Google" invisible.
for (const theme of ['light', 'dark']) {
  await step(`sign-in button readable (${theme})`, async () => {
    await page.goto('http://localhost:5173/');
    await page.evaluate((t) => localStorage.setItem('theme', t), theme);
    await page.reload();
    const btn = page.locator('button.google-btn');
    await btn.waitFor();
    const c = await expectReadable(btn, 'sign-in button');
    if (c < 4.5) throw new Error(`sign-in button: contrast ${c.toFixed(2)} < 4.5`);
    await page.screenshot({ path: `.e2e/contrast-login-${theme}.png` });
  });
}
await page.evaluate(() => localStorage.removeItem('theme'));

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('contrast@example.com'));
await page.getByText('צור טיול ראשון').click();
await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('ניגודיות');
await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('אתונה');
await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
await page.locator('.trip-card').getByText('פתח טיול').click();
await page.getByText('טיסת הלוך').first().waitFor();

// A new trip comes with emergency numbers. Empty its info list (emulator
// only) so the "load emergency numbers" confirm, the one confirm that is
// not a red one, can be opened.
const DB = 'http://127.0.0.1:8080/v1/projects/demo-flights/databases/(default)/documents';
const admin = { Authorization: 'Bearer owner' };
const emptyInfo = async () => {
  const trips = await (await fetch(`${DB}/trips?pageSize=300`, { headers: admin })).json();
  const trip = trips.documents.find(d => d.fields?.name?.stringValue === 'ניגודיות');
  const info = await (await fetch(`${DB}/${trip.name.split('/documents/')[1]}/info?pageSize=300`, { headers: admin })).json();
  for (const d of info.documents || []) await fetch(`${DB}/${d.name.split('/documents/')[1]}`, { method: 'DELETE', headers: admin });
};

for (const theme of ['light', 'dark']) {
  if (theme === 'dark') await page.locator('button[aria-label="עבור למצב כהה"]').click();

  await step(`${theme}: the confirm dialog's button is readable`, async () => {
    // Open first, then empty: the sheet shows the empty state live, and
    // nothing re-adds the defaults behind our back.
    await page.locator('header button[aria-label="מידע חשוב"]').click();
    await page.locator('.modal-header', { hasText: 'מידע חשוב' }).waitFor();
    await page.waitForTimeout(800);
    await emptyInfo();
    await page.getByRole('button', { name: 'טען מספרי חירום' }).click();
    const ok = page.locator('.modal-overlay button.btn-primary', { hasText: 'טען' });
    await ok.waitFor();
    console.log(`        confirm button contrast ${(await contrast(ok)).toFixed(2)}`);
    await expectReadable(ok, 'confirm button');
    await page.getByRole('button', { name: 'בטל', exact: true }).click();
  });
  // Whatever happened above, leave no sheet open.
  for (let i = 0; i < 3 && await page.locator('.modal-overlay').count(); i++) {
    await page.locator('.modal-overlay button[aria-label="סגור"]').last().click().catch(() => {});
    await page.waitForTimeout(400);
  }

  await step(`${theme}: the picked day is readable; back closes only the picker`, async () => {
    await page.locator('button[title="ערוך פרטי טיסה ומלון"]').click();
    await page.getByText('עריכת כל פרטי הנסיעה').waitFor();
    await page.locator('.modal-overlay').getByText('בחר תאריך...').first().click();
    await page.locator('button.cal-day', { hasText: /^15$/ }).first().click();
    const picked = page.locator('button.cal-day[aria-pressed="true"]');
    await picked.waitFor();
    console.log(`        selected day contrast ${(await contrast(picked)).toFixed(2)}`);
    await expectReadable(picked, 'selected day');
    await page.goBack();
    await picked.waitFor({ state: 'detached', timeout: 3000 });
    if (!(await page.getByText('עריכת כל פרטי הנסיעה').count())) throw new Error('back closed the edit sheet too');
    await page.locator('.modal-overlay button[aria-label="סגור"]').first().click();
    const leave = page.getByRole('button', { name: 'צא בלי לשמור' });
    if (await leave.count()) await leave.click();
    await page.getByText('עריכת כל פרטי הנסיעה').waitFor({ state: 'detached' });
  });
}

await browser.close();
process.exit(failed ? 1 : 0);
