import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  placeUrls, typedAddress, locationFp, atOf, wayOf, savedLocation, locationJob, guessedLocation,
  travelStamp, travelFresh, travelShowable, legDocId, NONE_RETRY_MS,
} from '../src/lib/placeLocation.js';

const short = 'https://maps.app.goo.gl/abc';
const place = (o = {}) => ({ id: 'p1', title: 'Changing of the guard', address: '', links: [], ...o });
const located = (plan, o = {}) => ({ ...plan, coords: { lat: 47.5, lng: 19.04, fp: locationFp(plan), src: 'link', pid: '', ...o } });

test('the links that may say where a place is: a link as its address, then its links', () => {
  assert.deepEqual(placeUrls(place({ address: short, links: [{ url: 'https://x.com' }, { url: short }, {}] })),
    [short, 'https://x.com']);
  assert.deepEqual(placeUrls(place({ address: 'Andrássy út 22' })), []);
  assert.equal(typedAddress(place({ address: ' Andrássy út 22 ' })), 'Andrássy út 22');
  assert.equal(typedAddress(place({ address: short })), '');
});

test('the fingerprint changes with the address, a link or the name, and nothing else', () => {
  const p = place({ address: 'A', links: [{ url: short, label: 'map' }] });
  const fp = locationFp(p);
  assert.equal(locationFp({ ...p, description: 'x', price: '5', visited: true, links: [{ url: short, label: 'other' }] }), fp);
  assert.notEqual(locationFp({ ...p, address: 'B' }), fp);
  assert.notEqual(locationFp({ ...p, links: [] }), fp);
  assert.notEqual(locationFp({ ...p, links: [{ url: 'https://maps.app.goo.gl/def' }] }), fp);
  assert.notEqual(locationFp({ ...p, title: 'Parliament' }), fp);
});

test('a saved location counts only for the place as it is now', () => {
  const p = located(place({ links: [{ url: short }] }));
  assert.equal(savedLocation(p).src, 'link');
  // Edited from anywhere (a link added from the details, a share, another phone).
  assert.equal(savedLocation({ ...p, links: [{ url: 'https://maps.app.goo.gl/new' }] }), null);
  // Saved before 8.88.0, with no fingerprint: found again.
  assert.equal(savedLocation({ ...p, coords: { lat: 1, lng: 2 } }), null);
  // One found on this phone and not saved.
  const runtime = { lat: 1, lng: 2, fp: locationFp(p), src: 'address' };
  assert.equal(savedLocation({ ...p, coords: null }, runtime).src, 'address');
});

test('what a place needs: found, its link tried again, or nothing', () => {
  const p = place({ links: [{ url: short }] });
  assert.equal(locationJob(p), 'resolve');
  assert.equal(locationJob(located(p)), null);
  // A guess by the name while it has a link: the link again, once a session.
  const guess = located(p, { src: 'title' });
  assert.equal(locationJob(guess), 'link');
  assert.equal(locationJob(guess, { linkTried: true }), null);
  // A guess for a place with nothing else is all there is.
  assert.equal(locationJob(located(place(), { src: 'title' })), null);
  // Nothing found: asked again after a while, or when the place changes.
  const none = { ...p, coords: { fp: locationFp(p), src: 'none', t: 1000 } };
  assert.equal(locationJob(none, { now: 1000 + 60000 }), null);
  assert.equal(locationJob(none, { now: 1000 + NONE_RETRY_MS + 1 }), 'resolve');
  assert.equal(locationJob({ ...none, address: 'Somewhere 1' }, { now: 2000 }), 'resolve');
  // Located before 8.90.0: its Google id is looked for, once.
  assert.equal(locationJob(located(p, { pid: undefined })), 'pid');
  assert.equal(locationJob(located(p, { pid: 'ChIJx' })), null);
  assert.equal(locationJob(located(p, { src: 'title', pid: undefined }), { linkTried: true }), 'pid');
});

test('a route goes to the place itself when its id is known, else to the point', () => {
  assert.equal(wayOf({ lat: 47.5, lng: 19.04, pid: 'ChIJx' }), 'place_id:ChIJx');
  assert.equal(wayOf({ lat: 47.5, lng: 19.04, pid: '' }), '47.500000,19.040000');
  assert.equal(wayOf({ lat: 47.5, lng: 19.04 }), '47.500000,19.040000');
  assert.equal(wayOf({ pid: 'ChIJx' }), null);
  assert.equal(wayOf(null), null);
});

test('a guess is flagged by how the place was found, not by a missing address', () => {
  const withLink = place({ links: [{ url: short }] });
  assert.equal(guessedLocation(located(withLink)), null);
  const g = guessedLocation(located(withLink, { src: 'title', name: 'Parliament', addr: 'Kossuth tér' }));
  assert.deepEqual(g, { at: '47.500000,19.040000', name: 'Parliament', address: 'Kossuth tér', hasLink: true, hasAddress: false });
  assert.equal(guessedLocation(located(place({ address: 'Somewhere' }), { src: 'title' })).hasAddress, true);
  // Nothing but a name, not located yet: a guess to come.
  assert.deepEqual(guessedLocation(place()), { at: null, name: '', address: '', hasLink: false, hasAddress: false });
  // A link not opened yet is not flagged before it is tried.
  assert.equal(guessedLocation(withLink), null);
});

test('a travel time is current only for where both ends are now', () => {
  const to = located(place());
  const from = { ...located(place({ id: 'p2', title: 'Palace' })), id: 'p2', coords: { lat: 47.49, lng: 19.03, fp: locationFp(place({ id: 'p2', title: 'Palace' })), src: 'link' } };
  const plans = new Map([['p1', to], ['p2', from]]);
  const opts = { locOf: p => savedLocation(p), planOf: id => plans.get(id), hotelFp: id => `hotel:${id}` };
  const fromHotel = travelStamp(to, 'hotel', opts);
  assert.deepEqual(fromHotel, { toAt: '47.500000,19.040000', originFp: 'hotel:hotel' });
  const fromPlace = travelStamp(to, 'place_p2', opts);
  assert.deepEqual(fromPlace, { toAt: '47.500000,19.040000', originFp: 'place_|47.490000,19.030000' });
  assert.equal(travelStamp(place(), 'hotel', opts), null);
  // Its id found: a new stamp, so the time measured to the point is measured again.
  const byId = { locOf: p => ({ ...savedLocation(p), pid: `id-${p.id}` }), planOf: opts.planOf, hotelFp: opts.hotelFp };
  assert.deepEqual(travelStamp(to, 'place_p2', byId), { toAt: 'place_id:id-p1', originFp: 'place_|place_id:id-p2' });
  assert.equal(travelStamp(to, 'place_gone', opts), null);

  const v = { walk: { seconds: 600 }, toAt: fromHotel.toAt, originFp: fromHotel.originFp };
  assert.equal(travelFresh(v, fromHotel), true);
  assert.equal(travelFresh(v, { ...fromHotel, toAt: '47.400000,19.040000' }), false);  // the place moved
  assert.equal(travelFresh(v, { ...fromHotel, originFp: 'hotel:other' }), false);     // the hotel changed
  assert.equal(travelFresh({ walk: { seconds: 600 } }, fromHotel), false);            // before 8.88.0
  assert.equal(travelFresh({ noLocation: true }, fromHotel), false);
  assert.equal(travelFresh({ manualOverride: true, walk: { seconds: 60 } }, null), true);
});

test('a time saved before 8.88.0 is shown until measured again, unless its start changed', () => {
  const old = { walk: { seconds: 600 }, originFp: 'h1' };
  assert.equal(travelShowable(old, null, 'h1'), true);
  assert.equal(travelShowable(old, null, 'h2'), false);
  assert.equal(travelShowable({ walk: { seconds: 600 } }, null, 'h2'), true);
  assert.equal(travelShowable(old, null, null), true);   // from another place
  assert.equal(travelShowable({ ...old, toAt: '1.000000,2.000000', originFp: 'h1' }, { toAt: '1.000000,2.000000', originFp: 'h1' }), true);
  assert.equal(travelShowable({ ...old, toAt: '1.000000,2.000000' }, { toAt: '3.000000,2.000000', originFp: 'h1' }), false);
  assert.equal(travelShowable({ loading: true }, null), false);
});

test('a point reads the same however it was written; a leg has one id per two ends', () => {
  assert.equal(atOf({ lat: 47.5, lng: 19.04 }), '47.500000,19.040000');
  assert.equal(atOf({ lat: 47.50000004, lng: 19.04 }), '47.500000,19.040000');
  assert.equal(atOf({ lat: NaN, lng: 1 }), null);
  assert.equal(atOf(null), null);
  assert.equal(legDocId('1,2', 'Some St'), legDocId('1,2', 'Some St'));
  assert.notEqual(legDocId('1,2', 'Some St'), legDocId('Some St', '1,2'));
  assert.match(legDocId('a', 'b'), /^l[0-9a-z]+$/);
});

test('a walk between two places is estimated from the line between them', async () => {
  const { walkEstimate, estimateLabel, WALK_DETOUR } = await import('../src/lib/placeLocation.js');
  // Budapest: Buda Castle to Matthias Church, about 700 m apart.
  const castle = { lat: 47.4962, lng: 19.0396 };
  const church = { lat: 47.5020, lng: 19.0343 };
  const e = walkEstimate(castle, church);
  assert.ok(e.meters > 700 * WALK_DETOUR && e.meters < 800 * WALK_DETOUR);
  assert.equal(Math.round(e.seconds / 60), Math.round(e.meters / (5000 / 60)));
  assert.deepEqual(walkEstimate(church, castle), e);
  assert.equal(walkEstimate(castle, null), null);
  assert.equal(walkEstimate(castle, { lat: NaN, lng: 1 }), null);
  assert.equal(walkEstimate(castle, castle).seconds, 0);
  assert.equal(estimateLabel(0), "~1 דק'");
  assert.equal(estimateLabel(12 * 60 + 20), "~12 דק'");
  assert.equal(estimateLabel(65 * 60), "~1 שע' 5 דק'");
});
