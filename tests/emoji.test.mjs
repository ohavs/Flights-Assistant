import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastEmoji } from '../src/lib/emoji.js';

const kinds = {
  plain: '🍕',
  'with a variation selector': '❤️',
  'skin tone': '👍🏽',
  'ZWJ family': '👨‍👩‍👧‍👦',
  'ZWJ profession with a tone': '👩🏾‍🍳',
  'ZWJ with a variation selector': '🏳️‍🌈',
  'regional-indicator flag': '🇮🇱',
  'tag-sequence flag': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  keycap: '1️⃣',
  'newer emoji': '🫠',
  'older symbol': '☕',
};

for (const [kind, e] of Object.entries(kinds)) {
  test(`keeps a ${kind} emoji whole`, () => {
    assert.equal(lastEmoji(e), e);
    assert.equal(lastEmoji(` ${e} `), e);
  });
}

test('the newest of several, after the current one', () => {
  assert.equal(lastEmoji('🍕🇮🇱'), '🇮🇱');
  assert.equal(lastEmoji('🇮🇱👨‍👩‍👧‍👦'), '👨‍👩‍👧‍👦');
});

test('letters, digits and spaces are not emoji', () => {
  assert.equal(lastEmoji('abc'), '');
  assert.equal(lastEmoji('מסעדות'), '');
  assert.equal(lastEmoji('123'), '');
  assert.equal(lastEmoji('  '), '');
  assert.equal(lastEmoji(''), '');
  assert.equal(lastEmoji(null), '');
  assert.equal(lastEmoji('a🍕b'), '🍕');
});

test('without Intl.Segmenter, the same', () => {
  const Seg = Intl.Segmenter;
  Intl.Segmenter = undefined;
  try {
    for (const e of Object.values(kinds)) assert.equal(lastEmoji(`x${e}`), e);
    assert.equal(lastEmoji('🍕🇮🇱'), '🇮🇱');
    assert.equal(lastEmoji('abc 123'), '');
  } finally { Intl.Segmenter = Seg; }
});
