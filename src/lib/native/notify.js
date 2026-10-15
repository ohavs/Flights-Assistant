// Local notifications (Android app only; every export is a no-op on the web).
//
// Which kinds are on is a per-device choice kept in localStorage. Each kind
// owns its notifications through `extra.kind`, so syncing one kind cancels
// and reschedules only its own.
//
// Never return the plugin from a promise or an async function: a Capacitor
// plugin is a proxy that answers `then`, and the await would never end
// (see AuthContext). Resolve the module and call the plugin from it.
import { isNative } from '../platform';

const mod = () => import('@capacitor/local-notifications');

const PREFS_KEY = 'notify.prefs';
export const NOTIFY_KINDS = [
  { key: 'flight', label: 'טיסות', hint: "24 שעות לפני (צ'ק־אין) ו־3 שעות לפני ההמראה", default: true },
  { key: 'reminder', label: 'תזכורות', hint: 'בשעה שקבעתם לתזכורת שלכם', default: true },
  { key: 'morning', label: 'סיכום בוקר', hint: 'בכל בוקר בטיול: התוכנית של היום ומזג האוויר', default: true },
];

// The morning summary's time, 'HH:MM' in the phone's own time. Kept apart
// from the switches, which are all booleans.
const MORNING_KEY = 'notify.morningTime';
export function morningTime() {
  try { return localStorage.getItem(MORNING_KEY) || '08:00'; } catch { return '08:00'; }
}
export function setMorningTime(t) {
  try { localStorage.setItem(MORNING_KEY, t); } catch { /* private mode */ }
}

// The first time there is something to notify about, ask, once per phone.
export async function askPermissionOnce() {
  if (!isNative) return;
  let asked = false;
  try { asked = localStorage.getItem('notify.asked') === '1'; } catch { /* private mode */ }
  if (asked) return;
  try { localStorage.setItem('notify.asked', '1'); } catch { /* private mode */ }
  await notifyPermission({ ask: true });
}

export function notifyPrefs() {
  const defaults = Object.fromEntries(NOTIFY_KINDS.map(k => [k.key, k.default]));
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; }
  catch { return defaults; }
}

export function setNotifyPref(kind, on) {
  const next = { ...notifyPrefs(), [kind]: on };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

// 'granted' | 'denied' | 'prompt' | 'unsupported'
export async function notifyPermission({ ask = false } = {}) {
  if (!isNative) return 'unsupported';
  try {
    const { LocalNotifications } = await mod();
    let { display } = await LocalNotifications.checkPermissions();
    if (ask && display !== 'granted') ({ display } = await LocalNotifications.requestPermissions());
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
  } catch { return 'unsupported'; }
}

// Replace every pending notification of `kind` with `alerts`
// ([{ id, at: Date, title, body, extra }]). With the kind switched off,
// or no permission, it only cancels.
export async function syncNotifications(kind, alerts) {
  if (!isNative) return;
  try {
    const { LocalNotifications } = await mod();
    const { notifications: pending } = await LocalNotifications.getPending();
    const mine = pending.filter(n => n.extra?.kind === kind);
    if (mine.length) await LocalNotifications.cancel({ notifications: mine.map(n => ({ id: n.id })) });

    if (!notifyPrefs()[kind] || !alerts.length) return;
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: alerts.slice(0, 60).map(a => ({
        id: a.id,
        title: a.title,
        body: a.body,
        largeBody: a.body,
        schedule: { at: a.at, allowWhileIdle: true },
        smallIcon: 'ic_stat_notify',
        extra: { ...a.extra, kind },
      })),
    });
  } catch (e) {
    console.warn('notifications:', e?.message || e);
  }
}

// Tapping a notification: `handler(extra)`. Returns an unsubscribe.
export function onNotificationTap(handler) {
  if (!isNative) return () => {};
  let sub;
  mod().then(({ LocalNotifications }) =>
    LocalNotifications.addListener('localNotificationActionPerformed', (e) => handler(e.notification?.extra || {}))
  ).then(s => { sub = s; }).catch(() => {});
  return () => { sub?.remove?.(); };
}
