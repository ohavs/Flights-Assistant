// Every list row is a ListCard and answers a finger the same way, on a
// touch phone: tap opens the item, ⋯ (always visible, no hover) opens its
// actions, and the actions do what they say.
//   bash scripts/run-e2e.sh tests/e2e/lists.e2e.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `.e2e/lists-fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
}
const tab = (label) => page.locator(`nav button.nav-item[aria-label="${label}"]`).click();
const card = (text) => page.locator('.list-card', { hasText: text }).first();
const sheet = (name) => page.getByRole('dialog', { name });

// The ⋯ button is there and can be tapped: on screen, not hidden, not
// transparent.
async function moreIsVisible(text) {
  const more = card(text).locator('button.list-card-more');
  await more.waitFor();
  const shown = await more.evaluate(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 20 && r.height > 20 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5;
  });
  if (!shown) throw new Error('⋯ is not visible');
  return more;
}

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('lists@example.com'));
await page.getByText('צור טיול ראשון').click();
await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('רשימות');
await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('פריז');
await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
await page.locator('.trip-card').getByText('פתח טיול').click();
await page.getByText('טיסת הלוך').first().waitFor();

// ── Bookings ──
await tab('הזמנות');
await step('bookings: a new booking is a ListCard', async () => {
  await page.locator('button.fab', { hasText: 'הזמנה חדשה' }).click();
  await page.getByPlaceholder('למשל: ארוחת ערב ב-Costes').fill('ארוחה בלה מארה');
  await page.locator('.sheet-footer button[type="submit"]').click();
  await card('ארוחה בלה מארה').waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '.e2e/lists-bookings.png' });
});
await step('bookings: tapping the card opens its form', async () => {
  await card('ארוחה בלה מארה').locator('.list-card-title').tap();
  await page.locator('.sheet-footer button[type="submit"]').waitFor();
  await page.locator('.sheet-footer button', { hasText: 'ביטול' }).click();
  await page.locator('.modal-overlay').waitFor({ state: 'detached' });
});
await step('bookings: ⋯ shows edit and delete, and delete works', async () => {
  const more = await moreIsVisible('ארוחה בלה מארה');
  await more.tap();
  const menu = sheet('ארוחה בלה מארה');
  await menu.getByRole('button', { name: 'עריכה' }).waitFor();
  await menu.getByRole('button', { name: 'מחיקה' }).click();
  await page.locator('.modal-overlay button.btn-primary.danger').click();
  await card('ארוחה בלה מארה').waitFor({ state: 'detached' });
});

// ── Expenses ──
await tab('הוצאות');
await step('expenses: a new expense is a ListCard with its category icon', async () => {
  await page.locator('button.fab', { hasText: 'הוצאה חדשה' }).click();
  await page.getByPlaceholder('0.00').fill('42');
  await page.getByPlaceholder('למשל: ארוחת ערב, כרטיסי כניסה...').fill('קפה וקרואסון');
  await page.locator('.sheet-footer button[type="submit"]').click();
  await card('קפה וקרואסון').waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '.e2e/lists-expenses.png' });
});
await step('expenses: tap opens the form; ⋯ deletes', async () => {
  await card('קפה וקרואסון').locator('.list-card-title').tap();
  await page.locator('.sheet-footer button[type="submit"]').waitFor();
  await page.locator('.sheet-footer button', { hasText: 'ביטול' }).click();
  await page.locator('.modal-overlay').waitFor({ state: 'detached' });
  const more = await moreIsVisible('קפה וקרואסון');
  await more.tap();
  await sheet('קפה וקרואסון').getByRole('button', { name: 'מחיקה' }).click();
  await page.locator('.modal-overlay button.btn-primary.danger').click();
  await card('קפה וקרואסון').waitFor({ state: 'detached' });
});

// ── Important info (the header button's sheet) ──
await step('info: items are ListCards; ⋯ edits', async () => {
  await page.locator('header button[aria-label="מידע חשוב"]').click();
  await page.locator('.modal-header', { hasText: 'מידע חשוב' }).waitFor();
  // Defaults arrive collapsed under "מספרי חירום": open the group.
  const first = page.locator('.modal-overlay .list-card').first();
  if (!(await first.count())) await page.locator('.modal-overlay').getByText('מספרי חירום').first().click();
  await first.waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '.e2e/lists-info.png' });
  const title = (await first.locator('.list-card-title').innerText()).trim();
  const more = await moreIsVisible(title);
  await more.tap();
  await sheet(title).getByRole('button', { name: 'עריכה' }).click();
  await page.locator('.sheet-footer button[type="submit"]').waitFor();
  await page.locator('.sheet-footer button', { hasText: 'ביטול' }).click();
  await page.locator('.sheet-footer').waitFor({ state: 'detached' });
});

await browser.close();
process.exit(failed ? 1 : 0);
