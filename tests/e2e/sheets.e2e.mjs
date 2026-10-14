// Every long sheet must scroll with a finger. Drives real touch events (a
// phone viewport with touch) and checks the sheet's content moved.
//   bash scripts/run-e2e.sh tests/e2e/sheets.e2e.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.on('dialog', d => d.accept());
const cdp = await ctx.newCDPSession(page);
let failed = 0;

// A finger swipe from (x, y0) to (x, y1) in small steps.
async function swipe(x, y0, y1) {
  const steps = 12;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
}

// Sum of scrollTop of every scrollable element inside the open sheet(s);
// with max=true, how far they can scroll in all.
const sheetScroll = (max = false) => page.evaluate((max) => {
  let sum = 0;
  for (const el of document.querySelectorAll('.modal-overlay *, [role="dialog"], [role="dialog"] *')) {
    if (el.scrollHeight > el.clientHeight + 2) sum += max ? el.scrollHeight - el.clientHeight : el.scrollTop;
  }
  return sum;
}, max);

async function check(name, open, close) {
  try {
    await open();
    await page.waitForTimeout(500);
    const before = await sheetScroll();
    await swipe(195, 560, 260);           // finger moves up: content should scroll down
    const after = await sheetScroll();
    // …and back up: a downward swipe in scrolled content scrolls, it does
    // not drag the sheet closed.
    await swipe(195, 300, 450);
    const back = await sheetScroll();
    const stillOpen = await page.locator('.modal-overlay, [role="dialog"]').count();
    const range = await sheetScroll(true);
    const ok = after >= Math.min(before + 40, range - 2) && after > before && back < after && stillOpen > 0;
    console.log(`  ${ok ? 'ok   ' : 'FAIL '} ${name} scrolls down and back (${before} → ${after} → ${back}${stillOpen ? '' : ', closed!'})`);
    if (!ok) { failed++; await page.screenshot({ path: `.e2e/sheet-fail-${name.replace(/\W+/g, '_')}.png` }); }
  } catch (e) {
    failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`);
  }
  await close().catch(() => {});
  await page.waitForTimeout(400);
}
// A swipe down from the grab handle closes the sheet (every sheet).
async function dragClose(name, open) {
  try {
    await open();
    await page.waitForTimeout(500);
    const grab = await page.locator('.sheet-grab').last().boundingBox();
    if (!grab) throw new Error('no grab handle');
    await swipe(grab.x + grab.width / 2, grab.y + grab.height / 2, grab.y + 320);
    await page.waitForTimeout(300);
    const left = await page.locator('.modal-overlay, [role="dialog"]').count();
    console.log(`  ${left ? 'FAIL ' : 'ok   '} ${name} closes with a swipe down${left ? ' (still open)' : ''}`);
    if (left) { failed++; await page.screenshot({ path: `.e2e/sheet-drag-${name.replace(/\W+/g, '_')}.png` }); }
  } catch (e) {
    failed++; console.log(`  FAIL  ${name} swipe to close: ${e.message.split('\n')[0]}`);
  }
  await closeAll().catch(() => {});
  await page.mouse.click(5, 5).catch(() => {});
  await page.waitForTimeout(400);
}

// A form with unsaved changes: the save bar sits at the bottom of the
// screen, the drag is off, and ✕, back and "ביטול" each ask before closing.
async function guardsUnsaved(name, open, fill) {
  const open_ = () => page.locator('.modal-overlay').count();
  const asks = async (how) => {
    await page.getByRole('button', { name: 'צא בלי לשמור' }).waitFor({ timeout: 3000 });
    if (how === 'stay') {
      await page.getByRole('button', { name: 'המשך עריכה' }).click();
      await page.waitForTimeout(400);
    }
  };
  const problems = [];
  try {
    await open();
    await page.waitForTimeout(500);
    const save = await page.locator('.sheet-footer button[type="submit"]').boundingBox();
    if (!save || save.y + save.height > 700 || save.y + save.height < 600) problems.push(`save bar at ${save && Math.round(save.y)}`);
    await fill();

    const grab = await page.locator('.sheet-grab').last().boundingBox();
    await swipe(grab.x + grab.width / 2, grab.y + grab.height / 2, grab.y + 320);
    await page.waitForTimeout(300);
    if (!(await open_())) problems.push('swiped away with changes');

    await page.locator('.modal-header button[aria-label="סגור"]').last().click();
    await asks('stay');
    if (!(await open_())) problems.push('✕ closed it');

    await page.evaluate(() => history.back());
    await asks('stay');
    if (!(await open_())) problems.push('back closed it');

    await page.locator('.sheet-footer').getByRole('button', { name: 'ביטול' }).click();
    await asks('leave');
    await page.getByRole('button', { name: 'צא בלי לשמור' }).click();
    await page.waitForTimeout(500);
    if (await open_()) problems.push('still open after leaving');
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }
  console.log(`  ${problems.length ? 'FAIL ' : 'ok   '} ${name} guards unsaved changes${problems.length ? ': ' + problems.join('; ') : ''}`);
  if (problems.length) { failed++; await page.screenshot({ path: `.e2e/sheet-dirty-${name.replace(/\W+/g, '_')}.png` }); }
  await closeAll().catch(() => {});
  await page.waitForTimeout(400);
}

const closeAll = async () => {
  for (let i = 0; i < 4; i++) {
    const leave = page.getByRole('button', { name: 'צא בלי לשמור' });
    if (await leave.count()) { await leave.click(); continue; }
    const btn = page.locator('.modal-overlay button[aria-label="סגור"], [role="dialog"] button[aria-label="סגור"]').last();
    if (!(await btn.count())) break;
    await btn.click({ force: true });
    await page.waitForTimeout(350);
  }
};

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('sheets@example.com'));
await page.getByText('צור טיול ראשון').click();
await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('גלילה');
await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('רומא');
await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
await page.locator('.trip-card').getByText('פתח טיול').click();
await page.getByText('טיסת הלוך').first().waitFor();
const tab = (label) => page.locator(`nav button.nav-item[aria-label="${label}"]`).click();

const openTripEdit = async () => {
  await page.locator('button[title="ערוך פרטי טיסה ומלון"]').click();
  await page.getByText('עריכת כל פרטי הנסיעה').waitFor();
};
await check('trip edit form', openTripEdit, closeAll);
await dragClose('trip edit form', openTripEdit);
await guardsUnsaved('trip edit form', openTripEdit,
  () => page.locator('.modal-content input.form-control').first().fill('שינוי'));

await check('info sheet', async () => {
  await page.locator('header button[aria-label="מידע חשוב"]').click();
  await page.locator('.modal-header', { hasText: 'מידע חשוב' }).waitFor();
  await page.locator('.modal-overlay').getByText('מספרי חירום').click();   // expand: long enough to scroll
}, closeAll);
await dragClose('info sheet', async () => {
  await page.locator('header button[aria-label="מידע חשוב"]').click();
  await page.locator('.modal-header', { hasText: 'מידע חשוב' }).waitFor();
});

await tab('תכנון טיול');
const openPlaceForm = async () => {
  await page.locator('button.fab', { hasText: 'יעד חדש' }).click();
  await page.getByText('הוספת יעד / אטרקציה חדשה').waitFor();
};
await check('place form', openPlaceForm, closeAll);
await dragClose('place form', openPlaceForm);
await guardsUnsaved('place form', openPlaceForm,
  () => page.getByPlaceholder('למשל: תצפית שקיעה בגבעה').fill('לא נשמר'));

// a place, for the details sheet
await page.locator('button.fab', { hasText: 'יעד חדש' }).click();
await page.getByPlaceholder('למשל: תצפית שקיעה בגבעה').fill('מקום עם הרבה קישורים');
await page.getByPlaceholder('כתובת או קישור למפה').first().fill('Piazza Navona, Roma');
await page.locator('.sheet-footer button[type="submit"]').click();
await page.getByText('מקום עם הרבה קישורים').first().waitFor();

const openOptions = async () => {
  await page.locator('[title="מיון ותצוגה"]').click();
  await page.getByRole('heading', { name: 'מיון ותצוגה' }).waitFor();
};
await check('options sheet', openOptions, closeAll);
await dragClose('options sheet', openOptions);

const openCategorySettings = async () => {
  await openOptions();
  await page.getByText('הגדרות קטגוריות').click();
  await page.getByText('התאמת קטגוריות').waitFor();
};
await check('category settings', openCategorySettings, closeAll);
await dragClose('category settings', openCategorySettings);

await dragClose('place details', async () => {
  await page.getByText('מקום עם הרבה קישורים').first().click();
  await page.locator('.modal-overlay').getByText('סמן שביקרנו').waitFor();
});

await page.locator('[role="tab"]', { hasText: 'לוח זמנים' }).click();
await page.locator('button.fab', { hasText: 'יום חדש' }).click();
await page.getByText('הוסף פעילות').first().waitFor();
const openActivityForm = async () => {
  await page.getByText('הוסף פעילות').first().click();
  await page.getByText('הוספת פעילות ליום').waitFor();
};
await check('activity form', openActivityForm, closeAll);
await dragClose('activity form', openActivityForm);
await guardsUnsaved('activity form', openActivityForm,
  () => page.getByPlaceholder('למשל: נסיעה ברכבת, ארוחת צהריים, ביקור במוזיאון').fill('לא נשמר'));

// an activity, for its details and actions sheets
await openActivityForm();
await page.getByPlaceholder('למשל: נסיעה ברכבת, ארוחת צהריים, ביקור במוזיאון').fill('קפה בבוקר');
await page.locator('.sheet-footer button[type="submit"]').click();
await page.getByText('קפה בבוקר').first().waitFor();
await page.waitForTimeout(400);
await dragClose('activity details', async () => {
  await page.getByText('קפה בבוקר').first().click();
  await page.getByRole('dialog', { name: 'קפה בבוקר' }).waitFor();
});
await dragClose('activity actions', async () => {
  await page.locator('button[aria-label="פעולות: קפה בבוקר"]').click();
  await page.getByRole('dialog', { name: 'קפה בבוקר' }).waitFor();
});

await tab('הוצאות');
const openExpense = async () => {
  await page.locator('button.fab', { hasText: 'הוצאה חדשה' }).click();
  await page.getByText('שמור הוצאה').waitFor();
};
await check('expense form', openExpense, closeAll);
await dragClose('expense form', openExpense);

await tab('הזמנות');
const openBooking = async () => {
  await page.locator('button.fab', { hasText: 'הזמנה חדשה' }).click();
  await page.locator('.modal-overlay').waitFor();
};
await check('booking form', openBooking, closeAll);
await dragClose('booking form', openBooking);

await browser.close();
process.exit(failed ? 1 : 0);
