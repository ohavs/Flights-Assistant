# PROGRESS

## מצב נוכחי
- ענף ראשי: `master` (ברירת המחדל). כל merge ל־`master` נפרס אוטומטית ל־Hosting (`deploy.yml`).
- אתר חי: https://listify-84018.web.app
- גרסת ווב: 8.22.1 (`changelog.md`)
- תוכנית: `docs/PLAN.md`. יישור הקו בין הטאבים: `docs/PLAN-consistency.md` (עדיפות עליונה).
- **בתחילת השיחה הבאה:**
  - לבדוק שה־PR של 8.22.1 (C9) מוזג ונפרס, וש־`deploy.yml` האחרון ירוק.
  - אחר כך C10.
- הרצת e2e מקומית: `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome bash scripts/run-e2e.sh tests/e2e/<name>.e2e.mjs`. בלי ארגומנטים רצות כל הבדיקות של CI: smoke, layout, planning, flight, sheets, contrast.

## כללים קריטיים — לקרוא לפני כל שינוי
האפליקציה בשימוש כמעט יומיומי בטיולים אמיתיים, של הבעלים ושל מי שהם משתפים. בטיחות הנתונים לפני מהירות.

### ענפים
- `master` = מה שחי. לפני חקירה: הריצה המוצלחת האחרונה של "Deploy to Firebase Hosting" צריכה להיות ראש `master`.
- עד 2026-10-14 הענף הראשי היה `claude/place-closure-button-qj61y5`, ו־`master` נשאר מאחור. סשן אחד ניתח קוד ישן ו"תיקן" באגים שכבר היו מתוקנים בקוד החי. הענף הזה הוצא משימוש: ה־deploy שלו מצביע על `master`, ו־push אליו לא פורס כלום.
- ענפים ישנים (`claude/place-closure-button-qj61y5`, `sweet-planck-g6kkC`, `fix-flight-date-range-d0WIv`, `zen-wozniak-rp2mrq`, `nice-gates-Qygl4`, `locations-links-ui-redesign-uazs41`) הם היסטוריה. לא למזג.

### מיזוג ופריסה
Claude ממזג ופורס בעצמו. כל שינוי נבדק בפני עצמו:
1. שינוי אחד ל־PR.
2. לפני מיזוג:
   - הבסיס הוא `master` העדכני, ואף אחד לא דחף בינתיים;
   - קוראים את ה־diff המלא (לא רק stat): שום דבר לא נדרס או מתבטל;
   - build עובר, lint לא גרוע יותר, CI ירוק.
3. אחרי מיזוג: מוודאים שה־deploy הצליח. אם נכשל, מתקנים מיד.
4. לפני כל דבר בלתי הפיך או שעולה כסף (מחיקת נתונים, מיגרציה, הקשחת חוקים, תשלום): לשאול את הבעלים.

### נתונים (Firestore, פרויקט `listify-84018`)
- **אף פעם לא בודקים מול הפרויקט האמיתי.** רק emulators, עם project ID `demo-flights`.
- **לא מחליפים מסמך קיים שלם.** משתמשים ב־`updateDoc`, ב־`setDoc(..., { merge: true })` וב־field paths. `setDoc` בלי merge רק למסמך חדש. מסמך הטיול מחזיק `members` ו־`memberIds`; בלעדיהם אף אחד לא נכנס לטיול.
- **שינויי סכימה רק מוסיפים.** שדות חדשים אופציונליים. לא משנים שם, לא מוחקים ולא משנים סוג של שדה שגרסה בשימוש (ווב, אפליקציה, APK ישן) קוראת או כותבת.
- **חוקי Firestore:**
  - PR נפרד עם בדיקות emulator.
  - על ה־PR, `rules.yml` מציג את החוקים החיים מול הקובץ; קוראים את ההבדל לפני המיזוג.
  - ב־merge הוא מריץ בדיקות, פורס ומוודא שהחי זהה לקובץ.
- **workflows:** ל־GitHub של Claude אין הרשאה להריץ workflow ידנית (403). לכן כל workflow נדרש מופעל מ־PR או מ־push, ו־`workflow_dispatch` נשאר רק לבעלים.
- **כתיבות fire-and-forget** (`.catch(...)`, בלי `await` לפני סגירת טופס), כדי שהאפליקציה תעבוד אופליין. לשמור על זה.
- **ריפו ציבורי:** הלוגים של GitHub Actions ציבוריים. לא מדפיסים מפתחות או נתוני משתמשים, ולא משתמשים ב־`pull_request_target`.

### Android
- **מפתח החתימה:**
  - לעולם לא מחליפים אותו.
  - `applicationId` קבוע: `com.ohavs.flightsassistant`.
  - `versionCode` תמיד עולה.
  - מפתח אחר אומר שעדכון לא יותקן על הגרסה הקיימת.
- **GitHub Releases** רק לאפליקציית האנדרואיד: ה־updater קורא את `releases/latest`.
- **לא לשלוח עדכון שדורש קוד נייטיב** שאין ב־APK המותקן.

## נעשה
- [x] 2026-10-14: `master` הוחזר להיות הענף הראשי (#4–#6). הפריסה מ־`master` נבדקה ועבדה.
- [x] רשת ביטחון (#7):
  - בדיקות חוקים: 9 בדיקות, `npm run test:data`.
  - בדיקת דפדפן על build אמיתי, `npm run test:e2e`: כניסה, טיול חדש, כל הטאבים, מקום, פריט, הוצאה, מלון, רענון, שיתוף למשתמש שני.
  - הכל מול emulators. CI (`ci.yml`) על כל PR ועל כל push.
- [x] `rules.yml` (#8, #9): check על PR שנוגע בחוקים, deploy ב־merge.
- [x] באג (#10, 8.15.1):
  - קריאת טיול שלא קיים בשרת החזירה `permission-denied` במקום "לא קיים". זה קורה כשנפתח טיול לפני שנשמר (רשת איטית או אופליין), או כשמישהו מוחק טיול פתוח.
  - Firestore 10.14 קרס אחרי זה (`INTERNAL ASSERTION FAILED`), והסנכרון נעצר.
  - תוקן בחוקים (`get` מטפל במסמך חסר). נפרס ואומת שהחי זהה לקובץ.

- [x] שלב 1 (#12, 8.15.2): Firebase SDK 10.14 → 12.19, בלי שינוי קוד. בדיקת הדפדפן: 29 מתוך 30 ריצות (25 אחרונות ברצף).
- [x] `deploy.yml` (#13): אחרי כל פריסה בודק שהאתר החי מגיש בדיוק את ה־build. הקונטיינר של Claude לא מגיע לאתר (הפרוקסי חוסם), אז זה האימות.
- [x] אפליקציית Android רשומה ב־Firebase: `1:883919555591:android:1ad4ccc419e3b985b32ea2`, עם SHA-1 ו־SHA-256 של מפתח השחרור (`firebase-android-setup.yml`). `google-services.json` ב־`android/app/`.
- [x] שלב 2ב (#14): מעטפת Capacitor, כניסה נייטיב, כפתור חזור, status bar, אייקון ו־splash. ה־SW נרשם רק בווב.
- [x] שלב 4.1 (8.16.0): טוקנים בשפת Payments (צבעים, רדיוסים, צללים, כהה), Rubik מקומי, כפתור ראשי "מדבקה", ירוק כברירת מחדל. צילומים: `bash scripts/run-e2e.sh tests/e2e/screens.e2e.mjs`.
- [x] שלב 4.2 (8.16.1): סרגל ניווט צמוד בסגנון Payments עם אייקוני מדבקה (`src/ui/icons.jsx`), קפיצה ונקודה. FAB בסגנון מדבקה.
- [x] באג (8.16.2): תאריכי הטיול בעריכת פרטי הנסיעה יצאו מהבלוק וגרמו לגלילה הצידה. תוקן ב־`.row-2` (`minmax(0,1fr)`) וב־container query בבורר התאריך. `layout.e2e.mjs` ב־CI.
- [x] 8.16.3: פלטת הצבעים הוסרה (בקשת הבעלים). מתג בהיר/כהה בכותרת, נשמר במכשיר.
- [x] שלב 4.3 (8.17.0): מסך הבית, כרטיס טיול, כותרת, `.round-btn`, `--icon-ink` לכהה.
- [x] באג (8.18.1): חלוניות ארוכות נסגרו בהחלקה חזרה למעלה במקום לגלול. `useSheetDrag` בודק עכשיו כל אזור נגלל. `sheets.e2e.mjs` עם מגע אמיתי ב־CI.
- [x] 8.18.2: בתכנון, חיפוש + קטגוריה + מיון בבלוק אחד דביק (`.plan-toolbar`).
- [x] 8.18.3: מצב כהה רך יותר (רקע `#212329`, כרטיסים `#2C2E35`).
- [x] 8.18.4: `src/ui/Sheet.jsx`, חלונית אחת לכל האפליקציה. 4 חלוניות בתכנון לא נסגרו בהחלקה, תוקן. `sheets.e2e` בודק החלקה לסגירה ב־12 חלוניות.
- [x] 8.19.0 (C2): מזג אוויר ו"מידע חשוב" בכותרת הטיול, בכל הטאבים. תוכנית יישור קו: `docs/PLAN-consistency.md` (C1–C11).
- [x] 8.19.1 (C3): בתכנון, גלולת קטגוריה + כפתורים עגולים להגדרות ולחיפוש. החיפוש נפתח לשדה.
- [x] 8.19.2 (C4): חלון אישור (טקסט שקוף), חזור בבוררים, אישור הסרת חבר, מצב כהה בצ'קליסט ובשיתוף. `contrast.e2e.mjs` ב־CI.
- [x] 8.19.3: מזג האוויר עבר מהכותרת לכרטיסי הטיסה, ליד עיר היעד (בקשת הבעלים). "מידע חשוב" בכותרת עם סימן קריאה בעיגול (`CircleAlert`).
- [x] 8.20.0 (C5א): `Sheet` קיבל `dirty` (שאלה אחידה "צא בלי לשמור" ב־✕, רקע, חזור ו"ביטול"; גרירה כבויה) ו־`.sheet-footer`. כל חלוניות התכנון וטופס הטיסה עברו אליו. `sheets.e2e` בודק את השמירה מפני יציאה בשלושה טפסים.
- [x] 8.20.1 (C5ב): הזמנות, פריט מידע והוצאה עברו ל־`Sheet`. בהוצאות נוספה בדיקת שינויים; במידע ובהוצאות היא משווה למה שהטופס נפתח איתו. `sheets.e2e` בודק שישה טפסים.
- [x] 8.20.2 (C5ג): תזכורות, פריט בצ'קליסט, שיוך לחברים, שיתוף ורשימה קבועה עברו ל־`Sheet`. מעטפת ה־`Sheet` הפרטית של הצ'קליסט נמחקה. **C5 הושלם:** כל החלוניות התחתונות הן `src/ui/Sheet.jsx` (מלבד חלונות אישור ממורכזים: `ConfirmModal` ומחיקת טיול).
- [x] באג (8.20.3): "שמור" בטופס פרטי הנסיעה לא נסגר בלי רשת (`await setDoc`). עכשיו fire-and-forget. `flight.e2e` בודק שמירה אופליין.
- [x] 8.21.0 (C6א): `src/ui/ListCard.jsx`. כרטיס אחד ⋯ ופעולות בהזמנות, בהוצאות ובמידע. החלקה כקיצור דרך (`SwipeRow` מעביר עכשיו `role`/`tabIndex`). "הוצאה חדשה" מוסתר מצופים. `lists.e2e.mjs` ב־CI.
- [x] 8.21.1 (C6ב + C7): צ'קליסט ותזכורות על `ListCard`. `CheckCircle` אחד (גם בתכנון) בלי קו חוצה.
- [x] 8.22.0 (C8): שדה/תפריט/תאריך באותו מראה, ‎16px‎ בטלפון (כלל `pointer: coarse`), `.chip` ו־`Segmented` בכל הטפסים.
- [x] 8.22.1 (C9): `SectionHeader` בכל הטאבים, ⋯ לקטגוריה בצ'קליסט (במקום לחיצה ארוכה), `EmptyState` בתזכורות ובצ'קליסט הקבוע. `ActionsMenu` משותף.
- [ ] שלב 2ג: `android.yml` (APK חתום, בדיקת חתימה, emulator), "בדוק עדכונים" ו־Release ראשון. מחכה לסודות החתימה. הקוד מוכן מקומית (`updater-wip`): `ApkUpdaterPlugin`, `src/lib/updater.js`, `release.js` עם בדיקות, `AppSettingsSheet`.

## הבא
לפי `docs/PLAN.md`:
- [ ] שלב 2: מעטפת אנדרואיד, Release ראשון ו"בדוק עדכונים".
- [ ] שלב 3: התראות מקומיות (תזכורות, טיסות).
- [ ] שלב 4: עיצוב מחדש בשפה של Payments-2026 (ווב ואפליקציה). ממשיך דרך יישור הקו (למטה).
- [ ] שלב 5: push (FCM ו־Functions). דורש Blaze.

- [ ] בהמשך, לא דחוף (בקשת הבעלים): ערכות צבע מוכנות מראש שמשנות את כל האפליקציה, לא רק את צבע ההדגשה. לתכנן בזהירות לפני שבונים.
- [x] טאב תכנון: `docs/PLAN-planning.md` (P0–P8). נעשו P0 (התוכנית ו־`planning.e2e.mjs`, 23 מצבים בבהיר ובכהה, רץ ב־CI) P1 (8.16.4, עריכה בלי שאלה מיותרת) P2 (8.17.1: מתג, שדות, מצבים ריקים) ו־P3 (8.17.2: כרטיסי מקום, תגיות, רשת, כותרות קיבוץ, צבעי קטגוריות). `src/ui/kit.jsx`: `Pill`, `CategoryDisc`. P4 (8.17.3): סרגל, "מיון ותצוגה" כגיליון. P5א (8.17.4): גיליון פרטי מקום. P5ב (8.17.5): טופס מקום, הגדרות קטגוריות. P6 (8.17.6): לוח זמנים, ⋯ לכל פעילות. P7 (8.17.7): פרטי פעילות כגיליון עם פעולות, טופס פעילות. P8 (8.17.8): מזג אוויר שעתי כגיליון, ומדידת ביצועים (`perf.e2e.mjs`). **טאב התכנון הושלם.**
- [x] טאב טיסה ומלון (8.18.0, בקשת הבעלים): ממיר המטבעות הוסר כולו. "מידע חשוב" ומזג האוויר בשורה של שני אריחים, וכל אחד פותח גיליון. `flight.e2e.mjs` ב־CI. כרטיסי הטיסה והמלון עוד בעיצוב הישן.
- [ ] **יישור קו בין הטאבים (בקשת הבעלים, עדיפות עליונה):** `docs/PLAN-consistency.md`, PRים C1–C11. הסקירה המלאה של מה שונה בכל טאב נמצאת בטבלה שם.
  - נעשו C1 (8.18.4, `Sheet`), C2 (8.19.0, כותרת), C3 (8.19.1, סרגל תכנון) ו־C4 (8.19.2, באגים).
  - החלטות הבעלים בדרך:
    - מזג אוויר: בכרטיס הטיסה ליד עיר היעד, לא בכותרת.
    - מידע חשוב: כפתור בכותרת, בכל הטאבים.
    - בתכנון: גלולת קטגוריה ושני כפתורים עגולים לבנים (הגדרות, חיפוש).
    - מצב כהה: אפור פחם (`#212329`).
  - **הבא: C10** (כפתורים ואייקונים):
    - ✕ אחיד (`.btn-close`).
    - `Pencil` במקום `Edit2` בטיסה.
    - בלי אימוג'י בכרום: 🗓️🚶🚌✨ במטא של התכנון, ⚠️✅❌ בבאנרים של הטיסה ובשיתוף.
    - `btn-primary` מוקטן (32–38px) → `round-btn`/`btn-secondary`.
    - ירוק עם טקסט לבן → `--brand-fg`: כפתור השליחה בצ'קליסט, "אשר", "סיכום" בהוצאות.
    - `Skeleton` בטעינת הטיסה במקום הנקודה המהבהבת.
    - כפתורי ה־+ בכותרות ובבית.
  - נשאר מ־C8: רשימת המטבעות ורשימת המקומות בהוצאה נשארו פאנלים עם חיפוש. `CustomDropdown` עוד בלי חיפוש.
  - `ListCard`: `lead` (למשל עיגול בוצע), `icon` (`CategoryDisc`), `title`, `meta`, `tags`, `onOpen`, `actions` [{key,label,Icon,run,danger,swipe}], `muted`. ה־children מוצגים מתחת לכותרת.
  - טופס חדש בחלונית: `<Sheet title onClose dirty={formDirty()}>{({ close, cancel }) => <form>… <div className="sheet-footer"><button type="submit" className="btn-primary">שמור</button><button type="button" onClick={cancel} className="btn-secondary">ביטול</button></div></form>}</Sheet>`. `dirty` משווה למה שהטופס נפתח איתו. בבדיקות, כפתור השמירה: `.sheet-footer button[type="submit"]`.
  - אחרי C10: C11 (צבעים קשיחים: כ־100 ערכי `rgba(11,11,48,…)`/`rgba(79,70,229,…)`/hex, בעיקר App, תכנון, צ'קליסט, בוררים; סקריפט ההחלפה מ־C8 ב־ExpensesTab עובד: אלפא → `--ink-N`/`--p-N` הקרוב).

## החלטות
- אנדרואיד עם Capacitor. הפצה ב־GitHub Releases עם עדכון מתוך האפליקציה ("בדוק עדכונים" בהגדרות). בלי Play.
- **התשתית נלקחת מ־`ohavs/Payments-2026`** (אותו בעלים, אותה גישה, כבר עובד): Capacitor 8, כניסת Google נייטיב, updater, `android.yml`, תזכורות מקומיות, בדיקות e2e. לא כותבים אותה מחדש.
- **קריאת Payments-2026:** `git clone --depth 1 https://github.com/ohavs/payments-2026 /home/user/ohavs/payments-2026` (ציבורי). הבעלים אישר להעתיק ממנו עיצוב, אנימציות ותשתית.
- **עיצוב: שפת העיצוב של Payments-2026, לווב ולאפליקציה, מאותו קוד.**
  - המקור: `docs/PLAN.md` סעיף 5, `src/styles.css`, `src/ui/`, פונט Rubik.
  - נשארים אותה פונקציונליות ואותו מיקום של הדברים; משתנים העיצוב, הפונט והאנימציות.
- פיצ'רים נייטיב (התראות וכו') רק באפליקציה, לפי בדיקת platform. לא כל עדכון עובר לווב.
- גרסאות: הווב ממשיך את 8.x ב־`changelog.md`. לאפליקציה גרסה משלה מ־1.0.0. רשומות מסומנות `[web]`, `[app]` או `[both]` מה־Release הראשון.

## סיכונים ידועים (לא תוקנו)
- טאב תכנון עם 200 מקומות (מעבד איטי פי 4): פתיחה כ־2.3 שניות, מעבר לרשת כ־1.3 שניות. אפשר לשפר עם memo לכרטיסים וחישובי מרחק מראש. למדוד עם `tests/e2e/perf.e2e.mjs`.
- `days.activities` נכתב כמערך שלם מהמצב המקומי (`PlanningTab.jsx`). עריכות במקביל, או עריכה אופליין שמסתנכרנת אחר כך, יכולות לדרוס זו את זו.
- `settings/categories` מוחלף כולו מהמצב המקומי (`saveCategorySettings`).
- הסנכרון האוטומטי של הצ'קליסט (`ChecklistTab.jsx`) כותב `{completed: false}` לפריט גלובלי שחסר ברשימה המקומית. אם ה־cache ישן, הוא עלול לאפס פריט שסומן. לא אומת.
- כל משתמש מחובר יכול לקרוא כל פרופיל ב־`users` (מייל, `tripIds`, צ'קליסט). זה נדרש כדי לשתף לפי מייל. לשקול אוסף lookup נפרד.
- בדיקת הדפדפן נכשלה פעם אחת מתוך 30 (Firebase 12): ב־"add a place" כפתור "יעד חדש" לא הופיע תוך 15 שניות. אולי `PlanningTab` נשאר ב־Skeleton כי `loading` לא ירד. לא שוחזר ב־25 ריצות נוספות, ולא ידוע אם זה קרה גם ב־10.14. אם יחזור: לשמור את `.e2e/fail-*.png` ולבדוק את ה־listener של `planning`.
- `PlanningTab` הוספת נקודת מוצא (`await updateDoc` לפני סגירת הטופס הקטן): אופליין הטופס נשאר פתוח עד שיש רשת. שולי.
- lint: 87 שגיאות ישנות. לא חוסם CI; לא להוסיף חדשות.

## חתימת Android
- keystore: PKCS12, alias `flights-assistant`, נוצר 2026-10-14. הקבצים נשלחו לבעלים לגיבוי.
- SHA1: `BC:EF:52:E9:D8:9E:82:22:E7:62:40:0F:17:DA:EE:77:3F:E0:91:A7`
- SHA256: `A6:F4:20:DE:C1:7D:56:65:6C:31:CB:93:DF:67:D7:37:BE:CA:1A:30:19:B5:05:A0:5D:BC:9A:31:3B:47:43:3B`

## סודות (שמות בלבד)
- `VITE_GOOGLE_MAPS_KEY`, `VITE_AERODATABOX_KEY`, `FIREBASE_TOKEN`: קיימים (build, Hosting ו־rules).
- `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`: הבעלים מוסיף מהקבצים שנשלחו. `android.yml` נכשל בלעדיהם, עם "Missing repository secret".
- מפתח Maps: אם יש לו הגבלת אתרים, צריך להוסיף `https://localhost/*`, המקור של האפליקציה. לא נבדק.

---

## פרטים טכניים

### Build & Deploy
Merge ל־`master` מפעיל את `deploy.yml`, שעושה:
1. בודק שהסודות `VITE_GOOGLE_MAPS_KEY`, `VITE_AERODATABOX_KEY` ו־`FIREBASE_TOKEN` מוגדרים.
2. בונה מחדש את commit `80f12ed` ובודק שהוא משחזר את ה־service worker החי. זה מוכיח שהמפתחות נכונים, ואם לא, הוא עוצר לפני פריסה.
3. בונה, בודק ששני המפתחות נכנסו ל־bundle, ופורס Hosting.

גיבוי ידני, ממכונה עם המפתחות:
```bash
npm run build
# Deploy token stored in ~/.claude/CLAUDE.md (global memory)
npx firebase-tools@latest deploy --only hosting --token "<see ~/.claude/CLAUDE.md>"
```

### Environment Variables (`.env.local`)
`.env.local` הוא gitignored, אז clone חדש בא בלי המפתחות. Vite מטמיע אותם בזמן build, ו־build בלעדיהם שולח אפליקציה שהפיצ'רים האלה כבויים בה, בשקט.
```
VITE_AERODATABOX_KEY=<RapidAPI key for aerodatabox.p.rapidapi.com — ask user>
VITE_GOOGLE_MAPS_KEY=<Google Cloud "Listify" project API key — ask user>
```
- **`VITE_AERODATABOX_KEY`:** נתוני טיסות חיים (`services/flightApi.js`).
- **`VITE_GOOGLE_MAPS_KEY`:** כל מה שקשור למרחקים (`services/distanceApi.js`).
  - הכל תלוי ב־`hasGmapsKey()`. בלי המפתח נעלמים כפתור "חשב ושמור מרחקים", זמני הנסיעה האוטומטיים וקיבוץ ה"איזור".
  - מרחקים שכבר נשמרו עדיין *מוצגים*, ולכן קל לפספס שהמפתח חסר.
  - דורש **Routes API** ו־**Places API (New)** בפרויקט Google Cloud.

לבדוק מפתח Maps לפני פריסה:
```bash
curl -X POST "https://routes.googleapis.com/directions/v2:computeRoutes" \
  -H "Content-Type: application/json" -H "X-Goog-Api-Key: $VITE_GOOGLE_MAPS_KEY" \
  -H "X-Goog-FieldMask: routes.duration" \
  -d '{"origin":{"location":{"latLng":{"latitude":47.4979,"longitude":19.0402}}},"destination":{"location":{"latLng":{"latitude":47.5010,"longitude":19.0600}}},"travelMode":"WALK"}'
```
אחרי build, לוודא שהמפתחות באמת נכנסו: `grep -c "$VITE_GOOGLE_MAPS_KEY" dist/assets/*.js`

### Stack
- React 19 + Vite PWA, עברית RTL, Firestore (`listify-84018`), Hosting: https://listify-84018.web.app
- מודל הנתונים: `project_overview.md`, סעיף "Firestore Data Model"
- npm צריך `--legacy-peer-deps`, כי `lucide-react@0.378` לא מכיר ב־React 19 כ־peer

### Key Patterns
- `useTrip()`: מספק `currentUid`, `canEdit`, `isOwner`, `memberProfiles`
- `useConfirm()`: דיאלוג אישור אסינכרוני
- DnD: `@dnd-kit/core` + `@dnd-kit/sortable`
- סדר הקטגוריות נשמר ב־Firestore: `trips/{tripId}/settings/checklistSync.categoryOrder` ו־`infoSync.categoryOrder`

### בדיקות
הכל מול emulators (`demo-flights`).
- `npm run test:data`: בדיקות חוקים (`tests/*.test.mjs`). צריך Java 11+.
- `npm run test:e2e`:
  - בונה במצב emulators (`VITE_USE_FIREBASE_EMULATORS=true`) ומריץ את `smoke.e2e.mjs`, `layout.e2e.mjs` (בלי גלילה הצידה ב־360/390/412px) ו־`planning.e2e.mjs` (כל זרימות טאב התכנון, עם צילומים ב־`.e2e/planning/`) ו־`flight.e2e.mjs` (שורת המידע ומזג האוויר, בלי ממיר).
  - בקונטיינר הענן של Claude, להוסיף לפני הפקודה `CHROMIUM_PATH=/opt/pw-browsers/chromium`.
  - צילומי המסך נשמרים ב־`.e2e/`.
- הדפדפן בבדיקות חוסם service workers: בביקור ראשון ה־PWA נטען מחדש וקוטע את הבדיקה באמצע.
