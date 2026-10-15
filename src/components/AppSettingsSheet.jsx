import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { RefreshCw, Download, CheckCircle2, AlertCircle, Bell, FileType2, FileText, FileSpreadsheet,
  Archive, Upload, Loader2, AlarmClock, ShieldCheck, ChevronLeft, KeyRound, Palette, Sun, Moon, Smartphone, LayoutGrid } from 'lucide-react';
import Sheet, { Segmented } from '../ui/Sheet';
import { useTheme } from '../ThemeContext';
import { PALETTES } from '../lib/theme';
import SectionHeader from '../ui/SectionHeader';
import Notice from '../ui/Notice';
import { Pill } from '../ui/kit';
import { CustomTimePicker } from './CustomDatePicker';
import { NOTIFY_KINDS, notifyPrefs, setNotifyPref, notifyPermission, morningTime, setMorningTime } from '../lib/native/notify';
import { PERMISSIONS, permissionStatus, openPermission } from '../lib/native/permissions';
import { widgetStatus, pinWidget } from '../lib/native/widget';
import { appVersion, isNative } from '../lib/platform';
import { canInstallUpdates, checkForUpdate, installUpdate, openInstallSettings } from '../lib/updater';
import { loadTripExportData, exportTripPdf, exportTripDocx, exportTripXlsx } from '../services/exportTrip';
import { exportTripBackup, saveBackupFile, importTripBackup } from '../services/backupTrip';
import { useDeleteCode, validCode, checkCode, saveCode } from '../lib/deleteCode';

/* Settings, on the web and in the Android app.
   Both: export a trip to PDF, Word or Excel; back a trip up to a file and
   import one back. In the app a file opens Android's share sheet (save
   to Files or Drive, or send it), since a WebView cannot download.
   App only: notifications; the permissions the app uses, each with its
   state and a shortcut to Android's page for it; and the installed
   version with "check for updates" — compare with the latest GitHub Release, download it in-app,
   verify its checksum and open Android's installer.
   `initial` is an update check from the launch banner, so the sheet opens
   straight on it. `onNotifyChange` reschedules after a switch. `trips`
   and `uid` are absent on the sign-in screen, which shows updates only;
   `tripId` and `activeTab` preselect the export when opened in a trip.
   Each section opens and closes on its title, and stays as it was left. */

const OPEN_KEY = 'settingsOpen';
const readOpen = () => {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY)) || {}; } catch { return {}; }
};

// A section of the sheet, folded to its title until opened. `meta` is a
// glance at its state for when it is folded; `force` opens it without
// remembering that (the update banner opens the sheet on its update).
function SettingsGroup({ id, title, Icon, meta, force, children }) {
  const [open, setOpen] = useState(() => !!force || !!readOpen()[id]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify({ ...readOpen(), [id]: next })); } catch { /* private mode */ }
  };
  return (
    <section className="sheet-section settings-group">
      <SectionHeader title={title} icon={Icon && <Icon size={17} />} meta={meta}
        collapsed={!open} onToggle={toggle} toggleProps={{ 'aria-controls': `settings-${id}` }} />
      {open && <div id={`settings-${id}`} className="settings-group-body">{children}</div>}
    </section>
  );
}

function NotifySettings({ onChange }) {
  const [prefs, setPrefs] = useState(notifyPrefs);
  const [perm, setPerm] = useState(null);
  const [time, setTime] = useState(morningTime);
  useEffect(() => { notifyPermission().then(setPerm); }, []);
  const changeTime = (t) => {
    setMorningTime(t);
    setTime(t);
    onChange?.();
  };
  const toggle = async (key) => {
    const on = !prefs[key];
    if (on) setPerm(await notifyPermission({ ask: true }));
    setPrefs(setNotifyPref(key, on));
    onChange?.();
  };
  const on = NOTIFY_KINDS.filter(k => prefs[k.key]).length;
  const meta = on === 0 ? 'כבויות' : on === NOTIFY_KINDS.length ? 'פעילות' : `${on} מתוך ${NOTIFY_KINDS.length} פעילות`;
  return (
    <SettingsGroup id="notify" title="התראות" Icon={Bell} meta={meta}>
      <div className="list-group">
        {NOTIFY_KINDS.map(k => (
          <button key={k.key} type="button" role="switch" aria-checked={!!prefs[k.key]} className="list-row" onClick={() => toggle(k.key)}>
            <Bell size={16} className="list-row-icon" />
            <span className="list-row-label">
              {k.label}
              <span className="list-row-hint">{k.hint}</span>
            </span>
            <span className={`switch${prefs[k.key] ? ' on' : ''}`} aria-hidden="true"><i /></span>
          </button>
        ))}
      </div>
      {prefs.morning && (
        <div className="settings-time" data-testid="morning-time">
          <CustomTimePicker label="שעת סיכום הבוקר" value={time} onChange={changeTime} />
        </div>
      )}
      {perm === 'denied' && Object.values(prefs).some(Boolean) && (
        <div className="settings-hint">ההתראות חסומות בטלפון. אפשר להפעיל אותן ב"הרשאות" כאן למטה.</div>
      )}
    </SettingsGroup>
  );
}


// The home screen widget: whether one is placed, and a button that asks the
// launcher to add it (Android 8+ launchers that allow it). Back from the
// launcher's dialog (resume), the count refreshes.
function WidgetSettings() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    const check = () => widgetStatus().then(setStatus);
    check();
    const h = CapApp.addListener('resume', check);
    return () => { h.then(x => x.remove()); };
  }, []);
  if (!status) return null;
  const placed = status.count > 0;
  return (
    <SettingsGroup id="widget" title="ווידג׳ט במסך הבית" Icon={LayoutGrid} meta={placed ? 'במסך הבית' : null}>
      <div className="settings-hint" style={{ marginTop: 0 }}>
        הטיסה הבאה עם ספירה לאחור, ובזמן הטיול התוכנית של היום. למטה: כמה נארז וכמה תזכורות פתוחות. לחיצה פותחת את הטיול.
      </div>
      {status.pinSupported ? (
        <button type="button" className="btn-secondary" onClick={() => pinWidget()}>
          <LayoutGrid size={16} /> {placed ? 'להוסיף עוד אחד' : 'להוסיף למסך הבית'}
        </button>
      ) : (
        <div className="settings-hint">לחיצה ארוכה על מסך הבית ← ווידג׳טים ← עוזר טיסות.</div>
      )}
    </SettingsGroup>
  );
}

const PERMISSION_ICONS = { notifications: Bell, exactAlarms: AlarmClock, installs: Download };

// Each permission with its state; a tap opens Android's page for it. Back
// from there (resume) the states refresh, and notifications are scheduled
// again, so a newly allowed exact alarm applies to them too.
function PermissionSettings({ onChange }) {
  const [st, setSt] = useState(null);
  const changed = useRef(onChange);
  useEffect(() => { changed.current = onChange; }, [onChange]);
  useEffect(() => {
    const refresh = () => permissionStatus().then(setSt);
    refresh();
    const sub = CapApp.addListener('resume', () => { refresh(); changed.current?.(); });
    return () => { sub.then((s) => s.remove()); };
  }, []);
  const off = st ? PERMISSIONS.filter(p => !st[p.key]).length : null;
  const meta = off == null ? null : off === 0 ? 'הכל מאושר' : `${off} לא מאושרות`;
  return (
    <SettingsGroup id="permissions" title="הרשאות" Icon={ShieldCheck} meta={meta}>
      <div className="list-group">
        {PERMISSIONS.map(p => {
          const Icon = PERMISSION_ICONS[p.key] || ShieldCheck;
          const on = st?.[p.key];
          return (
            <button key={p.key} type="button" className="list-row" onClick={() => openPermission(p.key)}>
              <Icon size={16} className="list-row-icon" />
              <span className="list-row-label">
                {p.label}
                <span className="list-row-hint">{p.hint}</span>
              </span>
              {st && <Pill size="sm" tone={on ? 'mint' : 'red'}>{on ? 'מאושר' : 'לא מאושר'}</Pill>}
              <ChevronLeft size={16} className="list-row-chevron" />
            </button>
          );
        })}
      </div>
      <div className="settings-hint">לחיצה פותחת את המסך של אנדרואיד להפעלה או לכיבוי.</div>
    </SettingsGroup>
  );
}

const SCOPES = [
  { key: 'all',       label: 'הכל' },
  { key: 'flight',    label: 'טיסה ומלון' },
  { key: 'planning',  label: 'תכנון' },
  { key: 'checklist', label: "צ'קליסט" },
  { key: 'info',      label: 'מידע חשוב' },
  { key: 'expenses',  label: 'הוצאות' },
];
const FORMATS = [
  { kind: 'pdf',  label: 'PDF',   Icon: FileType2,       run: exportTripPdf },
  { kind: 'docx', label: 'Word',  Icon: FileText,        run: exportTripDocx },
  { kind: 'xlsx', label: 'Excel', Icon: FileSpreadsheet, run: exportTripXlsx },
];

const lastBackup = (tripId) => {
  try {
    const at = localStorage.getItem(`lastExport_${tripId}`);
    return at ? new Date(at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.') : null;
  } catch { return null; }
};

function FileSettings({ trips, uid, tripId, activeTab }) {
  const [selId, setSelId] = useState(() => (trips.some(t => t.id === tripId) ? tripId : trips[0]?.id) || '');
  const [scope, setScope] = useState(() => (SCOPES.some(s => s.key === activeTab) ? activeTab : 'all'));
  const [busy, setBusy] = useState(null); // pdf | docx | xlsx | backup | import
  const [msg, setMsg] = useState(null);   // { tone, text, for: 'export' | 'backup' }
  const [, setTick] = useState(0);
  const fileRef = useRef(null);
  // A trip that appeared after the sheet opened (the first one, imported) counts too.
  const trip = trips.find(t => t.id === selId) || trips[0];
  const savedText = isNative ? null : 'הקובץ ירד למכשיר';

  const exportAs = async (f) => {
    if (busy || !trip) return;
    setBusy(f.kind); setMsg(null);
    try {
      await f.run(await loadTripExportData(trip.id, trip), scope);
      if (savedText) setMsg({ tone: 'success', text: savedText, for: 'export' });
    } catch (err) {
      console.error('Export failed:', err);
      setMsg({ tone: 'error', text: 'הייצוא נכשל: ' + (err?.message || err), for: 'export' });
    } finally { setBusy(null); }
  };

  const backup = async () => {
    if (busy || !trip) return;
    setBusy('backup'); setMsg(null);
    try {
      await saveBackupFile(await exportTripBackup(trip.id, trip), trip.name);
      try { localStorage.setItem(`lastExport_${trip.id}`, new Date().toISOString()); } catch { /* private mode */ }
      setTick(t => t + 1);
      if (savedText) setMsg({ tone: 'success', text: savedText, for: 'backup' });
    } catch (err) {
      console.error('Backup failed:', err);
      setMsg({ tone: 'error', text: 'הגיבוי נכשל: ' + (err?.message || err), for: 'backup' });
    } finally { setBusy(null); }
  };

  const importFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('import'); setMsg(null);
    try {
      const data = JSON.parse(await file.text());
      await importTripBackup(data, uid);
      setMsg({ tone: 'success', text: `"${data.trip?.name || 'טיול'} (יובא)" נוסף לרשימת הטיולים`, for: 'backup' });
    } catch (err) {
      console.error('Import failed:', err);
      const text = err instanceof SyntaxError ? 'זה לא קובץ גיבוי של עוזר טיסות' : (err?.message || 'הייבוא נכשל. ודא שהקובץ תקין');
      setMsg({ tone: 'error', text, for: 'backup' });
    } finally { setBusy(null); }
  };

  const last = trip && lastBackup(trip.id);
  return (
    <>
      <SettingsGroup id="export" title="ייצוא לקובץ" Icon={FileType2}>
        {trips.length === 0 ? (
          <div className="settings-hint">עוד אין טיולים לייצא.</div>
        ) : (
          <div className="settings-card">
            {trips.length > 1 && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="settings-trip">טיול</label>
                <select id="settings-trip" className="form-control" value={trip?.id || ''} onChange={e => { setSelId(e.target.value); setMsg(null); }}>
                  {trips.map(t => <option key={t.id} value={t.id}>{t.name || 'טיול'}</option>)}
                </select>
              </div>
            )}
            <div className="field-label">מה לכלול</div>
            <div className="chip-wrap" role="group" aria-label="מה לכלול">
              {SCOPES.map(s => (
                <button key={s.key} type="button" className="chip" aria-pressed={scope === s.key} onClick={() => setScope(s.key)}>{s.label}</button>
              ))}
            </div>
            <div className="settings-formats">
              {FORMATS.map(f => (
                <button key={f.kind} type="button" className="btn-secondary" disabled={!!busy} onClick={() => exportAs(f)}
                  aria-label={`ייצוא ל-${f.label}`}>
                  {busy === f.kind ? <Loader2 size={16} className="spinning" /> : <f.Icon size={16} />}
                  {f.label}
                </button>
              ))}
            </div>
            {msg?.for === 'export' && <Notice tone={msg.tone}>{msg.text}</Notice>}
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup id="backup" title="גיבוי ושחזור" Icon={Archive} meta={last ? `אחרון: ${last}` : null}>
        <div className="list-group">
          {trip && (
            <button type="button" className="list-row" onClick={backup} disabled={!!busy}>
              <Archive size={16} className="list-row-icon" />
              <span className="list-row-label">
                גיבוי של {trip.name || 'הטיול'}
                <span className="list-row-hint">{last ? `גיבוי אחרון: ${last}` : 'עוד לא גובה'} · כל פרטי הטיול בקובץ אחד</span>
              </span>
              {busy === 'backup' && <Loader2 size={16} className="spinning" />}
            </button>
          )}
          <button type="button" className="list-row" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            <Upload size={16} className="list-row-icon" />
            <span className="list-row-label">
              ייבוא טיול מגיבוי
              <span className="list-row-hint">נוצר טיול חדש עם כל מה שבקובץ</span>
            </span>
            {busy === 'import' && <Loader2 size={16} className="spinning" />}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={importFile} hidden data-testid="backup-import" />
        {msg?.for === 'backup' && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </SettingsGroup>
    </>
  );
}

// Light, dark or the phone's setting, and the palette. The header's
// switch stays for a quick flip. In the app, the launcher icon too.
const MODE_OPTIONS = [
  { key: 'light',  label: 'בהיר',        Icon: Sun },
  { key: 'dark',   label: 'כהה',         Icon: Moon },
  { key: 'system', label: 'לפי הטלפון', Icon: Smartphone },
];
function LookSettings() {
  const { mode, setMode, palette, setPalette } = useTheme();
  const current = PALETTES.find(p => p.key === palette);
  return (
    <SettingsGroup id="look" title="מראה" Icon={Palette}
      meta={`${current?.label || ''} · ${MODE_OPTIONS.find(m => m.key === mode)?.label || ''}`}>
      <Segmented label="בהיר או כהה" value={mode} onChange={setMode} options={MODE_OPTIONS} />
      <div className="palette-grid" role="radiogroup" aria-label="ערכת צבעים">
        {PALETTES.map(p => (
          <button key={p.key} type="button" role="radio" aria-checked={palette === p.key}
            className="palette-swatch" onClick={() => setPalette(p.key)}>
            <img className="palette-swatch-icon" src={`/app-icons/${p.icon}.png`} alt="" />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </SettingsGroup>
  );
}

// The personal code a trip delete asks for: set once (code + again),
// changed with the current one. The delete itself waits 24 hours.
function DeleteCodeSettings({ uid }) {
  const hash = useDeleteCode(uid);
  const [cur, setCur] = useState('');
  const [code, setCode] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState(null);
  const has = !!hash;

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (has && !(await checkCode(uid, cur, hash))) { setMsg({ tone: 'error', text: 'הקוד הנוכחי שגוי' }); return; }
    if (!validCode(code)) { setMsg({ tone: 'error', text: 'קוד של 4 עד 8 ספרות' }); return; }
    if (code !== again) { setMsg({ tone: 'error', text: 'האימות לא תואם לקוד' }); return; }
    await saveCode(uid, code);
    setCur(''); setCode(''); setAgain('');
    setMsg({ tone: 'success', text: has ? 'הקוד הוחלף' : 'קוד המחיקה נשמר' });
  };

  const field = (id, label, value, set) => (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="password" inputMode="numeric" autoComplete="off" maxLength={8}
        className="form-control code-input" value={value}
        onChange={e => { set(e.target.value.replace(/\D/g, '')); setMsg(null); }} />
    </div>
  );

  return (
    <SettingsGroup id="deleteCode" title="קוד מחיקה" Icon={KeyRound}
      meta={hash === undefined ? null : has ? 'מוגדר' : 'לא מוגדר'}>
      <div className="settings-hint">
        מחיקת טיול דורשת את הקוד הזה. אחרי הקוד הטיול נמחק רק בעוד 24 שעות, ועד אז אפשר לבטל מכרטיס הטיול.
      </div>
      {hash !== undefined && (
        <form className="settings-card" onSubmit={submit}>
          <div className="field-label">{has ? 'שינוי קוד' : 'הגדרת קוד (4 עד 8 ספרות)'}</div>
          {has && field('code-current', 'הקוד הנוכחי', cur, setCur)}
          {field('code-new', has ? 'קוד חדש' : 'קוד', code, setCode)}
          {field('code-again', 'שוב, לאימות', again, setAgain)}
          <button type="submit" className="btn-primary" disabled={!code || !again || (has && !cur)}>
            {has ? 'החלף קוד' : 'שמור קוד'}
          </button>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        </form>
      )}
    </SettingsGroup>
  );
}

function UpdateSettings({ initial }) {
  // idle | checking | uptodate | available | permission | downloading | installing | error
  const [state, setState] = useState(initial?.available ? 'available' : 'idle');
  const [info, setInfo] = useState(initial || null);
  const [current, setCurrent] = useState(initial?.current || null);
  const [pct, setPct] = useState(0);

  useEffect(() => { appVersion().then(setCurrent).catch(() => {}); }, []);

  const check = useCallback(async () => {
    setState('checking');
    try {
      const r = await checkForUpdate();
      setInfo(r);
      setState(r.available ? 'available' : 'uptodate');
    } catch {
      setState('error');
    }
  }, []);

  // Coming back from Android's "install unknown apps" screen: carry on.
  useEffect(() => {
    if (state !== 'permission') return undefined;
    const sub = CapApp.addListener('resume', async () => {
      if (await canInstallUpdates()) setState('available');
    });
    return () => { sub.then((s) => s.remove()); };
  }, [state]);

  const update = async () => {
    if (!(await canInstallUpdates())) { setState('permission'); return; }
    setState('downloading'); setPct(0);
    try {
      await installUpdate(info.latest, (p) => setPct(Math.max(0, p)));
      setState('installing');
    } catch {
      setState('error');
    }
  };

  const latest = info?.latest;
  const showLatest = latest && ['available', 'permission', 'downloading', 'installing'].includes(state);

  return (
    <SettingsGroup id="updates" title="עדכונים" Icon={RefreshCw} force={initial?.available}
      meta={latest && state === 'available' ? `גרסה ${latest.versionName} זמינה` : current?.name}>
      <div className="settings-card" style={{ gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>
            הגרסה שלך: {current ? current.name : '…'}
          </div>
          {['idle', 'uptodate', 'error'].includes(state) && (
            <button type="button" className="btn-primary" onClick={check} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <RefreshCw size={16} /> בדוק עדכונים
            </button>
          )}
        </div>

        {state === 'checking' && (
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>בודק אם יש גרסה חדשה…</div>
        )}
        {state === 'uptodate' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'var(--c-green)' }}>
            <CheckCircle2 size={16} /> יש לך את הגרסה האחרונה
          </div>
        )}
        {state === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'var(--c-red)' }}>
            <AlertCircle size={16} /> לא הצלחתי לבדוק או להוריד. בדוק חיבור לאינטרנט ונסה שוב.
          </div>
        )}

        {showLatest && (
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>גרסה {latest.versionName} זמינה</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{latest.sizeMb}MB</div>
            {latest.notes.length > 0 && (
              <ul style={{ margin: '10px 0 0', paddingInlineStart: 18, fontSize: 14, lineHeight: 1.55 }}>
                {latest.notes.slice(0, 8).map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
          </div>
        )}

        {state === 'permission' && (
          <div style={{ fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>
            אנדרואיד צריך אישור חד־פעמי להתקין עדכונים מהאפליקציה. במסך שייפתח הפעל את "אפשר מהמקור הזה" וחזור לכאן.
          </div>
        )}
        {state === 'downloading' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
              <span>מוריד</span><span>{pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--ink-6)', marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 999, transition: 'width .15s linear' }} />
            </div>
          </div>
        )}
        {state === 'installing' && (
          <div style={{ fontSize: 14, fontWeight: 700 }}>אשר את ההתקנה בחלון של אנדרואיד.</div>
        )}

        {state === 'available' && (
          <button type="button" className="btn-primary" onClick={update} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Download size={16} /> עדכן עכשיו
          </button>
        )}
        {state === 'permission' && (
          <button type="button" className="btn-primary" onClick={openInstallSettings}>אפשר התקנת עדכונים</button>
        )}
      </div>
    </SettingsGroup>
  );
}

export default function AppSettingsSheet({ onClose, initial, onNotifyChange, trips, uid, tripId, activeTab }) {
  return (
    <Sheet title="הגדרות" onClose={onClose}>
      <LookSettings />
      {isNative && <NotifySettings onChange={onNotifyChange} />}
      {isNative && <WidgetSettings />}
      {isNative && <PermissionSettings onChange={onNotifyChange} />}
      {uid && <FileSettings trips={trips || []} uid={uid} tripId={tripId} activeTab={activeTab} />}
      {uid && <DeleteCodeSettings uid={uid} />}
      {isNative && <UpdateSettings initial={initial} />}
    </Sheet>
  );
}
