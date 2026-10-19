import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withScheme } from '../src/lib/links.js';

test('a link gets https:// unless it has a scheme', () => {
  assert.equal(withScheme('booking.com/abc'), 'https://booking.com/abc');
  assert.equal(withScheme('  maps.app.goo.gl/x '), 'https://maps.app.goo.gl/x');
  assert.equal(withScheme('https://a.com'), 'https://a.com');
  assert.equal(withScheme('HTTP://a.com'), 'HTTP://a.com');
  assert.equal(withScheme('geo:47.5,19.0'), 'geo:47.5,19.0');
  assert.equal(withScheme(''), '');
  assert.equal(withScheme(null), '');
});
