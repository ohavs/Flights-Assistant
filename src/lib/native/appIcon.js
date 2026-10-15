// The launcher icon (Android app only): five designs (scripts/app-icons.mjs),
// each with the palette that goes with it. AppToolsPlugin switches the
// launcher alias once the app goes to the background. On the web, null.
import { isNative } from '../platform';
import { AppTools } from './appTools';

export const APP_ICONS = [
  { key: 'classic', label: 'קלאסי', palette: 'green' },
  { key: 'sunset',  label: 'שקיעה', palette: 'coral' },
  { key: 'night',   label: 'לילה',  palette: 'violet' },
  { key: 'map',     label: 'מפה',   palette: 'sand' },
  { key: 'sea',     label: 'ים',    palette: 'ocean' },
];

export async function appIcon() {
  if (!isNative) return null;
  try { return (await AppTools.getIcon()).icon || 'classic'; } catch { return null; }
}

export async function setAppIcon(key) {
  if (!isNative) return false;
  try { await AppTools.setIcon({ icon: key }); return true; } catch { return false; }
}
