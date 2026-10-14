// The in-app updater trusts only what parseRelease accepts. Run with the
// other tests (npm run test:data) or alone: node --test tests/release.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRelease } from '../src/lib/release.js';

const SHA = 'a'.repeat(64);
const rel = (body, assets = [{ name: 'flights-assistant.apk', browser_download_url: 'https://github.com/ohavs/Flights-Assistant/releases/download/v1.0.7/flights-assistant.apk', size: 7_340_032 }]) =>
  ({ tag_name: 'v1.0.7', published_at: '2026-10-14T06:00:00Z', body, assets });

test('reads version, checksum, download and notes from a release', () => {
  const r = parseRelease(rel(`- תיקון א\n- תיקון ב\n\n<!-- update {"versionCode":107,"sha256":"${SHA}","apk":"flights-assistant.apk"} -->`));
  assert.equal(r.versionName, '1.0.7');
  assert.equal(r.versionCode, 107);
  assert.equal(r.sha256, SHA);
  assert.match(r.url, /^https:\/\/github\.com\/ohavs\/Flights-Assistant\/releases\/download\//);
  assert.equal(r.sizeMb, 7.3);
  assert.deepEqual(r.notes, ['תיקון א', 'תיקון ב']);
});

test('a release without a valid update marker is ignored', () => {
  assert.equal(parseRelease(rel('just notes')), null);
  assert.equal(parseRelease(rel('<!-- update {not json} -->')), null);
  assert.equal(parseRelease(rel(`<!-- update {"versionCode":"107","sha256":"${SHA}","apk":"flights-assistant.apk"} -->`)), null);
  assert.equal(parseRelease(rel('<!-- update {"versionCode":107,"sha256":"short","apk":"flights-assistant.apk"} -->')), null);
  assert.equal(parseRelease(null), null);
});

test('the APK named in the marker must be attached', () => {
  const body = `<!-- update {"versionCode":107,"sha256":"${SHA}","apk":"flights-assistant.apk"} -->`;
  assert.equal(parseRelease(rel(body, [])), null);
  assert.equal(parseRelease(rel(body, [{ name: 'other.apk', browser_download_url: 'x', size: 1 }])), null);
});
