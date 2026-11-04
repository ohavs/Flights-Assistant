// The expenses tab on a full trip: two members, three currencies, six
// categories, a linked place, three expenses split (one with someone not
// on the trip). The card over the list (total, what I paid, what I get
// back), the summary ("שלי": what I paid, my settling up, my categories;
// "כולם": the total, who owes whom from the splits only, the split by
// category, payer or currency, one button switching it), the rows with
// their amount at the end, and the form's split. Rates are fixed:
// €1 = $1 = ₪4.
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
// Two more categories from the plan: the category list is long enough
// for its search.
await put('trips/exp/planning/p2', { title: 'פראיה דה רוצ\'ה', category: 'חופים' });
await put('trips/exp/planning/p3', { title: 'גולבנקיאן', category: 'מוזיאונים' });
const ex = (id, amount, currency, category, description, day, paidBy, extra = {}) =>
  put(`trips/exp/expenses/${id}`, { amount, currency, category, description, paidBy, linkedPlanId: null, customPlace: null,
    ilsSnapshot: null, createdAt: `2026-11-${day}T12:00:00.000Z`, ...extra });
// Mine: 170 + 1450 + 39.2 + 480 = 2139.2. Dana's: 72 + 60 + 256 + 230 + 109.6 = 727.6.
// Total 2866.8. Who owes whom, from the splits only:
//   e3 ₪1450 mine, with Dana: she owes me 725.
//   e8 ₪230 Dana's, with me and Roni (not on the trip): we owe her 76.67 each.
//   e5 ₪256 Dana's, "רק הם", Roni alone: he owes her 256.
// By pair (8.77.0): Dana → me 725 - 76.67 = 648.33, Roni → Dana 256 + 76.67 = 332.67.
// Each one's part (not split: the payer's): me 170 + 39.2 + 480 + 725 + 76.67
// = 1490.87; Dana 72 + 60 + 109.6 + 725 + 76.67 = 1043.27; Roni 256 + 76.67.
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

  await step(`${theme}: the card over the list: the total, what I paid, what I get back`, async () => {
    await hero.getByText('₪2,867').waitFor();
    await has(hero, '9 הוצאות');
    await has(hero, 'שילמתי');
    await has(hero, '₪2,139');
    for (const gone of ['לאדם', 'ממוצע ליום']) {
      if ((await hero.innerText()).includes(gone)) throw new Error(`"${gone}" is still on the card`);
    }
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

  await step(`${theme}: "כולם": the total, who owes whom from the splits, the split by category, payer, currency`, async () => {
    await hero.click();
    await sheet.waitFor();
    // It opens on "שלי"; "כולם" is the whole trip.
    if (await sheet.getByRole('radio', { name: 'שלי' }).getAttribute('aria-checked') !== 'true') throw new Error('not on "שלי"');
    await sheet.getByRole('radio', { name: 'כולם' }).click();
    await has(sheet.locator('.expense-headline'), '₪2,867');
    await has(sheet.locator('.expense-headline'), '2 משתתפים');
    const settle = sheet.locator('.expense-balance');
    await has(settle, 'מי מעביר למי');
    // By pair: each straight from what the two shared, with "שולם".
    const transfer = settle.locator('.expense-row.transfer');
    if (await transfer.count() !== 2) throw new Error(`${await transfer.count()} transfers`);
    await has(transfer.nth(0), 'דנה');
    await has(transfer.nth(0), '₪648');
    await has(transfer.nth(1), 'רוני');
    await has(transfer.nth(1), '₪333');
    await transfer.nth(1).getByRole('button', { name: 'רוני העביר/ה לדנה ₪333' }).waitFor();
    // Only the total, the settling up and the split.
    for (const gone of ['ההוצאות הגדולות', 'לכל משתתף', 'רק מהוצאות שחולקו', 'החלק שלי', 'לאדם', 'ממוצע ליום']) {
      if ((await sheet.innerText()).includes(gone)) throw new Error(`"${gone}" is still in the summary`);
    }
    if (await sheet.locator('.section-header-toggle').count()) throw new Error('sections that fold are back');
    const split = sheet.locator('.expense-card', { has: page.locator('.expense-by') });
    const row = (name) => split.locator('.share-row', { hasText: name });
    const pick = async (label) => {
      await split.locator('.expense-by').click();
      const picker = page.locator('.modal-overlay', { has: page.locator('.modal-header', { hasText: 'פילוג' }) });
      await picker.getByRole('radio', { name: label }).click();
      await picker.waitFor({ state: 'detached' });
      await has(split.locator('.expense-by'), label);
    };
    // It opens split by category; the second time, as it was left.
    if (theme === 'dark') {
      await has(split.locator('.expense-by'), 'לפי מטבע');
      await pick('לפי קטגוריה');
    }
    await has(split.locator('.expense-by'), 'לפי קטגוריה');
    if (await split.locator('.share-row').count() !== 6) throw new Error('not a row per category');
    await has(row('לינה'), '₪1,450');
    await has(row('לינה'), '51%');
    await shot(`${theme}-3-summary`);
    await page.mouse.move(200, 600);
    await page.mouse.wheel(0, 600);
    await shot(`${theme}-4-summary`);

    await pick('לפי מי ששילם');
    if (await split.locator('.share-row').count() !== 2) throw new Error('not a row per payer');
    await has(row('אני'), '₪2,139');
    await has(row('אני'), '75%');
    await has(row('דנה'), '₪728');
    await shot(`${theme}-5-by-payer`);
    await pick('לפי מטבע');
    await has(row('יורו'), '₪707');
    await has(row('יורו'), '€176.7');
    await has(row('דולר'), '₪480');
    await shot(`${theme}-6-by-currency`);
    await sheet.getByRole('button', { name: 'סגור' }).click();
    await sheet.waitFor({ state: 'detached' });
  });

  await step(`${theme}: "שלי": what I paid, my settling up, my categories`, async () => {
    await hero.click();
    await sheet.waitFor();
    await sheet.getByRole('radio', { name: 'שלי' }).click();
    const paid = sheet.locator('.expense-headline');
    await has(paid, 'שילמתי');
    await has(paid, '₪2,139');
    await has(paid, '4 הוצאות');
    // My settling up, from where I stand: both pay me. The title reads
    // from the right, over the amount.
    const balance = sheet.locator('.expense-balance');
    await has(balance, 'ההתחשבנות שלך');
    await has(balance, 'מגיע לך ₪648');
    const [title, amount] = await Promise.all(['.expense-balance-label', '.expense-balance-value']
      .map(sel => balance.locator(sel).boundingBox()));
    if (Math.abs(title.x + title.width - (amount.x + amount.width)) > 2 || title.y >= amount.y) throw new Error('the title is not on the right, over the amount');
    // By pair: only Dana shared with me, both ways, netted.
    const mine = balance.locator('.expense-row.settle');
    if (await mine.count() !== 1) throw new Error(`${await mine.count()} of my rows`);
    await has(mine.nth(0), 'מעביר/ה לך');
    await has(mine.nth(0), '2 הוצאות');
    await has(mine.nth(0), '₪648');
    await mine.nth(0).getByRole('button', { name: 'דנה שילם/ה לך ₪648' }).waitFor();
    // What I paid, by category: the room whole, though it was split.
    const cats = sheet.locator('.expense-card', { hasText: 'לפי קטגוריה' });
    await has(cats.locator('.share-row', { hasText: 'לינה' }), '₪1,450');
    await has(cats.locator('.share-row', { hasText: 'תחבורה' }), '₪480');
    if (await cats.locator('.share-row').count() !== 3) throw new Error('not my three categories');
    for (const gone of ['החלק שלי', 'ההוצאות הגדולות', 'מי מעביר למי']) {
      if ((await sheet.innerText()).includes(gone)) throw new Error(`"${gone}" is in "שלי"`);
    }
    await shot(`${theme}-7-mine`);
    await sheet.getByRole('button', { name: 'סגור' }).click();
    await sheet.waitFor({ state: 'detached' });
  });
}

await step('"שולם": Dana paid me; both ways close, and it undoes', async () => {
  const expDoc = async (id) => (await (await fetch(`${DB}/trips/exp/expenses/${id}`, { headers: admin })).json()).fields;
  const paidOf = async (id) => ((await expDoc(id))?.splitPaid?.arrayValue?.values || []).map(v => v.stringValue);
  const until = async (fn, what) => {
    for (let i = 0; i < 30; i++) { if (await fn()) return; await page.waitForTimeout(200); }
    throw new Error(what);
  };
  await hero.click();
  await sheet.waitFor();
  const balance = sheet.locator('.expense-balance');
  await balance.getByRole('button', { name: 'דנה שילם/ה לך ₪648' }).click();
  // How much came back (8.80.0): all of it, as the sheet opens.
  const settleForm = page.locator('.modal-content', { has: page.locator('#settle-amount') });
  await has(settleForm.locator('.settle-who'), 'מגיע לך ₪648');
  await has(settleForm.locator('.pay-context'), 'סוגר את כל החוב');
  await settleForm.getByRole('button', { name: 'שמור' }).click();
  await settleForm.waitFor({ state: 'detached' });
  // Her part of my room, and mine of her insurance.
  await until(async () => (await paidOf('e3')).includes(dana) && (await paidOf('e8')).includes(me), 'not marked paid');
  if ((await paidOf('e8')).includes('name:רוני')) throw new Error('Roni was marked too');
  // The headline changes too, not only the row.
  await has(balance, 'הכל שולם');
  await has(balance, 'קיבלת ₪648');
  const done = balance.locator('.expense-row.settle.done');
  await has(done, 'שילם/ה לך ₪648');
  await shot('dark-7-paid');
  // Everyone's: Dana's is gone, Roni's stays, and what was paid shows.
  await sheet.getByRole('radio', { name: 'כולם' }).click();
  const all = sheet.locator('.expense-balance');
  if (await all.locator('.expense-row.transfer').count() !== 1) throw new Error('Dana still pays');
  await has(all, 'כבר הועברו ₪802');
  await sheet.getByRole('radio', { name: 'שלי' }).click();
  await done.getByRole('button', { name: 'ביטול הסימון ששולם, דנה' }).click();
  await until(async () => !(await paidOf('e3')).length && !(await paidOf('e8')).length, 'the undo did not clear it');
  await has(balance, 'מגיע לך ₪648');
  await sheet.getByRole('button', { name: 'סגור' }).click();
  await sheet.waitFor({ state: 'detached' });
  // The list says who paid, on the row.
  await put('trips/exp/expenses/e3', { amount: 1450, currency: 'ILS', category: 'לינה', description: 'מקדמה למלון', paidBy: me,
    linkedPlanId: null, customPlace: null, ilsSnapshot: null, createdAt: '2026-11-12T12:00:00.000Z', splitWith: [dana], splitPaid: [dana] });
  await page.locator('.list-card', { hasText: 'מקדמה למלון' }).getByText('שולם').waitFor();
  await put('trips/exp/expenses/e3', { amount: 1450, currency: 'ILS', category: 'לינה', description: 'מקדמה למלון', paidBy: me,
    linkedPlanId: null, customPlace: null, ilsSnapshot: null, createdAt: '2026-11-12T12:00:00.000Z', splitWith: [dana] });
  await page.locator('.list-card', { hasText: 'מקדמה למלון' }).getByText('מתחלק ל־2').waitFor();
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

await step('the form: amount and currency in one field; a split with Dana and a new name, picked over the form', async () => {
  await page.setViewportSize({ width: 400, height: 860 });
  await page.locator('button.fab', { hasText: 'הוצאה חדשה' }).click();
  const form = page.locator('.modal-content').first();
  const over = () => page.locator('.modal-content').last();
  await page.getByPlaceholder('0.00').fill('90');
  // Lisbon: a new expense starts in euros, and the trip's own currencies
  // (shekels, euros) head the currency menu.
  await has(form.locator('.exp-currency'), 'EUR');
  await form.locator('.exp-currency').click();
  const ours = over().locator('[role="radiogroup"][aria-label="בטיול הזה"]');
  await has(ours, 'שקל');
  await has(ours, 'יורו');
  if ((await ours.innerText()).includes('לירה שטרלינג')) throw new Error('pounds are already the trip\'s');
  // Another one, from all of them, is kept for the trip.
  await over().getByPlaceholder('חיפוש מטבע').fill('GBP');
  await over().getByRole('radio', { name: /לירה שטרלינג/ }).click();
  await has(form.locator('.exp-currency'), 'GBP');
  await page.getByPlaceholder('למשל: ארוחת ערב, כרטיסי כניסה...').fill('ארוחה משותפת');
  // A long list has a search: it narrows, offers to add what is not there,
  // and Enter takes the one left.
  await form.locator('.custom-dropdown-trigger').first().click();
  const list = page.locator('.custom-dropdown-popup');
  const search = list.getByRole('searchbox', { name: 'חיפוש: קטגוריה' });
  await search.fill('מוז');
  if (await list.getByRole('option').count() !== 1) throw new Error('the search did not narrow the list');
  await has(list, 'מוזיאונים');
  await search.fill('גלידה');
  await list.getByRole('button', { name: 'הוסף "גלידה"' }).waitFor();
  await shot('dark-8-dropdown-search');
  await search.fill('אוכל');
  await search.press('Enter');
  await list.waitFor({ state: 'detached' });
  await has(form.locator('.custom-dropdown-trigger').first(), 'אוכל ושתייה');
  await has(form.locator('.exp-split'), 'בלי חלוקה, אף אחד לא חייב');
  // A place from the plan is right there, at the top.
  await form.getByRole('button', { name: 'חיפוש מקום ברשימה' }).waitFor();
  await shot('dark-8-form');
  await form.locator('.exp-split').click();
  // Roni is there already: a name from an earlier split.
  await over().getByRole('checkbox', { name: /רוני/ }).waitFor();
  await over().getByRole('checkbox', { name: /דנה/ }).click();
  await over().getByRole('button', { name: 'שם של מי שלא בטיול' }).click();
  await page.getByPlaceholder('שם של מי שלא בטיול').fill('יואב');
  await over().getByRole('button', { name: 'הוסף שם' }).click();
  await has(over(), '3 אנשים');
  await has(over(), '30');
  await shot('dark-8-split');
  const part = (name) => over().getByLabel(`החלק של ${name}`);
  // My part cleared stays empty while typing (it used to jump back to the
  // even share), and 0: the other two share it all.
  await part('אני').fill('');
  if (await part('אני').inputValue() !== '') throw new Error(`cleared: ${await part('אני').inputValue()}`);
  await part('אני').fill('0');
  if (await part('יואב').inputValue() !== '45' || await part('דנה').inputValue() !== '45') throw new Error('0 for me: not split between them');
  await part('דנה').fill('50');
  if (await part('יואב').inputValue() !== '40') throw new Error(`0 for me, Dana 50: Yoav ${await part('יואב').inputValue()}`);
  await over().getByRole('button', { name: 'חלוקה שווה' }).click();
  // "רק הם": the payer's own row, unticked.
  await over().getByRole('checkbox', { name: /אני/ }).click();
  await has(over(), '2 אנשים');
  if (await part('יואב').inputValue() !== '45') throw new Error('not even');
  // Dana's part typed: Yoav takes what is left.
  await part('דנה').fill('60');
  if (await part('יואב').inputValue() !== '30') throw new Error(`Yoav: ${await part('יואב').inputValue()}`);
  // Both typed, over the amount: it says by how much, and it cannot close.
  await part('יואב').fill('40');
  await has(over().locator('.split-meter'), 'חריגה של');
  if (!(await over().getByRole('button', { name: 'סיום' }).isDisabled())) throw new Error('closes over the amount');
  await shot('dark-8-split-over');
  // Back to even, then Dana's part again.
  await over().getByRole('button', { name: 'חלוקה שווה' }).click();
  if (await part('דנה').inputValue() !== '45') throw new Error('not even again');
  await part('דנה').fill('60');
  // Dana already paid me.
  await over().getByRole('button', { name: 'דנה שילם/ה' }).click();
  if (await over().getByRole('button', { name: 'דנה שילם/ה' }).getAttribute('aria-pressed') !== 'true') throw new Error('not marked');
  await has(over(), 'לפי סכומים');
  await shot('dark-8-split-uneven');
  // A narrow phone: the names keep their room, nothing is cut.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(300);
  const cut = await page.evaluate(() => [...document.querySelectorAll('.split-row, .split-row-pick .list-row-label')]
    .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
  if (cut.length) throw new Error(`cut: ${cut.join(' | ')}`);
  await shot('dark-8-split-narrow');
  await page.setViewportSize({ width: 400, height: 860 });
  await over().getByRole('button', { name: 'סיום' }).click();
  await page.waitForTimeout(400);
  await has(form.locator('.exp-split'), 'דנה, יואב');
  await has(form.locator('.exp-split'), 'לפי סכומים');
  await has(form.locator('.exp-split'), '1 שילמו');
  await form.getByRole('button', { name: 'מקום שלא ברשימה?' }).click();
  await form.getByLabel('מיקום').fill('טיים אאוט');
  await shot('dark-9-form');
  // The keyboard opens over a low field (the screen gets shorter): the
  // sheet scrolls it into sight, above the save bar.
  await page.setViewportSize({ width: 400, height: 420 });
  await page.waitForTimeout(700);
  const seen = await page.evaluate(() => {
    const el = document.activeElement;
    const box = el.closest('.modal-content');
    return { label: el.getAttribute('aria-label'), bottom: el.getBoundingClientRect().bottom,
      foot: box.querySelector('.sheet-footer').getBoundingClientRect().top, h: innerHeight, scrolled: box.scrollTop };
  });
  if (seen.label !== 'מיקום' || seen.bottom > seen.foot || seen.bottom > seen.h) throw new Error(`under the keyboard: ${JSON.stringify(seen)}`);
  console.log(`  (keyboard: scrolled ${Math.round(seen.scrolled)}px)`);
  await page.setViewportSize({ width: 400, height: 860 });
  await page.waitForTimeout(300);
  await page.locator('.sheet-footer button[type="submit"]').first().click();
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
  const parts = doc.fields.splitAmounts?.mapValue?.fields || {};
  const paidBack = (doc.fields.splitPaid?.arrayValue?.values || []).map(v => v.stringValue);
  if (JSON.stringify(Object.keys(parts)) !== JSON.stringify([dana]) || Number(parts[dana].integerValue ?? parts[dana].doubleValue) !== 60
    || JSON.stringify(paidBack) !== JSON.stringify([dana])) {
    throw new Error(`the split saved: ${JSON.stringify(doc.fields)}`);
  }
  if (doc.fields.currency?.stringValue !== 'GBP' || doc.fields.customPlace?.stringValue !== 'טיים אאוט' || doc.fields.category?.stringValue !== 'אוכל ושתייה') throw new Error(`saved: ${JSON.stringify(doc?.fields)}`);
  const kept = await (await fetch(`${DB}/trips/exp`, { headers: admin })).json();
  if (!(kept.fields?.expenseCurrencies?.arrayValue?.values || []).some(v => v.stringValue === 'GBP')) throw new Error('the pound was not kept for the trip');
  await page.locator('.list-card', { hasText: 'ארוחה משותפת' }).getByText('לא שווה ל־2 · 1 שילמו').waitFor();
  await page.locator('button.fab', { hasText: 'הוצאה חדשה' }).click();
  await page.locator('.modal-content .exp-split').click();
  await page.locator('.modal-content').last().getByRole('checkbox', { name: /יואב/ }).waitFor();
  await page.locator('.modal-overlay button[aria-label="סגור"]').last().click();
  await page.waitForTimeout(350);
  // The pound is the trip's now, with its own currencies.
  await page.locator('.modal-content .exp-currency').first().click();
  await has(page.locator('.modal-content').last().locator('[role="radiogroup"][aria-label="בטיול הזה"]'), 'לירה שטרלינג');
});

// "בינינו" (8.79.0): money between two people, apart from the expenses.
await step('"בינינו": Dana sent part of what she owes, I paid for her; edit, delete; not in the total', async () => {
  // The step before leaves its sheets open.
  for (let i = 0; i < 4 && await page.locator('.modal-overlay').count(); i++) {
    await page.locator('.modal-overlay button[aria-label="סגור"]').last().click();
    await page.waitForTimeout(450);
  }
  const total = await hero.locator('.expense-hero-total').innerText();
  await page.getByRole('radio', { name: 'בינינו' }).click();
  const view = page.locator('.pay-view');
  const danaRow = view.locator('.expense-row.settle', { hasText: 'דנה' }).first();
  await danaRow.waitFor();
  const num = (t) => Number(t.replace(/[^\d.]/g, ''));
  const before = num(await danaRow.locator('.expense-row-value').innerText());
  await has(view, 'עוד אין רישומים ביניכם');
  await shot('dark-10-between-empty');

  // A transfer: Dana owes me, so it is from her, against what she owes.
  await page.locator('button.fab', { hasText: 'רישום חדש' }).click();
  const form = page.locator('.modal-content', { has: page.locator('.pay-form') });
  await has(form.locator('.pay-pair'), 'דנה');
  await form.getByRole('radio', { name: 'העביר כסף' }).click();
  await has(form.getByRole('button', { name: /^מי העביר/ }), 'דנה');
  await has(form.getByRole('button', { name: /^למי/ }), 'אני');
  await has(form.locator('.pay-context'), 'מגיע לך');
  await form.locator('.pay-fill', { hasText: 'כל החוב' }).waitFor();
  await has(form.locator('.exp-currency'), 'EUR');
  await form.locator('#pay-amount').fill('25');
  await has(form.locator('.pay-context'), 'נשארו');
  await has(form.locator('.pay-context'), 'מתוך');
  await form.getByLabel('על מה').fill('ביט');
  await shot('dark-11-pay-form');
  await form.getByRole('button', { name: 'שמור' }).click();
  await page.locator('.modal-overlay').waitFor({ state: 'detached' });
  const got = view.locator('.list-card', { hasText: 'קיבלתי מדנה' });
  await has(got, '€25');
  await has(got, '≈ ₪100');
  await has(got, 'ביט');
  await has(danaRow.locator('.settle-progress-text'), 'הועברו ₪100 מתוך');
  const after = num(await danaRow.locator('.expense-row-value').innerText());
  if (Math.abs(before - 100 - after) > 1) throw new Error(`Dana: ${before} then ${after}`);
  let docs = [];
  for (let i = 0; i < 20 && !docs.length; i++) {
    docs = (await (await fetch(`${DB}/trips/exp/payments?pageSize=50`, { headers: admin })).json()).documents || [];
    if (!docs.length) await page.waitForTimeout(300);
  }
  const f = docs[0]?.fields || {};
  if (f.kind?.stringValue !== 'gave' || f.from?.stringValue !== dana || f.to?.stringValue !== me
    || Number(f.amount?.integerValue ?? f.amount?.doubleValue) !== 25 || f.currency?.stringValue !== 'EUR' || f.createdBy?.stringValue !== me) {
    throw new Error(`saved: ${JSON.stringify(f)}`);
  }

  // Paid for her: from me, €10 more she owes.
  await page.locator('button.fab', { hasText: 'רישום חדש' }).click();
  await has(form.getByRole('button', { name: /^מי שילם/ }), 'אני');
  await has(form.getByRole('button', { name: /^על מי/ }), 'דנה');
  await form.locator('#pay-amount').fill('10');
  await has(form.locator('.pay-context'), 'ביניכם אחרי זה: מגיע לך');
  await form.getByRole('button', { name: 'שמור' }).click();
  await page.locator('.modal-overlay').waitFor({ state: 'detached' });
  await view.locator('.list-card', { hasText: 'שילמתי על דנה' }).waitFor();
  if (Math.abs(num(await danaRow.locator('.expense-row-value').innerText()) - (before - 100 + 40)) > 1) throw new Error('paid for her: not owed');
  await shot('dark-12-between');

  // An edit writes what changed; a delete takes it out.
  await got.click();
  await form.locator('#pay-amount').fill('30');
  await form.getByRole('button', { name: 'שמור' }).click();
  await page.locator('.modal-overlay').waitFor({ state: 'detached' });
  await has(got, '€30');
  await view.locator('.list-card', { hasText: 'שילמתי על דנה' }).click();
  await form.getByRole('button', { name: 'מחיקה', exact: true }).click();
  await page.getByRole('button', { name: 'מחק', exact: true }).click();
  await view.locator('.list-card', { hasText: 'שילמתי על דנה' }).waitFor({ state: 'detached' });
  if (Math.abs(num(await danaRow.locator('.expense-row-value').innerText()) - (before - 120)) > 1) throw new Error('after the edit and delete');

  // Not an expense: the total stays; the list is a tap away.
  if (await hero.count()) throw new Error('the card with the total in "בינינו"');
  await page.getByRole('radio', { name: 'הוצאות' }).click();
  if (await hero.locator('.expense-hero-total').innerText() !== total) throw new Error('the total changed');
  await page.locator('.list-card', { hasText: 'מונית מהשדה' }).waitFor();
  if (await page.locator('button.fab', { hasText: 'הוצאה חדשה' }).count() !== 1) throw new Error('the add button');
});

// 8.80.0: "קיבלתי" asks how much came back, and a note.
await step('"קיבלתי": part of it is a transfer with its note; all of it with a note closes it and keeps it', async () => {
  for (let i = 0; i < 4 && await page.locator('.modal-overlay').count(); i++) {
    await page.locator('.modal-overlay button[aria-label="סגור"]').last().click();
    await page.waitForTimeout(450);
  }
  await page.getByRole('radio', { name: 'בינינו' }).click();
  const view = page.locator('.pay-view');
  const danaRow = view.locator('.expense-row.settle', { hasText: 'דנה' }).first();
  const num = (t) => Number(t.replace(/[^\d.]/g, ''));
  const before = num(await danaRow.locator('.expense-row-value').innerText());
  const form = page.locator('.modal-content', { has: page.locator('#settle-amount') });

  await danaRow.getByRole('button', { name: /^דנה שילם\/ה לך/ }).click();
  await has(form.locator('.settle-who'), 'מגיע לך');
  await has(form.locator('.settle-who'), 'מ־2 הוצאות ורישום אחד');
  if (num(await form.locator('#settle-amount').inputValue()) < 1) throw new Error('not the full amount to start');
  await form.locator('#settle-amount').fill('50');
  await has(form.locator('.pay-context'), 'נשארו');
  await form.locator('.pay-fill', { hasText: 'כל החוב' }).waitFor();
  await form.getByLabel('הערה').fill('מזומן');
  await shot('dark-13-settle-part');
  await form.getByRole('button', { name: 'שמור' }).click();
  await form.waitFor({ state: 'detached' });
  const part = view.locator('.list-card', { hasText: 'מזומן' });
  await has(part, 'קיבלתי מדנה');
  await has(part, '₪50');
  await has(danaRow.locator('.settle-progress-text'), 'הועברו');
  const after = num(await danaRow.locator('.expense-row-value').innerText());
  if (Math.abs(before - 50 - after) > 1) throw new Error(`Dana: ${before} then ${after}`);
  if (await part.getByText('נסגר').count()) throw new Error('part of it closed the debt');

  // All of it, with a note: nothing is left open, and the note stays.
  await danaRow.getByRole('button', { name: /^דנה שילם\/ה לך/ }).click();
  await form.getByLabel('הערה').fill('בהעברה בנקאית');
  await form.getByRole('button', { name: 'שמור' }).click();
  await form.waitFor({ state: 'detached' });
  await view.locator('.expense-row.settle.done', { hasText: 'דנה' }).waitFor();
  if (await view.locator('.expense-row.settle:not(.done)', { hasText: 'דנה' }).count()) throw new Error('still open with Dana');
  const all = view.locator('.list-card', { hasText: 'בהעברה בנקאית' });
  await has(all, 'קיבלתי מדנה');
  await has(all, 'נסגר');
  await shot('dark-14-settle-all');
});

// 8.80.0 (the owner's ask): each sees only their own settling up; the
// owner sees it all. Dana is an editor here.
await step('Dana: only her payments, and no one else\'s "מי מעביר למי"', async () => {
  await put('trips/exp/payments/pay-roni', {
    kind: 'for', from: me, to: 'name:רוני', amount: 70, currency: 'ILS', note: 'רק שלי ושל רוני', settled: false,
    createdAt: '2026-11-04T10:00:00.000Z', createdBy: me,
  });
  const view = page.locator('.pay-view');
  // The owner sees it.
  await view.locator('.list-card', { hasText: 'רק שלי ושל רוני' }).waitFor();
  await signIn('dana@example.com');
  await page.goto('http://localhost:5173/');
  await page.locator('.trip-card', { hasText: 'ליסבון' }).getByText('פתח טיול').click();
  await tab('הוצאות');
  await page.getByRole('radio', { name: 'בינינו' }).click();
  await view.locator('.list-card', { hasText: 'מזומן' }).waitFor();
  await page.waitForTimeout(800);
  if (await view.locator('.list-card', { hasText: 'רק שלי ושל רוני' }).count()) throw new Error('Dana sees the owner\'s payment with Roni');
  await page.getByRole('radio', { name: 'הוצאות' }).click();
  await hero.click();
  await sheet.waitFor();
  await sheet.getByRole('radio', { name: 'כולם' }).click();
  await has(sheet, 'סה"כ הטיול');
  if (await sheet.getByText('מי מעביר למי').count()) throw new Error('"מי מעביר למי" for Dana');
  await sheet.getByRole('radio', { name: 'שלי' }).click();
  await has(sheet, 'ההתחשבנות שלך');
  await shot('dark-15-dana-summary');
});

console.log(failed ? `${failed} failed` : 'all passed');
await browser.close();
process.exit(failed ? 1 : 0);
