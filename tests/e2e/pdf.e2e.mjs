// The trip PDF, on a full trip: imported from a backup (flights, hotel,
// places in three categories, two days, a checklist, important info,
// expenses in two currencies), exported from settings. It must be a PDF
// with a page per part, under 1MB, in Rubik only. With poppler installed
// the pages are rendered to .e2e/pdf/ to look at.
//   bash scripts/run-e2e.sh tests/e2e/pdf.e2e.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true })).newPage();
page.setDefaultTimeout(20000);
page.on('pageerror', e => console.log('        page error:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('        console:', m.text().slice(0, 200)); });
let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `.e2e/pdf-fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
}
await mkdir('.e2e/pdf', { recursive: true });

const airport = (code, city, timezone) => ({ code, city, name: city, timezone });
const flight = (n, dep, arr, date, sd, sa, extra = {}) => ({
  flightNumber: n, airline: 'El Al', depAirport: dep, arrAirport: arr, date,
  scheduledDep: sd, scheduledArr: sa, actualDep: '', estimatedArr: '', status: 'בזמן', gate: '', ...extra,
});
const TLV = airport('TLV', 'תל אביב', 'UTC +03:00'), LIS = airport('LIS', 'ליסבון', 'UTC +01:00');
const place = (id, category, title, address, description, visited = false) => ({ id, category, title, address, description, visited });
const backup = {
  version: 1,
  trip: {
    name: 'ליסבון והחוף', destination: 'ליסבון, פורטוגל', dates: '12.11.2026 - 18.11.2026',
    members: {}, memberIds: [],
    outboundFlightDetails: flight('LY375', TLV, LIS, '2026-11-12', '07:35', '11:50', { gate: 'B4', actualDep: '08:10' }),
    returnFlightDetails: flight('LY376', LIS, TLV, '2026-11-18', '13:00', '19:45', { status: 'באיחור קל' }),
    hotelDetails: {
      name: 'Memmo Alfama Hotel', address: 'Travessa das Merceeiras 27, Lisboa',
      link: 'https://www.memmohotels.com/alfama', checkIn: '2026-11-12T15:00', checkOut: '2026-11-18T11:00',
      roomNumber: 'זוגי עם מרפסת', notes: 'ארוחת בוקר 7:30–10:30. לבקש חדר בקומה גבוהה עם נוף לנהר.',
    },
  },
  subcollections: {
    planning: [
      place('p1', 'מקומות לבקר', 'מגדל בלם', 'Av. Brasília, 1400-038 Lisboa', 'להגיע מוקדם, לפני התורים', true),
      place('p2', 'מקומות לבקר', 'מנזר ז׳רונימוס', 'Praça do Império 1400-206 Lisboa', 'כניסה חינם ביום ראשון הראשון בחודש'),
      place('p3', 'מסעדות ומקומות אכילה', 'Time Out Market', 'Av. 24 de Julho 49, Lisboa', 'שוק אוכל, הרבה דוכנים'),
      place('p4', 'מסעדות ומקומות אכילה', 'Pastéis de Belém', 'R. de Belém 84-92', 'הפסטל דה נאטה המקורי'),
      place('p5', 'אטרקציות ודברים לעשות', 'חשמלית 28', '', 'לעלות בתחנה הראשונה כדי לשבת'),
    ],
    days: [
      { id: 'd1', title: 'יום 1 · בלם', date: '2026-11-13', order: 1, activities: [
        { id: 'a1', timeLabel: '09:00', title: 'מגדל בלם', category: 'מקומות לבקר', address: 'Av. Brasília, Lisboa', description: 'כרטיסים מראש' },
        { id: 'a2', timeLabel: '11:30', title: 'Pastéis de Belém', category: 'מסעדות ומקומות אכילה', address: 'R. de Belém 84-92', description: '' },
        { id: 'a3', timeLabel: '14:00', title: 'מנזר ז׳רונימוס', category: 'מקומות לבקר', address: '', description: 'סיור מודרך באנגלית, שעה וחצי' },
      ] },
      { id: 'd2', title: 'יום 2 · אלפמה', date: '2026-11-14', order: 2, activities: [] },
    ],
    checklist: [
      { id: 'c1', text: 'דרכונים', category: 'מסמכים', completed: true },
      { id: 'c2', text: 'ביטוח נסיעות', category: 'מסמכים', completed: true },
      { id: 'c3', text: 'כרטיס אשראי בינלאומי', category: 'מסמכים', completed: false },
      { id: 'c4', text: 'מטען נייד', category: 'אלקטרוניקה', completed: false },
      { id: 'c5', text: 'מתאם חשמל אירופאי', category: 'אלקטרוניקה', completed: true },
      { id: 'c6', text: 'נעלי הליכה נוחות לעליות של ליסבון', category: 'בגדים', completed: false },
    ],
    info: [
      { id: 'i1', category: 'מספרי חירום', title: 'חירום כללי', type: 'phone', value: '112' },
      { id: 'i2', category: 'מספרי חירום', title: 'שגרירות ישראל בליסבון', type: 'phone', value: '+351 21 355 3640' },
      { id: 'i3', category: 'אנשי קשר', title: 'נהג העברה מהשדה', type: 'phone', value: '+351 912 345 678' },
      { id: 'i4', category: 'כתובות חשובות', title: 'המלון', type: 'address', value: 'Travessa das Merceeiras 27, Lisboa' },
      { id: 'i5', category: 'אתרים שימושיים', title: 'תחבורה ציבורית', type: 'url', value: 'www.carris.pt' },
    ],
    expenses: [
      { id: 'e1', amount: 42.5, currency: 'EUR', category: 'אוכל ושתייה', description: 'ארוחת ערב באלפמה', createdAt: '2026-11-13T20:10:00.000Z' },
      { id: 'e2', amount: 18, currency: 'EUR', category: 'תחבורה', description: 'כרטיס יומי', createdAt: '2026-11-13T08:00:00.000Z' },
      { id: 'e3', amount: 1450, currency: 'ILS', category: 'לינה', description: 'מקדמה למלון', createdAt: '2026-10-01T10:00:00.000Z' },
      { id: 'e4', amount: 15, currency: 'EUR', category: 'בידור ותיירות', description: 'מגדל בלם', linkedPlanId: 'p1', createdAt: '2026-11-13T09:05:00.000Z' },
    ],
    settings: [],
  },
};

await page.goto('http://localhost:5173/');
await page.getByText('התחבר עם Google').waitFor();
await page.evaluate(() => window.__e2eSignIn('pdf@example.com'));
await page.getByText('צור טיול ראשון').waitFor();

const sheet = () => page.getByRole('dialog', { name: 'הגדרות' });
const group = (t) => sheet().locator('.section-header-toggle', { hasText: t });
const open = async (t) => { if ((await group(t).getAttribute('aria-expanded')) !== 'true') await group(t).click(); };

await step('import the full trip', async () => {
  await writeFile('.e2e/pdf/backup.json', JSON.stringify(backup));
  await page.getByRole('button', { name: 'הגדרות', exact: true }).click();
  await open('גיבוי ושחזור');
  await sheet().locator('[data-testid="backup-import"]').setInputFiles('.e2e/pdf/backup.json');
  await sheet().getByText('נוסף לרשימת הטיולים').waitFor();
});

let pdf = null;
await step('export it to PDF', async () => {
  await open('ייצוא לקובץ');
  const [d] = await Promise.all([page.waitForEvent('download'), sheet().getByRole('button', { name: 'ייצוא ל-PDF' }).click()]);
  pdf = await readFile(await d.path());
  await writeFile('.e2e/pdf/trip.pdf', pdf);
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('not a PDF');
  console.log(`        ${(pdf.length / 1024).toFixed(0)}KB`);
  if (pdf.length > 1024 * 1024) throw new Error(`${pdf.length} bytes, over 1MB`);
});

await step('Rubik only, in three weights; a page per part', async () => {
  const s = pdf.toString('latin1');
  if (/Noto/.test(s)) throw new Error('Noto still embedded');
  const fonts = new Set(s.match(/\/BaseFont \/[A-Za-z0-9+\-]+/g));
  if (fonts.size < 3) throw new Error(`fonts: ${[...fonts].join(', ')}`);
  const pages = (s.match(/\/Type \/Page[^s]/g) || []).length;
  console.log(`        ${pages} pages`);
  if (pages < 8) throw new Error(`${pages} pages`);   // cover, flight, planning, 2 days, checklist, info, expenses
});

await step('render the pages (poppler)', async () => {
  try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); } catch { console.log('        pdftoppm missing, skipped'); return; }
  execFileSync('pdftoppm', ['-png', '-r', '60', '.e2e/pdf/trip.pdf', '.e2e/pdf/page']);
});

await step('phone numbers, codes and addresses read left to right', async () => {
  let txt;
  try { txt = execFileSync('pdftotext', ['.e2e/pdf/trip.pdf', '-']).toString(); } catch { console.log('        pdftotext missing, skipped'); return; }
  for (const s of ['+351 21 355 3640', 'LY375', 'Travessa das Merceeiras 27, Lisboa', '42.5 EUR']) {
    if (!txt.includes(s)) throw new Error(`"${s}" not found as written`);
  }
});

await browser.close();
if (failed) { console.log(`pdf: ${failed} failed`); process.exit(1); }
console.log('pdf: all passed');
