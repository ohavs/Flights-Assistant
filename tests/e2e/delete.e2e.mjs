// Deleting a trip safely: the owner's personal delete code (set the first
// time, in the dialog), then 24 hours in which the card says when and the
// owner can cancel. Settings change the code with the current one. When
// the time comes, the owner's app deletes the trip.
//   bash scripts/run-e2e.sh tests/e2e/delete.e2e.mjs
import { chromium } from 'playwright';

const DB = 'http://127.0.0.1:8080/v1/projects/demo-flights/databases/(default)/documents';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' })).newPage();
page.setDefaultTimeout(15000);
let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `.e2e/delete-fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
}

const card = () => page.locator('.trip-card', { hasText: 'טיול למחיקה' });
const dialog = () => page.getByRole('dialog', { name: 'מחיקת טיול' });
const trash = () => card().locator('button[title="מחק טיול"]');
const tripDoc = async () => {
  const trips = await (await fetch(`${DB}/trips?pageSize=300`, { headers: admin })).json();
  return (trips.documents || []).find(d => d.fields?.name?.stringValue === 'טיול למחיקה') || null;
};

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('delete@example.com'));
await page.getByText('צור טיול ראשון').click();
await page.getByPlaceholder('למשל: סוף שבוע בפראג').fill('טיול למחיקה');
await page.getByPlaceholder("למשל: פראג, צ'כיה").fill('ליסבון');
await page.getByRole('button', { name: 'צור טיול', exact: true }).click();
await card().waitFor();

await step('first delete: the dialog sets the code (code + again)', async () => {
  await trash().click();
  await dialog().getByText('עוד אין לך קוד מחיקה').waitFor();
  await dialog().locator('#delete-code').fill('2468');
  await dialog().locator('#delete-code-again').fill('2469');
  await dialog().getByRole('button', { name: 'מחק בעוד 24 שעות' }).click();
  await dialog().getByText('האימות לא תואם לקוד').waitFor();
  await dialog().locator('#delete-code-again').fill('2468');
  await page.screenshot({ path: '.e2e/delete-first-code.png' });
  await dialog().getByRole('button', { name: 'מחק בעוד 24 שעות' }).click();
  await dialog().waitFor({ state: 'detached' });
});

await step('the card says when, offers a way back, and has no trash button', async () => {
  await card().getByText(/יימחק ב־\d\d\.\d\d בשעה \d\d:\d\d/).waitFor();
  await card().getByRole('button', { name: 'בטל מחיקה' }).waitFor();
  if (await trash().count()) throw new Error('trash still on a pending card');
  const at = Number((await tripDoc())?.fields?.deleteAt?.integerValue);
  const left = at - Date.now();
  if (!(left > 23.9 * 3600e3 && left <= 24 * 3600e3)) throw new Error(`deleteAt is ${left}ms away`);
  await page.screenshot({ path: '.e2e/delete-pending.png' });
});

await step('inside the trip, a banner says it too', async () => {
  await card().getByText('פתח טיול').click();
  await page.locator('.delete-notice.banner').waitFor();
  await page.locator('button[aria-label="חזרה לרשימת הטיולים"]').click();
  await card().waitFor();
});

await step('"בטל מחיקה" cancels it', async () => {
  await card().getByRole('button', { name: 'בטל מחיקה' }).click();
  await card().locator('.delete-notice').waitFor({ state: 'detached' });
  await trash().waitFor();
  await page.waitForTimeout(800);
  if ((await tripDoc())?.fields?.deleteAt) throw new Error('deleteAt still on the trip');
});

await step('next time the code is asked for, and a wrong one is refused', async () => {
  await trash().click();
  await dialog().locator('#delete-code').waitFor();
  if (await dialog().locator('#delete-code-again').count()) throw new Error('asks to set the code again');
  await dialog().locator('#delete-code').fill('1111');
  await dialog().getByRole('button', { name: 'מחק בעוד 24 שעות' }).click();
  await dialog().getByText('קוד שגוי').waitFor();
  await dialog().getByRole('button', { name: 'ביטול' }).click();
  await dialog().waitFor({ state: 'detached' });
  if (await card().locator('.delete-notice').count()) throw new Error('scheduled without the code');
});

await step('settings: change the code with the current one', async () => {
  await page.getByRole('button', { name: 'הגדרות', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'הגדרות' });
  const group = sheet.locator('.section-header-toggle', { hasText: 'קוד מחיקה' });
  await group.getByText('מוגדר').waitFor();
  await group.click();
  await sheet.locator('#code-current').fill('0000');
  await sheet.locator('#code-new').fill('13579');
  await sheet.locator('#code-again').fill('13579');
  await sheet.getByRole('button', { name: 'החלף קוד' }).click();
  await sheet.getByText('הקוד הנוכחי שגוי').waitFor();
  await sheet.locator('#code-current').fill('2468');
  await sheet.getByRole('button', { name: 'החלף קוד' }).click();
  await sheet.getByText('הקוד הוחלף').waitFor();
  await page.screenshot({ path: '.e2e/delete-settings.png' });
  await sheet.getByRole('button', { name: 'סגור' }).first().click();
  await sheet.waitFor({ state: 'detached' });
});

await step('the new code schedules the delete', async () => {
  await trash().click();
  await dialog().locator('#delete-code').fill('2468');
  await dialog().getByRole('button', { name: 'מחק בעוד 24 שעות' }).click();
  await dialog().getByText('קוד שגוי').waitFor();
  await dialog().locator('#delete-code').fill('13579');
  await dialog().getByRole('button', { name: 'מחק בעוד 24 שעות' }).click();
  await dialog().waitFor({ state: 'detached' });
  await card().locator('.delete-notice').waitFor();
});

await step('when the time comes, the owner\'s app deletes the trip', async () => {
  const id = (await tripDoc()).name.split('/').pop();
  const r = await fetch(`${DB}/trips/${id}?updateMask.fieldPaths=deleteAt`, {
    method: 'PATCH', headers: admin,
    body: JSON.stringify({ fields: { deleteAt: { integerValue: String(Date.now() - 1000) } } }),
  });
  if (!r.ok) throw new Error(`seed failed ${r.status}`);
  await card().waitFor({ state: 'detached' });
  for (let i = 0; i < 20 && await tripDoc(); i++) await page.waitForTimeout(500);
  if (await tripDoc()) throw new Error('the trip is still in the database');
});

await browser.close();
if (failed) { console.log(`delete: ${failed} failed`); process.exit(1); }
console.log('delete: all passed');
