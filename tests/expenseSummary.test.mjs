// The expenses tab's summary: totals, per person, per day, categories,
// who paid, and who owes whom (only from split expenses).
//   node --test tests/expenseSummary.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseSummary, settle, splitGroup } from '../src/lib/expenseSummary.js';

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

test('who paid; no one owes anyone until an expense is split', () => {
  const s = expenseSummary([ex(300, 'ILS', { paidBy: 'a' }), ex(100, 'ILS', { paidBy: 'b' })], { rates, members: ['a', 'b'], currentUid: 'a' });
  assert.deepEqual(s.byPayer.map(p => [p.uid, p.total, p.balance]), [['a', 300, 0], ['b', 100, 0]]);
  assert.equal(s.splits, 0);
  assert.deepEqual(s.transfers, []);
  assert.equal(s.mine, null);
  assert.equal(s.perPerson, 200);   // a statistic, not a debt
});

test('a split: evenly among the payer and those chosen', () => {
  const s = expenseSummary([
    ex(300, 'ILS', { paidBy: 'a', splitWith: ['b', 'c'] }),
    ex(100, 'ILS', { paidBy: 'b' }),   // not split: no one owes for it
  ], { rates, members: ['a', 'b', 'c'], currentUid: 'b' });
  assert.equal(s.splits, 1);
  assert.deepEqual(s.transfers.map(t => [t.from, t.to, t.amount]).sort(), [['b', 'a', 100], ['c', 'a', 100]]);
  assert.equal(s.mine, -100);
  assert.deepEqual(s.byPayer.find(p => p.uid === 'a').balance, 200);
});

test('"רק הם": the payer is out of the split; a guest by name owes too', () => {
  const s = expenseSummary([
    ex(25, 'EUR', { paidBy: 'a', splitWith: ['name:דני'], splitSelf: false }),   // ₪100, all Dani's
    ex(90, 'ILS', { paidBy: 'b', splitWith: ['a', 'name:דני'] }),               // ₪30 each
  ], { rates, members: ['a', 'b'], currentUid: 'a' });
  assert.equal(s.splits, 2);
  // a: +100 -30 = 70; b: +60; Dani: -130.
  assert.equal(s.mine, 70);
  assert.deepEqual(s.transfers, [{ from: 'name:דני', to: 'a', amount: 70 }, { from: 'name:דני', to: 'b', amount: 60 }]);
});

test('splitGroup: the payer first, never twice; nothing without a payer or others', () => {
  assert.deepEqual(splitGroup({ splitWith: ['b', 'a', 'b'] }, 'a'), ['a', 'b']);
  assert.deepEqual(splitGroup({ splitWith: ['b'], splitSelf: false }, 'a'), ['b']);
  assert.deepEqual(splitGroup({ splitWith: ['a'] }, 'a'), []);
  assert.deepEqual(splitGroup({ splitWith: ['b'] }, null), []);
  assert.deepEqual(splitGroup({}, 'a'), []);
});

test('a member who left and paid is still counted in per person', () => {
  const s = expenseSummary([ex(300, 'ILS', { paidBy: 'a' }), ex(300, 'ILS', { paidBy: 'gone' })], { rates, members: ['a', 'c'] });
  assert.equal(s.people, 3);
  assert.equal(s.perPerson, 200);
  assert.deepEqual(s.byPayer.map(p => p.uid).sort(), ['a', 'c', 'gone']);
});

test('no payer recorded: the one person on a trip of one, no one on a shared trip', () => {
  const solo = expenseSummary([ex(50, 'ILS')], { rates, members: ['a'] });
  assert.deepEqual(solo.byPayer.map(p => [p.uid, p.total]), [['a', 50]]);
  assert.equal(solo.unassigned, 0);
  const shared = expenseSummary([ex(50, 'ILS', { splitWith: ['b'] }), ex(100, 'ILS', { paidBy: 'a' })], { rates, members: ['a', 'b'] });
  assert.equal(shared.unassigned, 50);
  assert.equal(shared.splits, 0);   // a split with no payer owes no one
  assert.deepEqual(shared.transfers, []);
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
