import { useCallback, useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { RefreshCw, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import Sheet from '../ui/Sheet';
import { appVersion } from '../lib/platform';
import { canInstallUpdates, checkForUpdate, installUpdate, openInstallSettings } from '../lib/updater';

/* App settings (Android app only): the installed version and "check for
   updates" — compare with the latest GitHub Release, download it in-app,
   verify its checksum and open Android's installer. `initial` is a check
   result from the launch banner, so the sheet opens straight on it. */
export default function AppSettingsSheet({ onClose, initial }) {
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
    <Sheet title="הגדרות" onClose={onClose}>
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
    </Sheet>
  );
}
