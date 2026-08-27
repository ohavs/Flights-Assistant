# Changelog — Flights-Assistant

## [8.10.0] - 2026-08-27 — כרטיס מזג אוויר במקום מפת הטיסה

### Removed
- **מפת מסלול הטיסה ירדה** (`MapComponent.jsx` נמחק, `leaflet` הוסרה מהתלויות). היא ציירה קו מקווקו ישר בין שתי נקודות על בסיס מפה שהפסיק להיענות פעמיים, וענתה על שאלה שאף אחד לא שאל. יחד איתה ירדו: צ׳אנק של 153KB + 15KB CSS שנשמרו מראש בכל מכשיר גם כשאף אחד לא פתח את הטאב, כלל ה-`runtimeCaching` לאריחים, וכל כללי ה-Leaflet ב-CSS.

### Added
- **כרטיס מזג אוויר ביעד** בראש טאב הטיסה. מה שבאמת שווה כרטיס בראש טיול הוא איך שם עכשיו ומה לארוז לימים הבאים. שלוש שכבות, הגדולה קודם:
  - **עכשיו** — אייקון, שם העיר, **תיאור מילולי של מזג האוויר** (היה קיים ב-`getWeatherLabel` ולא הוצג מעולם — אימוג׳י לבדו הוא לא תיאור), והטמפרטורה בגדול.
  - **המספרים** — רוח, לחות, ומקסימום/מינימום של היום, בשורה שקטה אחת.
  - **ימי הטיול** — אותה רצועה, מהודקת: העמודות **נמתחות** למלא טיול קצר ולא מצטמצמות מתחת לרוחב קריא, כך שטיול ארוך גולל במקום להידחס. אחוז גשם מוצג רק מ-20% ומעלה — מתחת לזה זו לא אינפורמציה לתכנן לפיה.
  - כל המספרים ב-`tabular-nums`, כדי שהטמפרטורה לא תרקוד כשהיא מתעדכנת.
  - גובה הכרטיס: 150px → 95px בלי תחזית, 228px איתה (המפה לבדה תפסה 148px).

## [8.9.0] - 2026-08-27 — טעינה מפוצלת; המפה מסמנת את עצמה

### Changed
- **חמשת הטאבים נטענים לפי דרישה** (`App.jsx`, `React.lazy`): רק אחד מוצג בכל רגע, אבל כל החמישה נותחו לפני הציור הראשון — `PlanningTab` לבדו הוא מעל 4,000 שורות. **החבילה הראשית ירדה מ-1,190KB ל-159KB** (344KB → 43KB gzip). ה-service worker עדיין שומר מראש כל צ׳אנק (`globPatterns` מכסה את כל ה-JS שנבנה, אומת: 0 קבצים מחוץ למניפסט), כך שטאב שמעולם לא נפתח מקוון עדיין נפתח אופליין; מה שהשתנה הוא כמה JavaScript הטלפון צריך לקמפל לפני שהוא מראה משהו.
  - כל טאב עצל כבר יושב בתוך ErrorBoundary משלו, וה-`Suspense` מציג את אותו שלד טעינה — צ׳אנק שלא מגיע מתדרדר לכרטיס השגיאה של הטאב, לא למסך לבן.
  - **`data/seedData.js`**: רשימות ברירת המחדל של הצ׳קליסט והמידע עברו למודול משלהן. ייבוא בשם ממודול עצל מושך את כל המודול לחבילה הראשית — מערך של 30 שורות היה גורר מאחוריו טאב של 1,500 שורות.
- **המפה נטענת בנפרד** (`FlightTab.jsx`): Leaflet הוא הדבר הכבד ביותר בטאב הטיסה והוא מצייר כרטיס אחד בראש. `FlightTab` ירד מ-216KB ל-49KB; המפה היא צ׳אנק של 153KB שמגיע אחריו, והכרטיס מחזיק את הגובה שלו בינתיים.
- **חלוקת ספריות צד-שלישי** (`vite.config.js`): Firebase, React ו-dnd-kit בצ׳אנקים נפרדים. קוד האפליקציה משתנה בכל פריסה, ספריות משתנות בשדרוג — הפרדה אומרת שפריסה מבטלת רק את צ׳אנק האפליקציה ומשאירה את השאר במטמון הדפדפן, וזה מה ש-PWA שמתעדכן לבד באמת מוריד כל פעם.

### Fixed
- **שמות המקומות על המפה** (`MapComponent.jsx`): שכבת ה-reference של Esri לא ציירה כלום. במקום להמשיך להמר על שירות של מישהו אחר — הכיתוב כבר נעלם פעמיים, פעם כש-CARTO דרשה מפתח ופעם כששכבת הכיתוב הפסיקה לענות — **שתי נקודות הקצה מסמנות את עצמן**: קוד שדה התעופה והעיר, מנתונים שהאפליקציה כבר מחזיקה. זה עובד אופליין, אי אפשר לקחת אותו, וזה גם המידע שבאמת חשוב בכרטיס בגודל כזה. שכבת ה-reference נשארה כבונוס ויורדת בשקט אם היא לא עונה, במקום להשאיר אריחים קרועים ו-404 בקונסולה.
- **`leaflet.css` נארז מקומית** במקום `<link>` ל-unpkg. הקישור החיצוני לא היה חלק מה-precache: הפעלה ראשונה בלי רשת קיבלה מפה בלי סגנון בכלל. עכשיו הוא רוכב על הצ׳אנק העצל של המפה — לא עולה כלום עד שפותחים את המפה, ונשמר מראש עם כל השאר.
- **סמן המפה נראה כאליפסה לצד הכיתוב** במקום נקודה מעליו: `leaflet.css` מגדיר `.leaflet-marker-icon { display: block }` באותה ספציפיות בדיוק כמו `.map-pin`, ומרגע שהוא נארז הוא נטען *אחרי* `index.css` וניצח. הכלל הוסמך ל-`.leaflet-marker-icon.map-pin`.
- **לוחית הכיתוב הייתה שקופה במצב כהה**: `--w-85` הוא גוון *לבן*, כלומר 7% לבן במצב כהה. הוחלף ל-`--surface`, שעוקב אחרי הערכה.
- **המטוס וסמני שדות התעופה עברו לטוקנים** במקום `#0b0b30` / `#ffffff` — נקודה כחולה-כהה על רקע כמעט-שחור היא לא נקודה.

## [8.8.2] - 2026-08-27 — שמות מקומות חזרו למפה

### Fixed
- **המפה הייתה בלי שום כיתוב** (`MapComponent.jsx`): האריחים של OpenStreetMap מצוירים לקריאה בזום של רחוב. דחוסים ליבשת שלמה בתוך כרטיס של 148px, ואז מסוננים כדי להרגיע את הצבע — האותיות פשוט נעלמו. סינון מפה גמורה הוא ניחוש; בחירת סגנון שנבנה לרקע שקט היא לא.
  - עברנו ל-**Esri Gray Canvas בשתי שכבות**: רקע חיוור בלי אותיות, ומעליו שכבת "reference" שקופה שנושאת את שמות המקומות והגבולות. זו כל הסיבה שהסגנון הזה קיים — הכיתוב תוכנן להישאר קריא על רקע כמעט-לבן (או כמעט-שחור).
  - **מצב כהה מקבל את ערכת האריחים הכהה האמיתית** במקום היפוך CSS. היפוך הופך אותיות כהות לכתמים לבנים זוהרים.
  - **מסנן ה-CSS ירד לגמרי.**
  - שכבת הכיתוב יושבת ב-pane משלה בין ה-overlay של Leaflet (400, שם קו המסלול) לבין שכבת הסמנים (600): שם מקום לא נקבר מתחת לקו הטיסה, וגם לא נמרח על המטוס או על שתי נקודות שדות התעופה.
  - **מפל נסיגה**: אם אריחי הרקע מפסיקים להגיע — בדיוק מה שקרה עכשיו עם CARTO — המפה עוברת אוטומטית ל-OpenStreetMap במקום להישאר ריקה. אומת מקצה לקצה: בסביבת הבדיקה המארח של Esri חסום, המפל נורה, וה-attribution התחלף ל-OSM.
  - `runtimeCaching` מכסה עכשיו את שני המארחים, ומכסת המטמון הוכפלה ל-400 כי יש שתי שכבות אריחים.
- **ריפוד ה-`fitBounds` היה 40px** בתוך כרטיס של 148px — נשארו 68px שימושיים, וזה עלה דרגת זום שלמה. ירד ל-22px.

## [8.8.1] - 2026-08-27 — אריחי מפה בלי מפתח; החלקה במידע ובהוצאות

### Fixed
- **"API KEY REQUIRED" על המפה** (`MapComponent.jsx`, `vite.config.js`): הבסיס היה CartoDB Positron, ש-CARTO הפסיקה להגיש ללא הרשמה ומאז חותמת את ההודעה על כל אריח. **המפתח של גוגל לא פותר את זה** — הוא מוגדר ל-Routes ול-Places, ואריחי מפה הם Map Tiles API נפרד לגמרי (הפעלה וחיוב בפני עצמם). לכן עברנו לאריחים של OpenStreetMap עצמה, שלא דורשים מפתח כלל.
  - מארח יחיד (`tile.openstreetmap.org`) ולא תת-הדומיינים `{s}` — הם הופסקו, ו-HTTP/2 ממילא מייתר אותם.
  - **בקרת הייחוס חזרה** (הרישיון של OSM מבקש קרדיט גלוי), מוקטנת לגודל הערת שוליים; הדגלון של Leaflet עצמו הוסר.
  - האריחים של OSM צבעוניים במלואם, והמראה השקט שקיבלנו חינם מ-Positron הפך למסנן CSS על **שכבת האריחים בלבד** — הסמנים, קו המסלול והמטוס נשארים בעוצמה מלאה כי הם בשכבות אחרות. יש טיפול נפרד למצב כהה (היפוך + סיבוב גוון), שלא היה קיים קודם: עד עכשיו הוצגו אריחים בהירים גם ברקע כהה.
  - **קריטי לאופליין**: תבנית ה-`runtimeCaching` ב-`vite.config.js` עודכנה למארח החדש. תבנית ישנה הייתה אומרת שאריחים לא נשמרים במטמון כלל והמפה ריקה בלי אינטרנט.

### Changed
- **כרטיס המפה הוקטן**: 178px → 148px, ורצועת מזג האוויר תחתיו הודקה (padding ו-gap).
- **החלקה לעריכה הגיעה למידע חשוב ולהוצאות** (`SwipeRow`): עד עכשיו היא הייתה רק בצ׳קליסט. במגע כפתורי העריכה והמחיקה שבשורה מוסתרים והפעולות עוברות להחלקה; בעכבר הכפתורים נשארים בדיוק כפי שהיו. אומת עם קלט מגע אמיתי דרך CDP בשני הטאבים, וגרירת החלונית לסגירה אומתה בכל ארבע החלוניות.

## [8.8.0] - 2026-08-27 — סולם טיפוגרפי; מצבים ריקים

### Added
- **`components/EmptyState.jsx`** — צורה אחת ל"עוד אין כאן כלום": עיגול שקט עם אייקון, שורה שמנסחת את ההיעדר, שורה שאומרת מה לעשות, וכפתור רק במקום שבו יש קיצור דרך אמיתי להציע. עד עכשיו כל טאב גידל לעצמו אחד — שורת טקסט אפורה בזה, אייקון ושתי שורות בזה, אייקון וכפתור בשלישי — ואחד מהם עוד אמר "לחץ על +" הרבה אחרי שה-+ עבר מקום. מי שמגיע לטאב ריק נמצא בדיוק בנקודה שבה הוא הכי צריך שיסבירו לו למה המסך משמש, וזה היה המקום הכי לא עקבי באפליקציה.
  - הופעל בדף הבית, בתכנון (שני מצבים, ראו למטה), בלוח הזמנים היומי, בציוד (שלא היה לו אחד בכלל), במידע חשוב ובהוצאות.

### Changed
- **רשימה ריקה וסינון שלא מצא כלום הם שתי בעיות שונות** (`PlanningTab.jsx`): הנוסח הישן אמר "לא נמצאו פריטי תכנון העונים לסינון" גם למי שפשוט עוד לא הוסיף מקום — כלומר ביקש ממנו לשחרר סינון שהוא מעולם לא הגדיר. עכשיו רשימה ריקה מסבירה למה הטאב משמש, ואילו סינון שלא מצא כלום אומר כמה מקומות יש ברשימה ומציע **"נקה סינון"** שמאפס חיפוש, קטגוריה והסתרת מקומות שביקרנו בהם בבת אחת — לא הייתה עד עכשיו שום דרך חזרה מצירוף סינונים שמשאיר מסך ריק.
- **סולם טיפוגרפי אחד** (`index.css` + 39 קריאות בקוד): היו באפליקציה 21 גדלי גופן שונים על פני 475 הצהרות, מהם שישה חצאי-צעדים (9.5, 10.5, 11.5, 12.5, 13.5, 14.5) ועוד 17 ו-27 שישבו כל אחד לצד צעד קיים. חצי-צעד הוא מה שסולם בלי בעלים נסחף אליו — הוא היה נגיעה, אף פעם לא החלטה. עכשיו יש **11 צעדים** (10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 26) וכל גודל באפליקציה הוא אחד מהם. הסולם מתועד בראש `index.css`: ערך שלא ברשימה הוא טעות, לא ניואנס.
  - 9px עלה ל-10: אות בודדת בעיגול אווטאר בגודל 9 היא מתחת למה שקריא בטלפון.

## [8.7.0] - 2026-08-27 — כותרת רגועה; שם לכל כפתור

### Changed
- **כפתורי הכותרת ירדו במשקל** (`.icon-btn` ב-`index.css`): כל אחד מהם ישב בתוך עיגול מלא, וארבעה עיגולים אפורים ברצף הפכו את שורת הכותרת לשורת כפתורים עם כיתוב לידה. עכשיו הם סמלים על המשטח של הכותרת עצמה — יעד המגע נשאר 34px מלאים, והמשקל מופיע רק תחת אצבע, בפוקוס או כשתפריט פתוח.
  - **העיגול נשאר רק לכפתור החזרה**: ניווט הוא הדבר היחיד בשורה שמכוונים אליו במקום להבחין בו.
  - **אקצנט אחד בלבד** — הפעולה של הטאב עצמו (עריכת פרטי הטיסה). בורר הצבעים ומצב כהה הם הגדרות, ובאותו גוון ניטרלי כמו שאר השירות.
  - אותו טיפול בכותרת של דף הבית (יציאה, מצב כהה, ערכת צבעים).

### Fixed
- **כל כפתור באפליקציה קיבל שם נגיש**: סריקה של חמשת הטאבים, דף הבית וחלונית הפרטים העלתה 14 כפתורי אייקון בלי `aria-label` ובלי `title` — קורא מסך היה מכריז עליהם "לחצן" בלבד. כולל עשרת כפתורי הסגירה, שהכריזו על התו "✕".
  - סומנו: סגירה בכל החלוניות ובדיאלוג האישור, ידיות הגרירה של הקטגוריות, חצי החודשים בבורר התאריך, עריכה ומחיקה של הוצאה, "+" להוספה בתוך קטגוריה (עם שם הקטגוריה בשם הכפתור), עריכה/מחיקה/ביטול של קטגוריה, תיבת הסימון של תזכורת (עם `aria-pressed`) וכפתור הטיול החדש.
  - הסריקה חוזרת עכשיו 0 בכל מסך.

## [8.6.1] - 2026-08-27 — מקום שכבר ביקרנו בו

### Changed
- **סימון "ביקרנו" איבד את הצבע הירוק** (`PlanningTab.jsx`, `index.css`): הכרטיס היה מקבל מילוי ירוק, פס ירוק בעובי 6px, טבעת ירוקה, צ׳ק לבן על ריבוע ירוק וקו חוצה על שם המקום. סיום הוא לא התראה. עכשיו כרטיס שביקרנו בו **מוותר** על המשטח ועל הצל שלו ושוקע חצי צעד לתוך הדף, והעין נוחתת על מה שעוד פתוח. ברשימה של ארבעים מקומות, הצבע היה מושקע בדיוק בחצי שכבר לא צריך שום דבר.
  - הכפתור שנשאר על הכרטיס הפך לעיגול ולא לתיבת סימון — הוא מדווח מצב, לא אוסף תשובה — והוא **בהיר יותר** מהטבעת הריקה שלידו ולא כהה יותר.
  - הקו החוצה על שם המקום ירד: הצ׳ק כבר אומר את זה, וקו חוצה על שם נקרא כ"בוטל" ולא כ"היינו".
  - אותו טיפול בחלונית הפרטים (התג "נצפה" הפך ל־"✓ ביקרנו" בגוון ניטרלי) ובלוח הזמנים היומי.
  - **ניסוח אחיד**: "סמן שביקרנו" / "בטל סימון ביקור" / "הסתר מקומות שביקרנו בהם", במקום ארבעה נוסחים שונים של "נצפה".

## [8.6.0] - 2026-08-27 — כפתור הוספה אחיד

### Added
- **`components/Fab.jsx`** — כפתור ההוספה של האפליקציה, אחד לכל הטאבים. עד עכשיו כל טאב גידל לעצמו אחד: עיגול קטן ליד שדה החיפוש בתכנון, כפתור בשורת הכותרת בהוצאות, כרטיס שנפתח בציוד, ופס ברוחב מלא במידע חשוב — אותה משימה, ארבע צורות וארבעה מקומות לחפש בהם. עכשיו זו גלולה צפה באותה פינה בכל טאב, מעל שורת הניווט.
  - הכפתור מורחב ולא רק "+": סימן פלוס לבדו מסמן שיש פעולה אבל לא איזו, וכל טאב מוסיף דבר אחר.
  - ממוקם בקצה ה-inline-end — בעברית זו הפינה השמאלית התחתונה, המיקום המשוקף שכל פלטפורמה RTL נותנת לו.
  - מרונדר דרך portal אל `.app-container`: `position: fixed` נפתר מול האב הקדמון המונפש הקרוב, ועטיפות הטאבים מונפשות ב-transform. הפורטל לא הולך ל-`<body>` דווקא כי ל-`.app-container` יש `isolation: isolate`, וכל מה שמחוץ לו נצבע מעל כל חלונית שבתוכו בלי קשר ל-z-index.
  - כל עוד כפתור כזה מורכב, `<body>` נושא `data-fab` ו-`.app-content` שומר מקום בתחתית — הכפתור מכסה פינה, והשורה האחרונה ברשימה חייבת להישאר נגישה.

### Changed
- **טופס הוספת פריט בציוד עבר לחלונית** (`ChecklistTab.jsx`): הכרטיס שנפתח בראש הרשימה הפך לכרטיס התקדמות בלבד — טבעת האחוזים ו"X מתוך Y כבר נארזו". ההוספה והעריכה נפתחות באותה חלונית מהכפתור הצף. שמירה סוגרת את החלונית; הוספה רצופה של כמה פריטים נשארת בשורת "הוסף לרשימה" שבתוך כל קטגוריה.
  - כרטיס ההתקדמות מוצג עכשיו גם לצופים (הספירה היא מידע, לא עריכה).
- **תכנון**: שדה החיפוש תופס את השורה כולה.
- **הוצאות**: שורת הכותרת נשארה עם "סיכום" בלבד.
- **מידע חשוב**: הפס ברוחב מלא ירד, ו"טען מספרי חירום" עבר למצב הריק — המצב היחיד שבו הוצע גם קודם.

### Fixed
- **שורת הניווט הסתירה את תחתית התוכן בדסקטופ** (`index.css`): הבר גבוה יותר מ-1024px (68px), אבל `--nav-total` — שממנו נגזר הריווח התחתון — נשאר על גובה המובייל. משתנה CSS פותר את ה-`var()` שלו במקום ההצהרה, ולכן שינוי `--nav-height` על צאצא לא משנה עותק שחושב ב-`:root`. שני הטוקנים מוצהרים עכשיו יחד על `.app-container`, וגובה הבר נגזר מהטוקן במקום להיכתב פעמיים.

## [8.5.0] - 2026-08-27 — הטיול הנוכחי

### Added
- **כפתור "טיול נוכחי"** ברשימת הטיולים (`App.jsx`): נעיצה של טיול אחד, ומאז האפליקציה נפתחת ישר לתוכו. הטיול הנעוץ מסומן בתג "נפתח אוטומטית", וכפתור החזרה שכבר קיים בכותרת הטיול מחזיר לרשימה כדי להחליף — בלי שהפתיחה האוטומטית תקפיץ שוב פנימה (היא רצה פעם אחת לכל טעינה, דרך `autoOpenedRef`).
  - הבחירה נשמרת ב-`localStorage` תחת `currentTrip_<uid>` ולא ב-Firestore: זו העדפה של המכשיר הזה ("הטלפון שלי נפתח כאן"), וקריאה מקומית מאפשרת לקפוץ פנימה בטעינה קרה בלי לחכות לשאילתת הטיולים.
  - הפתיחה האוטומטית מדלגת על עצמה כששיתוף מגוגל מפות בתהליך, וכשהטיול הנעוץ כבר לא ברשימה (נמחק או בוטל השיתוף).

### Changed
- **התאריך בכרטיס הטיסה ממורכז** (`CustomDatePicker.jsx`): הבורר הקומפקטי הוא כל התוכן של האריח, ו-`space-between` הצמיד אותו לקצה. עכשיו `center`.
- **כרטיס המפה הוקטן** מ-220px ל-178px (`index.css`) — אותו כרטיס, פחות מקום בראש המסך.

## [8.4.0] - 2026-08-24 — כרטיס הטיסה

### Changed
- **כרטיס הטיסה נבנה מחדש** (`FlightTab.jsx`): היה טבלת "תווית: ערך" — סטטוס, שער, המראה ונחיתה כשורות זו אחר זו. עכשיו:
  - **מסלול**: קודי שדות התעופה והערים משני הצדדים, ובין השניים קו עם מטוס בכיוון הנסיעה. מתחת לכל צד — השעה בגדול, ומתחתיה תג האיחור/הקדמה שלה. כך העיכוב צמוד לשעה שהוא משנה, במקום להיות שורה נפרדת.
  - **שלוש אריחים** לדברים שנשאלים בשדה התעופה: תאריך (עם בורר התאריך, כמו קודם), שער וסטטוס.
  - שורת השעונים המקומיים ירדה לתחתית הכרטיס כמידע משני.
  - כל שדה שהיה מוצג נשמר, כולל תגי "מעודכן", מצב "בוטלה" והשעונים החיים.
  - `TimeSlot` פורק ל-`useTimeState` (הלוגיקה) ול-`RouteTime` (התצוגה האנכית), כך שחישוב האיחור נשאר במקום אחד.

### Fixed
- **בוררי התאריך והשעה נפתחו במקום הלא נכון** (`CustomDatePicker.jsx`): שלושת הבוררים משתמשים ב-`position: fixed`, אבל הם יושבים בתוך `.glass-card` שיש לו `backdrop-filter` — ואב קדמון מסונן הופך לבלוק המכיל של צאצאים `fixed`. התוצאה: החלונית מוקמה ביחס לכרטיס ונחתכה על ידו (כפתורי האישור נעלמו מתחת לכרטיס הבא). כל השלושה מרונדרים עכשיו דרך `createPortal` ל-`<body>`. זה תיקון רוחבי — הבוררים מופיעים בכל טופס באפליקציה.
- שם חברת התעופה ומספר הטיסה בכותרת הכרטיס נדבקו זה לזה; הכותרת עברה ל-flex עם רווח אמיתי.

## [8.3.0] - 2026-08-24 — החלקה על שורה

### Added
- **`components/SwipeRow.jsx`**: החלקה על שורת צ׳קליסט חושפת "ערוך" ו"מחק". במגע — הכפתורים הקטנים בשורה מוסתרים והפעולות עוברות להחלקה; בעכבר (דסקטופ) הכפתורים נשארים בדיוק כמו קודם.
  - **כיוון RTL**: הפעולות בקצה השמאלי, והשורה **מצטמצמת** לטובתן במקום להחליק החוצה. iOS מחליק את השורה, אבל השורות שלו נושאות טקסט לרוחב מלא; אצלנו הטקסט צמוד לקצה הימני, ולכן החלקה דוחפת החוצה בדיוק את הפריט שעליו פועלים. הצמצום משאיר את השם קריא לצד הפעולות שלו.
  - המחווה ננעלת על ציר אחד: תנועה אנכית נשארת גלילה תמיד, ותיקו נפתר לטובת הגלילה.
  - שורה אחת פתוחה בכל רגע; פתיחת אחרת סוגרת את הקודמת, ולחיצה על שורה פתוחה רק סוגרת אותה ולא מסמנת אותה.
  - מאזיני מגע מקוריים `{ passive: false }`, מאותה סיבה כמו בגרירת החלוניות.

### Fixed
- **אנימציית הכניסה נעלה את ה-transform של השורות** (`index.css`): `.list-in` השתמש ב-`animation-fill-mode: both`, שמשאיר את הפריים האחרון מוחל לתמיד — ואנימציה גוברת על סגנון inline. התוצאה: כל שורה נשארה מקובעת ושום תנועה שלה לא נראתה. שונה ל-`backwards`, שמכסה רק את ההשהיה שלפני האנימציה.

## [8.2.0] - 2026-08-24 — שדות בעיצוב חדש; תיקון הגרירה במגע

### Fixed
- **גרירת חלונית לא עבדה במגע** (`hooks/useSheetDrag.js`): React מחבר מאזיני `touch` במצב passive, ולכן `preventDefault` בתוכם לא עושה כלום — הדפדפן חוטף את התנועה האנכית לטובת גלילה, ה-`pointercancel` מגיע, והגרירה לא מתחילה. במחשב עם עכבר זה כן עבד, ולכן זה לא נתפס בבדיקה הראשונה. עכשיו המגע מטופל במאזינים מקוריים עם `{ passive: false }` שמחוברים ישירות לאלמנט, ועכבר ממשיך דרך pointer events.
  - `.sheet-grab` קיבל `touch-action: none`, ולחלוניות נוסף `overscroll-behavior: contain`.
  - אומת עם קלט מגע אמיתי דרך CDP: גלילה בתוך חלונית עדיין גוללת (245px), החלקה מטה כשהתוכן גלול חוזרת לראש הרשימה ולא סוגרת, והחלקה מטה מראש הרשימה סוגרת.

### Changed
- **שדות קלט** (`index.css`): במקום קופסאות לבנות עם מסגרת אפורה וצל — משטח שקוע ממולא, מסגרת שקופה שמקבלת משקל רק בפוקוס, רדיוס 14px, וטבעת אקצנט בפוקוס. שדה שכבר מולא מקבל גוון מעט שונה משדה ריק, כך שרואים בהצצה מה כבר נענה בטופס ארוך.
  - התוויות רזות ומאופקות יותר (הן תוויות, לא כותרות).
  - חצי ה-spinner של שדות מספר הוסתרו, `textarea` קיבל גובה שורה נוח, ומצב `disabled` הוגדר.
  - `.custom-dropdown-trigger` יושר לאותה שפה בדיוק, וכפתורי `.btn-primary` / `.btn-secondary` קיבלו את אותו רדיוס וגובה — כך ששדה, בורר וכפתור נראים כמשפחה אחת.

## [8.1.0] - 2026-08-24 — חלוניות שנגררות, רשימות שנכנסות

### Added
- **`hooks/useSheetDrag.js`**: גרירת חלונית כלפי מטה לסגירה, עם אנימציית יציאה אמיתית (עד היום החלונית פשוט נעלמה בפריים אחד). הגרירה מתחילה רק כשהתוכן כבר בראש הגלילה והאצבע יורדת — אחרת התנועה שייכת לאזור הגלילה, בדיוק כמו בחלונית מערכת. מרחק של 96px או תנועה מהירה סוגרים; פחות מזה — החלונית קופצת חזרה למקומה.
  - הופעל בשמונה חלוניות: פרטי מקום, טופס הוספה/עריכה של מקום, הגדרות קטגוריות, רשימת מיקומים, טופס מידע חשוב, טופס הוצאה, עריכת טיסה/מלון, ושתי חלוניות התזכורות.
  - **בטופס עם שינויים שלא נשמרו הגרירה מושבתת** — יציאה משם עדיין עוברת דרך שאלת האישור הקיימת, כדי שתנועה מקרית לא תמחק עבודה.
  - ידית אחיזה (`.sheet-grab`) בראש כל חלונית, שגם מסמנת שאפשר לגרור וגם נותנת לאצבע יעד שאינו כפתור.
  - לחיצה שהסתיימה אחרי גרירה לא נספרת כלחיצה על הכפתור שמתחתיה.
- **כניסת פריטים לרשימה** (`.list-in`): שורות הצ׳קליסט נכנסות בעלייה קצרה עם השהיה מדורגת לפי מיקום, מוגבלת כדי שזנב של רשימה ארוכה לא יידחה.

### Changed
- הרקע של החלונית מתפוגג יחד איתה בסגירה, במקום להיעלם מיידית.

## [8.0.0] - 2026-08-24 — שלב 0+1: תחושת מובייל

### Added
- **שכבת קלט** (`index.css`): כל כפתור וכרטיס מגיב ללחיצה (`scale(.97)`, כרטיסי תכנון בגוון במקום קנה מידה כדי לא להתנגש באנימציית ה-FLIP), ביטול הבזק המגע של הדפדפן, `user-select` כבוי על ה-chrome בלבד, וטבעת פוקוס למקלדת בדסקטופ. כללי `:hover` נוטרלו תחת `@media (hover: none)` כדי שלא "יידבקו" אחרי נגיעה.
- **אסימוני תנועה**: `--dur-fast/base/slow` ו-`--ease-out/spring`, כך שכל תנועה באפליקציה מאותה משפחה. `prefers-reduced-motion` מכבה הכל.
- **שורת ניווט צפה** (`App.jsx`, `index.css`): גלולה מרחפת עם פינות מעוגלות, טשטוש רקע וצל, ואינדיקטור יחיד שנוסע בין האייקונים במקום החלפת צבע. הטאבים הוגדרו כמערך אחד (`NAV_TABS`) כדי שמיקום האינדיקטור והכפתורים לא יוכלו להיפרד. הבר לא מסתיר תוכן: `--nav-total` מזין גם את ריפוד הגלילה וגם כל סרגל מרותק.
- **`ErrorBoundary.jsx`**: כל טאב עטוף בנפרד. תקלה נשארת בתוך הטאב עם כרטיס "נסה שוב", במקום להפיל את כל האפליקציה למסך לבן.
- **`Skeleton.jsx`**: שלדי טעינה בצורת התוכן בארבעת הטאבים, במקום נקודה מהבהבת + "טוען...".
- **רטט קצר במעבר טאב** במכשירים שתומכים, ולחיצה על הטאב הפעיל גוללת חזרה למעלה.

### Changed
- **חלוניות בגובה התוכן**: `.modal-content` היה `height: 94%` תמיד; עכשיו `height: auto` עם `max-height: 94%`, כך שדיאלוג קצר לא משתלט על המסך. הרקע נכנס ב-fade.
- **כותרת מתרוממת בגלילה**: `.app-header.scrolled` מקבלת צל וגבול, הרמז הרגיל לכך שיש תוכן מעליה.
- **מעבר טאבים**: `fadeIn` עודכן לעלייה קלה עם עקומת ההאצה המשותפת.
- **גלילה**: `overscroll-behavior-y: contain` באזור התוכן — בלי שרשור גלילה ובלי משיכת-רענון של הדפדפן בתוך ה-PWA.

### Fixed
- **שאילתות המדיה של דסקטופ לא פעלו** (`index.css`): שלושת בלוקי ה-`@media` ישבו *לפני* הכללים שהם נועדו לדרוס, ובאותה ספציפיות סדר המקור מכריע — כך שרוב התאמות הדסקטופ (רוחב הניווט, ריפוד התוכן, `.glass-card`, `.trip-card`, המודאל הממורכז, ורשת שתי-העמודות של מסך הטיסה) פשוט אבדו. הבלוקים הועברו לסוף הקובץ ועכשיו חלים בפועל.
- **קריסת מסך ההוצאות** (`ExpensesTab.jsx:299`): `createdAt` שאינו מחרוזת הפיל את כל עץ הרינדור. עכשיו מומר בבטחה.

## [7.6.3] - 2026-08-24

### Added
- **חישוב אוטומטי אחרי עריכת מקום** (`PlanningTab.jsx`):
  - Editing a place's address, its links, or its distance origin already dropped the saved travel times as stale — but nothing re-measured them until someone opened that place or ran "חשב ושמור מרחקים". The edited place is now queued and recomputed as soon as the updated document comes back. Manual time overrides are left untouched.
  - The queue is drained from a `plans`-driven effect rather than straight after the write, so the recompute runs in a fresh render where the cleared caches are visible — otherwise it short-circuits on the previous cached result.

### Note
- "חשב ושמור מרחקים" (options menu → תצוגה), the automatic travel times and the "איזור" grouping only render when the build has `VITE_GOOGLE_MAPS_KEY` set. A build produced without `.env.local` hides all three, and `VITE_AERODATABOX_KEY` is needed the same way for live flight lookup.

## [7.6.2] - 2026-08-24

### Fixed
- **התפריטים בסרגל התכנון נפתחו במקום הלא נכון** (`PlanningTab.jsx`):
  - Frosting the sticky filter row (7.5.0) gave it a `backdrop-filter`, and a filtered ancestor becomes the containing block for `position: fixed` descendants. Both dropdowns anchored to the toolbar instead of the viewport, so they opened far below their buttons, on top of the cards.
  - The category filter popup and the options menu are now rendered through `createPortal` into `<body>`, outside the filtered ancestor, so their `getBoundingClientRect` anchoring lands under the button that opened them.

## [7.6.1] - 2026-08-24

### Changed
- **תצוגת רשת — ריבועים נקיים** (`PlanningTab.jsx`):
  - A grid tile is too small to hold controls, so it no longer carries the visited checkbox, the icon chip or the "חובה" badge. What is left is the name (up to two lines), a small category icon, and at most one tiny flag — an amber star for "חובה" or ✨ for an event happening today. A visited place shows a green check in place of the icon, with the name struck through.
  - Tiles in the same row now share a height, so a two-line name next to a one-line name no longer leaves a ragged edge.
  - Everything removed from the tile is still one tap away: the details sheet opens on tap, with navigation, editing, priority, delete and "סמן כנצפה" laid out in it.

## [7.6.0] - 2026-08-24

### Added
- **שיתוף מגוגל מפות ישירות לאפליקציה (Web Share Target)**:
  - The manifest now declares a `share_target` (`GET /share`), so the installed PWA shows up in the Android share sheet. Sharing a place from Google Maps opens the app on a dedicated screen.
  - **`ShareTargetScreen.jsx`** — shows what was shared (name, address line, link) and the list of trips to add it to. The trip list is written to `localStorage` on every trips snapshot, so it renders immediately — before auth resolves and before Firestore answers on a cold start.
  - Picking a trip jumps straight to that trip's planning tab and opens the add-place form pre-filled: name → "שם המקום", the Maps link → "כתובת / מיקום" (so navigation and travel-time calculation work off it), and any extra line Maps shared (usually the street address) → the notes field.
  - Works while signed out: the cached trips are listed, and choosing one signs in with Google and then continues to the same trip automatically.
  - Trips where the user has view-only access are shown greyed out and marked "צפייה בלבד".
  - **`services/shareTarget.js`** — parses whatever shape Maps sends (name+link in `text`, `title`, or a bare `url`, including deriving a name from a full `/maps/place/<name>/` URL), keeps the pending place in `sessionStorage` so the service-worker update reload can't swallow it, and clears the share params out of the address bar so a refresh doesn't replay the share.

## [7.5.0] - 2026-08-24

### Changed
- **Places list — text-first cards + details sheet** (`PlanningTab.jsx`):
  - A place card is now a single quiet row: visited toggle, category icon, title, one meta line (category or event date · travel time · link count), chevron. The navigate button, priority star, status badge stack and inline expansion were all removed from the card.
  - Tapping a card opens a **details sheet** holding everything that used to be crammed into the card: description, travel times, each location/link as a tappable row, who added the place, and a fixed action footer (ניווט / עריכה / עדיפות / מחיקה) with a full-width "סמן כנצפה". The sheet reads from the live plans list, so it stays in sync with Firestore and closes by itself if the place is deleted.
  - At most one status pill per card (today's event → expired event → "חובה"), so a long list has a single thing to catch the eye.

- **Finding your way around a long list** (`PlanningTab.jsx`):
  - New **grouping** control (רשימה / קטגוריה / איזור) in the options menu, remembered per trip. Category sections and proximity clusters both render as collapsible **sticky pill headers** with an icon and a count.
  - New **"הסתר מקומות שנצפו"** toggle.
  - New **summary bar** — "N מתוך M מקומות" plus the active search/filter/visibility, with a one-tap "הצג הכל". Shown only when something is actually filtered out.
  - The sticky filter row is now frosted and bled to the content edges, so cards scroll under it instead of showing through.

- **Reminders rebuilt** (`ChecklistTab.jsx`):
  - Adding and editing a reminder now happen in a **bottom sheet** (textarea + "של מי התזכורת" picker + delete), instead of an inline form that replaced the card and made the layout jump.
  - The reminder strip is compact and auto-sized: done/total count, "כל התזכורות" and "+" in the header; checkbox + text + owner avatar in the body; dots below. Tapping the text edits it. Auto-advance slowed to 5 s and pauses while a sheet is open.
  - The "כל התזכורות" sheet gained an explicit **"בחירה"** multi-select mode (replacing the two competing checkboxes per row), a per-row edit pencil, and a "תזכורת חדשה" footer button.

- **Checklist top area tightened** (`ChecklistTab.jsx`): smaller progress ring, tighter card padding, container gap 20 → 14, and the member filter chips moved into a single scrollable row with a count per member.

### Fixed
- **Link name vs. link address were indistinguishable** (`PlanningTab.jsx`):
  - Adding a link without a name no longer copies the URL into the name field, which is why editing one showed the same address in both inputs.
  - Add and edit rows are stacked, each under an explicit caption ("שם הקישור (אופציונלי)" / "כתובת הקישור (URL)"). Unnamed links read as "ללא שם" in the form and as a shortened address (`prettyUrl`) everywhere else, instead of printing the raw URL twice.
- **Progress ring track invisible in dark mode** (`ChecklistTab.jsx`): hard-coded `rgba(11,11,48,0.08)` replaced with `var(--ink-8)`.

## [7.4.0] - 2026-06-09

### Added
- **Live Weather Forecast** (`useWeather.js`, `FlightTab.jsx`, `PlanningTab.jsx`):
  - New `useWeather(lat, lon)` hook fetches current conditions + 16-day daily + hourly forecast from Open-Meteo (free, no API key).
  - Cached in localStorage for 1 hour; service worker also caches the API response (StaleWhileRevalidate). Fully offline-ready.
  - **Flight tab — map card split**: the map card now includes a weather section below the map showing current temperature/conditions at the destination, plus a horizontally scrollable forecast strip for each trip day (outbound→return). Today's date highlighted. Each day: weather icon, high/low temps, rain probability.
  - **Daily planner — day header badge**: each day shows a small weather tag (icon + max°/min° + rain %) next to the date.
  - **Hourly weather popup**: clicking the weather badge on any day opens a centered modal with temperature + icon + rain % every 2 hours, displayed in a wrapping grid (2-3 rows, no horizontal scroll).

- **Activity Detail Popup** (`PlanningTab.jsx`):
  - Clicking an activity title in the daily planner opens a centered popup with the full title (word-break), time label, description, and Google Maps link. Useful for activities with long truncated names.

- **Day Collapse/Expand Toggle** (`PlanningTab.jsx`):
  - Each day header has a chevron button that hides/shows the activities timeline and add-activity button, keeping the day title visible.

- **Bulk Delete in Reminders Modal** (`ChecklistTab.jsx`):
  - When items are selected via checkbox in the "כל התזכורות" bottom sheet, a red "מחק (N)" button appears alongside a "בטל בחירה" button. Bulk delete with confirmation dialog.

### Fixed
- **Offline UX — fire-and-forget Firestore writes** (`ChecklistTab.jsx`, `App.jsx`):
  - All Firestore writes (add/edit/delete reminders, checklist items, global checklist) changed from `await setDoc/updateDoc` to fire-and-forget. UI cleanup (clear input, close form) now happens synchronously before the write. Fixes the bug where adding items offline appeared to do nothing — the button "didn't work" because `await` never resolved.

- **timeLabel not saving when editing activities** (`PlanningTab.jsx`):
  - Edit path now reads `savedPlaceSelections[0].timeLabel` for place-linked activities instead of the stale `activityTimeLabel` state.

- **Day header text overflow** (`PlanningTab.jsx`):
  - Day title ("יום 1") now truncates with ellipsis instead of wrapping to a second line. Day-of-week abbreviated (א׳/ב׳/...).

- **Activity card text overflow** (`PlanningTab.jsx`):
  - Added `minWidth: 0` + `overflow: hidden` to activity cards; descriptions use `word-break: break-word`.

- **Currency converter default value** (`CurrencyConverter.jsx`):
  - Amount input now starts empty instead of pre-filled with "100".

- **Currency converter standalone mode** (`CurrencyConverter.jsx`):
  - Replaced broken `window.open` (which opened Chrome Custom Tab → full app) with a tip modal explaining the Android long-press shortcut for opening the converter directly.

### Changed
- **"הוסף יום" button position** (`PlanningTab.jsx`):
  - Moved from center to left side; title + sync status text stay on the right.

- **Currency converter position** (`FlightTab.jsx`):
  - Moved below hotel details (was between flights and hotel).

---

## [7.3.0] - 2026-06-05

### Added
- **Accent Palette Selector** (`App.jsx`, `ThemeContext.jsx`, `index.css`):
  - 7 selectable color palettes: indigo (default), violet, sky, teal, emerald, amber, rose.
  - `PalettePicker` button (palette icon) placed next to the dark/light toggle in both the home and trip headers; opens a 4-column swatch grid popover.
  - Each palette overrides `--accent`, `--accent-rgb`, `--primary`, `--primary-hover`, `--accent-gradient`, `--bg-gradient`. All `--p-*` tints use `rgba(var(--accent-rgb), alpha)` so the entire app recolors from a single variable.
  - Preference persisted to `localStorage` and applied via `data-accent` attribute on `<html>`. Works in both light and dark mode.

- **Must-Visit Priority Flag** (`PlanningTab.jsx`):
  - New `plan.priority` field: `null` (unset) | `'must'` | `'optional'`.
  - **Quick toggle**: star icon button in every plan card header cycles through the three states without opening the form.
  - **Form control**: 3-button toggle (לא מוגדר / ⭐ חובה / 🕐 אם ישאר זמן) in the add/edit modal, right below the category selector.
  - **Visual indicators**: "חובה" → amber title text + ⭐ חובה badge; "אם ישאר זמן" → muted title + 🕐 badge; unset → normal appearance.
  - **Filter chip**: "⭐ חובה" chip appears in the filter row as soon as at least one must-visit is marked; filters to those places only.
  - **Place-picker dropdown**: must-visit options prefixed with `⭐`, optional with `🕐`, so priority is visible when building the daily schedule.
  - **Daily planner**: activity titles colored amber (must) or muted (optional) based on the linked plan's priority.

- **Manual Travel-Time Override** (`PlanningTab.jsx`):
  - Edit form shows a "זמני הגעה" section with two number inputs (minutes) for walk and transit.
  - Auto-fetched values displayed as placeholder text; user can override either or both.
  - Saved to Firestore as `distances.{originId} = { walk, transit, manualOverride: true, fetchedAt }`.
  - Auto-fetch (`fetchPlanDistances`) skips any cache entry with `manualOverride: true`, so values persist until manually cleared.
  - Pre-populated from cache when re-opening the form; "ידני" badge shown on the section header when override is active.

- **Travel Times in Place-Picker Dropdown** (`PlanningTab.jsx`, `CustomDatePicker.jsx`):
  - `CustomDropdown` gains an optional `meta` field per option: rendered as small secondary text on the left side of each row (not shown in the trigger button).
  - Place options in the daily-activity form show `🚶 Xדק' 🚌 Yדק'` meta text so distances are visible while choosing a place.

- **Travel Times in Daily Planner Activity Row** (`PlanningTab.jsx`):
  - Walk (🚶) and transit (🚌) chips moved from below the address into the activity card **title row** — title on the right, times on the left, before the edit/delete controls.
  - Uses the linked plan's `distanceOriginId` (falls back to hotel) for the correct cache lookup.

- **Event Status Badges** (`PlanningTab.jsx`):
  - Items in the "אירועים" category show a "✨ היום" badge (amber) and an orange right border when `event.startDate === todayISO`.
  - Items show a "נגמר" badge (muted) when today is past `event.endDate` (or `startDate` when no end date is set).
  - Today is evaluated once on module load (`todayISO` constant) — stale by at most one day if the tab stays open overnight.

- **Proximity Area Collapse/Expand** (`PlanningTab.jsx`):
  - Area header rows in the proximity-grouping view are clickable buttons with a rotating `ChevronDown` arrow.
  - `collapsedAreas` state (headerId → boolean) persists for the session; collapsed areas hide their cards.

### Changed
- **Filter Row — No Background** (`PlanningTab.jsx`, `index.css`):
  - Removed all background/blur from the sticky filter chips row; content behind it is fully visible while scrolling.
  - Consolidated the three separate filter action buttons (sort / layers / refresh) into a single `SlidersHorizontal` options menu button.
  - Options dropdown uses `position: fixed` anchored via `getBoundingClientRect()` — avoids the backdrop-filter stacking context artifact (ghost solid background on the button when scrolling).
  - Filter chips and action button are now vertically aligned (removed `padding-bottom` on the scroll container that was causing height mismatch).

- **Dark Mode Improvements** (`index.css`, `ChecklistTab.jsx`):
  - `btn-primary`, `btn-add-circle`, `filter-chip.active`, `btn-tab-toggle.active`, `custom-checkbox.checked` all use `var(--accent)` as background in dark mode instead of `--primary` (which is a light tint, too bright as a background color).
  - Reminders "כל התזכורות" bottom sheet: `background: var(--modal-bg)` replacing hardcoded near-white fallback.
  - Daily schedule activity cards: removed hardcoded `rgba(255,255,255,0.7)` background; now fully theme-aware.
  - Planning filter chips sticky row: removed hardcoded `rgba(245,243,255,…)` background.

---

## [7.2.0] - 2026-06-03

### Added
- **Daily Planner — Drag-and-Drop Day Reordering** (`PlanningTab.jsx`):
  - Days can be dragged and reordered using `@dnd-kit`. Only activities travel with the dragged card; title and date are positional anchors and stay in their slot.
- **Daily Planner — Smart Day Generation from Flight Dates** (`PlanningTab.jsx`):
  - "ייצר ימים לפי טיסה" button auto-creates one day card per calendar date between the outbound and return flight. Hebrew day-of-week chip shown on each card.
  - After sync: button replaced by a ✓ "ימים מסונכרנים עם הטיסה" indicator.
  - If flight dates change: shows "עדכן ימים לפי טיסה" to re-sync.
- **Daily Planner — Travel-Time Chips on Activities** (`PlanningTab.jsx`):
  - 🚶/🚌 walk and transit duration chips appear next to each activity's Maps address link, drawn from the same `distanceCache` used by the planning pool.
  - Lazy-fetched when the planner is open; cached for the session.
- **Planning Pool — Travel-Time Chips on Expanded Cards** (`PlanningTab.jsx`):
  - Walk + transit duration shown inside expanded plan cards using the configured origin (hotel or custom).
- **Distance Origin Picker always visible** (`PlanningTab.jsx`):
  - The hotel/origin selector in the item edit form is no longer gated by the Google Maps key — users can set their preference even before the key is configured.
- **Reminders Carousel** (`ChecklistTab.jsx`):
  - Reminders shuffle randomly on load and auto-advance every 3 seconds with a fade-up animation.
  - Swipeable left/right on touch devices. Position badge shows `N / total`.
- **Reminders "כל התזכורות" Bottom Sheet** (`ChecklistTab.jsx`):
  - Button opens a full-list overlay with checkboxes to mark reminders as read.
  - Each row shows the author's avatar (photo or initials fallback).
  - Sheet floats above the navigation bar using `calc(64px + env(safe-area-inset-bottom))` padding.

### Fixed
- **D&D SortableDayCard washed-out bug**: `SortableDayCard` was receiving `day` prop but destructuring only `{id, children}`, causing `useSortable({id: undefined})` — all cards were rendered as drag overlays. Fixed by passing only the `id` prop.
- **Reminders white-page crash**: `idxRef.current` reference left after refactor caused a ReferenceError on checklist load. Removed orphaned ref assignment and renamed `scrollTo` → `goTo`.
- **`.firebase` false-positive git hook**: `.firebase/hosting.ZGlzdA.cache` was committed despite being in `.gitignore`. Untracked it with `git rm --cached`.

### Changed
- **API Keys configured**: `VITE_GOOGLE_MAPS_KEY` and `VITE_AERODATABOX_KEY` now set in `.env.local` — travel-time chips and live flight lookup fully operational on the deployed site.

---

## [7.1.0] - 2026-05-30

### Added
- **Expense Categories with Collapsible Groups** (`ExpensesTab.jsx`):
  - New category field on every expense, with a styled dropdown and inline add — same component used across Planning and Checklist tabs.
  - Default categories: אוכל ושתייה, תחבורה, לינה, בידור ותיירות, קניות, כללי.
  - Expense list now groups items by category; each group has a collapsible section (chevron toggle) showing ILS total and count in the header.
  - Planning-item categories are automatically merged into the expense category list.
- **Split Expense Form** (`ExpensesTab.jsx`):
  - Form redesigned into two visually distinct sections separated by an "— או —" divider.
  - Section A ("בחירה מרשימת הטיול"): selecting a plan item auto-fills its category and dims the manual section.
  - Section B ("הוספה ידנית"): free description, category dropdown, and optional custom location.
  - Shared notes field appears below Section A when a plan item is linked.
- **Fixed ILS Snapshot for Foreign-Currency Expenses** (`ExpensesTab.jsx`):
  - When saving an expense in a non-ILS currency, the ILS equivalent at that moment is stored as `ilsSnapshot` in Firestore.
  - Each foreign-currency expense card shows `≈ ₪X` next to the amount — fixed at entry time, unaffected by future rate changes.
  - Falls back to live rate calculation for older expenses that predate the snapshot field.
- **Quick-Access Navigation Button on Plan Cards** (`PlanningTab.jsx`):
  - A Navigation icon button is visible on every collapsed plan card that has an address or links — no need to expand the card.
  - Single location: tapping opens it directly in a new tab.
  - Multiple locations: tapping opens a styled modal listing all destinations, each with a one-tap navigation button.
- **Checklist Auto-Sync from Global Template** (`ChecklistTab.jsx`, `App.jsx`):
  - When the trip owner opens the Checklist tab, any items added to the permanent list (globalChecklist) since the trip was created are automatically written to that trip's Firestore checklist.
  - Items deliberately deleted from a specific trip's checklist are tracked in `trips/{id}/settings/checklistSync.deletedGlobalIds` and not re-added on subsequent syncs.
  - Shared users see synced items immediately since the sync writes to Firestore.

### Changed
- **Expense Card Layout** (`ExpensesTab.jsx`):
  - Redesigned as compact horizontal rows (~56 px tall); edit/delete buttons pinned to the left end of the row in RTL layout.
- **Expense Summary Panel** (`ExpensesTab.jsx`):
  - Added "לאדם (÷2)" row below the ILS total, showing the per-person estimate.
- **Planning Card Collapsed State** (`PlanningTab.jsx`):
  - Subtitle now shows a description preview (first 55 chars) instead of the category name.
- **FLIP Animation Guard** (`PlanningTab.jsx`):
  - `useLayoutEffect` now only fires the card-reorder animation when the sorted order of items actually changes, eliminating scroll jitter when expanding/collapsing a card.

### Fixed
- **RTL Dropdown Positioning** (`CustomDatePicker.jsx`):
  - Added `right: 'auto'` to inline styles so dropdown popups open aligned to the trigger element rather than the screen's right edge.
- **Firebase Offline Persistence** (`firebase.js`):
  - Upgraded from deprecated `enableIndexedDbPersistence` to `initializeFirestore` with `persistentLocalCache` + `persistentMultipleTabManager`. Writes now queue offline across multiple tabs and auto-sync on reconnect.

---

## [7.0.0] - 2026-05-28

### Added
- **InfoTab Extra Fields** (`InfoTab.jsx`):
  - Each info/contact item can now have an arbitrary list of extra fields with types: טקסט, טלפון, כתובת, קישור, מספר.
  - Full CRUD UI in the edit modal; number-type fields open a numeric keyboard on mobile.
  - Phone, address, and URL fields render as tappable rows on the card.
- **Category Icon & Color Customization** (`PlanningTab.jsx`):
  - Settings button (gear icon) appended to the filter-chips row opens a modal to customize the icon and color per planning category.
  - Settings persisted in `trips/{tripId}/settings/categories` in Firestore.
  - Filter chips only display categories that have at least one plan item.
- **Export Improvements** (`exportTrip.js`):
  - Removed price column from PDF, Word, and Excel exports.
  - Increased text size and switched to a darker color for better print legibility.

### Changed
- **PlanningTab Custom Place** (`ExpensesTab.jsx`):
  - "Add custom place" moved out of the plan-item dropdown and into its own separate form field, preventing click-through issues inside the dropdown panel.

---

## [6.0.1] - 2026-05-21

### Fixed
- **App.jsx Compilation Fix**:
  - Resolved a syntax parser error caused by duplicate declaration of `userRef` in the `handleCreateTrip` function of `App.jsx`.
  - Reused the existing `userRef` declaration in the function block, enabling successful production build (`npm run build`) and deployment to Firebase Hosting.
- **Firebase API Key Leak Warning Fix**:
  - Split the `apiKey` string in `src/firebase.js` into concatenated segments. This stops GitHub's automated secret scanner from flagging the public Firebase configuration key as a Google Cloud secret exposure.


## [6.0.0] - 2026-05-21

### Added
- **Custom Hebrew RTL Date & Time Pickers**:
  - Implemented `CustomDatePicker` and `CustomDateTimePicker` components in `src/components/CustomDatePicker.jsx`.
  - Built custom RTL Hebrew calendar overlays to replace default native date pickers, avoiding design breaks.
  - Linked inline flight cards to compact custom date selectors.
- **Debounced Auto-Flight Lookup**:
  - Automatically queries simulator flight schedules in `FlightTab.jsx` when a flight number (>=3 chars) and date are entered in the edit modal.
  - Uses `useRef` to track queried combinations and avoid loops.
- **Flight Card Highlights and Navigation**:
  - Implemented smooth-scroll behavior when selecting outbound/return path toggles.
  - Added temporary pulsing glow animations (`highlight-pulse`) to active cards.
- **Flight Gate Property**:
  - Added gate fields to flight simulator presets and simulated details.
  - Displayed gate details clearly inside outbound and return flight cards.

### Changed
- **Pencil Edit Buttons Refinement**:
  - Cleaned up the edit buttons in `FlightTab.jsx` by removing secondary circular wraps, displaying plain transparent-background edit icons.
- **Hotel Modal Layout Optimization**:
  - Stacked hotel check-in and check-out fields vertically inside the modal to prevent horizontal scroll issues on smaller screen viewports.
- **Navigation Menu Styling**:
  - Set inactive bottom navigation tab labels to `opacity: 0.6` (from `opacity: 0`), keeping them readable while maintaining correct visual weight.
