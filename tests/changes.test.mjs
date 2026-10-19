// An edit writes only what it changed (src/lib/changes.js).
//   node --test tests/changes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { changedFields } from '../src/lib/changes.js';

test('only the fields the form changed', () => {
  const opened = { amount: 42, currency: 'EUR', description: 'קפה', linkedPlanId: null };
  assert.deepEqual(changedFields(opened, { ...opened }), {});
  assert.deepEqual(changedFields(opened, { ...opened, amount: 45 }), { amount: 45 });
  // null and missing are the same "nothing"; arrays and objects by value.
  assert.deepEqual(changedFields({ a: null, tags: ['x'] }, { a: undefined, tags: ['x'] }), {});
  assert.deepEqual(changedFields({ tags: ['x'] }, { tags: ['x', 'y'] }), { tags: ['x', 'y'] });
  assert.deepEqual(changedFields({ event: { t: '10:00' } }, { event: { t: '11:00' } }), { event: { t: '11:00' } });
});
