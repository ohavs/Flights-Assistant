// Reads the GitHub Release the app updates from. Pure, so it can be tested
// without a device: tests/release.test.mjs.
//
// Each release is tagged v<versionName> and its notes end with a marker
// <!-- update {"versionCode":N,"sha256":"…","apk":"flights-assistant.apk"} -->
// written by .github/workflows/android.yml.
export function parseRelease(rel) {
  const m = /<!--\s*update\s*(\{[\s\S]*?\})\s*-->/.exec(rel?.body || '');
  if (!m) return null;
  let meta;
  try { meta = JSON.parse(m[1]); } catch { return null; }
  const asset = (rel.assets || []).find((a) => a.name === meta.apk);
  if (!asset || !Number.isInteger(meta.versionCode) || !/^[0-9a-f]{64}$/.test(meta.sha256 || '')) return null;
  const notes = rel.body.replace(m[0], '').trim();
  return {
    versionName: String(rel.tag_name || '').replace(/^v/, ''),
    versionCode: meta.versionCode,
    sha256: meta.sha256,
    url: asset.browser_download_url,
    sizeMb: Math.round(asset.size / 1e5) / 10,
    notes: notes.split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean),
    publishedAt: rel.published_at,
  };
}
