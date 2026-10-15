// Every list row is a ListCard and answers a finger the same way, on a
// touch phone: a tap opens (or ticks) the item, a swipe shows what the tap
// does not do, and there is no ⋯ — a third way to the same place. With a
// mouse, which cannot swipe, ⋯ is there instead.
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

// Is the ⋯ drawn: on screen, a real size, not transparent.
const moreDrawn = (loc) => loc.evaluate(el => {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return r.width > 20 && r.height > 20 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5;
});
// On a phone ⋯ is not drawn (it stays in the page for screen readers).
async function noMoreOnPhone(text) {
  const more = card(text).locator('button.list-card-more');
  if ((await more.count()) && await moreDrawn(more)) throw new Error('⋯ is drawn on a phone');
}
// Swipe a card aside with a finger and return the action buttons it shows.
const cdp = await ctx.newCDPSession(page);
async function swipeOpen(text) {
  const box = await card(text).boundingBox();
  const y = box.y + box.height / 2, x0 = box.x + 40;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + 25 * i, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
  // The actions are uncovered beside the card, in its .swipe-row.
  return page.locator('.swipe-row').filter({ has: card(text) }).first();
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
await step('bookings: no ⋯ on a phone; a swipe deletes (the tap already edits)', async () => {
  await noMoreOnPhone('ארוחה בלה מארה');
  const row = await swipeOpen('ארוחה בלה מארה');
  if (await row.getByRole('button', { name: 'עריכה' }).count()) throw new Error('swipe repeats the tap (עריכה)');
  await row.getByRole('button', { name: 'מחיקה' }).tap();
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
await step('expenses: tap opens the form; a swipe deletes', async () => {
  await card('קפה וקרואסון').locator('.list-card-title').tap();
  await page.locator('.sheet-footer button[type="submit"]').waitFor();
  await page.locator('.modal-overlay .chip[aria-pressed="true"]').first().waitFor();   // currency, category
  await page.locator('.modal-overlay .chip.add').first().tap();                       // "+ מטבע" opens its search
  const min = await smallestField();
  if (min < 16) throw new Error(`a field is ${min}px`);
  await page.locator('.sheet-footer button', { hasText: 'ביטול' }).click();
  await page.locator('.modal-overlay').waitFor({ state: 'detached' });
  await noMoreOnPhone('קפה וקרואסון');
  const row = await swipeOpen('קפה וקרואסון');
  await row.getByRole('button', { name: 'מחיקה' }).tap();
  await page.locator('.modal-overlay button.btn-primary.danger').click();
  await card('קפה וקרואסון').waitFor({ state: 'detached' });
});

// ── Important info (the header button's sheet) ──
await step('info: items are ListCards; a tap edits; "+ פריט" ends an open group', async () => {
  await page.locator('header button[aria-label="מידע חשוב"]').click();
  await page.locator('.modal-header', { hasText: 'מידע חשוב' }).waitFor();
  // Defaults arrive collapsed under "מספרי חירום": open the group.
  const first = page.locator('.modal-overlay .list-card').first();
  if (!(await first.count())) await page.locator('.modal-overlay').getByText('מספרי חירום').first().click();
  await first.waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '.e2e/lists-info.png' });
  const title = (await first.locator('.list-card-title').innerText()).trim();
  await noMoreOnPhone(title);
  await page.locator('.modal-overlay .chip.add', { hasText: 'פריט' }).first().waitFor();
  if (await page.locator('.modal-overlay .section-header-btn').count()) throw new Error('a + is still in a group header');
  await first.locator('.list-card-title').tap();
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
  // The tap ticks; editing and deleting are a swipe away.
  await noMoreOnPhone(title);
  const swiped = await swipeOpen(title);
  await swiped.getByRole('button', { name: 'מחיקה' }).waitFor();
  await swiped.getByRole('button', { name: 'עריכה' }).tap();
  await page.locator('.sheet-footer button[type="submit"]').waitFor();
  await page.locator('.sheet-footer button', { hasText: 'ביטול' }).click();
  await page.locator('.sheet-footer').waitFor({ state: 'detached' });
});

await step('checklist: no + in the category headers; "+ פריט" ends an open category', async () => {
  if (await page.locator('.app-content .section-header-btn').count()) throw new Error('a + is still in a category header');
  await page.locator('.app-content .chip.add', { hasText: 'פריט' }).first().waitFor();
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

// A mouse cannot swipe: there ⋯ is drawn and opens the actions.
await step('with a mouse, ⋯ is drawn and opens the actions', async () => {
  const desk = await browser.newPage({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
  try {
    await desk.goto('http://localhost:5173/');
    await desk.getByText('התחבר עם Google').waitFor();
    await desk.evaluate(() => window.__e2eSignIn('lists@example.com'));
    await desk.locator('.trip-card', { hasText: 'רשימות' }).getByText('פתח טיול').click();
    await desk.locator('nav button.nav-item[aria-label="הזמנות"]').click();
    const more = desk.locator('.list-card', { hasText: 'סיור' }).first().locator('button.list-card-more');
    await more.waitFor();
    if (!(await moreDrawn(more))) throw new Error('⋯ is not drawn for a mouse');
    await more.click();
    await desk.getByRole('dialog', { name: 'סיור' }).getByRole('button', { name: 'מחיקה' }).waitFor();
  } finally { await desk.close(); }
});

await browser.close();
process.exit(failed ? 1 : 0);
