// Opens a short Google Maps link (maps.app.goo.gl) on the server, where it
// is a plain redirect (8.89.0). In the browser it can't be read (CORS), and
// the public proxies the app used for it were down, so a place shared as a
// short link was located by its name, flagged "מיקום משוער", for good.
//
// A link shared from Android leads to a URL with the place's pin
// (`!3d…!4d…`); one shared from an iPhone (`?g_st=ic`) leads to
// `maps.google.com/?q=<name, address>&ftid=…`, with no coordinates. Then
// `query` is that text, Google's own name and address of the place, which
// the app looks up (its Maps key is a browser key, for the app only).
//
// → { url, at: "lat,lng" | null, query: string | null }

const SHORT = /^(?:maps\.app\.goo\.gl|goo\.gl)$/i;
const GOOGLE = /(?:^|\.)google\.[a-z.]+$|(?:^|\.)goo\.gl$/i;
const MAX_HOPS = 6;

// Same order as the app (src/services/distanceApi.js): the place's own pin
// first, `@lat,lng` (where the map was centred) last.
export function coordsInUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const pin = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pin) return `${pin[1]},${pin[2]}`;
  const q = url.match(/[?&](?:q|query|destination|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
  if (q) return `${q[1]},${q[2]}`;
  const ll = url.match(/[?&]ll=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i);
  if (ll) return `${ll[1]},${ll[2]}`;
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return `${at[1]},${at[2]}`;
  return null;
}

// The place named by a Maps URL without coordinates: `?q=` / `?query=`, or
// the name in `/maps/place/<name>/`.
export function queryInUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const q = (u.searchParams.get('q') || u.searchParams.get('query') || '').trim();
  if (q && !/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(q)) return q;
  const m = u.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (m && !m[1].startsWith('data=')) {
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim() || null; } catch { return null; }
  }
  return null;
}

// Only links of Google's short-link hosts are opened, so this is not a way
// to fetch anything else.
export function isShortMapsLink(url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { return false; }
  if (!/^https?:$/.test(u.protocol) || !SHORT.test(u.hostname)) return false;
  return u.hostname.toLowerCase() !== 'goo.gl' || u.pathname.startsWith('/maps');
}

// A Maps URL inside a page that answered instead of redirecting.
function urlInPage(html) {
  if (!html) return null;
  const patterns = [
    /http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i,
    /property=["']og:url["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:url["']/i,
    /rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
    /(https:\/\/(?:www\.|maps\.)?google\.[a-z.]+\/maps[^"'\s<>\\]+)/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1].replace(/&amp;/g, '&');
  }
  return null;
}

export async function expandMapsLink(url, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  let cur = String(url).trim();
  const answer = () => ({ url: cur, at: coordsInUrl(cur), query: coordsInUrl(cur) ? null : queryInUrl(cur) });
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (coordsInUrl(cur)) break;
    let host;
    try { host = new URL(cur).hostname; } catch { break; }
    if (!GOOGLE.test(host)) break;
    // Google's consent page carries the address it stands in front of.
    if (/^consent\./i.test(host)) {
      const cont = new URL(cur).searchParams.get('continue');
      if (!cont) break;
      cur = cont;
      continue;
    }
    // Past the short link, the URL itself is what is wanted: a place
    // query needs no more pages.
    if (hop > 0 && queryInUrl(cur)) break;
    const res = await fetchImpl(cur, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; trip-planner)', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      cur = new URL(loc, cur).toString();
      continue;
    }
    if (res.ok && hop === 0) {
      const next = urlInPage(await res.text());
      if (next) { cur = new URL(next, cur).toString(); continue; }
    }
    break;
  }
  return answer();
}
