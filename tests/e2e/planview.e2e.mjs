// The planning list (8.69.0): a category's header glued to the top with the
// toolbar under it and nothing showing through; each category's cards in
// its own theme; the title centred on a card; a date and time range.
//   bash scripts/run-e2e.sh tests/e2e/planview.e2e.mjs
// Screenshots: .e2e/planview/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = '.e2e/planview';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 393, height: 800 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  try {
    if (!localStorage.getItem('palette')) localStorage.setItem('palette', 'ocean');
    // An older choice saved on the device gives way to the new default.
    localStorage.setItem('planGroupBy_pv', 'none');
    localStorage.setItem('planLayout_pv', 'compact');
  } catch { /* */ }
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${out}/fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
}
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}.png` }); };

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
const me = await page.evaluate(() => window.__e2eSignIn('planview@example.com').then(c => c.user.uid));
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1500);
await put('trips/pv', {
  name: 'בודפשט', destination: 'בודפשט, הונגריה', dates: '12.11.2026 - 18.11.2026',
  members: { [me]: 'owner' }, memberIds: [me],
});
// A fresh list each run (the emulator keeps data between local runs).
const old = await fetch(`${DB}/trips/pv/planning?pageSize=300`, { headers: admin }).then(r => r.json());
for (const d of old.documents || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: admin });
// The owner's categories, with the emoji they picked.
await put('trips/pv/settings/categories', {
  'שווקי כריסמס': { emoji: '🎄' },
  'קניות': { emoji: '🛍️' },
  'ברים': { emoji: '🍻' },
});
const CATS = {
  'אטרקציות ודברים לעשות': ['גלגל ענק', 'פופ אנד רול גלריה ושירותים', 'Cinema Mystica Budapest', 'סאגווי', 'Escape room'],
  'מסעדות ומקומות אכילה': ['Pizza george', 'Szimpla', 'Bors GasztroBár', 'Mazel Tov'],
  'מקומות לבקר': ['ארמון בודה', 'גשר השלשלאות', 'הפרלמנט'],
  'שווקי כריסמס': ['Advent Basilica', 'Vörösmarty tér'],
  'קניות': ['Váci utca', 'Great Market Hall'],
  'ברים': ['Instant-Fogas', 'Szimpla Kert'],
  'אירועים': ['קונצרט באופרה'],
};
let n = 0;
for (const [cat, names] of Object.entries(CATS)) {
  for (const title of names) {
    n++;
    const extra = {};
    if (title === 'גלגל ענק' || title === 'Advent Basilica') extra.priority = 'must';
    if (title === 'Advent Basilica') extra.event = { startDate: '2026-11-13', endDate: '2027-01-01', startTime: '11:00', endTime: '22:00' };
    if (title === 'קונצרט באופרה') extra.event = { startDate: '2026-11-14', startTime: '19:30', endTime: '22:00' };
    await put(`trips/pv/planning/p${n}`, { title, category: cat, address: '', ...extra });
  }
}

await page.locator('.trip-card', { hasText: 'בודפשט' }).getByText('פתח טיול').click();
await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
await page.locator('.plan-card', { hasText: 'גלגל ענק' }).waitFor();
await shot('0-top');

const scroller = page.locator('.app-content');
await step('scrolled: the category header is glued to the top, the toolbar right under it', async () => {
  await scroller.evaluate(el => { el.scrollTop = 520; });
  await page.waitForTimeout(300);
  const top = (await scroller.boundingBox()).y;
  const head = page.locator('.plan-group-head[data-stuck]');
  if (await head.count() !== 1) throw new Error(`${await head.count()} stuck headers`);
  const h = await head.boundingBox();
  if (Math.abs(h.y - top) > 1) throw new Error(`header ${h.y - top}px from the top`);
  const pill = await page.locator('.plan-filter-pill').boundingBox();
  if (pill.y < h.y + h.height || pill.y > h.y + h.height + 10) throw new Error(`toolbar at ${pill.y - (h.y + h.height)}px under the header`);
  await shot('1-stuck');
});

await step('each category in its own theme; a Santa hat on the Christmas markets', async () => {
  const themeOf = (t) => page.locator('.plan-card', { hasText: t }).locator('[data-ct]').getAttribute('data-ct');
  const want = { 'גלגל ענק': 'attractions', 'Pizza george': 'food', 'ארמון בודה': 'sights', 'Advent Basilica': 'christmas', 'Váci utca': 'shopping', 'Instant-Fogas': 'bars', 'קונצרט באופרה': 'events' };
  for (const [t, k] of Object.entries(want)) {
    const got = await themeOf(t);
    if (got !== k) throw new Error(`${t}: ${got}`);
  }
  const xmas = page.locator('.pstub-wrap', { hasText: 'Advent Basilica' });
  if (!(await xmas.locator('.ct-santa').count())) throw new Error('no hat');
  // A category with no colour of its own takes its theme's: red, not the stock indigo.
  const c = await xmas.locator('.plan-card').evaluate(e => getComputedStyle(e).getPropertyValue('--c').trim());
  if (c.toUpperCase() !== '#C62F2F') throw new Error(`Christmas colour ${c}`);
  await xmas.scrollIntoViewIfNeeded();
  await scroller.evaluate(el => { el.scrollTop -= 120; });
  await shot('2-christmas');
  await page.locator('.plan-card', { hasText: 'Instant-Fogas' }).scrollIntoViewIfNeeded();
  await shot('3-bars');
});

await step('the title in the middle of the card, "must" at its top', async () => {
  const c = page.locator('.plan-card', { hasText: 'גלגל ענק' });
  const [card, title, flags] = [await c.boundingBox(), await c.locator('.pstub-title').boundingBox(), await c.locator('.pstub-flags').boundingBox()];
  const mid = (b) => b.y + b.height / 2;
  if (Math.abs(mid(title) - mid(card)) > 2) throw new Error(`title ${mid(title) - mid(card)}px off the middle`);
  if (flags.y - card.y > 16) throw new Error('"must" is not at the top');
});

await step('a dot by the date: a ring before it starts, green while it is on, grey after', async () => {
  const iso = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dated = { 'פסטיבל היום': [0, 'live'], 'הופעה אתמול': [-1, 'past'], 'שוק בעוד שבוע': [7, 'upcoming'] };
  let i = 0;
  for (const [title, [days]] of Object.entries(dated)) {
    await put(`trips/pv/planning/when${++i}`, { title, category: 'אירועים', address: '', event: { startDate: iso(days) } });
  }
  for (const [title, [, state]] of Object.entries(dated)) {
    const top = page.locator('.plan-card', { hasText: title }).locator('.pstub-when-top');
    await top.locator(`.when-dot.${state}`).waitFor();
    // Before the top line, on its line.
    const [dot, line] = [await top.locator('.when-dot').boundingBox(), await top.boundingBox()];
    if (Math.abs(dot.y + dot.height / 2 - (line.y + line.height / 2)) > 2) throw new Error(`${title}: the dot is off the line`);
  }
  const live = page.locator('.plan-card', { hasText: 'פסטיבל היום' });
  if (await live.locator('.pstub-stub.past').count()) throw new Error('today is grey');
  if (!(await page.locator('.plan-card', { hasText: 'הופעה אתמול' }).locator('.pstub-stub.past').count())) throw new Error('yesterday is not grey');
  await live.scrollIntoViewIfNeeded();
  await shot('9-when-dots');
});

await step('"טווח": a first and a last day, a start and an end time, saved as one range', async () => {
  const modal = () => page.locator('.modal-content').last();
  await page.locator('button.fab', { hasText: 'יעד חדש' }).click();
  await modal().getByPlaceholder('למשל: תצפית שקיעה בגבעה').fill('יריד הסתיו');
  const when = modal().locator('.place-when');
  await when.getByRole('switch', { name: 'טווח' }).click();
  // Days: a tap on the first, a tap on the last; the ones between are one stretch.
  await when.locator('.picker-field', { hasText: 'בחר תאריכים' }).click();
  const days = page.locator('.picker-card .cal-day');
  // The first tap is the first day, whatever today is; the days before it
  // go grey, and the stretch runs on into the next month.
  const next = page.locator('.picker-card .cal-nav[aria-label="החודש הבא"]');
  await next.click();
  await days.filter({ hasText: /^20$/ }).click();
  if (!/ועכשיו היום האחרון/.test(await page.locator('.picker-readout').innerText())) throw new Error('the first tap was not the first day');
  if (await page.locator('.picker-card .cal-day.before-range').count() !== 19) throw new Error('the days before the first are not grey');
  await next.click();
  await days.filter({ hasText: /^10$/ }).click();
  if (await page.locator('.picker-card .cal-day.in-range').count() !== 9) throw new Error('the stretch is not marked in the next month');
  await shot('6a-range-months');
  await page.locator('.picker-card').getByRole('button', { name: 'ביטול' }).click();
  await when.locator('.picker-field', { hasText: 'בחר תאריכים' }).click();
  await days.filter({ hasText: /^13$/ }).click();
  await days.filter({ hasText: /^16$/ }).click();
  if (await page.locator('.picker-card .cal-day.in-range').count() !== 2) throw new Error('the days between are not marked');
  const readout = (await page.locator('.picker-readout').innerText()).trim();
  if (!/^13–16 ב\S+ \d{4}$/.test(readout)) throw new Error(`readout "${readout}"`);
  await shot('6-date-range');
  await page.getByRole('button', { name: 'בחירה', exact: true }).click();
  // Times: both ends in one window; the end opens an hour after the start.
  await when.locator('.picker-field', { hasText: 'בחר שעות' }).click();
  if ((await page.locator('.picker-readout').innerText()).trim() !== '12:00 – 13:00') throw new Error(`time readout ${await page.locator('.picker-readout').innerText()}`);
  await page.locator('.time-range-side').nth(1).locator('.wheel').first().evaluate(el => { el.scrollTop += 44 * 4; });
  await page.waitForTimeout(500);
  if ((await page.locator('.picker-readout').innerText()).trim() !== '12:00 – 17:00') throw new Error(`time readout ${await page.locator('.picker-readout').innerText()}`);
  await shot('7-time-range');
  await page.getByRole('button', { name: 'בחירה', exact: true }).click();
  await shot('8-form-range');
  await modal().locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  const saved = async () => {
    for (let i = 0; i < 20; i++) {
      const docs = await fetch(`${DB}/trips/pv/planning?pageSize=300`, { headers: admin }).then(r => r.json());
      const ev = docs.documents.find(d => d.fields.title?.stringValue === 'יריד הסתיו')?.fields.event?.mapValue.fields;
      if (ev) return ev;
      await page.waitForTimeout(250);
    }
    return null;
  };
  const ev = await saved();
  const got = ev && ['startDate', 'endDate', 'startTime', 'endTime'].map(k => ev[k]?.stringValue || '').join(' ');
  if (!/^\d{4}-\d\d-13 \d{4}-\d\d-16 12:00 17:00$/.test(got || '')) throw new Error(`saved ${got}`);
  // The card: every day in those hours, and the days as a tag (not one stretch from 13 12:00 to 16 17:00).
  const rangeCard = page.locator('.pstub-wrap', { hasText: 'יריד הסתיו' });
  await rangeCard.scrollIntoViewIfNeeded();
  const stubText = (await rangeCard.locator('.pstub-stub.when').innerText()).replace(/\s+/g, ' ');
  if (!/כל יום 12:00 עד 17:00/.test(stubText)) throw new Error(`stub says "${stubText}"`);
  if (!/^13\.\d\d–16\.\d\d$/.test((await rangeCard.locator('.pstub-tags > *').first().innerText()).trim())) {
    throw new Error(`tags say "${await rangeCard.locator('.pstub-tags').innerText()}"`);
  }
  await shot('8b-card-range');
  // Off again: back to one day and one time, and the end is not saved.
  await page.locator('.plan-card', { hasText: 'יריד הסתיו' }).click();
  await page.locator('.modal-content').last().getByRole('button', { name: 'עריכה' }).first().click();
  await when.getByRole('switch', { name: 'טווח', checked: true }).click();
  await when.locator('.picker-field', { hasText: '12:00' }).waitFor();
  await modal().locator('.sheet-footer button[type="submit"]').click();
  await page.waitForTimeout(1500);
  const ev2 = await saved();
  if (ev2.endDate?.stringValue || ev2.endTime?.stringValue) throw new Error('the end stayed');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
});

await step('dark mode', async () => {
  await page.locator('button[aria-label="עבור למצב כהה"]').click();
  await page.locator('.plan-card', { hasText: 'Advent Basilica' }).scrollIntoViewIfNeeded();
  await shot('4-dark');
  await scroller.evaluate(el => { el.scrollTop = 520; });
  await shot('5-dark-stuck');
  await page.locator('button[aria-label="עבור למצב בהיר"]').click();
});

if (errors.length) { console.log('  page errors:', errors); failed++; }
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('planview: all passed');
