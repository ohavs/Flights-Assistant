/* Where a place is, kept on the place (8.88.0).

   One location per place, saved on its document as
     coords: { lat, lng, fp, src, name?, addr?, pid? }
   `fp` is the fingerprint of what the location was found from (the
   address, the links and the name), so a place edited anywhere (the form,
   a link added from its details, a share from Google Maps, another phone)
   no longer matches and is found again. `src` is how it was found:
     'link'    coordinates in a Maps link, or a short link expanded
     'address' the typed address, searched
     'title'   the name, searched (a guess; `name`/`addr` say what it found)
     'none'    nothing found (`t`: when; tried again after NONE_RETRY_MS)
   `pid` is Google's id of the place ('' when none was found near it).
   Routes go to it, not to the point (8.90.0): a point is taken to the
   nearest road, which for a castle on a hill is the road below it (23
   minutes' walk to the palace next door, instead of 5).
   It stays inside `coords` so the "הוספה" rule (visited, distances, coords)
   holds as it is.

   A travel time saved in `distances[<from>]` keeps where it was measured
   to (`toAt`) and the identity of where it was measured from
   (`originFp`). When either differs from the place's location now, the
   time is measured again. Pure: no network, no storage. */

export const MAPS_SHORT = /maps\.app\.goo\.gl|goo\.gl\/maps/i;
export const NONE_RETRY_MS = 3 * 24 * 3600 * 1000;
export const PLACE_ORIGIN = 'place_';

const isUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(s.trim());

// FNV-1a, 32 bits, in base 36: short enough to sit on every place.
export function hashText(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// The place's links that may say where it is: the address when it is a
// link (a share from Google Maps), then its links, in order.
export function placeUrls(plan) {
  const out = [];
  if (isUrl(plan?.address)) out.push(plan.address.trim());
  (Array.isArray(plan?.links) ? plan.links : []).forEach(l => {
    const u = typeof l?.url === 'string' ? l.url.trim() : '';
    if (u && !out.includes(u)) out.push(u);
  });
  return out;
}

// A typed address (not a link), or ''.
export const typedAddress = (plan) => (isUrl(plan?.address) ? '' : (plan?.address || '').trim());

export function locationFp(plan) {
  return hashText([typedAddress(plan), ...placeUrls(plan), (plan?.title || '').trim()].join('\n'));
}

const finite = (c) => !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng);

// "lat,lng" at six decimals (about 10 cm): the same point always reads
// the same, so it can be compared as text.
export const atOf = (c) => (finite(c) ? `${c.lat.toFixed(6)},${c.lng.toFixed(6)}` : null);

// The saved location when it is of the place as it is now, else null.
// `runtime`: one found on this phone and not saved (a viewer, a failed
// write), used the same way.
// Where a route to a location goes: the place itself when its id is
// known, else the point. Compared as text, like atOf.
export const wayOf = (c) => (!finite(c) ? null : c.pid ? `place_id:${c.pid}` : atOf(c));

export function savedLocation(plan, runtime = null) {
  const fp = locationFp(plan);
  for (const c of [plan?.coords, runtime]) {
    if (c && c.fp === fp && finite(c)) return c;
  }
  return null;
}

// What a place needs now: 'resolve' (no location for what it is now),
// 'link' (found by its name though it has a link: try the link again,
// once a session), 'pid' (located, its Google id never looked for) or
// null. `linkTried`: the link was tried this session.
export function locationJob(plan, { runtime = null, linkTried = false, now = Date.now() } = {}) {
  const fp = locationFp(plan);
  const saved = [plan?.coords, runtime].find(c => c && c.fp === fp);
  if (!saved) return 'resolve';
  if (saved.src === 'none') return now - (saved.t || 0) > NONE_RETRY_MS ? 'resolve' : null;
  if (!finite(saved)) return 'resolve';
  if (saved.src === 'title' && placeUrls(plan).length && !linkTried) return 'link';
  if (saved.pid === undefined) return 'pid';
  return null;
}

// A place whose location is a guess by its name: what is known of it
// ({ at, name, address, hasLink, hasAddress }), else null. A place with
// no address and no link that was not located yet is a guess too (at: null).
export function guessedLocation(plan, runtime = null) {
  if (!plan) return null;
  const hasLink = placeUrls(plan).length > 0;
  const hasAddress = !!typedAddress(plan);
  const loc = savedLocation(plan, runtime);
  if (loc) {
    return loc.src === 'title'
      ? { at: atOf(loc), name: loc.name || '', address: loc.addr || '', hasLink, hasAddress }
      : null;
  }
  if (hasAddress || hasLink) return null;
  return { at: null, name: '', address: '', hasLink: false, hasAddress: false };
}

// The stamp a travel time to `plan` from `originId` must carry to be
// current: { toAt, originFp }, or null while either end has no location.
// `locOf(plan)` → its location; `hotelFp(originId)` → the fingerprint of
// the hotel or extra starting point it names.
export function travelStamp(plan, originId, { locOf, planOf, hotelFp }) {
  const to = wayOf(locOf(plan));
  if (!to) return null;
  if (originId.startsWith(PLACE_ORIGIN)) {
    const from = planOf(originId.slice(PLACE_ORIGIN.length));
    const at = from && wayOf(locOf(from));
    return at ? { toAt: to, originFp: `${PLACE_ORIGIN}|${at}` } : null;
  }
  return { toAt: to, originFp: hotelFp(originId) };
}

// Is this saved/known travel time for where both ends are now? A time
// typed in by hand stays until the place's location is edited.
export function travelFresh(value, stamp) {
  if (!value) return false;
  if (value.manualOverride) return true;
  return !!stamp && !!(value.walk || value.transit)
    && value.toAt === stamp.toAt && value.originFp === stamp.originFp;
}

// May a saved time be shown? A current one, and one measured before 8.88.0
// (no `toAt`: where it went is not known) until it is measured again,
// unless where it starts from is known to have changed (`originFp`, the
// hotel's or a starting point's; null for a time from another place).
export function travelShowable(value, stamp, originFp = null) {
  if (!value) return false;
  if (value.manualOverride) return true;
  if (!(value.walk || value.transit)) return false;
  if (value.toAt) return travelFresh(value, stamp);
  return !originFp || !value.originFp || value.originFp === originFp;
}

// The document id of a leg between two positions ("lat,lng" or an
// address), shared by everyone in the trip: trips/{id}/legs/{legDocId}.
export const legDocId = (from, to) => `l${hashText(`${from}>${to}`)}${hashText(`${to}<${from}`)}`;
