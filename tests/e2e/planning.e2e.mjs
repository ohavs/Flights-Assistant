// The planning tab, every state, light and dark: a walkthrough of each flow
// (places, filters, options, details, forms, days, activities) that also
// saves a screenshot of each screen for design review.
//   bash scripts/run-e2e.sh tests/e2e/planning.e2e.mjs
// Output: <argv[2]>/planning/<nn>-<theme>-<name>.png. Exits non-zero if a
// step fails.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = `${process.argv[2] || '.e2e'}/planning`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(10000);
page.on('dialog', d => d.accept());
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text().slice(0, 200)); });

let n = 0, failed = 0, theme = 'light';
async function shot(name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${theme}-${name}.png` });
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
// Every sheet sits in a .modal-overlay with a "סגור" button in its header.
// Closes them all, top first (a form can sit on top of a details sheet).
const closeModal = async () => {
  for (let i = 0; i < 4 && await page.locator('.modal-overlay').count(); i++) {
    const close = page.locator('.modal-overlay button[aria-label="סגור"]').last();
    const leave = page.getByRole('button', { name: 'צא בלי לשמור' });
    if (await leave.count()) await leave.click();
    else if (await close.count()) await close.click();
    else await page.locator('.modal-overlay').last().click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(350);
  }
};

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('planner@example.com'));
await page.getByText('טיולים מתוכננים').waitFor();
await page.getByText('צור טיול ראשון').click();
await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('בודפשט עם המאומצות');
await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('בודפשט');
await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
await page.locator('.trip-card').getByText('פתח טיול').click();
await page.getByText('טיסת הלוך').first().waitFor();
await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();

await step('empty places list', async () => {
  await page.getByText('עוד אין מקומות ברשימה').first().waitFor();
  await shot('pool-empty');
});

async function addPlace({ title, category, must, booking, address }) {
  await page.locator('button.fab', { hasText: 'יעד חדש' }).click();
  await modal().getByPlaceholder('למשל: תצפית שקיעה בגבעה').fill(title);
  if (category) {
    await modal().getByText('אטרקציות ודברים לעשות', { exact: true }).first().click();
    await page.getByText(category, { exact: true }).last().click();
  }
  if (must) await modal().getByText('חובה', { exact: true }).first().click();
  if (booking) await modal().getByText('צריך לסגור / להזמין', { exact: false }).first().click();
  if (address) await modal().getByPlaceholder('כתובת או קישור למפה').first().fill(address);
  if (n === 1) await shot('place-form');
  await modal().locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  await page.getByText(title).first().waitFor();
}

await step('add places of several kinds', async () => {
  await addPlace({ title: 'מבצר הדייגים', must: true, booking: true, address: 'Szentháromság tér, Budapest' });
  await addPlace({ title: 'Mazel Tov', category: 'מסעדות ומקומות אכילה' });
  await addPlace({ title: 'גשר השלשלאות', category: 'מקומות לבקר' });
  await addPlace({ title: 'מרחצאות סצ\'ני', booking: true });
  await addPlace({ title: 'טיפ: כרטיס תחבורה ל-72 שעות', category: 'מידע כללי וטיפים' });
  await shot('pool-list');
});

await step('search opens from its round button and closes with X', async () => {
  await page.getByRole('button', { name: 'חיפוש', exact: true }).click();
  await page.getByPlaceholder('חיפוש מקומות').fill('גשר');
  await page.getByText('מבצר הדייגים').first().waitFor({ state: 'detached' });
  await shot('pool-search');
  await page.getByRole('button', { name: 'סגור חיפוש' }).click();
  await page.getByPlaceholder('חיפוש מקומות').waitFor({ state: 'detached' });
  await page.getByText('מבצר הדייגים').first().waitFor();
});

await step('category filter', async () => {
  await page.locator('[title="סינון לפי קטגוריה"]').click();
  await shot('pool-category-menu');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
});

await step('options menu', async () => {
  await page.locator('[title="מיון ותצוגה"]').click();
  await shot('pool-options-menu');
});

await step('compact layout', async () => {
  await page.getByText('קומפקטי', { exact: true }).click();
  await page.mouse.click(5, 5);
  await shot('pool-compact');
});

await step('grid layout', async () => {
  await page.locator('[title="מיון ותצוגה"]').click();
  await page.getByText('רשת', { exact: true }).click();
  await page.mouse.click(5, 5);
  await shot('pool-grid');
});

await step('group by category', async () => {
  await page.locator('[title="מיון ותצוגה"]').click();
  await page.getByText('עמודת זמן', { exact: true }).click();
  await page.getByText('קטגוריה', { exact: true }).first().click();
  await page.mouse.click(5, 5);
  await shot('pool-grouped');
});

await step('place details sheet', async () => {
  await page.getByText('מבצר הדייגים').first().click();
  await modal().getByText('סמן שביקרנו').waitFor();
  await shot('place-details');
  await closeModal();
});

await step('edit place form', async () => {
  await page.getByText('מבצר הדייגים').first().click();
  await modal().getByText('עריכה', { exact: true }).click();
  await modal().getByText('עריכת פריט תכנון').waitFor();
  await shot('place-edit');
  await closeModal();
});

await step('closing an unchanged edit does not ask about unsaved changes', async () => {
  await page.getByText('מבצר הדייגים').first().click();
  await modal().getByText('עריכה', { exact: true }).click();
  await modal().getByText('עריכת פריט תכנון').waitFor();
  await modal().locator('button[aria-label="סגור"]').last().click();
  await page.getByText('עריכת פריט תכנון').waitFor({ state: 'detached', timeout: 3000 });
  if (await page.getByRole('button', { name: 'צא בלי לשמור' }).count()) throw new Error('asked about unsaved changes');
  await closeModal();
});

await step('closing a changed edit asks first', async () => {
  await page.getByText('מבצר הדייגים').first().click();
  await modal().getByText('עריכה', { exact: true }).click();
  await modal().getByPlaceholder('למשל: תצפית שקיעה בגבעה').fill('מבצר הדייגים!');
  await modal().locator('button[aria-label="סגור"]').last().click();
  await page.getByRole('button', { name: 'צא בלי לשמור' }).click();
  await page.getByText('עריכת פריט תכנון').waitFor({ state: 'detached', timeout: 3000 });
  await closeModal();
});

await step('category settings', async () => {
  await page.locator('[title="מיון ותצוגה"]').click();
  await page.getByText('הגדרות קטגוריות', { exact: false }).first().click();
  await modal().waitFor();
  await shot('category-settings');
  // Each change writes that one category only (src/lib/categorySettings.js).
  await modal().locator('button.chip.add', { hasText: 'קטגוריה' }).click();
  await modal().getByPlaceholder('שם הקטגוריה החדשה').fill('חופים');
  await modal().getByRole('button', { name: 'הוסף', exact: true }).click();
  const card = modal().locator('div', { has: page.locator('span', { hasText: /^חופים$/ }) })
    .filter({ has: page.locator('[title="מחק קטגוריה"]') }).last();
  await card.waitFor();
  await card.locator('[title="מחק קטגוריה"]').click();
  await page.getByRole('button', { name: 'מחק', exact: true }).click();
  await modal().locator('span', { hasText: /^חופים$/ }).waitFor({ state: 'detached', timeout: 5000 });
  await closeModal();
});

await step('a category takes an emoji from the keyboard, of any kind, and an icon takes it back', async () => {
  await page.locator('[title="מיון ותצוגה"]').click();
  await page.getByText('הגדרות קטגוריות', { exact: false }).first().click();
  await modal().waitFor();
  const field = modal().getByLabel("אימוג'י למסעדות ומקומות אכילה");
  await field.scrollIntoViewIfNeeded();
  // Not an emoji: refused, nothing saved.
  await field.fill('abc');
  await modal().getByText('רק אימוג׳י').waitFor();
  if ((await field.inputValue()) !== '') throw new Error('letters were taken');
  // A family (a ZWJ sequence), then a flag: each kept whole.
  for (const e of ['👨‍👩‍👧‍👦', '🇮🇱']) {
    await field.fill(e);
    await page.waitForFunction((v) => [...document.querySelectorAll('.modal-overlay .cat-emoji')].some(el => el.textContent === v), e, { timeout: 5000 });
    if ((await field.inputValue()) !== e) throw new Error(`the field holds ${await field.inputValue()}`);
  }
  await shot('category-emoji');
  await closeModal();
  // The list wears it: the restaurant's disc, and its stub (no address).
  const card = page.locator('.plan-card', { hasText: 'Mazel Tov' }).first();
  await card.locator('.cat-emoji', { hasText: '🇮🇱' }).first().waitFor();
  await shot('pool-emoji');
  // An icon replaces it.
  await page.locator('[title="מיון ותצוגה"]').click();
  await page.getByText('הגדרות קטגוריות', { exact: false }).first().click();
  await modal().waitFor();
  const row = modal().locator('div', { has: page.getByLabel("אימוג'י למסעדות ומקומות אכילה") }).last();
  await row.locator('button[title="Coffee"]').click();
  await page.waitForFunction(() => document.querySelector('.modal-overlay input[aria-label="אימוג\'י למסעדות ומקומות אכילה"]')?.value === '', null, { timeout: 5000 });
  await closeModal();
  if (await card.locator('.cat-emoji').count()) throw new Error('the emoji stayed on the card');
});

await step('a place with a date and time: optional, and the loudest thing on its card in every layout', async () => {
  const title = 'סיור לילה בפרלמנט';
  await page.locator('button.fab', { hasText: 'יעד חדש' }).click();
  await modal().getByPlaceholder('למשל: תצפית שקיעה בגבעה').fill(title);
  const when = modal().locator('.place-when');
  await when.getByText('מתי? (לא חובה)').waitFor();
  // A time alone is not saved: it asks for a day.
  await when.locator('.picker-field', { hasText: 'בחר שעה' }).click();
  const time = (await page.locator('.picker-readout').innerText()).trim();
  await page.getByRole('button', { name: 'בחירה', exact: true }).click();
  await modal().locator('.sheet-footer button[type="submit"]').click();
  await when.getByText('בחרו תאריך לשעה הזאת').waitFor();
  await when.locator('.picker-field', { hasText: 'בחר תאריך' }).click();
  await page.getByRole('button', { name: 'בחירה', exact: true }).click();     // today
  await shot('place-form-when');
  await modal().locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  const card = page.locator('.plan-card', { hasText: title }).first();
  await card.scrollIntoViewIfNeeded();
  // The stub: when, solid.
  const stub = card.locator('.pstub-stub.when');
  const text = (await stub.innerText()).replace(/\s+/g, ' ');
  if (!text.includes('היום') || !text.includes(time)) throw new Error(`stub says "${text}", not today ${time}`);
  const look = await stub.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
  if (look.fg !== 'rgb(255, 255, 255)' || /rgba\(.*, 0\)|transparent/.test(look.bg)) throw new Error(`the stub is not solid: ${JSON.stringify(look)}`);
  await shot('pool-when-stub');
  // Compact: a leaf at the row's end.
  await page.locator('[title="מיון ותצוגה"]').click();
  await page.getByText('קומפקטי', { exact: true }).click();
  await page.mouse.click(5, 5);
  const leaf = page.locator('.plan-card', { hasText: title }).first().locator('.plan-when-leaf');
  if (!(await leaf.innerText()).includes(time)) throw new Error(`leaf says ${await leaf.innerText()}`);
  await shot('pool-when-compact');
  // Grid: a solid line under the name.
  await page.locator('[title="מיון ותצוגה"]').click();
  await page.getByText('רשת', { exact: true }).click();
  await page.mouse.click(5, 5);
  const chip = page.locator('.plan-card', { hasText: title }).first().locator('.plan-when-chip');
  if (!(await chip.innerText()).includes(`היום`) || !(await chip.innerText()).includes(time)) throw new Error(`chip says ${await chip.innerText()}`);
  await shot('pool-when-grid');
  await page.locator('[title="מיון ותצוגה"]').click();
  await page.getByText('עמודת זמן', { exact: true }).click();
  await page.mouse.click(5, 5);
  // The details sheet says it too; the edit form clears it.
  await page.locator('.plan-card', { hasText: title }).first().locator('.pstub-title').click();
  await modal().locator('.modal-header').getByText(time, { exact: false }).waitFor();
  await modal().getByText('עריכה', { exact: true }).click();
  await modal().getByRole('button', { name: 'בלי תאריך ושעה' }).click();
  await modal().locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  if (await page.locator('.plan-card', { hasText: title }).first().locator('.pstub-stub.when').count()) throw new Error('the date stayed');
});

await step('daily plan: empty', async () => {
  await page.getByRole('tab', { name: /לוח זמנים/ }).click();
  await page.getByText('עוד אין ימי טיול').first().waitFor();
  await shot('days-empty');
});

await step('daily plan: add a day', async () => {
  await page.locator('button.fab', { hasText: 'יום חדש' }).click();
  await page.waitForTimeout(400);
  if (await page.locator('.modal-content').count()) {
    await shot('day-form');
    await modal().getByRole('button', { name: /שמור|הוסף/ }).last().click();
  }
  await page.getByText('הוסף פעילות').first().waitFor();
  await shot('days-one');
});

await step('daily plan: add activities', async () => {
  for (const what of ['ארוחת בוקר במלון', 'סיור ברובע היהודי']) {
    await page.getByText('הוסף פעילות').first().click();
    await modal().waitFor();
    if (what === 'ארוחת בוקר במלון') await shot('activity-form');
    await modal().getByPlaceholder('למשל: נסיעה ברכבת, ארוחת צהריים, ביקור במוזיאון').fill(what);
    await modal().locator('.sheet-footer button[type="submit"]').click();
    await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
    await page.getByText(what).first().waitFor();
  }
  await shot('days-activities');
});

await step('daily plan: activity actions sheet moves an activity', async () => {
  await page.locator('button[aria-label="פעולות: ארוחת בוקר במלון"]').click();
  await page.getByRole('dialog', { name: 'ארוחת בוקר במלון' }).waitFor();
  await shot('activity-actions');
  await page.getByRole('button', { name: 'הזז למטה' }).click();
  await page.waitForTimeout(600);
  const order = await page.evaluate(() => {
    const text = document.body.innerText;
    return [text.indexOf('סיור ברובע היהודי'), text.indexOf('ארוחת בוקר במלון')];
  });
  if (!(order[0] >= 0 && order[0] < order[1])) throw new Error(`order did not change: ${order}`);
});

await step('daily plan: summary layout', async () => {
  const toggle = page.locator('button[aria-label="תצוגה מקוצרת"], button[aria-label="תצוגת סיכום"], button[aria-label="תצוגה מלאה"]').first();
  await toggle.click();
  await shot('days-summary');
  await toggle.click();
});

await step('activity details', async () => {
  await page.getByText('סיור ברובע היהודי').first().click();
  await page.waitForTimeout(300);
  await page.getByRole('dialog', { name: 'סיור ברובע היהודי' }).waitFor();
  await shot('activity-details');
  await page.getByRole('dialog', { name: 'סיור ברובע היהודי' }).getByRole('button', { name: 'סגור' }).click();
  await page.getByRole('dialog', { name: 'סיור ברובע היהודי' }).waitFor({ state: 'detached' });
});

// Dark mode: the main views again.
theme = 'dark';
await step('dark mode', async () => {
  await page.locator('button[aria-label="עבור למצב כהה"]').click();
  await shot('days-activities');
  await page.getByRole('tab', { name: /מקומות/ }).click();
  await shot('pool-grouped');
  await page.locator('[title="מיון ותצוגה"]').click();
  await shot('pool-options-menu');
  await page.mouse.click(5, 5);
  await page.getByText('מבצר הדייגים').first().click();
  await shot('place-details');
  await closeModal();
  await page.locator('button.fab', { hasText: 'יעד חדש' }).click();
  await shot('place-form');
  await closeModal();
});

if (errors.length) { console.log('  console errors:', errors); failed++; }
console.log(`  screenshots: ${out} (${n})`);
await browser.close();
process.exit(failed ? 1 : 0);
