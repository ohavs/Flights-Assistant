// A new version of the app pops up (the owner's ask), on top of the banner:
// once for a version, and not again on the next launch the same day.
// The web app has no updater; the test hands it a release
// (window.__e2eUpdate, read by checkForUpdateQuietly).
//   bash scripts/run-e2e.sh tests/e2e/updates.e2e.mjs
// Screenshots: .e2e/updates/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = `${process.argv[2] || '.e2e'}/updates`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  window.__e2eUpdate = {
    available: true,
    current: { name: '1.0.232', code: 232 },
    latest: {
      versionName: '1.0.240', versionCode: 240, sizeMb: 9.8, sha256: 'a'.repeat(64), url: 'https://example.com/app.apk',
      notes: ['התראה כשמתקרבים למקום', 'מקום שהסרתם ממנו שעות לא ימולא שוב', 'הודעה קופצת על גרסה חדשה'],
    },
  };
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let failed = 0, n = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${out}/fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {});
  }
}
const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const popup = () => page.getByRole('dialog', { name: 'יש גרסה חדשה לאפליקציה' });

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('updates@example.com'));

await step('a new version pops up, with what is new in it', async () => {
  await popup().waitFor();
  await popup().getByText('גרסה 1.0.240 · 9.8MB').waitFor();
  await popup().getByText('התראה כשמתקרבים למקום').waitFor();
  await shot('popup');
});

await step('"אחר כך" closes it, and the banner stays', async () => {
  await popup().getByRole('button', { name: 'אחר כך' }).click();
  await popup().waitFor({ state: 'detached' });
  await page.locator('.update-banner', { hasText: 'גרסה 1.0.240 זמינה' }).waitFor();
  await shot('banner');
});

await step('the next launch the same day: the banner, not the popup again', async () => {
  await page.reload();
  await page.locator('.update-banner', { hasText: 'גרסה 1.0.240 זמינה' }).waitFor();
  await page.waitForTimeout(800);
  if (await popup().count()) throw new Error('popped up again the same day');
});

await step('a newer version than the one shown pops up at once', async () => {
  await page.evaluate(() => { window.__e2eUpdate.latest = { ...window.__e2eUpdate.latest, versionName: '1.0.241', versionCode: 241 }; });
  await page.addInitScript(() => { window.__e2eUpdate.latest = { ...window.__e2eUpdate.latest, versionName: '1.0.241', versionCode: 241 }; });
  await page.reload();
  await popup().getByText(/גרסה 1\.0\.241/).waitFor();
  // "עדכן עכשיו" leads to the settings (the download itself is the app's).
  await popup().getByRole('button', { name: 'עדכן עכשיו' }).click();
  await page.getByRole('dialog', { name: 'הגדרות' }).waitFor();
});

if (errors.length) { console.log('  page errors:', errors); failed++; }
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
