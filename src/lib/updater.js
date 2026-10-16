// In-app updates from GitHub Releases (Android app only; on the web every
// call is a no-op). The release format is in release.js.
import { registerPlugin } from '@capacitor/core';
import { appVersion, isNative } from './platform.js';
import { parseRelease } from './release.js';

const ApkUpdater = registerPlugin('ApkUpdater');
const REPO = 'ohavs/Flights-Assistant';
const LAST_CHECK_KEY = 'update-last-check';

// → { current, latest, available } ; throws on network errors.
export async function checkForUpdate() {
  if (!isNative) return { current: null, latest: null, available: false };
  const [current, res] = await Promise.all([
    appVersion(),
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000),   // a weak connection: an error, not an endless "checking"
    }),
  ]);
  // No release yet reads as "up to date", not as an error.
  if (res.status === 404) return { current, latest: null, available: false };
  if (!res.ok) throw new Error('GitHub ' + res.status);
  const latest = parseRelease(await res.json());
  try { localStorage.setItem(LAST_CHECK_KEY, String(Date.now())); } catch { /* storage unavailable */ }
  return { current, latest, available: !!latest && latest.versionCode > current.code };
}

// Background check on launch, at most every 6 hours. Never throws.
export async function checkForUpdateQuietly() {
  if (!isNative) return null;
  try {
    const last = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);
    if (Date.now() - last < 6 * 3600 * 1000) return null;
  } catch { /* storage unavailable */ }
  try { return await checkForUpdate(); } catch { return null; }
}

export const canInstallUpdates = async () => (await ApkUpdater.canInstall()).allowed;
export const openInstallSettings = () => ApkUpdater.openInstallSettings();

// Downloads, verifies the SHA-256 and opens Android's installer. onProgress(0..100).
export async function installUpdate(latest, onProgress) {
  const sub = await ApkUpdater.addListener('progress', (e) => onProgress?.(e.percent));
  try {
    await ApkUpdater.downloadAndInstall({ url: latest.url, sha256: latest.sha256 });
  } finally {
    sub.remove();
  }
}
