// Duplicates on the places list: the same name, or the same link/address.
//   node --test tests/placeDuplicates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicates, nameKey, placeKey } from '../src/lib/placeDuplicates.js';

test('the same name, whatever the case, spaces and marks', () => {
  assert.equal(nameKey('  Mazel  Tov! '), 'mazel tov');
  assert.equal(nameKey('מבצר  הדייגים'), nameKey('מבצר הדייגים.'));
  const d = findDuplicates([
    { id: 'a', title: 'Mazel Tov' }, { id: 'b', title: 'mazel tov' }, { id: 'c', title: 'Szimpla' },
  ]);
  assert.deepEqual(d.groups, [['a', 'b']]);
  assert.deepEqual(d.byId.get('a'), { group: ['a', 'b'], name: true, place: false });
  assert.equal(d.byId.has('c'), false);
});

test('the same link or address, with or without https://, www. and a trailing slash', () => {
  assert.equal(placeKey('https://www.google.com/maps/place/x/'), placeKey('google.com/maps/place/x'));
  const d = findDuplicates([
    { id: 'a', title: 'ארמון בודה', address: 'https://maps.app.goo.gl/abc' },
    { id: 'b', title: 'הארמון', address: 'maps.app.goo.gl/abc/' },
    { id: 'c', title: 'גשר', address: 'https://maps.app.goo.gl/xyz' },
    { id: 'd', title: 'גשר 2', address: '' },
    { id: 'e', title: 'גשר 3' },
  ]);
  assert.deepEqual(d.groups, [['a', 'b']]);
  assert.equal(d.byId.get('b').place, true);
  assert.equal(d.byId.get('b').name, false);
});

test('a chain: a matches b by name, b matches c by place: one group', () => {
  const d = findDuplicates([
    { id: 'a', title: 'שוק', address: 'רחוב א' },
    { id: 'b', title: 'שוק', address: 'רחוב ב' },
    { id: 'c', title: 'שוק מקורה', address: 'רחוב ב' },
    { id: 'x', title: 'אחר' },
  ]);
  assert.deepEqual(d.groups, [['a', 'b', 'c']]);
  assert.deepEqual(d.byId.get('b'), { group: ['a', 'b', 'c'], name: true, place: true });
});

test('nothing alike, or no list', () => {
  assert.deepEqual(findDuplicates([{ id: 'a', title: 'א' }, { id: 'b', title: 'ב' }]).groups, []);
  assert.deepEqual(findDuplicates(undefined).groups, []);
});
