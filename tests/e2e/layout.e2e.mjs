// Layout regressions at phone widths: nothing in the trip edit form may be
// wider than the screen (a sideways scroll on a phone). Run like the smoke
// test:  bash scripts/run-e2e.sh tests/e2e/layout.e2e.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
let failed = 0;

for (const width of [360, 390, 412]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.goto('http://localhost:5173/');
  await page.getByText('התחבר עם Google').waitFor();
  await page.evaluate((e) => window.__e2eSignIn(e), `layout${width}@example.com`);
  await page.getByText('טיולים מתוכננים').waitFor();
  await page.getByText('צור טיול ראשון').click();
  await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('בודפשט עם המאומצות');
  await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('בודפשט');
  await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
  await page.locator('.trip-card').getByText('פתח טיול').click();
  // The header button talks to the flight tab, which loads lazily.
  await page.getByText('טיסת הלוך').first().waitFor();
  await page.locator('button[title="ערוך פרטי טיסה ומלון"]').click();
  await page.getByText('עריכת כל פרטי הנסיעה').waitFor();

  // Give both pickers of the dates row a date (today, through the picker
  // itself), then the longest month name in each.
  for (const i of [0, 1]) {
    await page.locator('.modal-content .row-2').first().locator('.form-control').nth(i).click();
    await page.getByRole('button', { name: 'בחירה', exact: true }).click();
  }
  const filled = await page.evaluate(() => {
    const row = document.querySelector('.modal-content .row-2');   // trip dates
    const triggers = row ? row.querySelectorAll('.form-control > span') : [];
    for (const t of triggers) {
      const long = t.querySelector('.date-long');
      if (long) {
        long.textContent = '28 באוקטובר 2026';
        t.querySelector('.date-short').textContent = '28 באוק׳ 2026';
      } else {
        t.textContent = '28 באוקטובר 2026';
      }
    }
    return triggers.length;
  });
  if (filled !== 2) { console.log(`  FAIL  ${width}px: expected 2 dated pickers, found ${filled}`); failed++; await ctx.close(); continue; }
  await page.waitForTimeout(100);
  const over = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.modal-content, .modal-content *')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > window.innerWidth + 0.5 || r.left < -0.5)) out.push(`${el.tagName}.${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    const m = document.querySelector('.modal-content');
    return { out: out.slice(0, 5), scroll: m.scrollWidth - m.clientWidth };
  });
  const ok = over.out.length === 0 && over.scroll <= 0;
  console.log(`  ${ok ? 'ok   ' : 'FAIL '} ${width}px: trip edit form fits the screen${ok ? '' : ` (sideways scroll ${over.scroll}px; ${over.out.join(' | ')})`}`);
  await page.locator('.modal-content .row-2').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${process.argv[2] || '.e2e'}/layout-${width}.png` });
  if (!ok) failed++;
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
