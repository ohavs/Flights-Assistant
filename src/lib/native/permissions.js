// The Android permissions the app uses, for the list in settings: whether
// each is on now, and a shortcut to Android's own page for it. A permission
// the app comes to need later is one more entry in PERMISSIONS (and a case
// in AppToolsPlugin.permissions / openSettings). App only.
import { isNative } from '../platform';
import { AppTools } from './appTools';
import { notifyPermission } from './notify';

export const PERMISSIONS = [
  { key: 'notifications', label: 'התראות', hint: 'טיסות ותזכורות' },
  { key: 'exactAlarms', label: 'התראה בזמן מדויק', hint: 'בלי זה אנדרואיד עלול לאחר התראה בכמה דקות' },
  { key: 'installs', label: 'התקנת עדכונים', hint: 'מאפשר ל"בדוק עדכונים" להתקין גרסה חדשה' },
];

// → { notifications, exactAlarms, installs } as booleans, or null.
export async function permissionStatus() {
  if (!isNative) return null;
  try { return await AppTools.permissions(); } catch { return null; }
}

// Notifications never asked for get Android's question first; anything
// else opens Android's page for that permission, to turn it on or off.
export async function openPermission(key) {
  if (!isNative) return;
  if (key === 'notifications' && (await notifyPermission()) === 'prompt') {
    if ((await notifyPermission({ ask: true })) === 'granted') return;
  }
  try { await AppTools.openSettings({ target: key }); } catch { /* no such page */ }
}
