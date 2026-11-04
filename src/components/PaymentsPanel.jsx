import { useMemo, useState } from 'react';
import {
  HandCoins, Banknote, ArrowLeftRight, ChevronDown, Check, Plus, X, Pencil, Trash2,
} from 'lucide-react';
import Sheet, { Segmented } from '../ui/Sheet';
import SheetDelete from '../ui/SheetDelete';
import SectionHeader from '../ui/SectionHeader';
import ListCard from '../ui/ListCard';
import { Pill, CategoryDisc } from '../ui/kit';
import EmptyState from './EmptyState';
import CurrencySheet from './CurrencySheet';
import { MySettle, MemberAvatar } from './ExpenseSummary';
import { getCurrencyInfo, shekels, money, expenseDay } from './expenseStyle';
import { convert } from '../services/currency';
import { SETTLED, GUEST, PAY_FOR, PAY_GAVE } from '../lib/expenseSummary';

/* ── "בינינו" (8.79.0, the owner's ask) ────────────────────────────────
   Money between two people, apart from the trip's expenses: "שילמתי על
   דנה €25", "קיבלתי מדנה ₪50". A payment (trips/{id}/payments) is money
   from `from` to `to`, so `to` owes `from` that much more; it is in who
   owes whom (src/lib/expenseSummary.js) and never in the trip's total.
   The view: my settling up (MySettle, the summary's own), then the
   payments, newest first. The form reads as a sentence: who, to whom,
   how much, and what it leaves between them.                              */

const KIND = {
  [PAY_FOR]: { Icon: HandCoins, color: '#F59E0B' },
  [PAY_GAVE]: { Icon: Banknote, color: '#22A45D' },
};

// "לדנה", "ל־Dana": a Hebrew name takes the letter, any other a maqaf.
const withPrefix = (p, name) => (/^[֐-׿]/.test(name || '') ? `${p}${name}` : `${p}־${name}`);

// The row's sentence, first person when it is mine.
function paymentTitle(m, me, nameOf) {
  const from = nameOf(m.from);
  const to = nameOf(m.to);
  if (m.kind === PAY_GAVE) {
    if (m.from === me) return `העברתי ${withPrefix('ל', to)}`;
    if (m.to === me) return `קיבלתי ${withPrefix('מ', from)}`;
    return `${from} העביר/ה ${withPrefix('ל', to)}`;
  }
  if (m.from === me) return `שילמתי על ${to}`;
  if (m.to === me) return `${from} שילם/ה עליי`;
  return `${from} שילם/ה על ${to}`;
}

// Who owes whom, in words.
function owesText(debtor, creditor, amount, me, nameOf) {
  const v = shekels(amount);
  if (debtor === me) return `עליך להעביר ${v} ${withPrefix('ל', nameOf(creditor))}`;
  if (creditor === me) return `מגיע לך ${v} ${withPrefix('מ', nameOf(debtor))}`;
  return `${nameOf(debtor)} מעביר/ה ${withPrefix('ל', nameOf(creditor))} ${v}`;
}

// How much x owes y now, in shekels (below 0: y owes x), from who pays
// whom; without `skip`, the payment being edited.
function owes(summary, x, y, skip, rates) {
  let n = 0;
  for (const t of summary.transfers) {
    if (t.from === x && t.to === y) n += t.amount;
    else if (t.from === y && t.to === x) n -= t.amount;
  }
  if (skip && !skip.settled && rates) {
    const v = convert(skip.amount, skip.currency, 'ILS', rates);
    if (skip.to === x && skip.from === y) n -= v;
    else if (skip.from === x && skip.to === y) n += v;
  }
  return n;
}

export function PaymentsView({
  summary: s, payments, rates, currentUid, personProfile, mayChange, onOpen, onDelete, onMark, canMark,
}) {
  const nameOf = (id) => (id === currentUid ? 'אני' : personProfile(id)?.displayName || personProfile(id)?.email || 'משתתף');
  const list = useMemo(
    () => [...payments].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))),
    [payments]
  );
  return (
    <div className="pay-view">
      {rates && (
        <MySettle balance={s.mine || 0} withMe={s.withMe} splits={s.splits + s.payments}
          getPayerProfile={personProfile} onMark={onMark} canMark={canMark}
          emptyText="עוד אין מה להתחשבן. שילמת על מישהו, או שמישהו העביר לך? רושמים כאן." />
      )}
      {list.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="עוד אין רישומים ביניכם"
          hint='שילמת על מישהו, או שמישהו העביר לך כסף? רושמים כאן, וזה נכנס ל"מי מעביר למי". הוצאה של הטיול נרשמת ב"הוצאות".'
        />
      ) : (
        <section className="pay-list">
          <SectionHeader title="רישומים" count={list.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map(m => {
              const k = KIND[m.kind] || KIND[PAY_FOR];
              const ils = m.currency !== 'ILS' && rates ? convert(m.amount, m.currency, 'ILS', rates) : null;
              const meta = [m.note, expenseDay(m.createdAt)].filter(Boolean).join(' · ');
              const mine = mayChange(m);
              return (
                <ListCard
                  key={m.id}
                  muted={!!m.settled}
                  icon={<CategoryDisc color={k.color} size={42} muted={!!m.settled}><k.Icon size={19} /></CategoryDisc>}
                  title={paymentTitle(m, currentUid, nameOf)}
                  menuTitle={paymentTitle(m, currentUid, nameOf)}
                  meta={meta || null}
                  tags={[
                    m.settled && <Pill key="done" size="sm" tone="mint" icon={<Check size={11} strokeWidth={3} />}>נסגר</Pill>,
                  ]}
                  trailing={
                    <span className="expense-amount">
                      <span className="expense-amount-main">{money(m.amount, m.currency)}</span>
                      {ils != null && <span className="expense-amount-ils">≈ {shekels(ils)}</span>}
                    </span>
                  }
                  onOpen={mine ? () => onOpen(m) : undefined}
                  actions={mine ? [
                    { key: 'edit', label: 'עריכה', Icon: Pencil, run: () => onOpen(m) },
                    { key: 'del', label: 'מחיקה', Icon: Trash2, run: () => onDelete(m), danger: true, swipe: true },
                  ] : []}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// The form. people: who can be picked (the trip's, then names of people
// not on it). onSave(fields): the payment's own fields.
export function PaymentSheet({
  payment, people, currentUid, personProfile, summary, rates,
  quickCurrencies, startCurrency, onKeepCurrency, onSave, onDelete, onClose,
}) {
  const others = people.filter(id => id !== currentUid);
  // A new one: from me, to whoever I have the most open with.
  const [init] = useState(() => {
    if (payment) {
      return { kind: payment.kind === PAY_GAVE ? PAY_GAVE : PAY_FOR, from: payment.from, to: payment.to,
        amount: String(payment.amount ?? ''), currency: payment.currency || startCurrency, note: payment.note || '' };
    }
    const top = summary.withMe.find(p => p.open.length && Math.abs(p.balance) >= SETTLED)?.uid;
    return { kind: PAY_FOR, from: currentUid, to: top || others[0] || '', amount: '', currency: startCurrency, note: '' };
  });
  const [kind, setKind] = useState(init.kind);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [amount, setAmount] = useState(init.amount);
  const [currency, setCurrency] = useState(init.currency);
  const [note, setNote] = useState(init.note);
  const [quick, setQuick] = useState(() => [...new Set([...quickCurrencies, init.currency])]);
  const [picking, setPicking] = useState(null);   // 'from' | 'to'
  const [curOpen, setCurOpen] = useState(false);
  const [names, setNames] = useState([]);         // names added here
  const [draft, setDraft] = useState(null);       // a new name being typed

  const everyone = [...new Set([...people, ...names, from, to].filter(Boolean))];
  const nameOf = (id) => (id === currentUid ? 'אני' : personProfile(id)?.displayName || personProfile(id)?.email || 'משתתף');
  const dirty = JSON.stringify([kind, from, to, amount, currency, note]) !== JSON.stringify([init.kind, init.from, init.to, init.amount, init.currency, init.note]);
  const value = parseFloat(String(amount).replace(',', '.'));
  const valid = from && to && from !== to && value > 0;

  // A transfer is from whoever owes: switching to it turns the pair around
  // when it is the other way.
  const chooseKind = (k) => {
    setKind(k);
    if (k === PAY_GAVE && rates && from && to && owes(summary, to, from, payment, rates) >= SETTLED) {
      setFrom(to); setTo(from);
    }
  };
  const pick = (side, id) => {
    const other = side === 'from' ? to : from;
    if (id === other) { setFrom(to); setTo(from); return; }   // the same one: swap
    (side === 'from' ? setFrom : setTo)(id);
  };

  const submit = (e, close) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      kind, from, to, amount: Math.round(value * 100) / 100, currency, note: note.trim() || null,
    });
    close();
  };

  // What it leaves between them.
  const ctx = (() => {
    if (!rates || !from || !to || from === to) return null;
    const before = owes(summary, from, to, payment, rates);   // from owes to
    const v = value > 0 ? convert(value, currency, 'ILS', rates) : 0;
    const after = before - v;
    const toCur = (ils) => Math.round(convert(ils, 'ILS', currency, rates) * 100) / 100;
    let sub = null;
    let tone = '';
    if (kind === PAY_GAVE && before >= SETTLED) {
      if (!v) sub = `${owesText(from, to, before, currentUid, nameOf)}`;
      else if (after >= SETTLED) sub = `נשארו ${shekels(after)} מתוך ${shekels(before)}`;
      else if (after > -SETTLED) { sub = 'הכל הועבר, אין יותר חוב'; tone = 'up'; }
      else sub = `יותר מהחוב. עכשיו ${owesText(to, from, -after, currentUid, nameOf)}`;
    } else if (v) {
      sub = Math.abs(after) < SETTLED ? 'ביניכם אחרי זה: מאוזן'
        : `ביניכם אחרי זה: ${after > 0 ? owesText(from, to, after, currentUid, nameOf) : owesText(to, from, -after, currentUid, nameOf)}`;
    }
    const fill = kind === PAY_GAVE && before >= SETTLED && Math.abs(v - before) >= SETTLED ? toCur(before) : null;
    return { sub, tone, fill };
  })();

  const person = (side) => {
    const id = side === 'from' ? from : to;
    const label = side === 'from'
      ? (kind === PAY_GAVE ? 'מי העביר' : 'מי שילם')
      : (kind === PAY_GAVE ? 'למי' : 'על מי');
    const prof = id ? personProfile(id) : null;
    return (
      <button type="button" className="pay-person" onClick={() => setPicking(side)} aria-haspopup="dialog"
        aria-label={`${label}: ${id ? nameOf(id) : 'לבחור'}`}>
        <span className="pay-person-label">{label}</span>
        <span className="pay-person-who">
          {id ? <MemberAvatar profile={prof} size={24} /> : <span className="pay-person-empty" aria-hidden="true" />}
          <span className="pay-person-name">{id ? nameOf(id) : 'לבחור'}</span>
          <ChevronDown size={15} strokeWidth={2.6} aria-hidden="true" />
        </span>
      </button>
    );
  };

  const addName = (side) => {
    const n = (draft || '').trim();
    if (!n) return;
    const id = GUEST + n;
    setNames(prev => (prev.includes(id) ? prev : [...prev, id]));
    setDraft(null);
    pick(side, id);
    setPicking(null);
  };

  return (
    <>
      <Sheet title={payment ? 'עריכת רישום' : 'רישום בינינו'} onClose={onClose} dirty={dirty} style={{ maxHeight: '92vh' }}>
        {({ cancel, close }) => (
          <form onSubmit={(e) => submit(e, close)} className="pay-form">
            <Segmented label="מה קרה" value={kind} onChange={chooseKind} options={[
              { key: PAY_FOR, label: 'שילם על מישהו', Icon: HandCoins },
              { key: PAY_GAVE, label: 'העביר כסף', Icon: Banknote },
            ]} />

            <div className="pay-pair">
              {person('from')}
              <button type="button" className="round-btn pay-swap" onClick={() => { setFrom(to); setTo(from); }}
                aria-label="החלפת כיוון" title="החלפת כיוון">
                <ArrowLeftRight size={16} />
              </button>
              {person('to')}
            </div>

            <div className="exp-amount">
              <label htmlFor="pay-amount" className="exp-amount-label">סכום *</label>
              <div className="exp-amount-field">
                <input id="pay-amount" type="number" min="0" step="0.01" inputMode="decimal" required
                  placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
                <button type="button" className="exp-currency" onClick={() => setCurOpen(true)}
                  aria-haspopup="dialog" aria-label={`מטבע: ${getCurrencyInfo(currency).name}`}>
                  <span className="exp-currency-symbol">{getCurrencyInfo(currency).symbol}</span>
                  <span className="exp-currency-code">{currency}</span>
                  <ChevronDown size={15} strokeWidth={2.6} aria-hidden="true" />
                </button>
              </div>
            </div>

            {ctx && (ctx.sub || ctx.fill != null) && (
              <div className={`pay-context${ctx.tone ? ' ' + ctx.tone : ''}`} role="status">
                {ctx.sub && <span className="pay-context-text">{ctx.sub}</span>}
                {ctx.fill != null && (
                  <button type="button" className="pay-fill" onClick={() => setAmount(String(ctx.fill))}>
                    {`כל החוב: ${money(ctx.fill, currency)}`}
                  </button>
                )}
              </div>
            )}

            <input type="text" className="form-control" aria-label="על מה" value={note} onChange={e => setNote(e.target.value)}
              placeholder={kind === PAY_GAVE ? 'הערה (רשות): ביט, מזומן…' : 'על מה? (רשות) כרטיס, מונית…'} />

            <div className="sheet-footer">
              <button type="submit" className="btn-primary" disabled={!valid}>שמור</button>
              <button type="button" onClick={cancel} className="btn-secondary">ביטול</button>
              {payment && onDelete && <SheetDelete close={close} onDelete={() => onDelete(payment)} />}
            </div>
          </form>
        )}
      </Sheet>

      {picking && (
        <Sheet title={picking === 'from' ? (kind === PAY_GAVE ? 'מי העביר' : 'מי שילם') : (kind === PAY_GAVE ? 'למי' : 'על מי')}
          onClose={() => { setPicking(null); setDraft(null); }}>
          {({ close }) => (
            <div className="list-group" role="radiogroup">
              {everyone.map(id => {
                const on = (picking === 'from' ? from : to) === id;
                const prof = personProfile(id);
                return (
                  <button key={id} type="button" role="radio" aria-checked={on} className="list-row"
                    onClick={() => { pick(picking, id); close(); }}>
                    <MemberAvatar profile={prof} size={26} />
                    <span className="list-row-label">
                      {nameOf(id)}
                      {prof?.guest && <span className="list-row-hint">לא בטיול</span>}
                    </span>
                    {on && <Check size={16} aria-hidden="true" />}
                  </button>
                );
              })}
              {draft != null ? (
                <div className="list-row exp-new-name">
                  <input type="text" autoFocus className="form-control" value={draft} placeholder="שם של מי שלא בטיול"
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addName(picking); } }} />
                  <button type="button" onClick={() => addName(picking)} className="round-btn on" aria-label="הוסף שם" title="הוסף שם">
                    <Check size={16} />
                  </button>
                  <button type="button" className="btn-x" aria-label="ביטול" title="ביטול" onClick={() => setDraft(null)}>
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button type="button" className="list-row" onClick={() => setDraft('')}>
                  <Plus size={16} className="list-row-icon" />
                  <span className="list-row-label">שם של מי שלא בטיול</span>
                </button>
              )}
            </div>
          )}
        </Sheet>
      )}

      {curOpen && (
        <CurrencySheet value={currency} quick={quick} onClose={() => setCurOpen(false)}
          onPick={(code) => {
            setCurrency(code);
            if (!quick.includes(code)) setQuick(prev => [...prev, code]);
            onKeepCurrency?.(code);
          }} />
      )}
    </>
  );
}
