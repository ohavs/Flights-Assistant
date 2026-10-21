// "הוספה" (8.70.0): the owner gives a member the role from the share
// sheet; that member adds places, items and activities, ticks anyone's,
// and edits only their own. The rules refuse the rest (tests/rules.test.mjs).
//   bash scripts/run-e2e.sh tests/e2e/roles.e2e.mjs
// Screenshots: .e2e/roles/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = `${process.argv[2] || '.e2e'}/roles`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${out}/fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
}
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}.png` }); };

const DB = 'http://127.0.0.1:8080/v1/projects/demo-flights/databases/(default)/documents';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const value = (v) => v === null ? { nullValue: null }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'string' ? { stringValue: v }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : Array.isArray(v) ? { arrayValue: { values: v.map(value) } }
  : { mapValue: { fields: fields(v) } };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, value(v)]));
const put = (path, data) => fetch(`${DB}/${path}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: fields(data) }) })
  .then(r => { if (!r.ok) throw new Error(`${path}: ${r.status}`); });
const list = (coll) => fetch(`${DB}/trips/rl/${coll}?pageSize=300`, { headers: admin }).then(r => r.json()).then(j => j.documents || []);
const read = (path) => fetch(`${DB}/${path}`, { headers: admin }).then(r => r.json());
async function until(fn, what) {
  for (let i = 0; i < 40; i++) { const v = await fn(); if (v) return v; await page.waitForTimeout(250); }
  throw new Error(`never: ${what}`);
}

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
const signIn = (email) => page.evaluate((e) => window.__e2eSignIn(e).then(c => c.user.uid), email);
const adder = await signIn('adder@example.com');
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1500);
const me = await signIn('roles-owner@example.com');
await page.getByText('צור טיול ראשון').waitFor();
await page.waitForTimeout(1500);
await put(`users/${adder}`, { displayName: 'דנה', email: 'adder@example.com' });
await put('trips/rl', {
  name: 'פראג', destination: 'פראג, צ\'כיה', dates: '12.11.2026 - 18.11.2026',
  members: { [me]: 'owner', [adder]: 'viewer' }, memberIds: [me, adder],
});
await put('trips/rl/planning/p1', { title: 'גשר קארל', category: 'מקומות לבקר', address: '', visited: false, createdBy: me, addedBy: me });
await put('trips/rl/checklist/c1', { text: 'דרכון', category: 'מסמכים וסידורים', completed: false, createdBy: me });
await put('trips/rl/days/d1', { title: 'יום 1', date: '2026-11-12', activities: [{ id: 'a1', title: 'סיור בעיר העתיקה', order: 1, timeLabel: '', placeId: null, address: '', description: '', category: 'אחר', createdBy: me }] });

const card = (t) => page.locator('.plan-card', { hasText: t }).first();
const closeModal = async () => {
  await page.locator('.modal-overlay button[aria-label="סגור"]').last().click();
  await page.waitForTimeout(350);
};
const sheet = () => page.locator('.modal-content').last();

await step('the owner gives "הוספה" from the share sheet', async () => {
  await page.locator('.trip-card', { hasText: 'פראג' }).locator('button[title="שתף וניהול חברים"]').click();
  // Three roles to invite with.
  for (const r of ['צפייה', 'הוספה', 'עריכה']) await sheet().locator('form').getByText(r, { exact: true }).waitFor();
  const row = sheet().locator('.member-role');
  await row.getByRole('radio', { name: 'הוספה' }).click();
  await until(async () => (await read('trips/rl')).fields?.members?.mapValue.fields[adder]?.stringValue === 'contributor', 'role saved');
  if (await row.getByRole('radio', { name: 'הוספה' }).getAttribute('aria-checked') !== 'true') throw new Error('not marked');
  await shot('1-share');
  await closeModal();
});

await step('the trip card tells them "הוספה"', async () => {
  await signIn('adder@example.com');
  await page.locator('.trip-card', { hasText: 'פראג' }).getByText('הוספה').waitFor();
});

await page.locator('.trip-card', { hasText: 'פראג' }).getByText('פתח טיול').click();
await page.locator('nav button.nav-item[aria-label="תכנון טיול"]').click();
await card('גשר קארל').waitFor();

await step('a place: they add one; someone else\'s they tick but cannot edit or delete', async () => {
  await page.locator('button.fab', { hasText: 'יעד חדש' }).click();
  await sheet().getByPlaceholder('למשל: תצפית שקיעה בגבעה').fill('בית הקפה סלביה');
  await sheet().locator('.sheet-footer button[type="submit"]').click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  const mine = await until(async () => (await list('planning')).find(d => d.fields.title.stringValue === 'בית הקפה סלביה'), 'place saved');
  if (mine.fields.createdBy?.stringValue !== adder) throw new Error('not saved as theirs');
  // Someone else's: the sheet offers "visited", not edit or delete.
  await card('גשר קארל').click();
  await sheet().getByText('סמן שביקרנו').waitFor();
  if (await sheet().getByRole('button', { name: 'עריכה' }).count()) throw new Error('edit offered on someone else\'s place');
  if (await sheet().getByRole('button', { name: 'מחיקה' }).count()) throw new Error('delete offered on someone else\'s place');
  await shot('2-theirs');
  await sheet().getByText('סמן שביקרנו').click();
  await until(async () => (await read('trips/rl/planning/p1')).fields?.visited?.booleanValue === true, 'ticked');
  await closeModal();
  // Their own: edit and delete.
  await card('בית הקפה סלביה').click();
  await sheet().getByRole('button', { name: 'עריכה' }).waitFor();
  await sheet().getByRole('button', { name: 'מחיקה' }).waitFor();
  await shot('3-mine');
  await closeModal();
});

await step('the schedule: they add an activity, and only theirs has actions', async () => {
  await page.getByRole('tab', { name: 'לוח זמנים' }).click();
  await page.getByText('סיור בעיר העתיקה').waitFor();
  if (await page.getByRole('button', { name: 'פעולות: סיור בעיר העתיקה' }).count()) throw new Error('actions on someone else\'s activity');
  if (await page.locator('button.fab', { hasText: 'יום חדש' }).count()) throw new Error('"new day" offered');
  // Someone else's activity opens to read, with no edit.
  await page.getByText('סיור בעיר העתיקה').click();
  await sheet().getByText('אין עוד פרטים לפעילות הזו.', { exact: true }).waitFor();
  if (await sheet().getByRole('button', { name: 'עריכה' }).count()) throw new Error('edit offered on someone else\'s activity');
  await closeModal();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'הוסף פעילות' }).first().click();
  await sheet().getByPlaceholder('למשל: נסיעה ברכבת, ארוחת צהריים, ביקור במוזיאון').fill('קפה ועוגה');
  await sheet().locator('button[type="submit"]').last().click();
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });
  await page.getByText('קפה ועוגה').waitFor();
  const acts = await until(async () => {
    const a = (await read('trips/rl/days/d1')).fields?.activities?.arrayValue.values || [];
    return a.length === 2 && a;
  }, 'activity saved');
  const added = acts.find(v => v.mapValue.fields.title.stringValue === 'קפה ועוגה');
  if (added.mapValue.fields.createdBy?.stringValue !== adder) throw new Error('not saved as theirs');
  // Theirs: edit and delete, but no moving the others about.
  await page.locator('button[aria-label="פעולות: קפה ועוגה"]:visible').click();
  await sheet().getByText('עריכה', { exact: true }).waitFor();
  await sheet().getByText('מחיקה', { exact: true }).waitFor();
  if (await sheet().getByText('הזז למעלה').count()) throw new Error('move offered');
  await shot('4-schedule');
  await closeModal();
});

await step('the checklist: they tick someone else\'s item, and add their own', async () => {
  await page.locator('nav button.nav-item[aria-label="צ\'קליסט"]').click();
  await page.getByText('מסמכים וסידורים').first().click();
  const row = page.locator('.list-card', { hasText: 'דרכון' }).first();
  await row.waitFor();
  await row.locator('.check-circle').click();
  await until(async () => (await read('trips/rl/checklist/c1')).fields?.completed?.booleanValue === true, 'ticked');
  await page.locator('button.fab', { hasText: 'פריט חדש' }).click();
  await sheet().getByPlaceholder('למשל: סוודר, מטען').fill('מטען לטלפון');
  await sheet().locator('button[type="submit"]').last().click();
  const item = await until(async () => (await list('checklist')).find(d => d.fields.text?.stringValue === 'מטען לטלפון'), 'item saved');
  if (item.fields.createdBy?.stringValue !== adder) throw new Error('not saved as theirs');
  await shot('5-checklist');
});

if (errors.length) { console.log('  page errors:', errors); failed++; }
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('roles: all passed');
