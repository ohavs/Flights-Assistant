// The launcher icon (Android app only): five designs (scripts/app-icons.mjs),
// each with the palette that goes with it. AppIcons (Android) switches the
// launcher alias once the user leaves the app, or at once on request.
import { isNative } from '../platform';
import { AppTools } from './appTools';

export const APP_ICONS = [
  { key: 'classic', label: 'קלאסי', palette: 'green' },
  { key: 'sunset',  label: 'שקיעה', palette: 'coral' },
  { key: 'night',   label: 'לילה',  palette: 'violet' },
  { key: 'map',     label: 'מפה',   palette: 'sand' },
  { key: 'sea',     label: 'ים',    palette: 'ocean' },
];

// { icon, pending }: the icon picked, and whether it still waits for the
// user to leave the app. null on the web.
export async function appIcon() {
  if (!isNative) return null;
  try {
    const r = await AppTools.getIcon();
    return { icon: r.icon || 'classic', pending: !!r.pending };
  } catch { return null; }
}

export async function setAppIcon(key) {
  if (!isNative) return null;
  try {
    const r = await AppTools.setIcon({ icon: key });
    return { icon: r?.icon || key, pending: !!r?.pending };
  } catch { return null; }
}

// Switches now: the app goes to the background, the launcher shows the new
// icon at once, and the app opens from it fresh.
export async function applyAppIconNow() {
  if (!isNative) return;
  try { await AppTools.applyIconNow(); } catch { /* an app from before 8.37.0 */ }
}
