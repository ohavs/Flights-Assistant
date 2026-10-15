import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { RefreshCw, Download, CheckCircle2, AlertCircle, Bell, FileType2, FileText, FileSpreadsheet,
  Archive, Upload, Loader2 } from 'lucide-react';
import Sheet, { SheetSection } from '../ui/Sheet';
import Notice from '../ui/Notice';
import { NOTIFY_KINDS, notifyPrefs, setNotifyPref, notifyPermission } from '../lib/native/notify';
import { appVersion, isNative } from '../lib/platform';
import { canInstallUpdates, checkForUpdate, installUpdate, openInstallSettings } from '../lib/updater';
import { loadTripExportData, exportTripPdf, exportTripDocx, exportTripXlsx } from '../services/exportTrip';
import { exportTripBackup, saveBackupFile, importTripBackup } from '../services/backupTrip';

/* Settings, on the web and in the Android app.
   Both: export a trip to PDF, Word or Excel; back a trip up to a file and
   import one back. In the app a file opens Android's share sheet (save
   to Files or Drive, or send it), since a WebView cannot download.
   App only: notifications, and the installed version with "check for
   updates" — compare with the latest GitHub Release, download it in-app,
   verify its checksum and open Android's installer.
   `initial` is an update check from the launch banner, so the sheet opens
   straight on it. `onNotifyChange` reschedules after a switch. `trips`
   and `uid` are absent on the sign-in screen, which shows updates only;
   `tripId` and `activeTab` preselect the export when opened in a trip. */

function NotifySettings({ onChange }) {
  const [prefs, setPrefs] = useState(notifyPrefs);
  const [perm, setPerm] = useState(null);
  useEffect(() => { notifyPermission().then(setPerm); }, []);
  const toggle = async (key) => {
    const on = !prefs[key];
    if (on) setPerm(await notifyPermission({ ask: true }));
    setPrefs(setNotifyPref(key, on));
    onChange?.();
  };
  return (
    <SheetSection label="התראות">
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
      {perm === 'denied' && Object.values(prefs).some(Boolean) && (
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', lineHeight: 1.5, paddingInline: 4 }}>
          ההתראות חסומות בטלפון. אפשר להפעיל אותן בהגדרות הטלפון ← אפליקציות ← עוזר טיסות ← התראות.
        </div>
      )}
    </SheetSection>
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
  const trip = trips.find(t => t.id === selId);
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
      <SheetSection label="ייצוא לקובץ">
        {trips.length === 0 ? (
          <div className="settings-hint">עוד אין טיולים לייצא.</div>
        ) : (
          <div className="settings-card">
            {trips.length > 1 && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="settings-trip">טיול</label>
                <select id="settings-trip" className="form-control" value={selId} onChange={e => { setSelId(e.target.value); setMsg(null); }}>
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
      </SheetSection>

      <SheetSection label="גיבוי ושחזור">
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
      </SheetSection>
    </>
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
    <section style={{ background: 'var(--surface-2)', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>עדכונים</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            הגרסה שלך: {current ? current.name : '…'}
          </div>
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
    </section>
  );
}

export default function AppSettingsSheet({ onClose, initial, onNotifyChange, trips, uid, tripId, activeTab }) {
  return (
    <Sheet title="הגדרות" onClose={onClose}>
      {isNative && <NotifySettings onChange={onNotifyChange} />}
      {uid && <FileSettings trips={trips || []} uid={uid} tripId={tripId} activeTab={activeTab} />}
      {isNative && <UpdateSettings initial={initial} />}
    </Sheet>
  );
}
