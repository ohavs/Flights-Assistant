// The expenses tab's numbers: the total, per person, per day, by category,
// by currency, the biggest, who paid, and who owes whom. Pure, without
// Firebase (tests/expenseSummary.test.mjs). Shekel values are at today's
// rates, like the total; with no rates there are only the totals per
// currency.
import { convert } from '../services/currency.js';

const TOP = 3;
const EVEN = 0.5;   // under half a shekel is settled: it shows as ₪0

// expenses: the trip's expense documents. rates: per euro, or null.
// members: the trip's uids now. currentUid: whoever is looking.
export function expenseSummary(expenses, { rates = null, members = [], currentUid = null } = {}) {
  const list = expenses || [];
  const ilsOf = (e) => convert(e.amount, e.currency, 'ILS', rates);

  const perCurrency = {};
  for (const e of list) perCurrency[e.currency] = (perCurrency[e.currency] || 0) + Number(e.amount || 0);
  const byCurrency = Object.entries(perCurrency)
    .map(([code, total]) => ({ code, total, ils: rates ? convert(total, code, 'ILS', rates) : null }))
    .sort((a, b) => b.total - a.total);

  // Everyone who shares the costs: the members, and whoever paid and has
  // since left (their money was spent on the trip).
  const payers = [...new Set(list.map(e => e.paidBy).filter(Boolean))];
  const participants = [...new Set([...members, ...payers])];
  if (!participants.length && currentUid) participants.push(currentUid);
  const people = Math.max(participants.length, 1);

  const base = {
    count: list.length,
    byCurrency,
    people,
    ils: null, perPerson: null, daily: null,
    byCategory: [], top: [], byPayer: [], transfers: [], unassigned: 0, share: null,
  };
  if (!rates || !list.length) return base;

  const valued = list.map(e => ({ e, ils: ilsOf(e) }));
  const ils = valued.reduce((s, x) => s + x.ils, 0);

  const perCat = {};
  for (const { e, ils: v } of valued) {
    const cat = e.category || 'כללי';
    perCat[cat] = (perCat[cat] || 0) + v;
  }
  const grand = ils || 1;
  const byCategory = Object.entries(perCat)
    .map(([cat, total]) => ({ cat, total, pct: Math.round((total / grand) * 100), frac: total / grand }))
    .sort((a, b) => b.total - a.total);

  // createdAt is written as an ISO string, but a document from an older
  // version (or a hand edit) can hold a number — coerce rather than crash.
  const days = new Set(list.map(e => String(e.createdAt ?? '').slice(0, 10)).filter(Boolean)).size || 1;

  const top = [...valued].sort((a, b) => b.ils - a.ils).slice(0, TOP).map(({ e, ils: v }) => ({ ...e, ils: v }));

  // Who paid: an expense from before payers were recorded belongs to the
  // one person on a trip of one, and to no one when there are more.
  const solo = participants.length === 1 ? participants[0] : null;
  const paid = Object.fromEntries(participants.map(uid => [uid, 0]));
  let unassigned = 0;
  for (const { e, ils: v } of valued) {
    const uid = e.paidBy || solo;
    if (uid) paid[uid] = (paid[uid] || 0) + v;
    else unassigned += v;
  }
  // An equal share of what has a payer. What has none is shared already.
  const share = (ils - unassigned) / people;
  const byPayer = Object.entries(paid)
    .map(([uid, total]) => ({ uid, total, balance: total - share }))
    .sort((a, b) => b.total - a.total || (a.uid === currentUid ? -1 : b.uid === currentUid ? 1 : 0));

  return {
    ...base,
    ils,
    perPerson: participants.length >= 2 ? ils / people : null,
    daily: { avg: ils / days, days },
    byCategory,
    top,
    byPayer,
    share: participants.length >= 2 ? share : null,
    unassigned,
    transfers: participants.length >= 2 ? settle(byPayer) : [],
  };
}

// The fewest transfers that even everyone out: the one who owes most pays
// the one owed most, until no one is out by half a shekel or more.
export function settle(balances) {
  const owe = balances.filter(b => b.balance <= -EVEN).map(b => ({ uid: b.uid, left: -b.balance }));
  const owed = balances.filter(b => b.balance >= EVEN).map(b => ({ uid: b.uid, left: b.balance }));
  const out = [];
  while (owe.length && owed.length) {
    owe.sort((a, b) => b.left - a.left);
    owed.sort((a, b) => b.left - a.left);
    const from = owe[0], to = owed[0];
    const amount = Math.min(from.left, to.left);
    out.push({ from: from.uid, to: to.uid, amount });
    from.left -= amount;
    to.left -= amount;
    if (from.left < EVEN) owe.shift();
    if (to.left < EVEN) owed.shift();
  }
  return out;
}
