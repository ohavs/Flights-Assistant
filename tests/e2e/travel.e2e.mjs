// Places list: the category filter picks several categories, each shown in
// its own section under a header that stays in the list, and a place's
// details sheet measures travel times from any other place on the list.
//   bash scripts/run-e2e.sh tests/e2e/travel.e2e.mjs
// The app gets a fake Maps key (emulator builds only) and this test answers
// the Routes and Places calls itself, from straight-line distances.
// Output: <argv[2]>/travel/<nn>-<name>.png. Exits non-zero if a step fails.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = `${process.argv[2] || '.e2e'}/travel`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await ctx.addInitScript(() => { window.__e2eGmapsKey = 'e2e'; });

// Budapest centre, and every place a few hundred metres from it.
const CITY = { lat: 47.4979, lng: 19.0402 };
const meters = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2
    + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
const point = (w) => {
  const ll = w?.location?.latLng;
  return ll ? { lat: ll.latitude, lng: ll.longitude } : CITY;
};
await ctx.route('https://routes.googleapis.com/**', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  const m = Math.round(meters(point(body.origin), point(body.destination)));
  // About 1.3 m/s on foot; by transit a 5-minute wait, then 6 m/s.
  const secs = body.travelMode === 'WALK' ? Math.round(m / 1.3) : 300 + Math.round(m / 6);
  await route.fulfill({ json: { routes: [{ duration: `${secs}s`, distanceMeters: m }] } });
});
await ctx.route('https://places.googleapis.com/**', (route) =>
  route.fulfill({ json: { places: [{ location: { latitude: CITY.lat, longitude: CITY.lng } }] } }));

const page = await ctx.newPage();
page.setDefaultTimeout(10000);
page.on('dialog', d => d.accept());
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text().slice(0, 200)); });

let n = 0, failed = 0;
async function shot(name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` });
}
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${out}/fail-${String(n).padStart(2, '0')}-${name.replace(/\W+/g, '_')}.png` }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  }
}
const modal = () => page.locator('.modal-overlay').last();
const closeModal = async () => {
  for (let i = 0; i < 4 && await page.locator('.modal-overlay').count(); i++) {
    await page.locator('.modal-overlay button[aria-label="סגור"]').last().click();
    await page.waitForTimeout(350);
  }
};
const travel = () => modal().locator('.travel-from');

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('traveller@example.com'));
await page.getByText('טיולים מתוכננים').waitFor();
await page.getByText('צור טיול ראשון').click();
await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('בודפשט');
await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('בודפשט');
await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
await page.locator('.trip-card').getByText('פתח טיול').click();
await page.getByText('טיסת הלוך').first().waitFor();
await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
await page.getByText('עוד אין מקומות ברשימה').first().waitFor();

const at = (lat, lng) => `https://www.google.com/maps/place/x/@${lat},${lng},17z`;
async function addPlace({ title, category, address }) {
  await page.locator('button.fab', { hasText: 'יעד חדש' }).click();
  await modal().getByPlaceholder('למשל: תצפית שקיעה בגבעה').fill(title);
  if (category) {
    await modal().getByText('אטרקציות ודברים לעשות', { exact: true }).first().click();
    await page.getByRole('option', { name: category }).click();
  }
  await modal().getByPlaceholder('כתובת או קישור למפה').first().fill(address);
  await modal().locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  await page.getByText(title).first().waitFor();
}

await step('add places in several categories', async () => {
  // The castle is 750 m from the bastion, the church next door to it.
  await addPlace({ title: 'מבצר הדייגים', address: at(47.5022, 19.0347) });
  await addPlace({ title: 'ארמון בודה', address: at(47.4962, 19.0396) });
  await addPlace({ title: 'כנסיית מתיאש', address: at(47.5020, 19.0343) });
  await addPlace({ title: 'Mazel Tov', category: 'מסעדות ומקומות אכילה', address: at(47.5004, 19.0636) });
  await addPlace({ title: 'Szimpla', category: 'מסעדות ומקומות אכילה', address: at(47.4970, 19.0633) });
  await addPlace({ title: 'Karaván', category: 'מסעדות ומקומות אכילה', address: at(47.4975, 19.0630) });
  await addPlace({ title: 'גשר השלשלאות', category: 'מקומות לבקר', address: at(47.4989, 19.0436) });
  await addPlace({ title: 'הפרלמנט', category: 'מקומות לבקר', address: at(47.5071, 19.0456) });
  await addPlace({ title: 'האי מרגיט', category: 'מקומות לבקר', address: at(47.5270, 19.0469) });
  await addPlace({ title: 'כרטיס תחבורה', category: 'מידע כללי וטיפים', address: at(47.5000, 19.0560) });
  await addPlace({ title: 'שוק הפשפשים', category: 'מידע כללי וטיפים', address: at(47.4870, 19.0580) });
});

await step('two categories picked: one section each, under headers that are not sticky', async () => {
  const pill = page.locator('button.plan-filter-pill');
  const menu = page.getByRole('dialog', { name: 'סינון לפי קטגוריה' });
  const heads = () => page.locator('.plan-group .section-header-title').allInnerTexts();
  await pill.click();
  await menu.getByRole('checkbox', { name: /מסעדות ומקומות אכילה/ }).click();
  await menu.getByRole('checkbox', { name: /מקומות לבקר/ }).click();
  if (await menu.getByRole('checkbox', { name: /כל הקטגוריות/ }).getAttribute('aria-checked') !== 'false') {
    throw new Error('"all" is still ticked');
  }
  await menu.getByRole('button', { name: 'הצג 6 מקומות' }).waitFor();
  await shot('filter-two-picked');
  await menu.getByRole('button', { name: 'הצג 6 מקומות' }).click();
  await menu.waitFor({ state: 'detached' });
  // In the list's category order, though "מקומות לבקר" was picked second.
  if ((await heads()).join('|') !== 'מסעדות ומקומות אכילה|מקומות לבקר') throw new Error(`sections: ${(await heads()).join('|')}`);
  if (await page.locator('.plan-card').count() !== 6) throw new Error('not just the two categories');
  if (!(await pill.innerText()).includes('2 קטגוריות')) throw new Error('the pill does not say two categories');
  if (await page.locator('.plan-group .section-header').first().evaluate(el => getComputedStyle(el).position) === 'sticky') {
    throw new Error('the header is still sticky');
  }
  await shot('two-categories');
  // Back to everything: a single list again (grouping is off).
  await pill.click();
  await menu.getByRole('button', { name: 'נקה' }).click();
  await menu.getByRole('button', { name: 'הצג 11 מקומות' }).click();
  await menu.waitFor({ state: 'detached' });
  if (await page.locator('.plan-group').count()) throw new Error('sections without two categories picked');
  // Grouped by category from the options, every category gets a section.
  await page.locator('[title="מיון ותצוגה"]').click();
  await page.getByText('קטגוריה', { exact: true }).first().click();
  await page.mouse.click(5, 5);
  await page.locator('.plan-group').nth(3).waitFor();
  if ((await heads()).length !== 4) throw new Error(`sections: ${(await heads()).join('|')}`);
  // Scrolled, the first header leaves with its places instead of sticking.
  const head = page.locator('.plan-group .section-header').first();
  const top0 = (await head.boundingBox()).y;
  await page.mouse.move(195, 500);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 90);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(200);
  const top1 = (await head.boundingBox()).y;
  if (top1 > top0 - 300) throw new Error(`the header did not scroll away (${top0} → ${top1})`);
  await shot('grouped-scrolled');
});

let cardBefore = '';
await step('details sheet shows times from the city centre', async () => {
  await page.mouse.wheel(0, -5000);
  await page.waitForTimeout(300);
  const card = page.locator('.plan-card', { hasText: 'מבצר הדייגים' }).first();
  await card.click();
  await travel().getByText('ממרכז בודפשט').waitFor();
  await travel().locator('.lucide-footprints').waitFor();
  await shot('details-from-city');
  await closeModal();
  // Measured once, the time shows on the card too.
  await card.locator('.meta-part').nth(1).waitFor();
  cardBefore = (await card.innerText()).replace(/\s+/g, ' ');
  await card.click();
});

await step('picker: centre pinned on top, nearest places first, search', async () => {
  await travel().click();
  const picker = modal();
  await picker.getByText('יוצאים מ…').waitFor();
  const fixed = picker.locator('[role="radiogroup"]').first();
  await fixed.getByRole('radio', { name: /מרכז בודפשט/ }).waitFor();
  if (await fixed.getByRole('radio', { name: /מרכז בודפשט/ }).getAttribute('aria-checked') !== 'true') {
    throw new Error('the current origin is not marked');
  }
  const names = await picker.locator('[role="radiogroup"]').nth(1).getByRole('radio').allInnerTexts();
  if (!names[0].includes('כנסיית מתיאש')) throw new Error(`nearest first, got: ${names[0]}`);
  if (names.some(t => t.includes('מבצר הדייגים'))) throw new Error('the place itself is listed');
  await shot('picker');
  // One group per category, in the list's order; each folds.
  const heads = await picker.locator('.origin-picker-group .section-header-title').allInnerTexts();
  if (heads.join('|') !== 'אטרקציות ודברים לעשות|מסעדות ומקומות אכילה|מקומות לבקר|מידע כללי וטיפים') {
    throw new Error(`category groups: ${heads.join('|')}`);
  }
  const food = picker.locator('.origin-picker-group', { hasText: 'מסעדות ומקומות אכילה' });
  await food.locator('.section-header-toggle').click();
  await food.getByRole('radio').first().waitFor({ state: 'detached' });
  await shot('picker-folded');
  // A search shows every match, folded or not.
  await picker.getByPlaceholder('חיפוש מקום ברשימה').fill('Szimpla');
  await picker.getByRole('radio', { name: /Szimpla/ }).waitFor();
  await picker.getByPlaceholder('חיפוש מקום ברשימה').fill('');
  await food.getByRole('radio').first().waitFor({ state: 'detached' });
  await food.locator('.section-header-toggle').click();
  await food.getByRole('radio', { name: /Mazel Tov/ }).waitFor();
  await picker.getByPlaceholder('חיפוש מקום ברשימה').fill('ארמון');
  await picker.getByRole('radio', { name: /כנסיית מתיאש/ }).waitFor({ state: 'detached' });
  await shot('picker-search');
  await picker.getByRole('radio', { name: /ארמון בודה/ }).click();
  await page.getByText('יוצאים מ…').waitFor({ state: 'detached' });
});

await step('the sheet now measures from the chosen place', async () => {
  await travel().getByText('מ־ארמון בודה').waitFor();
  // The walk the fake Routes answer gives for castle → bastion.
  const walk = Math.round(Math.round(Math.round(meters({ lat: 47.4962, lng: 19.0396 }, { lat: 47.5022, lng: 19.0347 })) / 1.3) / 60);
  await travel().getByText(`${walk} דק'`).first().waitFor();
  await shot('details-from-place');
  await closeModal();
});

await step('the card and other places keep the city centre', async () => {
  const card = page.locator('.plan-card', { hasText: 'מבצר הדייגים' }).first();
  const now = (await card.innerText()).replace(/\s+/g, ' ');
  if (now !== cardBefore) throw new Error(`card changed: "${cardBefore}" → "${now}"`);
  await page.locator('.plan-card', { hasText: 'גשר השלשלאות' }).first().click();
  await travel().getByText('ממרכז בודפשט').waitFor();
  await closeModal();
});

await step('the choice is saved on the place', async () => {
  await page.reload();
  await page.locator('.trip-card').getByText('פתח טיול').click();
  await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
  await page.locator('.plan-card', { hasText: 'מבצר הדייגים' }).first().click();
  await travel().getByText('מ־ארמון בודה').waitFor();
});

await step('the pinned row brings back the city centre', async () => {
  await travel().click();
  await modal().getByRole('radio', { name: /מרכז בודפשט/ }).click();
  await page.getByText('יוצאים מ…').waitFor({ state: 'detached' });
  await travel().getByText('ממרכז בודפשט').waitFor();
  await closeModal();
});

await step('offline: the pick is kept, the times come back online', async () => {
  await ctx.setOffline(true);
  await page.locator('.plan-card', { hasText: 'מבצר הדייגים' }).first().click();
  await travel().click();
  await modal().getByRole('radio', { name: /Mazel Tov/ }).click();
  await page.getByText('יוצאים מ…').waitFor({ state: 'detached' });
  await travel().getByText('מ־Mazel Tov').waitFor();
  await travel().getByText('אין חיבור', { exact: false }).waitFor();
  await shot('offline-pick');
  await ctx.setOffline(false);
  await travel().locator('.lucide-footprints').waitFor({ timeout: 20000 });
  await closeModal();
});

await step('dark mode', async () => {
  await page.locator('button[aria-label="עבור למצב כהה"]').click();
  await page.locator('.plan-card', { hasText: 'מבצר הדייגים' }).first().click();
  await shot('dark-details');
  await travel().click();
  await shot('dark-picker');
  await closeModal();
});

if (errors.length) { console.log('  console errors:', errors); failed++; }
console.log(`  screenshots: ${out} (${n})`);
await browser.close();
process.exit(failed ? 1 : 0);
