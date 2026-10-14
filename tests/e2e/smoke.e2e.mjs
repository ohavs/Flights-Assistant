// Browser smoke test of the real app (production build) against the Firebase
// emulators. Run with:  npm run test:e2e
// Exits non-zero if any check fails. Screenshots go to the directory in argv[2].
import { chromium } from 'playwright';

const shots = process.argv[2] || '.e2e';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.on('dialog', dialog => dialog.accept());

const errors = [];
page.on('console', m => {
  // External fonts / map tiles may be blocked in CI sandboxes — not app errors
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text().slice(0, 200));
});

let failed = 0;
let shotCount = 0;
const card = (text) => page.locator('.trip-card', { hasText: text });

async function step(name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (e) {
    await page.screenshot({ path: `${shots}/fail-${++shotCount}.png` });
    console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`);
    console.log('  console errors:', errors);
    await browser.close();
    process.exit(1);
  }
}

function check(name, ok) {
  console.log(`  ${ok ? 'ok   ' : 'FAIL '} ${name}`);
  if (!ok) failed++;
}

await step('open app', () => page.goto('http://localhost:5173/'));
await step('sign in (first login seeds the demo trip)', async () => {
  await page.getByText('התחבר עם Google').waitFor();
  await page.evaluate(() => window.__e2eSignIn('owner@example.com'));
  await page.getByText('טיולים מתוכננים').waitFor();
  await card('פראג').first().waitFor();
});
await page.waitForTimeout(3000);
check('demo trip is still listed a few seconds after first login', await card('פראג').count() === 1);

await step('create a trip', async () => {
  await page.locator('button:has(svg.lucide-plus)').first().click();
  await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('טיול בדיקה');
  await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('רומא');
  await page.getByText('צור טיול').click();
  await card('טיול בדיקה').waitFor();
});

await step('save the flight & hotel form', async () => {
  await card('פראג').click();
  await page.getByText('ערוך את כל פרטי הנסיעה').click();
  await page.getByText('שמור את כל השינויים').click();
  await page.locator('.modal-overlay').waitFor({ state: 'detached' });
  await page.locator('header.app-header button').first().click();
  await page.getByText('טיולים מתוכננים').waitFor();
  await page.waitForTimeout(1500);
});
check('trip keeps its name after saving the form', await card('פראג - סוף שבוע אירופאי קלאסי').count() === 1);
await page.screenshot({ path: `${shots}/home-after-save.png` });

await step('delete a trip', () => card('טיול בדיקה').locator('button[title="מחק טיול"]').click());
await page.waitForTimeout(2000);
check('deleted trip leaves the list without a reload', await card('טיול בדיקה').count() === 0);

await step('reload', async () => {
  await page.reload();
  await page.getByText('טיולים מתוכננים').waitFor();
  await page.waitForTimeout(2000);
});
check('after reload: edited trip still there', await card('פראג - סוף שבוע אירופאי קלאסי').count() === 1);
check('after reload: deleted trip still gone', await card('טיול בדיקה').count() === 0);
check('no console errors', errors.length === 0);
if (errors.length) console.log('  console errors:', errors);

await browser.close();
process.exit(failed ? 1 : 0);
