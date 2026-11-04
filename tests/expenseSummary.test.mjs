// The expenses tab's summary: totals, categories, each one's part and what
// they paid, who owes whom (only from split expenses), and one person's own.
//   node --test tests/expenseSummary.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseSummary, splitGroup, shareOf, paidExpenses, allocateSplit, splitParts, paidBack } from '../src/lib/expenseSummary.js';

const rates = { EUR: 1, ILS: 4, USD: 1 };   // €1 = ₪4 = $1
const ex = (amount, currency, extra = {}) => ({ amount, currency, category: 'כללי', createdAt: '2026-11-13T10:00:00.000Z', ...extra });

test('no rates: the totals per currency only, biggest first', () => {
  const s = expenseSummary([ex(10, 'EUR'), ex(100, 'ILS'), ex(5, 'EUR')], { members: ['a'] });
  assert.equal(s.count, 3);
  assert.equal(s.ils, null);
  assert.deepEqual(s.byCurrency.map(c => [c.code, c.total, c.ils]), [['ILS', 100, null], ['EUR', 15, null]]);
  assert.deepEqual(s.transfers, []);
});

test('in shekels: total, by category, the biggest', () => {
  const s = expenseSummary([
    ex(10, 'EUR', { category: 'אוכל ושתייה', paidBy: 'a' }),
    ex(100, 'ILS', { category: 'תחבורה', paidBy: 'b', createdAt: '2026-11-14T10:00:00.000Z' }),
    ex(25, 'USD', { paidBy: 'a', description: 'מונית' }),
  ], { rates, members: ['a', 'b'] });
  assert.equal(s.ils, 40 + 100 + 100);
  assert.deepEqual(s.byCategory.map(c => [c.cat, c.total, c.pct]), [['תחבורה', 100, 42], ['כללי', 100, 42], ['אוכל ושתייה', 40, 17]]);
  assert.deepEqual(s.top.map(e => e.ils), [100, 100, 40]);
  assert.equal(s.byCurrency.find(c => c.code === 'EUR').ils, 40);
});

test('who paid; no one owes anyone until an expense is split', () => {
  const s = expenseSummary([ex(300, 'ILS', { paidBy: 'a' }), ex(100, 'ILS', { paidBy: 'b' })], { rates, members: ['a', 'b'], currentUid: 'a' });
  // Not split: all of it is the payer's part.
  assert.deepEqual(s.byPerson.map(p => [p.uid, p.paid, p.share, p.balance]), [['a', 300, 300, 0], ['b', 100, 100, 0]]);
  assert.equal(s.splits, 0);
  assert.deepEqual(s.transfers, []);
  assert.equal(s.mine, null);
  assert.equal(s.myShare, 300);
});

test('a split: evenly among the payer and those chosen', () => {
  const s = expenseSummary([
    ex(300, 'ILS', { paidBy: 'a', splitWith: ['b', 'c'] }),
    ex(100, 'ILS', { paidBy: 'b' }),   // not split: no one owes for it
  ], { rates, members: ['a', 'b', 'c'], currentUid: 'b' });
  assert.equal(s.splits, 1);
  assert.deepEqual(s.transfers.map(t => [t.from, t.to, t.amount]).sort(), [['b', 'a', 100], ['c', 'a', 100]]);
  assert.equal(s.mine, -100);
  assert.deepEqual(s.byPerson.find(p => p.uid === 'a').balance, 200);
  // b: 100 of a's split, and all of their own.
  assert.equal(s.myShare, 200);
  assert.deepEqual(s.byPerson.map(p => [p.uid, p.paid, p.share]), [['b', 100, 200], ['a', 300, 100], ['c', 0, 100]]);
});

test('"רק הם": the payer is out of the split; a guest by name owes too', () => {
  const s = expenseSummary([
    ex(25, 'EUR', { paidBy: 'a', splitWith: ['name:דני'], splitSelf: false }),   // ₪100, all Dani's
    ex(90, 'ILS', { paidBy: 'b', splitWith: ['a', 'name:דני'] }),               // ₪30 each
  ], { rates, members: ['a', 'b'], currentUid: 'a' });
  assert.equal(s.splits, 2);
  // a: +100 -30 = 70; b: +60; Dani: -130.
  assert.equal(s.mine, 70);
  assert.equal(s.myShare, 30);
  assert.equal(s.byPerson.find(p => p.uid === 'name:דני').share, 130);
  // By pair: Dani owes a 100, and b 30; a owes b 30.
  assert.deepEqual(s.transfers.map(t => [t.from, t.to, t.amount]), [['name:דני', 'a', 100], ['a', 'b', 30], ['name:דני', 'b', 30]]);
});

test('splitGroup: the payer first, never twice; nothing without a payer or others', () => {
  assert.deepEqual(splitGroup({ splitWith: ['b', 'a', 'b'] }, 'a'), ['a', 'b']);
  assert.deepEqual(splitGroup({ splitWith: ['b'], splitSelf: false }, 'a'), ['b']);
  assert.deepEqual(splitGroup({ splitWith: ['a'] }, 'a'), []);
  assert.deepEqual(splitGroup({ splitWith: ['b'] }, null), []);
  assert.deepEqual(splitGroup({}, 'a'), []);
});

test('a member who left and paid is still one of the people', () => {
  const s = expenseSummary([ex(300, 'ILS', { paidBy: 'a' }), ex(300, 'ILS', { paidBy: 'gone' })], { rates, members: ['a', 'c'] });
  assert.equal(s.people, 3);
  assert.deepEqual(s.byPerson.map(p => p.uid).sort(), ['a', 'c', 'gone']);
});

test('each one\'s part of an expense', () => {
  const list = [
    ex(300, 'ILS', { paidBy: 'a', splitWith: ['b', 'c'], category: 'אוכל ושתייה' }),   // 100 each
    ex(80, 'ILS', { paidBy: 'b', category: 'תחבורה' }),                                // all b's
    ex(60, 'ILS', { paidBy: 'a', splitWith: ['b'], splitSelf: false }),                // all b's
    ex(40, 'ILS', { paidBy: 'c' }),                                                    // none of b's
  ];
  assert.equal(shareOf(list[0], 'b', 'a'), 1 / 3);
  assert.equal(shareOf(list[2], 'a', 'a'), 0);
  assert.equal(shareOf(list[3], 'b', 'c'), 0);
});

test('what one person paid ("שלי"): whole, split or not', () => {
  const list = [
    ex(300, 'ILS', { paidBy: 'a', splitWith: ['b', 'c'], category: 'אוכל ושתייה' }),
    ex(80, 'ILS', { paidBy: 'b', category: 'תחבורה' }),
    ex(60, 'ILS', { paidBy: 'a', splitWith: ['b'], splitSelf: false }),
    ex(40, 'ILS', {}),                                                                 // no payer, shared trip: no one's
  ];
  const mine = paidExpenses(list, 'a', { members: ['a', 'b', 'c'] });
  assert.deepEqual(mine.map(e => e.amount), [300, 60]);
  const s = expenseSummary(mine, { rates, members: ['a', 'b', 'c'], currentUid: 'a' });
  assert.equal(s.ils, 360);
  assert.deepEqual(s.byCategory.map(c => [c.cat, c.total]), [['אוכל ושתייה', 300], ['כללי', 60]]);
  // On a trip of one, an expense with no payer is theirs.
  assert.deepEqual(paidExpenses([ex(50, 'ILS')], 'a', { members: ['a'] }).map(e => e.amount), [50]);
  assert.deepEqual(paidExpenses(list, null), []);
});

test('a small split still owes: under a shekel is not "settled"', () => {
  // ₪0.60 split in two: Dana owes 30 agorot (8.75.0 showed "מאוזן").
  const s = expenseSummary([ex(0.6, 'ILS', { paidBy: 'a', splitWith: ['b'] }), ex(2000, 'ILS', { paidBy: 'a' })],
    { rates, members: ['a', 'b'], currentUid: 'a' });
  assert.ok(Math.abs(s.mine - 0.3) < 1e-9);
  assert.equal(s.transfers.length, 1);
  assert.deepEqual([s.transfers[0].from, s.transfers[0].to], ['b', 'a']);
  // Float dust is still settled.
  const dust = expenseSummary([ex(0.00000001, 'ILS', { paidBy: 'a', splitWith: ['b'] })], { rates, members: ['a', 'b'] });
  assert.deepEqual(dust.transfers, []);
});

test('no payer recorded: the one person on a trip of one, no one on a shared trip', () => {
  const solo = expenseSummary([ex(50, 'ILS')], { rates, members: ['a'] });
  assert.deepEqual(solo.byPerson.map(p => [p.uid, p.paid, p.share]), [['a', 50, 50]]);
  assert.equal(solo.unassigned, 0);
  const shared = expenseSummary([ex(50, 'ILS', { splitWith: ['b'] }), ex(100, 'ILS', { paidBy: 'a' })], { rates, members: ['a', 'b'] });
  assert.equal(shared.unassigned, 50);
  assert.equal(shared.splits, 0);   // a split with no payer owes no one
  assert.deepEqual(shared.transfers, []);
});

test('who pays whom: by pair, netted both ways', () => {
  const s = expenseSummary([
    ex(300, 'ILS', { paidBy: 'a', splitWith: ['b', 'c'] }),   // b and c owe a 100 each
    ex(60, 'ILS', { paidBy: 'b', splitWith: ['a'] }),          // a owes b 30
    ex(0.4, 'ILS', { paidBy: 'c', splitWith: ['d'], splitSelf: false }),   // d owes c 40 agorot
  ], { rates, members: ['a', 'b', 'c', 'd'], currentUid: 'a' });
  assert.deepEqual(s.transfers.map(t => [t.from, t.to, Math.round(t.amount * 100) / 100]),
    [['c', 'a', 100], ['b', 'a', 70], ['d', 'c', 0.4]]);
  assert.deepEqual(s.withMe.map(p => [p.uid, Math.round(p.balance)]), [['c', 100], ['b', 70]]);
});

test('a number createdAt and an empty list do not throw', () => {
  assert.equal(expenseSummary([ex(10, 'ILS', { createdAt: 1700000000000 })], { rates, members: ['a'] }).ils, 10);
  const none = expenseSummary([], { rates, members: ['a'] });
  assert.equal(none.count, 0);
  assert.equal(none.ils, null);
});

test('allocateSplit: a set part is theirs, the rest share what is left', () => {
  // Nothing set: even.
  assert.deepEqual(allocateSplit(300, ['a', 'b', 'c']), { amounts: { a: 100, b: 100, c: 100 }, gap: 0, custom: false, free: 3 });
  // Dana 150: the other two share 150.
  let r = allocateSplit(300, ['a', 'b', 'c'], { b: '150' });
  assert.deepEqual(r.amounts, { a: 75, b: 150, c: 75 });
  assert.equal(r.gap, 0);
  assert.equal(r.custom, true);
  // Everyone else set: the payer gets what is left ("he owes me this, she owes me that").
  r = allocateSplit(300, ['a', 'b', 'c'], { b: 120, c: '80,5' });
  assert.equal(r.amounts.a, 99.5);
  // All set, short or over: the gap says by how much.
  assert.equal(allocateSplit(300, ['a', 'b'], { a: 100, b: 150 }).gap, 50);
  assert.equal(allocateSplit(300, ['a', 'b'], { a: 200, b: 150 }).gap, -50);
  // Over with someone free: they get nothing, and it is over.
  r = allocateSplit(100, ['a', 'b', 'c'], { b: 80, c: 40 });
  assert.equal(r.amounts.a, 0);
  assert.equal(r.gap, -20);
  // Empty, bad or negative is not set; a part of someone not in it is ignored.
  r = allocateSplit(90, ['a', 'b'], { a: '', b: 'x', z: 50 });
  assert.deepEqual(r.amounts, { a: 45, b: 45 });
  assert.equal(r.custom, false);
  assert.equal(allocateSplit(90, ['a', 'b'], { a: -5 }).custom, false);
});

test('an uneven split: each one\'s part, who owes whom', () => {
  // ₪300 a paid: b owes 200, c owes 40, a's own is 60.
  const e = ex(300, 'ILS', { paidBy: 'a', splitWith: ['b', 'c'], splitAmounts: { b: 200, c: 40 } });
  assert.deepEqual(splitParts(e, 'a').map(p => [p.id, p.amount]), [['a', 60], ['b', 200], ['c', 40]]);
  assert.equal(shareOf(e, 'b', 'a'), 200 / 300);
  const s = expenseSummary([e], { rates, members: ['a', 'b', 'c'], currentUid: 'a' });
  assert.deepEqual(s.byPerson.map(p => [p.uid, Math.round(p.share), Math.round(p.balance)]), [['b', 200, -200], ['a', 60, 240], ['c', 40, -40]]);
  assert.equal(s.mine, 240);
  // A part of someone no longer in the split is ignored; "רק הם" too.
  const only = ex(100, 'ILS', { paidBy: 'a', splitWith: ['b', 'c'], splitSelf: false, splitAmounts: { a: 50, b: 70 } });
  assert.deepEqual(splitParts(only, 'a').map(p => [p.id, p.amount]), [['b', 70], ['c', 30]]);
  // An amount an older app changed: the parts still add up to the whole.
  const stale = ex(600, 'ILS', { paidBy: 'a', splitWith: ['b'], splitAmounts: { a: 100, b: 200 } });
  assert.deepEqual(splitParts(stale, 'a').map(p => Math.round(p.frac * 600)), [200, 400]);
});

test('paid back: no longer owed, and withMe shows both ways', () => {
  const list = [
    { ...ex(300, 'ILS', { paidBy: 'a', splitWith: ['b', 'c'] }), id: 'e1', splitPaid: ['b'] },   // b paid me back
    { ...ex(90, 'ILS', { paidBy: 'b', splitWith: ['a'] }), id: 'e2' },                            // I owe b 45
    { ...ex(60, 'ILS', { paidBy: 'c', splitWith: ['b'] }), id: 'e3' },                            // not mine
  ];
  assert.equal(paidBack(list[0], 'b'), true);
  assert.equal(paidBack(list[0], 'c'), false);
  const s = expenseSummary(list, { rates, members: ['a', 'b', 'c'], currentUid: 'a' });
  // c owes me 100; I owe b 45; b's 100 is paid.
  assert.equal(Math.round(s.mine), 55);
  assert.equal(Math.round(s.paidBack), 100);
  const c = s.withMe.find(p => p.uid === 'c');
  const b = s.withMe.find(p => p.uid === 'b');
  assert.equal(Math.round(c.balance), 100);
  assert.deepEqual(c.open, [{ expenseId: 'e1', id: 'c' }]);
  assert.equal(Math.round(b.balance), -45);
  assert.equal(Math.round(b.back), 100);
  assert.deepEqual(b.open, [{ expenseId: 'e2', id: 'a' }]);
  assert.deepEqual(b.closed, [{ expenseId: 'e1', id: 'b' }]);
  assert.deepEqual(s.withMe.map(p => p.uid), ['c', 'b']);
  // Everyone's: what is left leaves out what was paid. c → a 100,
  // a → b 45, b → c 30; b's 100 to a is paid.
  assert.deepEqual(s.transfers.map(t => [t.from, t.to, Math.round(t.amount)]), [['c', 'a', 100], ['a', 'b', 45], ['b', 'c', 30]]);
  assert.deepEqual(s.transfers[0].open, [{ expenseId: 'e1', id: 'c' }]);
  // The parts still count as theirs.
  assert.equal(Math.round(s.byPerson.find(p => p.uid === 'b').share), 100 + 45 + 30);
});

// 8.79.0: payments between two people ("בינינו").
const pay = (id, from, to, amount, currency, kind, extra = {}) => ({ id, from, to, amount, currency, kind, ...extra });

test('payments: paid for someone is a debt, a transfer pays it back, neither is an expense', () => {
  const s = expenseSummary([ex(400, 'ILS', { id: 'e1', paidBy: 'a', splitWith: ['b'] })], {
    rates, members: ['a', 'b', 'c'], currentUid: 'a',
    payments: [
      pay('p1', 'a', 'b', 25, 'EUR', 'for', { note: 'מונית' }),   // ₪100 more from b
      pay('p2', 'b', 'a', 150, 'ILS', 'gave'),                     // b sent ₪150
      pay('p3', 'c', 'a', 30, 'ILS', 'for'),                       // c paid for me
    ],
  });
  // The total is the expenses only.
  assert.equal(Math.round(s.ils), 400);
  assert.equal(s.payments, 3);
  const b = s.withMe.find(p => p.uid === 'b');
  // b owes 200 (split) + 100 (taxi) - 150 (sent) = 150: 150 sent of 300.
  assert.equal(Math.round(b.balance), 150);
  assert.equal(Math.round(b.debt), 300);
  assert.equal(Math.round(b.moved), -150);
  assert.deepEqual(b.open, [{ expenseId: 'e1', id: 'b' }, { paymentId: 'p1' }, { paymentId: 'p2' }]);
  const c = s.withMe.find(p => p.uid === 'c');
  assert.equal(Math.round(c.balance), -30);
  assert.equal(Math.round(s.mine), 150 - 30);
  assert.deepEqual(s.transfers.map(t => [t.from, t.to, Math.round(t.amount)]), [['b', 'a', 150], ['a', 'c', 30]]);
});

test('payments: closed with the pair, only the debts count as paid back', () => {
  const s = expenseSummary([ex(400, 'ILS', { id: 'e1', paidBy: 'a', splitWith: ['b'], splitPaid: ['b'] })], {
    rates, members: ['a', 'b'], currentUid: 'a',
    payments: [
      pay('p1', 'a', 'b', 100, 'ILS', 'for', { settled: true }),
      pay('p2', 'b', 'a', 150, 'ILS', 'gave', { settled: true }),
    ],
  });
  const b = s.withMe.find(p => p.uid === 'b');
  assert.equal(b.open.length, 0);
  // 200 + 100 owed, all paid (150 of it sent before the close).
  assert.equal(Math.round(b.back), 300);
  assert.equal(Math.round(s.paidBack), 300);
  assert.deepEqual(s.transfers, []);
});

test('payments alone: no expenses, still who owes whom; bad ones are left out', () => {
  const s = expenseSummary([], {
    rates, members: ['a', 'b'], currentUid: 'b',
    payments: [pay('p1', 'a', 'b', 50, 'ILS', 'gave'), pay('p2', 'a', 'a', 50, 'ILS', 'gave'), pay('p3', 'a', 'b', 0, 'ILS', 'for')],
  });
  assert.equal(s.ils, null);
  assert.equal(s.payments, 1);
  assert.equal(Math.round(s.mine), -50);
  assert.deepEqual(s.transfers.map(t => [t.from, t.to, Math.round(t.amount)]), [['b', 'a', 50]]);
});
