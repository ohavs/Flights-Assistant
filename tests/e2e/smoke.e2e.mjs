// Browser smoke test of the real app (production build in emulator mode)
// against the Firebase emulators. Run with:  npm run test:e2e
// Exits non-zero if any check fails. Screenshots go to the directory in argv[2].
import { chromium } from 'playwright';

const shots = process.argv[2] || '.e2e';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);

const errors = [];
let failed = 0;
let shotCount = 0;

async function newUser(email) {
  // Service workers are blocked: on a first visit the PWA worker installs and
  // reloads the page, which would interrupt the test mid-step.
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('dialog', dialog => dialog.accept());
  page.on('pageerror', e => errors.push(`${email}: ${e.message}`));
  page.on('console', m => {
    // External fonts, maps and APIs may be blocked in CI sandboxes — not app errors
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) {
      errors.push(`${email}: ${m.text().slice(0, 200)}`);
    }
  });
  await page.goto('http://localhost:5173/');
  await page.getByText('התחבר עם Google').waitFor();
  await page.evaluate((e) => window.__e2eSignIn(e), email);
  await page.getByText('טיולים מתוכננים').waitFor();
  return page;
}

async function step(page, name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (e) {
    await page.screenshot({ path: `${shots}/fail-${++shotCount}.png` });
    console.log(`  FAIL  ${name}: ${e.message.split('\n').slice(0, 12).join('\n        ')}`);
    console.log('  console errors:', errors);
    await browser.close();
    process.exit(1);
  }
}

function check(name, ok) {
  console.log(`  ${ok ? 'ok   ' : 'FAIL '} ${name}`);
  if (!ok) failed++;
}

const tab = (page, label) => page.locator(`nav button.nav-item[aria-label="${label}"]`).click();
const fab = (page, label) => page.locator('button.fab', { hasText: label }).click();
const card = (page, text) => page.locator('.trip-card', { hasText: text });
const crashed = (page) => page.getByText('משהו השתבש').count();

// Signing in creates the profile — the friend must exist before they can be invited
const friend = await newUser('friend@example.com');
const owner = await newUser('owner@example.com');

await step(owner, 'create a trip', async () => {
  await owner.getByText('עוד אין טיולים').waitFor();
  await owner.getByText('צור טיול ראשון').click();
  await owner.getByPlaceholder('למשל: סוף שבוע בפראג').fill('טיול בדיקה');
  await owner.getByPlaceholder("למשל: פראג, צ'כיה").fill('רומא');
  await owner.getByRole('button', { name: 'צור טיול', exact: true }).click();
  await card(owner, 'טיול בדיקה').waitFor();
});

await step(owner, 'open the trip and visit every tab', async () => {
  await card(owner, 'טיול בדיקה').getByText('פתח טיול').click();
  for (const [label, heading] of [
    ['תכנון טיול', 'תכנון הטיול'],
    ["צ'קליסט", 'רשימת ציוד'],
    ['הזמנות', 'ההזמנות שלנו'],
    ['הוצאות', 'מעקב הוצאות'],
    ['טיסה ומלון', 'טיסת הלוך'],
  ]) {
    await tab(owner, label);
    await owner.getByText(heading).first().waitFor();
    if (await crashed(owner)) throw new Error(`tab "${label}" shows the error screen`);
  }
});

await step(owner, 'add a place', async () => {
  await tab(owner, 'תכנון טיול');
  await fab(owner, 'יעד חדש');
  await owner.getByPlaceholder('למשל: תצפית שקיעה בגבעה').fill('תצפית בדיקה');
  await owner.locator('.sheet-footer button[type="submit"]').click();
  await owner.getByText('תצפית בדיקה').first().waitFor();
});

await step(owner, 'add a checklist item', async () => {
  await tab(owner, "צ'קליסט");
  // Categories start collapsed, so check the item count (the tally beside
  // the filter: "0/22 נארזו") rather than the text
  await owner.locator('.list-progress', { hasText: '/22' }).waitFor();
  await fab(owner, 'פריט חדש');
  await owner.getByPlaceholder('למשל: סוודר, מטען').fill('פריט בדיקה');
  await owner.locator('.sheet-footer button[type="submit"]').click();
  await owner.locator('.list-progress', { hasText: '/23' }).waitFor();
});

await step(owner, 'add an expense', async () => {
  await tab(owner, 'הוצאות');
  await fab(owner, 'הוצאה חדשה');
  await owner.getByPlaceholder('0.00').fill('42');
  await owner.getByPlaceholder('למשל: ארוחת ערב, כרטיסי כניסה...').fill('הוצאת בדיקה');
  await owner.locator('.sheet-footer button[type="submit"]').click();
  await owner.getByText('הוצאת בדיקה').first().waitFor();
});

await step(owner, 'save hotel details (writes the trip document)', async () => {
  await tab(owner, 'טיסה ומלון');
  await owner.locator('button[title="ערוך פרטי מלון"]').click();
  await owner.locator('.form-group', { hasText: 'שם המלון' }).locator('input').fill('מלון בדיקה');
  await owner.getByRole('button', { name: 'שמור', exact: true }).click();
  await owner.getByText('עריכת כל פרטי הנסיעה').waitFor({ state: 'detached' });
  await owner.getByText('מלון בדיקה').first().waitFor();
});

await step(owner, 'reload and find everything still there', async () => {
  await owner.reload();
  await card(owner, 'טיול בדיקה').waitFor();
  await card(owner, 'טיול בדיקה').getByText('פתח טיול').click();
  await owner.getByText('מלון בדיקה').first().waitFor();
  await tab(owner, 'תכנון טיול');
  await owner.getByText('תצפית בדיקה').first().waitFor();
  await tab(owner, "צ'קליסט");
  await owner.locator('.list-progress', { hasText: '/23' }).waitFor();
  await tab(owner, 'הוצאות');
  await owner.getByText('הוצאת בדיקה').first().waitFor();
});
await owner.screenshot({ path: `${shots}/owner-after-reload.png` });

await step(owner, 'share the trip with a friend as editor', async () => {
  await owner.reload();
  await card(owner, 'טיול בדיקה').waitFor();
  await card(owner, 'טיול בדיקה').locator('button[title="שתף וניהול חברים"]').click();
  await owner.getByPlaceholder('example@gmail.com').fill('friend@example.com');
  await owner.getByText('עריכה', { exact: true }).click();
  await owner.getByRole('button', { name: 'שתף', exact: true }).click();
  await owner.getByText('מחפש...').waitFor({ state: 'detached' });
});

await step(friend, 'friend sees the shared trip and its data', async () => {
  await card(friend, 'טיול בדיקה').waitFor();
  await card(friend, 'טיול בדיקה').getByText('פתח טיול').click();
  await tab(friend, 'תכנון טיול');
  await friend.getByText('תצפית בדיקה').first().waitFor();
});
await friend.screenshot({ path: `${shots}/friend-shared-trip.png` });

check('no error screens or console errors', errors.length === 0);
if (errors.length) console.log('  console errors:', errors);

await browser.close();
process.exit(failed ? 1 : 0);
