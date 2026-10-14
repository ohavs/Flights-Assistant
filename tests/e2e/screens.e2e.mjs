// Screenshots of every screen, light and dark, at phone size, for comparing a
// design change before and after. Runs against the emulators like the smoke
// test:  bash scripts/run-e2e.sh tests/e2e/screens.e2e.mjs
// Output: <argv[2]>/screens/<theme>-<nn>-<name>.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = `${process.argv[2] || '.e2e'}/screens`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.on('dialog', d => d.accept());

const tab = (label) => page.locator(`nav button.nav-item[aria-label="${label}"]`).click();
const fab = (label) => page.locator('button.fab', { hasText: label }).click();
const card = (text) => page.locator('.trip-card', { hasText: text });
let n = 0;
const settle = () => page.waitForTimeout(600);   // entrance animations
async function shot(theme, name) {
  await settle();
  await page.screenshot({ path: `${out}/${theme}-${String(++n).padStart(2, '0')}-${name}.png` });
}

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await shot('light', 'sign-in');
await page.evaluate(() => window.__e2eSignIn('owner@example.com'));
await page.getByText('טיולים מתוכננים').waitFor();

// Some content, so the screens are not all empty states.
await page.getByText('צור טיול ראשון').click();
await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('סוף שבוע ברומא');
await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('רומא');
await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
await card('סוף שבוע ברומא').waitFor();
await card('סוף שבוע ברומא').getByText('פתח טיול').click();

await tab('טיסה ומלון');
await page.locator('button[title="ערוך פרטי מלון"]').click();
await page.locator('.form-group', { hasText: 'שם המלון' }).locator('input').fill('Hotel Artemide');
await page.getByRole('button', { name: 'שמור', exact: true }).click();
await page.getByText('Hotel Artemide').first().waitFor();

await tab('תכנון טיול');
for (const place of ['הקולוסיאום', 'מזרקת טרווי', 'גלידה ב-Giolitti']) {
  await fab('יעד חדש');
  await page.getByPlaceholder('למשל: תצפית שקיעה בגבעה').fill(place);
  await page.locator('.sheet-footer button[type="submit"]').click();
  await page.getByText(place).first().waitFor();
}

await tab('הוצאות');
for (const [amount, what] of [['42', 'ארוחת ערב'], ['18', 'כרטיסי מטרו']]) {
  await fab('הוצאה חדשה');
  await page.getByPlaceholder('0.00').fill(amount);
  await page.getByPlaceholder('למשל: ארוחת ערב, כרטיסי כניסה...').fill(what);
  await page.getByText('שמור הוצאה').click();
  await page.getByText(what).first().waitFor();
}

for (const theme of ['light', 'dark']) {
  // Home: back out of the trip with the header's back button.
  await page.goto('http://localhost:5173/');
  await card('סוף שבוע ברומא').waitFor();
  if (theme === 'dark' && await page.locator('button[aria-label="עבור למצב כהה"]').count()) {
    await page.locator('button[aria-label="עבור למצב כהה"]').click();
  }
  await shot(theme, 'home');
  await card('סוף שבוע ברומא').getByText('פתח טיול').click();
  for (const [label, name] of [
    ['טיסה ומלון', 'flight'], ['תכנון טיול', 'planning'], ["צ'קליסט", 'checklist'],
    ['הזמנות', 'bookings'], ['הוצאות', 'expenses'],
  ]) {
    await tab(label);
    await shot(theme, name);
  }
  await fab('הוצאה חדשה');
  await shot(theme, 'sheet-expense');
  await page.keyboard.press('Escape');
}

console.log(`screenshots: ${out} (${n})`);
await browser.close();
