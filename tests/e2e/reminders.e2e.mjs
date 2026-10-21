// The reminders sheet on a trip of two: the composer is one box (text and
// send, then whose it is and when), every avatar and the chosen one's ring
// are whole on screen, the time chip is a pill with a short time, and the
// sheet keeps one height across its filters. Light and dark.
//   bash scripts/run-e2e.sh tests/e2e/reminders.e2e.mjs
// Screenshots: .e2e/reminders/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = '.e2e/reminders';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', e => console.log('        page error:', e.message));
let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${out}/fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
}

const DB = 'http://127.0.0.1:8080/v1/projects/demo-flights/databases/(default)/documents';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const value = (v) => typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'string' ? { stringValue: v }
  : typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(value) } }
  : { mapValue: { fields: fields(v) } };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, value(v)]));
const put = (path, data) => fetch(`${DB}/${path}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: fields(data) }) })
  .then(r => { if (!r.ok) throw new Error(`${path}: ${r.status}`); });

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
const signIn = (email) => page.evaluate((e) => window.__e2eSignIn(e).then(c => c.user.uid), email);
const noa = await signIn('noa@example.com');
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1500);
const me = await signIn('rem-owner@example.com');
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1500);
await put(`users/${noa}`, { displayName: 'נועה', email: 'noa@example.com' });
await put('trips/rem', {
  name: 'רומא', destination: 'רומא, איטליה', dates: '12.11.2026 - 18.11.2026',
  members: { [me]: 'owner', [noa]: 'editor' }, memberIds: [me, noa],
});
await put('trips/rem/reminders/r1', { text: 'לקנות כרטיסים לקולוסיאום', createdAt: 1, completed: false, addedByUid: me, addedByName: 'אני' });
await put('trips/rem/reminders/r2', { text: 'להזמין שולחן בטרסטוורה', createdAt: 2, completed: true, addedByUid: noa, addedByName: 'נועה' });
await put('trips/rem/reminders/r3', { text: 'להחליף כסף', createdAt: 3, completed: false, addedByUid: noa, addedByName: 'נועה' });

const sheet = page.getByRole('dialog', { name: 'תזכורות' });
for (const theme of ['light', 'dark']) {
  await page.goto('http://localhost:5173/');
  await page.locator('.trip-card', { hasText: 'רומא' }).waitFor();
  if (theme === 'dark' && await page.locator('button[aria-label="עבור למצב כהה"]').count()) {
    await page.locator('button[aria-label="עבור למצב כהה"]').click();
  }
  await page.locator('.trip-card', { hasText: 'רומא' }).getByText('פתח טיול').click();
  await page.locator(`nav button.nav-item[aria-label="צ'קליסט"]`).click();
  await page.locator('button[aria-label="תזכורות"]').click();
  await sheet.waitFor();
  await page.waitForTimeout(400);

  await step(`${theme}: whose it is: both avatars and the chosen one's ring are whole`, async () => {
    const owners = sheet.locator('.reminder-composer [role="radiogroup"][aria-label="של מי"] [role="radio"]');
    if (await owners.count() !== 2) throw new Error(`${await owners.count()} avatars`);
    if (await owners.first().getAttribute('aria-checked') !== 'true') throw new Error('I am not chosen by default');
    // Nothing between an avatar and the sheet clips it, and the ring
    // (4px around it) is inside the composer box.
    const bad = await owners.evaluateAll(els => els.flatMap(el => {
      const r = el.getBoundingClientRect();
      const box = el.closest('.reminder-composer').getBoundingClientRect();
      const issues = [];
      for (let p = el.parentElement; p && !p.classList.contains('reminder-composer'); p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') issues.push(`clipped by ${p.className}`);
      }
      if (r.left - 4 < box.left || r.right + 4 > box.right || r.top - 4 < box.top || r.bottom + 4 > box.bottom) issues.push('ring outside the box');
      return issues;
    }));
    if (bad.length) throw new Error(bad.join(', '));
    await owners.nth(1).tap();
    if (await owners.nth(1).getAttribute('aria-checked') !== 'true') throw new Error('the tap did not choose her');
    await owners.first().tap();
  });

  await step(`${theme}: the time chip is a pill; once set it is short and clears with ✕`, async () => {
    const chip = sheet.getByRole('button', { name: 'שעה להתראה' });
    const fit = await chip.evaluate(el => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, spill: el.scrollWidth - el.clientWidth }));
    if (fit.w < fit.h * 2.5 || fit.spill > 1) throw new Error(`the time chip is squeezed: ${JSON.stringify(fit)}`);
    await page.screenshot({ path: `${out}/${theme}-1-composer.png` });
    await chip.tap();
    await page.getByRole('button', { name: 'אישור', exact: true }).tap();      // today, 12:00
    const set = sheet.locator('.chip.reminder-when[aria-pressed="true"]');
    await set.waitFor();
    if (!(await set.innerText()).includes('היום · 12:00')) throw new Error(`the chip says ${await set.innerText()}`);
    await page.getByPlaceholder('כתוב תזכורת ושלח...').fill('לבדוק שעות פתיחה בוותיקן');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/${theme}-2-time-set.png` });
    await set.getByRole('button', { name: 'בלי שעה' }).tap();
    await chip.waitFor();
    await page.getByPlaceholder('כתוב תזכורת ושלח...').fill('');
  });

  await step(`${theme}: one height for every filter`, async () => {
    const heights = [];
    for (let i = 0; i < 3; i++) {
      await sheet.locator('.segmented button').nth(i).tap();
      await page.waitForTimeout(250);
      heights.push(Math.round((await sheet.boundingBox()).height));
    }
    if (new Set(heights).size !== 1) throw new Error(`the sheet changes height: ${heights}`);
    await sheet.locator('.segmented button').nth(0).tap();
  });

  await sheet.locator('button[aria-label="סגור"]').first().click();
  await sheet.waitFor({ state: 'detached' });
}

await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
