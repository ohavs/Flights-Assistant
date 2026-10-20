// The expenses tab on a full trip: two members, three currencies, six
// categories, a linked place, three expenses split (one with someone not
// on the trip). The card over the list (total, per person, per day, what
// you get back), the full summary with who owes whom from the splits only,
// its sections folding, the rows with their amount at the end, and the
// form's split. Rates are fixed: €1 = $1 = ₪4.
//   bash scripts/run-e2e.sh tests/e2e/expenses.e2e.mjs
// Screenshots, light and dark: .e2e/expenses/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = '.e2e/expenses';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await ctx.route('**/currency-api@latest/**', r => r.fulfill({ json: { eur: { eur: 1, ils: 4, usd: 1 } } }));
await ctx.route('**/api.frankfurter.app/**', r => r.fulfill({ json: { rates: { ILS: 4, USD: 1 } } }));
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', e => console.log('        page error:', e.message));
let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${out}/fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
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
const put = (path, data) => fetch(`${DB}/${path}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: fields(data) }) })
  .then(r => { if (!r.ok) throw new Error(`${path}: ${r.status}`); });

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
const signIn = (email) => page.evaluate((e) => window.__e2eSignIn(e).then(c => c.user.uid), email);
// Each signs in once and settles (the app writes their profile), then the
// names are set.
const dana = await signIn('dana@example.com');
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1500);
const me = await signIn('owner@example.com');
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1500);
await put(`users/${dana}`, { displayName: 'דנה', email: 'dana@example.com' });
await put('trips/exp', {
  name: 'ליסבון', destination: 'ליסבון, פורטוגל', dates: '12.11.2026 - 18.11.2026',
  members: { [me]: 'owner', [dana]: 'editor' }, memberIds: [me, dana],
});
await put('trips/exp/planning/p1', { title: 'מגדל בלם', category: 'מקומות לבקר' });
const ex = (id, amount, currency, category, description, day, paidBy, extra = {}) =>
  put(`trips/exp/expenses/${id}`, { amount, currency, category, description, paidBy, linkedPlanId: null, customPlace: null,
    ilsSnapshot: null, createdAt: `2026-11-${day}T12:00:00.000Z`, ...extra });
// Mine: 170 + 1450 + 39.2 + 480 = 2139.2. Dana's: 72 + 60 + 256 + 230 + 109.6 = 727.6.
// Total 2866.8. Who owes whom, from the splits only:
//   e3 ₪1450 mine, with Dana: she owes me 725.
//   e8 ₪230 Dana's, with me and Roni (not on the trip): we owe her 76.67 each.
//   e5 ₪256 Dana's, "רק הם", Roni alone: he owes her 256.
// Me +648.33, Dana -315.67, Roni -332.67: Roni → me 332.67, Dana → me 315.67.
await ex('e1', 42.5, 'EUR', 'אוכל ושתייה', 'ארוחת ערב באלפמה', 13, me);
await ex('e2', 18, 'EUR', 'תחבורה', 'כרטיס יומי', 13, dana);
await ex('e3', 1450, 'ILS', 'לינה', 'מקדמה למלון', 12, me, { splitWith: [dana] });
await ex('e4', 15, 'EUR', 'בידור ותיירות', '', 14, dana, { linkedPlanId: 'p1' });
await ex('e5', 64, 'EUR', 'קניות', 'מגנטים ואריחים', 14, dana, { splitWith: ['name:רוני'], splitSelf: false });
await ex('e6', 9.8, 'EUR', 'אוכל ושתייה', 'פסטל דה נאטה', 14, me);
await ex('e7', 120, 'USD', 'תחבורה', 'מונית מהשדה', 12, me);
await ex('e8', 230, 'ILS', 'כללי', 'ביטוח נסיעות', 12, dana, { splitWith: [me, 'name:רוני'] });
await ex('e9', 27.4, 'EUR', 'אוכל ושתייה', 'Time Out Market', 15, dana, { customPlace: 'שוק' });

const shot = async (name) => { await page.waitForTimeout(600); await page.screenshot({ path: `${out}/${name}.png` }); };
const tab = (label) => page.locator(`nav button.nav-item[aria-label="${label}"]`).click();
const hero = page.locator('.expense-hero');
const sheet = page.locator('.modal-overlay', { has: page.locator('.modal-header', { hasText: 'סיכום הוצאות' }) });
const has = async (loc, text) => {
  const t = await loc.innerText();
  if (!t.includes(text)) throw new Error(`no "${text}" in: ${t.replace(/\s+/g, ' ').slice(0, 200)}`);
};

for (const theme of ['light', 'dark']) {
  await page.goto('http://localhost:5173/');
  await page.locator('.trip-card', { hasText: 'ליסבון' }).waitFor();
  if (theme === 'dark' && await page.locator('button[aria-label="עבור למצב כהה"]').count()) {
    await page.locator('button[aria-label="עבור למצב כהה"]').click();
  }
  await page.locator('.trip-card', { hasText: 'ליסבון' }).getByText('פתח טיול').click();
  await tab('הוצאות');

  await step(`${theme}: the card over the list: the total, per person, per day, what I get back`, async () => {
    await hero.getByText('₪2,867').waitFor();
    await has(hero, '9 הוצאות');
    await has(hero, '₪1,433');   // per person
    await has(hero, '₪717');     // a day, over 4
    await has(hero, 'מגיע לך');
    await has(hero, '₪648');
    if (await hero.locator('.expense-bar > span').count() !== 6) throw new Error('not a segment per category');
    await shot(`${theme}-1-list`);
  });

  await step(`${theme}: a row: its label, its day, its amount at the end with the shekels`, async () => {
    const row = page.locator('.list-card', { hasText: 'מונית מהשדה' });
    await has(row.locator('.expense-amount'), '$120');
    await has(row.locator('.expense-amount'), '≈ ₪480');
    await has(row, '12.11');
    // No description: the linked place names it.
    await page.locator('.list-card', { hasText: 'מגדל בלם' }).locator('.expense-amount', { hasText: '€15' }).waitFor();
    await page.mouse.move(200, 500);
    await page.mouse.wheel(0, 700);
    await shot(`${theme}-2-list-down`);
    await page.mouse.wheel(0, -3000);
  });

  await step(`${theme}: the full summary: who paid, who owes whom from the splits, categories, currencies, the biggest`, async () => {
    await hero.click();
    await sheet.waitFor();
    await sheet.locator('.expense-row.transfer', { hasText: 'דנה' }).waitFor();
    const transfer = sheet.locator('.expense-row.transfer');
    if (await transfer.count() !== 2) throw new Error(`${await transfer.count()} transfers`);
    await has(transfer.nth(0), 'רוני');
    await has(transfer.nth(0), '₪333');
    await has(transfer.nth(1), 'דנה');
    await has(transfer.nth(1), '₪316');
    await has(sheet, 'רק מהוצאות שחולקו');
    await has(sheet, '+₪648');
    await has(sheet, '−₪316');
    for (const t of ['לפי קטגוריה', 'לינה', '51%', 'לפי מטבע מקורי', '€176.7', '≈ ₪707', 'ההוצאות הגדולות', 'מקדמה למלון']) await has(sheet, t);
    await shot(`${theme}-3-summary`);
    for (const k of [4, 5, 6]) {
      await page.mouse.move(200, 600);
      await page.mouse.wheel(0, 600);
      await shot(`${theme}-${k}-summary`);
    }
    await sheet.getByRole('button', { name: 'סגור' }).click();
    await sheet.waitFor({ state: 'detached' });
  });
}

await step('a summary section folds, and stays folded the next time', async () => {
  await hero.click();
  await sheet.waitFor();
  const toggle = sheet.locator('.section-header-toggle', { hasText: 'לפי קטגוריה' });
  await toggle.click();
  const rows = sheet.locator('.expense-section', { has: page.locator('.section-header-toggle', { hasText: 'לפי קטגוריה' }) })
    .locator('.expense-rows');
  if ((await toggle.getAttribute('aria-expanded')) !== 'false') throw new Error('did not fold');
  if (await rows.count()) throw new Error('the section did not fold');
  await sheet.getByRole('button', { name: 'סגור' }).click();
  await sheet.waitFor({ state: 'detached' });
  await hero.click();
  await sheet.waitFor();
  if ((await toggle.getAttribute('aria-expanded')) !== 'false') throw new Error('folded, then open again');
  await toggle.click();
  await rows.waitFor();
  await sheet.getByRole('button', { name: 'סגור' }).click();
  await sheet.waitFor({ state: 'detached' });
});

await step('a narrow phone: the card fits, nothing scrolls sideways', async () => {
  await page.setViewportSize({ width: 340, height: 740 });
  await hero.getByText('₪2,867').waitFor();
  await page.waitForTimeout(300);
  const wide = await page.evaluate(() => [...document.querySelectorAll('.expense-hero, .expense-tile-value, .expense-amount-main')]
    .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className + ': ' + el.textContent));
  if (wide.length) throw new Error(`cut: ${wide.join(' | ')}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('scrolls sideways');
  await shot('dark-7-narrow');
});

await step('the form: a split with Dana and a new name; the name is there to pick next time', async () => {
  await page.setViewportSize({ width: 400, height: 860 });
  await page.locator('button.fab', { hasText: 'הוצאה חדשה' }).click();
  const form = page.locator('.modal-content');
  await page.getByPlaceholder('0.00').fill('90');
  await page.getByPlaceholder('למשל: ארוחת ערב, כרטיסי כניסה...').fill('ארוחה משותפת');
  await has(form, 'בלי חלוקה, אף אחד לא חייב');
  // Roni is there already: a name from an earlier split.
  await form.locator('.split-chips button.chip', { hasText: 'רוני' }).waitFor();
  await form.locator('.split-chips button.chip', { hasText: 'דנה' }).click();
  await form.locator('.split-chips button.chip.add', { hasText: 'שם' }).click();
  await page.getByPlaceholder('שם של מי שלא בטיול').fill('יואב');
  await form.getByRole('button', { name: 'הוסף שם' }).click();
  await has(form, '3 אנשים');
  await has(form, '30 כל אחד');
  await shot('dark-8-split');
  await form.getByRole('radio', { name: 'רק הם' }).click();
  await has(form, '2 אנשים');
  await page.locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.modal-overlay').waitFor({ state: 'detached' });
  let doc;
  for (let i = 0; i < 20 && !doc; i++) {
    const list = await (await fetch(`${DB}/trips/exp/expenses?pageSize=50`, { headers: admin })).json();
    doc = (list.documents || []).find(d => d.fields?.description?.stringValue === 'ארוחה משותפת');
    if (!doc) await page.waitForTimeout(300);
  }
  const split = (doc?.fields?.splitWith?.arrayValue?.values || []).map(v => v.stringValue).sort();
  if (JSON.stringify(split) !== JSON.stringify([dana, 'name:יואב'].sort()) || doc.fields.splitSelf?.booleanValue !== false) {
    throw new Error(`saved: ${JSON.stringify(doc?.fields)}`);
  }
  await page.locator('.list-card', { hasText: 'ארוחה משותפת' }).getByText('מתחלק ל־2').waitFor();
  await page.locator('button.fab', { hasText: 'הוצאה חדשה' }).click();
  await page.locator('.modal-content .split-chips button.chip', { hasText: 'יואב' }).waitFor();
});

console.log(failed ? `${failed} failed` : 'all passed');
await browser.close();
process.exit(failed ? 1 : 0);
