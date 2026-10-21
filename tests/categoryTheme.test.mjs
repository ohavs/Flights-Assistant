import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryTheme, THEMES } from '../src/lib/categoryTheme.js';

test("the owner's categories", () => {
  assert.equal(categoryTheme('אטרקציות ודברים לעשות'), 'attractions');
  assert.equal(categoryTheme('מסעדות ומקומות אכילה'), 'food');
  assert.equal(categoryTheme('מקומות לבקר'), 'sights');
  assert.equal(categoryTheme('שווקי כריסמס', '🎄'), 'christmas');
  assert.equal(categoryTheme('קניות', '🛍️'), 'shopping');
  assert.equal(categoryTheme('ברים', '🍻'), 'bars');
});

test('the default categories', () => {
  assert.equal(categoryTheme('תחבורה ציבורית'), 'transport');
  assert.equal(categoryTheme('מידע כללי וטיפים'), 'info');
  assert.equal(categoryTheme('אירועים'), 'events');
});

test('Christmas before market; a word, not any letters', () => {
  assert.equal(categoryTheme('Christmas markets'), 'christmas');
  assert.equal(categoryTheme('שווקים'), 'shopping');
  assert.equal(categoryTheme('בר יין'), 'bars');
  assert.equal(categoryTheme('ברזל'), null);
  assert.equal(categoryTheme('Wine bars'), 'bars');
  assert.equal(categoryTheme('Barcelona'), null);
  assert.equal(categoryTheme('Seaside'), null);
  assert.equal(categoryTheme('Coffee & cake'), 'cafe');
  assert.equal(categoryTheme('בתי קפה'), 'cafe');
  assert.equal(categoryTheme('מרחצאות'), 'spa');
  assert.equal(categoryTheme('פארקים וגנים'), 'nature');
  assert.equal(categoryTheme('מוזיאונים'), 'museums');
});

test('the emoji when the name says nothing', () => {
  assert.equal(categoryTheme('של דנה', '🍷'), 'bars');
  assert.equal(categoryTheme('שונות', '🎅🏽'), 'christmas');
  assert.equal(categoryTheme('שונות', '♨️'), 'spa');
  assert.equal(categoryTheme('שונות'), null);
  assert.equal(categoryTheme('', ''), null);
  assert.equal(categoryTheme(undefined, undefined), null);
});

test('every theme has a hue', () => {
  for (const [k, t] of Object.entries(THEMES)) assert.match(t.hue, /^#[0-9A-F]{6}$/i, k);
});
