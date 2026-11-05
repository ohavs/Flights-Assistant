// A short Maps link opened on the server (functions/mapsLink.js).
//   node --test tests/mapsLink.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { coordsInUrl, queryInUrl, isShortMapsLink, expandMapsLink } from '../functions/mapsLink.js';

// A fake fetch: url → { status, location?, body? }.
const web = (pages) => {
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push(url);
    assert.equal(opts.redirect, 'manual');
    const p = pages[url];
    if (!p) throw new Error(`unexpected fetch ${url}`);
    return {
      status: p.status, ok: p.status >= 200 && p.status < 300,
      headers: { get: (h) => (h.toLowerCase() === 'location' ? p.location || null : null) },
      text: async () => p.body || '',
    };
  };
  return { fetchImpl, seen };
};

test('only Google short Maps links are opened', () => {
  assert.equal(isShortMapsLink('https://maps.app.goo.gl/eA3iMAxDhxF9N4Ss5?g_st=ic'), true);
  assert.equal(isShortMapsLink('https://goo.gl/maps/abc'), true);
  assert.equal(isShortMapsLink('https://goo.gl/abc'), false);
  assert.equal(isShortMapsLink('https://evil.com/maps.app.goo.gl'), false);
  assert.equal(isShortMapsLink('https://maps.app.goo.gl.evil.com/x'), false);
  assert.equal(isShortMapsLink('file:///etc/passwd'), false);
  assert.equal(isShortMapsLink(''), false);
});

test('coordinates: the pin first, the map centre last', () => {
  assert.equal(coordsInUrl('https://www.google.com/maps/place/X/@47.1,19.1,17z/data=!3d47.5!4d19.05'), '47.5,19.05');
  assert.equal(coordsInUrl('https://maps.google.com/?q=47.5,19.05'), '47.5,19.05');
  assert.equal(coordsInUrl('https://www.google.com/maps/@47.1,19.1,15z'), '47.1,19.1');
  assert.equal(coordsInUrl('https://maps.google.com/?q=Pop%26Roll&ftid=0x1:0x2'), null);
});

test('a place query: q, query, or the name in /maps/place/', () => {
  assert.equal(queryInUrl('https://maps.google.com/?q=Pop%26Roll+Art+Shop,+Dorottya+u.+6,+Budapest&ftid=0x1:0x2&g_st=ic'),
    'Pop&Roll Art Shop, Dorottya u. 6, Budapest');
  assert.equal(queryInUrl('https://www.google.com/maps/search/?api=1&query=Szimpla+Kert'), 'Szimpla Kert');
  assert.equal(queryInUrl('https://www.google.com/maps/place/Szimpla+Kert/data=!4m2'), 'Szimpla Kert');
  assert.equal(queryInUrl('https://maps.google.com/?q=47.5,19.05'), null);
  assert.equal(queryInUrl('not a url'), null);
});

test('a link shared from Android: the redirect carries the pin', async () => {
  const { fetchImpl, seen } = web({
    'https://maps.app.goo.gl/and': { status: 302, location: 'https://www.google.com/maps/place/X/@47.1,19.1,17z/data=!3d47.5!4d19.05' },
  });
  assert.deepEqual(await expandMapsLink('https://maps.app.goo.gl/and', { fetchImpl }),
    { url: 'https://www.google.com/maps/place/X/@47.1,19.1,17z/data=!3d47.5!4d19.05', at: '47.5,19.05', query: null });
  assert.equal(seen.length, 1);
});

test('a link shared from an iPhone: the name and address, without fetching Maps', async () => {
  const to = 'https://maps.google.com?q=Pop%26Roll+Art+Shop,+Dorottya+u.+6,+Budapest,+1051&ftid=0x4741dc:0x5f&g_st=ic';
  const { fetchImpl, seen } = web({ 'https://maps.app.goo.gl/ios?g_st=ic': { status: 302, location: to } });
  const r = await expandMapsLink('https://maps.app.goo.gl/ios?g_st=ic', { fetchImpl });
  assert.equal(r.at, null);
  assert.equal(r.query, 'Pop&Roll Art Shop, Dorottya u. 6, Budapest, 1051');
  assert.equal(seen.length, 1);
});

test('redirects are followed, through a consent page, only on Google', async () => {
  const pin = 'https://www.google.com/maps/place/X/data=!3d47.5!4d19.05';
  const { fetchImpl } = web({
    'https://maps.app.goo.gl/c': { status: 301, location: 'https://maps.google.com/maps/place/data=!4m2' },
    'https://maps.google.com/maps/place/data=!4m2': { status: 302, location: `https://consent.google.com/m?continue=${encodeURIComponent(pin)}` },
  });
  assert.equal((await expandMapsLink('https://maps.app.goo.gl/c', { fetchImpl })).at, '47.5,19.05');

  const away = web({ 'https://maps.app.goo.gl/x': { status: 302, location: 'https://example.com/a' } });
  const r = await expandMapsLink('https://maps.app.goo.gl/x', { fetchImpl: away.fetchImpl });
  assert.deepEqual(r, { url: 'https://example.com/a', at: null, query: null });
  assert.equal(away.seen.length, 1);
});

test('a page in place of a redirect: its Maps URL', async () => {
  const { fetchImpl } = web({
    'https://maps.app.goo.gl/p': { status: 200, body: '<meta property="og:url" content="https://www.google.com/maps/place/X/@47.5,19.05,17z">' },
  });
  assert.equal((await expandMapsLink('https://maps.app.goo.gl/p', { fetchImpl })).at, '47.5,19.05');
});

test('a link that is gone: nothing found', async () => {
  const { fetchImpl } = web({ 'https://maps.app.goo.gl/gone': { status: 404 } });
  assert.deepEqual(await expandMapsLink('https://maps.app.goo.gl/gone', { fetchImpl }),
    { url: 'https://maps.app.goo.gl/gone', at: null, query: null });
});
