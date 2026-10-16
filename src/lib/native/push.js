// Push from trip partners (N5, Android app only; no-ops on the web).
//
// The server (functions/index.js) sends to every device listed under
// users/{uid}/devices. This phone lists itself there, with its FCM token,
// while the "שינויים של שותפים" switch is on (notify.js), and takes itself
// off when the switch goes off or the user signs out. Only the user can
// read or write their own devices (firestore.rules).
//
// As in notify.js: never return the plugin from a promise; resolve the
// module and call the plugin from it.
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { isNative } from '../platform';

const mod = () => import('@capacitor/push-notifications');

// One id per install, so a phone replaces its own entry, never another's.
function deviceId() {
  try {
    let id = localStorage.getItem('push.device');
    if (!id) {
      id = 'android-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('push.device', id);
    }
    return id;
  } catch { return null; }
}

let current = null;     // the uid the token is saved for
let listening = false;

function listen(PushNotifications) {
  if (listening) return;
  listening = true;
  PushNotifications.addListener('registration', ({ value }) => {
    const id = deviceId();
    if (!current || !id || !value) return;
    setDoc(doc(db, 'users', current, 'devices', id), {
      token: value, platform: 'android', updatedAt: new Date().toISOString(),
    }).catch(err => console.warn('push: save token', err?.code || err));
  });
  PushNotifications.addListener('registrationError', (e) => console.warn('push: register', e?.error || e));
}

// On with `on`, for `uid`; off (and forgotten here) otherwise.
export async function syncPush(uid, on) {
  if (!isNative) return;
  if (!on || !uid) {
    // Only what this run turned on: at start-up, before sign-in is known,
    // there is nothing to undo (and the token is worth keeping).
    if (current) await forgetDevice();
    return;
  }
  current = uid;
  try {
    const { PushNotifications } = await mod();
    listen(PushNotifications);
    await PushNotifications.createChannel({
      id: 'partners', name: 'שינויים של שותפים', importance: 3,
      description: 'כששותף לטיול מוסיף הוצאה, מקום או פעילות, מצטרף, או משנה טיסה או מלון',
    }).catch(() => {});
    await PushNotifications.register();
  } catch (e) {
    console.warn('push:', e?.message || e);
  }
}

// Switch off or sign out: this phone stops getting the account's pushes.
// Bounded: offline it gives up after a moment, and the server forgets the
// token the first time a send to it fails.
export function forgetDevice() {
  if (!isNative || !current) return Promise.resolve();
  const id = deviceId();
  const uid = current;
  current = null;
  // The token goes too, so a list entry left behind offline sends nothing.
  mod().then(({ PushNotifications }) => PushNotifications.unregister()).catch(() => {});
  const gone = id ? deleteDoc(doc(db, 'users', uid, 'devices', id)).catch(() => {}) : Promise.resolve();
  return Promise.race([gone, new Promise(r => setTimeout(r, 2000))]);
}

// Tapping a push: `handler({ tripId, tab })`. Returns an unsubscribe.
export function onPushTap(handler) {
  if (!isNative) return () => {};
  let sub;
  let gone = false;
  mod().then(({ PushNotifications }) =>
    PushNotifications.addListener('pushNotificationActionPerformed', (e) => handler(e.notification?.data || {}))
  ).then(s => { if (gone) s?.remove?.(); else sub = s; }).catch(() => {});
  return () => { gone = true; sub?.remove?.(); };
}
