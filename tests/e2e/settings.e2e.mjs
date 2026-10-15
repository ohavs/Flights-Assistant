// Settings, on the web: export a trip to PDF / Word / Excel, back it up to
// a file and import it back. The trip card no longer carries a backup
// button, and a trip's header opens settings with that trip and tab picked.
//   bash scripts/run-e2e.sh tests/e2e/settings.e2e.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `.e2e/settings-fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
}
const sheet = () => page.getByRole('dialog', { name: 'הגדרות' });
const openSettings = async () => { await page.getByRole('button', { name: 'הגדרות', exact: true }).click(); await sheet().waitFor(); };
const closeSettings = async () => { await sheet().getByRole('button', { name: 'סגור' }).first().click(); await sheet().waitFor({ state: 'detached' }); };
// The file's bytes. (Headless Chromium drops a Hebrew download name, so
// the test checks what is inside, not the name.)
const download = async (click) => {
  const [d] = await Promise.all([page.waitForEvent('download'), click()]);
  return readFile(await d.path());
};

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('settings@example.com'));
await page.getByText('צור טיול ראשון').click();
await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('גיבויים');
await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('רומא');
await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
await page.locator('.trip-card').getByText('פתח טיול').waitFor();

await step('the trip card has no backup button, the home has no import button', async () => {
  if (await page.locator('.trip-card [title="ייצוא גיבוי JSON"]').count()) throw new Error('backup button on the card');
  if (await page.locator('[title="ייבוא טיול מגיבוי"]').count()) throw new Error('import button on the home screen');
});

await step('settings open on the web with export and backup', async () => {
  await openSettings();
  await sheet().getByText('ייצוא לקובץ').waitFor();
  await sheet().getByText('גיבוי ושחזור').waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '.e2e/settings-web.png' });
});

await step('export to PDF downloads a .pdf', async () => {
  const bytes = await download(() => sheet().getByRole('button', { name: 'ייצוא ל-PDF' }).click());
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('not a PDF');
  await sheet().getByText('הקובץ ירד למכשיר').waitFor();
});

await step('export to Excel downloads a .xlsx', async () => {
  const bytes = await download(() => sheet().getByRole('button', { name: 'ייצוא ל-Excel' }).click());
  if (bytes.subarray(0, 2).toString() !== 'PK') throw new Error('not an xlsx');
});

let backupPath = null;
await step('backup downloads a .json and records the date', async () => {
  const bytes = await download(() => sheet().getByRole('button', { name: /גיבוי של גיבויים/ }).click());
  backupPath = '.e2e/settings-backup.json';
  await writeFile(backupPath, bytes);
  const json = JSON.parse(bytes.toString('utf8'));
  if (json.version !== 1 || json.trip?.name !== 'גיבויים') throw new Error('unexpected backup');
  await sheet().getByText('גיבוי אחרון:').waitFor();
});

await step('importing the backup adds a trip', async () => {
  await sheet().locator('[data-testid="backup-import"]').setInputFiles(backupPath);
  await sheet().getByText('"גיבויים (יובא)" נוסף לרשימת הטיולים').waitFor();
  await closeSettings();
  await page.locator('.trip-card', { hasText: 'גיבויים (יובא)' }).waitFor();
});

await step('a bad file says so', async () => {
  await openSettings();
  await sheet().locator('[data-testid="backup-import"]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  await sheet().getByText('זה לא קובץ גיבוי של עוזר טיסות').waitFor();
  await closeSettings();
});

await step("a trip's header opens settings on that trip and tab", async () => {
  await page.locator('.trip-card', { hasText: 'רומא' }).filter({ hasNotText: '(יובא)' }).getByText('פתח טיול').click();
  await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
  await openSettings();
  const sel = sheet().locator('#settings-trip');
  const picked = await sel.evaluate(el => el.options[el.selectedIndex].text);
  if (picked !== 'גיבויים') throw new Error(`trip ${picked}`);
  const pressed = await sheet().locator('.chip[aria-pressed="true"]').innerText();
  if (pressed !== 'תכנון') throw new Error(`scope ${pressed}`);
  await closeSettings();
});

await browser.close();
if (failed) { console.log(`settings: ${failed} failed`); process.exit(1); }
console.log('settings: all passed');
