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
// On a phone no field may be under 16px: iOS zooms in on it.
const smallestField = () => page.evaluate(() => Math.min(...[...document.querySelectorAll('.modal-overlay input, .modal-overlay textarea, .modal-overlay select')]
  .filter(el => !['checkbox', 'radio', 'range', 'hidden'].includes(el.type) && el.offsetParent)
  .map(el => parseFloat(getComputedStyle(el).fontSize))));
await step('bookings: tapping the card opens its form', async () => {
  await card('ארוחה בלה מארה').locator('.list-card-title').tap();
  await page.locator('.sheet-footer button[type="submit"]').waitFor();
  // The form's parts are the shared ones: type chips, a segmented status.
  await page.locator('.modal-overlay .chip[aria-pressed="true"]').first().waitFor();
  await page.locator('.modal-overlay .segmented[aria-label="סטטוס"]').waitFor();
  const min = await smallestField();
  if (min < 16) throw new Error(`a field is ${min}px`);
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
  await page.locator('.modal-overlay .chip[aria-pressed="true"]').first().waitFor();   // currency, category
  await page.locator('.modal-overlay .chip.add').first().tap();                       // "+ מטבע" opens its search
  const min = await smallestField();
  if (min < 16) throw new Error(`a field is ${min}px`);
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

  // Close the info sheet before moving on.
for (let i = 0; i < 3 && await page.locator('.modal-overlay').count(); i++) {
  await page.locator('.modal-overlay button[aria-label="סגור"]').last().click().catch(() => {});
  await page.waitForTimeout(400);
}

// ── Checklist: one "done" circle, no strike-through, ⋯ like everywhere ──
await tab("צ'קליסט");
await step('checklist: the circle ticks an item; done is quiet, not struck through', async () => {
  // Categories start collapsed; their headers are the shared SectionHeader.
  const header = page.locator('.app-content .section-header').first();
  await header.locator('.section-header-toggle').click();
  if ((await header.locator('.section-header-toggle').getAttribute('aria-expanded')) !== 'true') throw new Error('header did not open');
  const row = page.locator('.app-content .list-card').first();
  await row.waitFor();
  const title = (await row.locator('.list-card-title').innerText()).trim();
  const circle = row.locator('button.check-circle');
  if ((await circle.getAttribute('aria-pressed')) !== 'false') throw new Error('item starts ticked');
  await circle.tap();
  await page.locator('.app-content .list-card.muted', { hasText: title }).waitFor();
  const deco = await page.locator('.app-content .list-card', { hasText: title }).first()
    .locator('.list-card-title').evaluate(el => getComputedStyle(el).textDecorationLine);
  if (deco.includes('line-through')) throw new Error('done item is struck through');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '.e2e/lists-checklist.png' });
  const more = await moreIsVisible(title);
  await more.tap();
  await sheet(title).getByRole('button', { name: 'עריכה' }).click();
  await page.locator('.sheet-footer button[type="submit"]').waitFor();
  await page.locator('.sheet-footer button', { hasText: 'ביטול' }).click();
  await page.locator('.sheet-footer').waitFor({ state: 'detached' });
});

await step('checklist: a category has a visible ⋯ with rename and delete (no long press)', async () => {
  const header = page.locator('.app-content .section-header').first();
  const name = (await header.locator('.section-header-title').innerText()).trim();
  await header.locator('button.actions-more').tap();
  const menu = sheet(name);
  await menu.getByRole('button', { name: 'שינוי שם' }).waitFor();
  await menu.getByRole('button', { name: 'מחיקת הקטגוריה' }).waitFor();
  await menu.getByRole('button', { name: 'סגור' }).click();
  await menu.waitFor({ state: 'detached' });
});

await step('expenses and bookings group under the same header', async () => {
  await tab('הוצאות');
  await page.locator('button.fab', { hasText: 'הוצאה חדשה' }).click();
  await page.getByPlaceholder('0.00').fill('7');
  await page.locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.app-content .section-header').first().waitFor({ timeout: 5000 });
  await tab('הזמנות');
  await page.locator('button.fab', { hasText: 'הזמנה חדשה' }).click();
  await page.getByPlaceholder('למשל: ארוחת ערב ב-Costes').fill('סיור');
  await page.locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.app-content .section-header').first().waitFor({ timeout: 5000 });
});

// Buttons, labels and notices carry icons, never emoji; there are two ✕
// (the sheet's .btn-close, the quiet in-form .btn-x) and + is always one
// of the shared buttons.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2712}\u{2714}\u{2716}-\u{27BF}\u{2B50}\u{24D8}]/u;   // not ✓ ✕
const chromeProblems = (scope) => page.evaluate(([src, scope]) => {
  const re = new RegExp(src, 'u');
  const root = document.querySelector(scope);
  if (!root) return [`${scope} not found`];
  const hits = [...root.querySelectorAll('button, label, .list-card-meta, .notice, .section-header, [role="status"], [role="alert"]')]
    .filter(el => !el.closest('.weather-chip') && re.test(el.textContent))
    .map(el => el.textContent.trim().slice(0, 40));
  const xs = [...root.querySelectorAll('button:has(svg.lucide-x)')]
    .filter(el => !el.matches('.btn-x, .round-btn'))
    .map(el => `X: ${el.outerHTML.slice(0, 80)}`);
  // "+" is one of the shared buttons, never a one-off.
  const pluses = [...root.querySelectorAll('button:has(svg.lucide-plus)')]
    .filter(el => !el.matches('.fab, .chip, .round-btn, .btn-primary, .btn-secondary, .section-header-btn'))
    .map(el => `+: ${el.outerHTML.slice(0, 80)}`);
  return [...hits, ...xs, ...pluses];
}, [EMOJI.source, scope]);
const expectClean = async (scope) => {
  const bad = await chromeProblems(scope);
  if (bad.length) throw new Error(bad.join(' | '));
};
const leaveForm = async () => {
  await page.locator('.sheet-footer button', { hasText: 'ביטול' }).click();
  const discard = page.getByRole('button', { name: 'צא בלי לשמור' });
  if (await discard.isVisible({ timeout: 800 }).catch(() => false)) await discard.click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
};

await step('flight: the lookup message is words and an icon', async () => {
  await tab('טיסה ומלון');
  await page.locator('button[title^="ערוך טיסת"]').first().click();
  await page.getByRole('button', { name: 'חיפוש טיסה' }).first().click();
  try {
    await page.locator('.modal-overlay').getByText('הזן מספר טיסה לפני החיפוש').waitFor();
    const text = await page.locator('.modal-overlay').innerText();
    if (EMOJI.test(text)) throw new Error(`emoji in the flight form: ${text.match(EMOJI)[0]}`);
    await page.locator('.modal-overlay .notice').first().waitFor({ timeout: 3000 });
  } finally { await leaveForm(); }
});
await step('expenses: the new-category field cancels with the one in-form ✕', async () => {
  await tab('הוצאות');
  await page.locator('button.fab', { hasText: 'הוצאה חדשה' }).click();
  try {
    await page.locator('.modal-overlay .chip.add', { hasText: 'קטגוריה' }).click();
    await page.locator('.modal-overlay input[placeholder="שם קטגוריה חדשה"]').waitFor();
    await expectClean('.modal-overlay');
  } finally { await leaveForm(); }
});
for (const name of ['טיסה ומלון', 'תכנון טיול', "צ'קליסט", 'הוצאות', 'הזמנות']) {
  await step(`${name}: no emoji in buttons and labels; one kind of ✕`, async () => {
    await tab(name);
    await page.waitForTimeout(600);
    await expectClean('.app-container');
  });
}

await browser.close();
process.exit(failed ? 1 : 0);
