// Settings → "מראה": light, dark or the phone's setting, and five full
// palettes. Each palette in each mode keeps text on the brand button and
// accent text on a card readable (≥ 4.5), and changes the page itself,
// not only the accent. The choice survives a reload; the header switch
// still flips light/dark.
//   bash scripts/run-e2e.sh tests/e2e/themes.e2e.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', colorScheme: 'light' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `.e2e/themes-fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
}

// Contrast of an element's text against the first opaque background behind it.
const contrast = (sel) => page.locator(sel).evaluate((el) => {
  const parse = (c) => { const p = c.match(/rgba?\(([^)]+)\)/)[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  let n = el, bg = null;
  while (n) { bg = parse(getComputedStyle(n).backgroundColor); if (bg.a > 0.5) break; n = n.parentElement; }
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const a = lum(parse(getComputedStyle(el).color)), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
});
const attr = (name) => page.evaluate((n) => document.documentElement.getAttribute(n), name);
const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const sheet = () => page.getByRole('dialog', { name: 'הגדרות' });
const openLook = async () => {
  await page.getByRole('button', { name: 'הגדרות', exact: true }).click();
  await sheet().waitFor();
  const group = sheet().locator('.section-header-toggle', { hasText: 'מראה' });
  if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click();
  await sheet().getByRole('radiogroup', { name: 'ערכת צבעים' }).waitFor();
};
const closeSheet = async () => { await sheet().getByRole('button', { name: 'סגור' }).first().click(); await sheet().waitFor({ state: 'detached' }); };

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('themes@example.com'));
await page.getByText('צור טיול ראשון').click();
await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('צבעים');
await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('אתונה');
await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
await page.locator('.trip-card').waitFor();

// A brand button and accent text on a card, to measure in each palette.
await page.evaluate(() => {
  const card = document.querySelector('.trip-card');
  const b = document.createElement('button'); b.id = 'e2e-brand'; b.className = 'btn-primary'; b.textContent = 'שמור';
  const t = document.createElement('span'); t.id = 'e2e-accent'; t.style.color = 'var(--accent)'; t.style.fontWeight = '800'; t.textContent = 'פתח טיול';
  card.append(b, t);
});

await step('a fresh device follows the phone, green', async () => {
  if ((await attr('data-theme')) !== 'light' || (await attr('data-palette')) !== 'green') throw new Error(`${await attr('data-theme')} ${await attr('data-palette')}`);
  await ctx.storageState();   // nothing to do; the context was created light
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light');
});

const seen = new Set();
for (const palette of ['ירוק', 'כחול ים', 'סגול', 'שקיעה', 'חול חם']) {
  for (const mode of ['בהיר', 'כהה']) {
    await step(`${palette}, ${mode}: readable, and the page itself changes`, async () => {
      await openLook();
      await sheet().getByRole('radio', { name: palette }).click();
      await sheet().getByRole('radio', { name: mode }).click();
      if ((await sheet().getByRole('radio', { name: palette }).getAttribute('aria-checked')) !== 'true') throw new Error('palette not marked');
      await page.waitForTimeout(350);
      await page.screenshot({ path: `.e2e/themes-${palette.replace(' ', '-')}-${mode}-settings.png` });
      await closeSheet();
      await page.waitForTimeout(300);
      const brand = await contrast('#e2e-brand');
      const accent = await contrast('#e2e-accent');
      console.log(`        brand ${brand.toFixed(2)} · accent ${accent.toFixed(2)}`);
      if (brand < 4.5) throw new Error(`text on the brand button ${brand.toFixed(2)}`);
      if (accent < 4.5) throw new Error(`accent text on a card ${accent.toFixed(2)}`);
      const bg = await bodyBg();
      if (seen.has(bg)) throw new Error(`page background ${bg} same as another palette/mode`);
      seen.add(bg);
      await page.screenshot({ path: `.e2e/themes-${palette.replace(' ', '-')}-${mode}.png` });
    });
  }
}

await step('the choice survives a reload; the header switch flips light/dark', async () => {
  await page.reload();
  await page.locator('.trip-card').waitFor();
  if ((await attr('data-palette')) !== 'sand' || (await attr('data-theme')) !== 'dark') throw new Error(`${await attr('data-palette')} ${await attr('data-theme')}`);
  await page.locator('button[aria-label="עבור למצב בהיר"]').click();
  if ((await attr('data-theme')) !== 'light' || (await attr('data-palette')) !== 'sand') throw new Error('header switch');
  await openLook();
  if ((await sheet().getByRole('radio', { name: 'בהיר' }).getAttribute('aria-checked')) !== 'true') throw new Error('settings do not show the switch');
  await sheet().getByRole('radio', { name: 'לפי הטלפון' }).click();
  await sheet().getByRole('radio', { name: 'ירוק' }).click();
  await closeSheet();
});

await browser.close();
if (failed) { console.log(`themes: ${failed} failed`); process.exit(1); }
console.log('themes: all passed');
