/* Seed data for a new trip.
 *
 * These live here rather than inside ChecklistTab / InfoTab because
 * App.jsx needs them to seed a trip, and the tabs are loaded lazily.
 * A named import from a lazy module pulls that whole module into the
 * main chunk, which would undo the split — a 30-line array would drag
 * a 1,500-line tab in behind it.
 */

export const defaultChecklist = [
  { id: 'doc-1', text: 'דרכון בתוקף (לפחות חצי שנה)', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-2', text: 'כרטיסי טיסה מודפסים / בנייד', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-3', text: 'אישור הזמנת מלון', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-4', text: 'ביטוח נסיעות לחו"ל בתוקף', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-5', text: 'רישיון נהיגה בינלאומי', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-6', text: 'המרת מט"ח / כרטיס אשראי בינלאומי', completed: false, category: 'מסמכים וסידורים' },
  { id: 'clo-1', text: 'בגדים להחלפה (לפי מספר ימי הטיול)', completed: false, category: 'בגדים' },
  { id: 'clo-2', text: 'בגד ים ומשקפי שמש', completed: false, category: 'בגדים' },
  { id: 'clo-3', text: 'נעלי הליכה נוחות', completed: false, category: 'בגדים' },
  { id: 'clo-4', text: 'ז\'קט / סוודר חם לטיסה', completed: false, category: 'בגדים' },
  { id: 'clo-5', text: 'לבנים, גרביים ופיג\'מה', completed: false, category: 'בגדים' },
  { id: 'ele-1', text: 'מטען לטלפון ומטען נייד (Power Bank)', completed: false, category: 'אלקטרוניקה' },
  { id: 'ele-2', text: 'מתאם שקעים בינלאומי', completed: false, category: 'אלקטרוניקה' },
  { id: 'ele-3', text: 'אוזניות נוחות לטיסה', completed: false, category: 'אלקטרוניקה' },
  { id: 'med-1', text: 'ערכת עזרה ראשונה (פלסטרים, פולידין)', completed: false, category: 'תרופות ועזרה ראשונה' },
  { id: 'med-2', text: 'משככי כאבים ותרופות אישיות', completed: false, category: 'תרופות ועזרה ראשונה' },
  { id: 'med-3', text: 'קרם הגנה ושפתון נגד יובש', completed: false, category: 'תרופות ועזרה ראשונה' },
  { id: 'med-4', text: 'מברשת שיניים, משחה וכלי רחצה', completed: false, category: 'תרופות ועזרה ראשונה' },
  { id: 'chk-1', text: 'סגירת ברז מים ראשי וגז בבית', completed: false, category: 'סידורים אחרונים בארץ' },
  { id: 'chk-2', text: 'כיבוי מכשירים חשמליים ופינוי זבל', completed: false, category: 'סידורים אחרונים בארץ' },
  { id: 'chk-3', text: 'נעילת חלונות, מרפסות ודלת כניסה', completed: false, category: 'סידורים אחרונים בארץ' },
  { id: 'chk-4', text: 'הפעלת חבילת גלישה / סים בינלאומי', completed: false, category: 'סידורים אחרונים בארץ' },
];

// Default items seeded for every new trip. Israeli emergency numbers
// + the European universal 112, plus a couple of placeholders the user
// is likely to fill in.
export const defaultInfoItems = [
  { id: 'info-il-police',    title: 'משטרת ישראל',       value: '100', type: 'phone',   category: 'מספרי חירום' },
  { id: 'info-il-mda',       title: 'מד"א — אמבולנס',    value: '101', type: 'phone',   category: 'מספרי חירום' },
  { id: 'info-il-fire',      title: 'כיבוי אש',            value: '102', type: 'phone',   category: 'מספרי חירום' },
  { id: 'info-il-civil',     title: 'מל"ל (חירום אזרחי)', value: '104', type: 'phone',   category: 'מספרי חירום' },
  { id: 'info-eu-112',       title: 'חירום באירופה (כללי)', value: '112', type: 'phone', category: 'מספרי חירום' },
  { id: 'info-il-mfa',       title: 'משרד החוץ — מוקד לאזרחים בחו"ל', value: '+972-3-9744444', type: 'phone', category: 'מספרי חירום' },
  { id: 'info-embassy',      title: 'שגרירות ישראל ביעד',   value: '',    type: 'phone',   category: 'מספרי חירום' },
  { id: 'info-insurance',    title: 'מוקד ביטוח נסיעות',   value: '',    type: 'phone',   category: 'מספרי חירום' },
  { id: 'info-credit-block', title: 'חסימת אשראי (חברת האשראי)', value: '', type: 'phone', category: 'מספרי חירום' },
];
