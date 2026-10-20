// The expenses tab's summary: totals, per person, per day, categories,
// who paid and who owes whom.
//   node --test tests/expenseSummary.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseSummary, settle } from '../src/lib/expenseSummary.js';

const rates = { EUR: 1, ILS: 4, USD: 1 };   // €1 = ₪4 = $1
const ex = (amount, currency, extra = {}) => ({ amount, currency, category: 'כללי', createdAt: '2026-11-13T10:00:00.000Z', ...extra });

test('no rates: the totals per currency only, biggest first', () => {
  const s = expenseSummary([ex(10, 'EUR'), ex(100, 'ILS'), ex(5, 'EUR')], { members: ['a'] });
  assert.equal(s.count, 3);
  assert.equal(s.ils, null);
  assert.deepEqual(s.byCurrency.map(c => [c.code, c.total, c.ils]), [['ILS', 100, null], ['EUR', 15, null]]);
  assert.deepEqual(s.transfers, []);
});

test('in shekels: total, per person, per day, by category, the biggest', () => {
  const s = expenseSummary([
    ex(10, 'EUR', { category: 'אוכל ושתייה', paidBy: 'a' }),
    ex(100, 'ILS', { category: 'תחבורה', paidBy: 'b', createdAt: '2026-11-14T10:00:00.000Z' }),
    ex(25, 'USD', { paidBy: 'a', description: 'מונית' }),
  ], { rates, members: ['a', 'b'] });
  assert.equal(s.ils, 40 + 100 + 100);
  assert.equal(s.perPerson, 120);
  assert.deepEqual(s.daily, { avg: 120, days: 2 });
  assert.deepEqual(s.byCategory.map(c => [c.cat, c.total, c.pct]), [['תחבורה', 100, 42], ['כללי', 100, 42], ['אוכל ושתייה', 40, 17]]);
  assert.deepEqual(s.top.map(e => e.ils), [100, 100, 40]);
  assert.equal(s.byCurrency.find(c => c.code === 'EUR').ils, 40);
});

test('who paid, the equal share, and one transfer to even it out', () => {
  const s = expenseSummary([ex(300, 'ILS', { paidBy: 'a' }), ex(100, 'ILS', { paidBy: 'b' })], { rates, members: ['a', 'b'] });
  assert.equal(s.share, 200);
  assert.deepEqual(s.byPayer.map(p => [p.uid, p.total, p.balance]), [['a', 300, 100], ['b', 100, -100]]);
  assert.deepEqual(s.transfers, [{ from: 'b', to: 'a', amount: 100 }]);
});

test('a member who paid nothing owes a share; one who left and paid is counted', () => {
  const s = expenseSummary([ex(300, 'ILS', { paidBy: 'a' }), ex(300, 'ILS', { paidBy: 'gone' })], { rates, members: ['a', 'c'] });
  assert.equal(s.people, 3);
  assert.equal(s.perPerson, 200);
  assert.deepEqual(s.byPayer.map(p => p.uid).sort(), ['a', 'c', 'gone']);
  assert.deepEqual(s.transfers.map(t => [t.from, t.to, t.amount]).sort(), [['c', 'a', 100], ['c', 'gone', 100]]);
});

test('no payer recorded: the one person on a trip of one, no one on a shared trip', () => {
  const solo = expenseSummary([ex(50, 'ILS')], { rates, members: ['a'] });
  assert.deepEqual(solo.byPayer.map(p => [p.uid, p.total]), [['a', 50]]);
  assert.equal(solo.unassigned, 0);
  assert.equal(solo.share, null);
  const shared = expenseSummary([ex(50, 'ILS'), ex(100, 'ILS', { paidBy: 'a' })], { rates, members: ['a', 'b'] });
  assert.equal(shared.unassigned, 50);
  assert.equal(shared.share, 50);   // of what has a payer
  assert.deepEqual(shared.transfers, [{ from: 'b', to: 'a', amount: 50 }]);
});

test('settle: fewest transfers, nothing under half a shekel', () => {
  const t = settle([{ uid: 'a', balance: 150 }, { uid: 'b', balance: -100 }, { uid: 'c', balance: -50 }, { uid: 'd', balance: 0.3 }]);
  assert.deepEqual(t, [{ from: 'b', to: 'a', amount: 100 }, { from: 'c', to: 'a', amount: 50 }]);
  assert.deepEqual(settle([{ uid: 'a', balance: 0.2 }, { uid: 'b', balance: -0.2 }]), []);
});

test('a number createdAt and an empty list do not throw', () => {
  assert.equal(expenseSummary([ex(10, 'ILS', { createdAt: 1700000000000 })], { rates, members: ['a'] }).daily.days, 1);
  const none = expenseSummary([], { rates, members: ['a'] });
  assert.equal(none.count, 0);
  assert.equal(none.ils, null);
});
