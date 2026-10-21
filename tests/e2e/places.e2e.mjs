// The places list: "must" and booking at the top of a card, by the stub,
// with the title wrapping beside them; duplicates (the same name, or the
// same link or address) marked on every card, and a note over the list
// that shows just them, each set together.
//   bash scripts/run-e2e.sh tests/e2e/places.e2e.mjs
// Screenshots: .e2e/places/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = '.e2e/places';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
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
const me = await page.evaluate(() => window.__e2eSignIn('places@example.com').then(c => c.user.uid));
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1500);
await put('trips/pl', {
  name: 'בודפשט', destination: 'בודפשט, הונגריה', dates: '12.11.2026 - 18.11.2026',
  members: { [me]: 'owner' }, memberIds: [me],
});
const place = (id, title, category, extra = {}) => put(`trips/pl/planning/${id}`, { title, category, address: '', ...extra });
await place('p1', 'מוזיאון האמנויות היפות של בודפשט', 'אטרקציות ודברים לעשות', { priority: 'must', needsReservation: true });
await place('p2', 'Szimpla', 'מסעדות ומקומות אכילה', { address: 'https://maps.app.goo.gl/abc' });
await place('p3', 'szimpla ', 'מקומות לבקר');
await place('p4', 'ארמון בודה', 'מקומות לבקר', { address: 'https://maps.app.goo.gl/xyz' });
await place('p5', 'הארמון המלכותי', 'אטרקציות ודברים לעשות', { address: 'maps.app.goo.gl/xyz/' });
await place('p6', 'גשר השלשלאות', 'מקומות לבקר');

await page.locator('.trip-card', { hasText: 'בודפשט' }).getByText('פתח טיול').click();
await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
const card = (t) => page.locator('.plan-card', { has: page.locator('.pstub-title', { hasText: t }) });
await card('גשר השלשלאות').waitFor();

await step('"must" and booking: at the top of the card by the stub, the title beside them, nothing overlapping', async () => {
  const c = card('מוזיאון');
  const flags = c.locator('.pstub-flags');
  const title = c.locator('.pstub-title');
  if ((await flags.innerText()).replace(/\s+/g, ' ').trim() !== 'חובה להזמין') throw new Error(`flags: ${await flags.innerText()}`);
  if (await c.locator('.pstub-tags', { hasText: 'חובה' }).count()) throw new Error('"must" is still down with the tags');
  const [f, t, main, stub] = [await flags.boundingBox(), await title.boundingBox(), await c.locator('.pstub-main').boundingBox(), await c.locator('.pstub-stub').boundingBox()];
  // Hebrew: the stub is on the left, so the flags are on the title's left, next to it.
  if (!(f.x + f.width <= t.x + 1)) throw new Error('the flags overlap the title');
  if (f.y - main.y > 18) throw new Error('the flags are not at the top');
  if (f.x - (stub.x + stub.width) > 24) throw new Error('the flags are not by the stub');
  if (f.x < stub.x + stub.width - 1) throw new Error('the flags are on the stub');
  // Both one width; booking still to make is solid red.
  const widths = await c.locator('.pstub-flag').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)));
  if (new Set(widths).size !== 1) throw new Error(`widths ${widths}`);
  const bg = await c.locator('.pstub-flag.book').evaluate(e => getComputedStyle(e).backgroundColor);
  if (bg !== 'rgb(220, 38, 38)') throw new Error(`booking is ${bg}`);
  await shot('1-flags');
});

await step('duplicates: the same name or the same link, marked on each card', async () => {
  for (const t of ['Szimpla', 'szimpla', 'ארמון בודה', 'הארמון המלכותי']) {
    if (!(await card(t).first().innerText()).includes('כפילות')) throw new Error(`"${t}" is not marked`);
  }
  for (const t of ['גשר השלשלאות', 'מוזיאון']) {
    if ((await card(t).innerText()).includes('כפילות')) throw new Error(`"${t}" is marked`);
  }
  if (!(await card('ארמון בודה').locator('.pstub-flag.dup').getAttribute('title')).includes('הארמון המלכותי')) {
    throw new Error('the mark does not say which place it repeats');
  }
});

await step('the note over the list shows just the duplicates, each set together; "הצג הכל" brings back the rest', async () => {
  const note = page.locator('.plan-dup-notice');
  if (!(await note.innerText()).includes('4 מקומות')) throw new Error(`note: ${await note.innerText()}`);
  await note.click();
  const heads = await page.locator('.plan-group .section-header-title').allInnerTexts();
  if (heads.join('|') !== 'כפילות 1 · אותו שם|כפילות 2 · אותו מיקום') throw new Error(`sections: ${heads.join('|')}`);
  if (await page.locator('.plan-card').count() !== 4) throw new Error(`${await page.locator('.plan-card').count()} cards`);
  if (await note.count()) throw new Error('the note stays while showing them');
  await shot('2-duplicates');
  await page.getByRole('button', { name: 'הצג הכל' }).click();
  await card('גשר השלשלאות').waitFor();
  if (await page.locator('.plan-card').count() !== 6) throw new Error('not all back');
  await note.waitFor();
});

await step('dark mode', async () => {
  await page.locator('button[aria-label="עבור למצב כהה"]').click();
  await shot('3-dark');
});

if (errors.length) { console.log('  page errors:', errors); failed++; }
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('places: all passed');
