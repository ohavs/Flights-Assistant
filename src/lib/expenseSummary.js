// The expenses tab's numbers: the total, by category, by currency, the
// biggest, each person's part and what they paid, and who owes whom; and
// the same for what one person paid (paidExpenses). Pure, without
// Firebase (tests/expenseSummary.test.mjs). Shekel values are at today's
// rates, like the total; with no rates there are only the totals per
// currency.
//
// Who owes whom comes only from what the payer split (the owner's ask): an
// expense with splitWith is shared by the payer and those chosen, or, with
// splitSelf false ("רק הם"), by those chosen alone. An id there is a uid,
// or GUEST + a name for someone not on the trip.
//
// 8.77.0 (the owner's ask): evenly unless splitAmounts sets someone's part
// (in the expense's currency); whoever has none shares what is left evenly.
// splitPaid: who already paid the payer back; their part is no longer owed.
// Settling up is by pair (who owes whom straight from what they shared,
// netted both ways), so a "שולם" mark is always on what is shown.
//
// 8.79.0 (the owner's ask): payments between two people ("בינינו", the
// trips/{id}/payments collection): { from, to, amount, currency, kind,
// note, date, settled }. Either kind is money from `from` to `to`, so `to`
// owes `from` that much more: 'for' (paid for them, a debt) or 'gave' (a
// transfer, which pays a debt back). Not an expense: not in the total.
// settled: closed with the pair's "קיבלתי"/"העברתי", like splitPaid.
import { convert } from '../services/currency.js';

const TOP = 3;
// Under half an agora is settled. Any debt above it shows, in agorot
// when small (8.75.0 hid a split under half a shekel as "מאוזן").
export const SETTLED = 0.005;
export const GUEST = 'name:';
export const PAY_FOR = 'for';
export const PAY_GAVE = 'gave';

// The people an expense is split among, payer first; [] when it is not.
export function splitGroup(e, payer) {
  const others = [...new Set((e.splitWith || []).filter(id => id && id !== payer))];
  if (!payer || !others.length) return [];
  return e.splitSelf === false ? others : [payer, ...others];
}

// A part someone set, as a number, or null when it is not set (empty, not
// a number, below zero).
export function partAmount(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// The split of `total` among `group`: a part set in `fixed` ({ id: amount })
// is that person's, and the rest share what is left evenly. amounts: { id:
// amount }. gap: what is left to split (above 0) or split twice (below 0);
// 0 when it adds up. custom: whether any part is set.
export function allocateSplit(total, group, fixed = {}) {
  const t = Number(total) || 0;
  const set = {};
  for (const id of group) {
    const n = partAmount(fixed?.[id]);
    if (n !== null) set[id] = n;
  }
  const free = group.filter(id => !(id in set));
  const taken = Object.values(set).reduce((a, b) => a + b, 0);
  const left = t - taken;
  const each = free.length ? Math.max(left, 0) / free.length : 0;
  const amounts = Object.fromEntries(group.map(id => [id, id in set ? set[id] : each]));
  const gap = free.length ? Math.min(left, 0) : left;
  return { amounts, gap: Math.abs(gap) < SETTLED ? 0 : gap, custom: Object.keys(set).length > 0, free: free.length };
}

// Each one's part of a split expense, payer first: [{ id, frac, amount }],
// frac of the whole. Fractions of what the parts add up to, so an amount
// an older app changed (it does not know splitAmounts) still adds up.
export function splitParts(e, payer) {
  const group = splitGroup(e, payer);
  if (!group.length) return [];
  const { amounts } = allocateSplit(e.amount, group, e.splitAmounts);
  const sum = group.reduce((s, id) => s + amounts[id], 0);
  return group.map(id => ({ id, amount: amounts[id], frac: sum > 0 ? amounts[id] / sum : 1 / group.length }));
}

// Whether someone in a split already paid the payer back.
export const paidBack = (e, id) => Array.isArray(e?.splitPaid) && e.splitPaid.includes(id);

// How much of an expense is one person's: all of it for the payer of one
// not split, their part in a split, else nothing.
export function shareOf(e, uid, payer) {
  const parts = splitParts(e, payer);
  if (parts.length) return parts.find(p => p.id === uid)?.frac || 0;
  return payer && payer === uid ? 1 : 0;
}

// Everyone who shares the costs: the members, and whoever paid and has
// since left (their money was spent on the trip). An expense from before
// payers were recorded belongs to the one person on a trip of one.
function participantsOf(list, members, currentUid) {
  const payers = [...new Set(list.map(e => e.paidBy).filter(Boolean))];
  const participants = [...new Set([...members, ...payers])];
  if (!participants.length && currentUid) participants.push(currentUid);
  return participants;
}

// The expenses one person paid ("שלי" in the summary): summed by
// expenseSummary like the whole trip's. One with no payer is the one
// person's on a trip of one, and no one's when there are more.
export function paidExpenses(expenses, uid, { members = [] } = {}) {
  const list = expenses || [];
  const participants = participantsOf(list, members, uid);
  const solo = participants.length === 1 ? participants[0] : null;
  return list.filter(e => uid && (e.paidBy || solo) === uid);
}

// expenses: the trip's expense documents. rates: per euro, or null.
// members: the trip's uids now. currentUid: whoever is looking.
// payments: the trip's payments between people (above).
export function expenseSummary(expenses, { rates = null, members = [], currentUid = null, payments = [] } = {}) {
  const list = expenses || [];
  const moves = (payments || []).filter(p => p && p.from && p.to && p.from !== p.to && Number(p.amount) > 0);
  const ilsOf = (e) => convert(e.amount, e.currency, 'ILS', rates);

  const perCurrency = {};
  for (const e of list) perCurrency[e.currency] = (perCurrency[e.currency] || 0) + Number(e.amount || 0);
  const byCurrency = Object.entries(perCurrency)
    .map(([code, total]) => ({ code, total, ils: rates ? convert(total, code, 'ILS', rates) : null }))
    .sort((a, b) => b.total - a.total);

  const participants = participantsOf(list, members, currentUid);
  const people = Math.max(participants.length, 1);

  const base = {
    count: list.length,
    byCurrency,
    people,
    ils: null,
    byCategory: [], top: [], byPerson: [], transfers: [], unassigned: 0, splits: 0, payments: 0, mine: null, myShare: null,
    withMe: [], paidBack: 0,
  };
  if (!rates || (!list.length && !moves.length)) return base;

  const valued = list.map(e => ({ e, ils: ilsOf(e) }));
  const ils = list.length ? valued.reduce((s, x) => s + x.ils, 0) : null;

  const perCat = {};
  for (const { e, ils: v } of valued) {
    const cat = e.category || 'כללי';
    perCat[cat] = (perCat[cat] || 0) + v;
  }
  const grand = ils || 1;
  const byCategory = Object.entries(perCat)
    .map(([cat, total]) => ({ cat, total, pct: Math.round((total / grand) * 100), frac: total / grand }))
    .sort((a, b) => b.total - a.total);

  const top = [...valued].sort((a, b) => b.ils - a.ils).slice(0, TOP).map(({ e, ils: v }) => ({ ...e, ils: v }));

  // Who paid: an expense with no payer belongs to the one person on a
  // trip of one, and to no one when there are more.
  const solo = participants.length === 1 ? participants[0] : null;
  const paid = Object.fromEntries(participants.map(uid => [uid, 0]));
  let unassigned = 0;
  for (const { e, ils: v } of valued) {
    const uid = e.paidBy || solo;
    if (uid) paid[uid] = (paid[uid] || 0) + v;
    else unassigned += v;
  }
  // Each one's part (all of an expense not split is the payer's), and who
  // owes whom: each split expense's part, from everyone in it but the
  // payer, to the payer, unless they paid it back already. By pair: net
  // above 0 when b owes a; open and closed are the parts, to mark them.
  const share = {};
  const owed = {};
  const ledger = {};
  const pairOf = (x, y) => {
    const [a, b] = x < y ? [x, y] : [y, x];
    return (ledger[`${a}\u0000${b}`] ||= { a, b, net: 0, back: 0, debt: 0, moved: 0, open: [], closed: [] });
  };
  let splits = 0;
  let back = 0;
  for (const { e, ils: v } of valued) {
    const payer = e.paidBy || solo;
    const parts = splitParts(e, payer);
    if (!parts.length) {
      if (payer) share[payer] = (share[payer] || 0) + v;
      continue;
    }
    splits++;
    for (const { id, frac } of parts) {
      const part = v * frac;
      share[id] = (share[id] || 0) + part;
      if (id === payer) continue;
      const paid = paidBack(e, id);
      const pair = pairOf(payer, id);
      const sign = pair.a === payer ? 1 : -1;
      const item = { expenseId: e.id, id };
      if (paid) { pair.back += sign * part; pair.closed.push(item); }
      else { pair.net += sign * part; pair.debt += sign * part; pair.open.push(item); }
      if (paid) { back += part; continue; }
      owed[id] = (owed[id] || 0) - part;
      owed[payer] = (owed[payer] || 0) + part;
    }
  }
  // Payments: `to` owes `from` that much more. debt and moved apart, for
  // "הועברו X מתוך Y"; a closed transfer is how a debt was paid, so only a
  // closed debt counts in what was paid back.
  for (const m of moves) {
    const v = convert(m.amount, m.currency, 'ILS', rates);
    const pair = pairOf(m.from, m.to);
    const sign = pair.a === m.from ? 1 : -1;
    const item = { paymentId: m.id };
    const gave = m.kind === PAY_GAVE;
    if (m.settled) {
      if (!gave) { pair.back += sign * v; back += v; }
      pair.closed.push(item);
      continue;
    }
    pair.net += sign * v;
    if (gave) pair.moved += sign * v; else pair.debt += sign * v;
    pair.open.push(item);
    owed[m.to] = (owed[m.to] || 0) - v;
    owed[m.from] = (owed[m.from] || 0) + v;
  }
  const byPerson = [...new Set([...Object.keys(paid), ...Object.keys(share)])]
    .map(uid => ({ uid, paid: paid[uid] || 0, share: share[uid] || 0, balance: owed[uid] || 0 }))
    .sort((a, b) => b.share - a.share || b.paid - a.paid || (a.uid === currentUid ? -1 : b.uid === currentUid ? 1 : 0));

  return {
    ...base,
    ils,
    byCategory,
    top,
    byPerson,
    unassigned,
    splits,
    payments: moves.length,
    mine: currentUid && currentUid in owed ? owed[currentUid] : null,
    myShare: currentUid ? share[currentUid] || 0 : null,
    // Who pays whom: each pair still out by more than SETTLED, most first.
    transfers: Object.values(ledger).filter(p => Math.abs(p.net) >= SETTLED)
      .map(p => ({ from: p.net > 0 ? p.b : p.a, to: p.net > 0 ? p.a : p.b, amount: Math.abs(p.net), open: p.open }))
      .sort((x, y) => y.amount - x.amount),
    // The looker and each one they split with: balance above 0 when the
    // other owes; back, what was paid back (same sign). Open first, the
    // most owed either way first; then those all paid back.
    withMe: currentUid ? Object.values(ledger).filter(p => p.a === currentUid || p.b === currentUid)
      .map(p => {
        const sign = p.a === currentUid ? 1 : -1;
        return {
          uid: p.a === currentUid ? p.b : p.a, balance: sign * p.net, back: sign * p.back,
          debt: sign * p.debt, moved: sign * p.moved, open: p.open, closed: p.closed,
        };
      })
      .sort((x, y) => (y.open.length > 0) - (x.open.length > 0)
        || Math.abs(y.balance) - Math.abs(x.balance) || Math.abs(y.back) - Math.abs(x.back)) : [],
    paidBack: back,
  };
}
