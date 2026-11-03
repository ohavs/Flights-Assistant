import { useState } from 'react';
import { ChevronLeft, ChevronDown, ArrowLeft, Check, Users, User, Tags, Coins, RotateCcw } from 'lucide-react';
import Sheet, { Segmented } from '../ui/Sheet';
import { CategoryDisc } from '../ui/kit';
import { SETTLED } from '../lib/expenseSummary';
import { expenseCategoryStyle, getCurrencyInfo, shekels, money } from './expenseStyle';

/* The expenses tab's numbers (src/lib/expenseSummary.js), twice:
   ExpenseHero, the card over the list — the total, big, the split by
   category, and what the looker paid and gets back; and
   ExpenseSummarySheet, which the card opens: for the looker alone
   ("שלי") or the whole trip ("כולם"), a total, the settling up and the
   split, nothing more (the owner's ask, 8.76.0). Settling up is by pair,
   and each pair's "שולם" marks what is open between them paid (8.77.0). */

export function MemberAvatar({ profile, size = 22 }) {
  if (profile?.photoURL) {
    return (
      <img src={profile.photoURL} alt="" referrerPolicy="no-referrer"
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  const name = profile?.displayName || profile?.email || '?';
  const initials = name.charAt(0).toUpperCase();
  const hue = name.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `hsl(${hue},55%,82%)`, color: `hsl(${hue},55%,28%)`,
      fontSize: Math.round(size * 0.46), fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// The share of each category, one bar: a segment each, in its colour,
// biggest first. The names are beside it (the legend, the rows).
function CategoryBar({ items, height = 10 }) {
  return (
    <span className="expense-bar" style={{ height }} role="img"
      aria-label={items.map(c => `${c.cat} ${c.pct}%`).join(', ')}>
      {items.map(c => (
        <span key={c.cat} title={`${c.cat} · ${shekels(c.total)} · ${c.pct}%`}
          style={{ flexGrow: c.frac, background: expenseCategoryStyle(c.cat).color }} />
      ))}
    </span>
  );
}

function Legend({ items, max = 4 }) {
  const shown = items.slice(0, max);
  return (
    <span className="expense-legend">
      {shown.map(c => (
        <span key={c.cat} className="expense-legend-item">
          <span className="expense-legend-dot" style={{ background: expenseCategoryStyle(c.cat).color }} />
          {c.cat} <b>{c.pct}%</b>
        </span>
      ))}
      {items.length > max && <span className="expense-legend-item">ועוד {items.length - max}</span>}
    </span>
  );
}

function Tile({ label, value, tone }) {
  return (
    <span className="expense-tile">
      <span className="expense-tile-label">{label}</span>
      <span className={`expense-tile-value${tone ? ' ' + tone : ''}`}>{value}</span>
    </span>
  );
}

const plural = (n, one, many) => (n === 1 ? one : `${n.toLocaleString('he-IL')} ${many}`);


// All paid back (nothing open, something closed) says so, not "מאוזן".
function BalanceTile({ balance, allPaid }) {
  if (Math.abs(balance) < SETTLED) return <Tile label="ההתחשבנות שלך" value={allPaid ? 'הכל שולם' : 'מאוזן'} tone={allPaid ? 'up' : ''} />;
  return balance > 0
    ? <Tile label="מגיע לך" value={shekels(balance)} tone="up" />
    : <Tile label="עליך להעביר" value={shekels(balance)} tone="down" />;
}

// The looker's own: what they paid (on a shared trip), and what they get
// back or owe from the expenses split with them (null when none was).
// Otherwise the biggest expense.
export function ExpenseHero({ summary: s, currentUid, onOpen }) {
  const tiles = [];
  const me = s.byPerson.find(p => p.uid === currentUid);
  if (s.ils != null && s.people >= 2 && currentUid) tiles.push(<Tile key="paid" label="שילמתי" value={shekels(me?.paid || 0)} />);
  const allPaid = s.withMe.length > 0 && s.withMe.every(p => !p.open.length);
  if (s.mine != null || allPaid) tiles.push(<BalanceTile key="mine" balance={s.mine || 0} allPaid={allPaid} />);
  if (tiles.length < 2 && s.top.length) tiles.push(<Tile key="top" label="הגדולה ביותר" value={shekels(s.top[0].ils)} />);

  return (
    <button type="button" className="glass-card expense-hero" onClick={onOpen}>
      <span className="expense-hero-head">
        <span className="expense-hero-label">סה"כ הוצאות</span>
        <span className="expense-hero-more">סיכום מלא<ChevronLeft size={16} aria-hidden="true" /></span>
      </span>
      {s.ils != null ? (
        <span className="expense-hero-total">{shekels(s.ils)}</span>
      ) : (
        <span className="expense-hero-currencies">
          {s.byCurrency.map(c => <span key={c.code}>{money(c.total, c.code)}</span>)}
        </span>
      )}
      <span className="expense-hero-sub">
        {plural(s.count, 'הוצאה אחת', 'הוצאות')}
        {s.byCurrency.length > 1 && ` · ${s.byCurrency.length} מטבעות`}
        {s.ils == null && ' · ההמרה לשקלים תופיע כשיהיו שערים'}
      </span>
      {s.byCategory.length > 0 && (
        <span className="expense-hero-split">
          <CategoryBar items={s.byCategory} />
          <Legend items={s.byCategory} />
        </span>
      )}
      {tiles.length > 0 && <span className="expense-tiles" style={{ '--n': tiles.length }}>{tiles}</span>}
    </button>
  );
}

// What the split shows in "כולם", kept on this phone.
const BY = 'expenses.summaryBy';
const BY_OPTIONS = [
  { key: 'category', label: 'לפי קטגוריה', Icon: Tags },
  { key: 'payer', label: 'לפי מי ששילם', Icon: Users },
  { key: 'currency', label: 'לפי מטבע', Icon: Coins },
];

function PersonName({ uid, profile, currentUid, size = 28 }) {
  return (
    <span className={`expense-person${profile?.former ? ' person-former' : ''}`}>
      <MemberAvatar profile={profile} size={size} />
      <span className="expense-person-name">
        {profile?.displayName || profile?.email || uid}
        {uid === currentUid && <span className="expense-person-note">(אני)</span>}
        {/* Their share still counts — the money was spent. */}
        {profile?.former && <span className="expense-person-note">(כבר לא בטיול)</span>}
      </span>
    </span>
  );
}

// One part of the whole: its name and amount, and under them a bar as
// long as its share, the share at its end. rows: [{ key, lead, name,
// note, value, frac, color }], biggest first.
function ShareRows({ rows }) {
  return (
    <div className="share-rows">
      {rows.map(r => {
        const pct = Math.round(r.frac * 100);
        return (
          <div key={r.key} className="share-row">
            <span className="share-row-lead">{r.lead}</span>
            <span className="share-row-name">
              {r.name}
              {r.note && <span className="share-row-note">{r.note}</span>}
            </span>
            <span className="share-row-value">{shekels(r.value)}</span>
            <span className="share-row-track" aria-hidden="true">
              <span style={{ width: `${Math.max(r.frac * 100, 1.5)}%`, background: r.color }} />
            </span>
            <span className="share-row-pct">{pct < 1 && r.frac > 0 ? '<1' : pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

const categoryRows = (items) => items.map(c => {
  const st = expenseCategoryStyle(c.cat);
  return {
    key: c.cat, name: c.cat, value: c.total, frac: c.frac, color: st.color,
    lead: <CategoryDisc color={st.color} size={32}><st.Icon size={16} /></CategoryDisc>,
  };
});

// One number that matters, big, with a line under it.
function Headline({ label, value, sub }) {
  return (
    <div className="expense-headline">
      <span className="expense-headline-label">{label}</span>
      <span className="expense-headline-value">{value}</span>
      {sub && <span className="expense-headline-sub">{sub}</span>}
    </div>
  );
}

// Marks what is open between two people paid back. An action, worded as
// one ("קיבלתי"/"העברתי"), not "שולם", which read as if it already was.
// Shown only when every one of those expenses may be changed here (canMark).
function PaidButton({ items, label, text, onMark, canMark }) {
  if (!onMark || !canMark?.(items)) return null;
  return (
    <button type="button" className="settle-btn" onClick={() => onMark(items, true)} aria-label={label} title={label}>
      {text}
    </button>
  );
}

// Settling up, from the splits only, by pair. Everyone's: who pays whom,
// each with "שולם"; under them what was paid back already.
function Settle({ transfers, splits, back, currentUid, getPayerProfile, onMark, canMark }) {
  const name = (uid) => (uid === currentUid ? 'אני' : getPayerProfile(uid)?.displayName || getPayerProfile(uid)?.email || 'משתתף');
  const even = !transfers.length;
  const allPaid = even && back >= SETTLED;
  return (
    <div className={`expense-balance${allPaid ? ' up' : ''}`}>
      <span className="expense-balance-label">מי מעביר למי</span>
      {even && <span className="expense-balance-value">{allPaid ? 'הכל שולם' : 'כולם מאוזנים'}</span>}
      {transfers.map(t => (
        <span key={`${t.from}-${t.to}`} className="expense-row transfer">
          <span className="expense-row-main">
            <PersonName uid={t.from} profile={getPayerProfile(t.from)} currentUid={currentUid} />
            <span className="expense-transfer-to">
              <ArrowLeft size={14} aria-hidden="true" />
              אל
              <PersonName uid={t.to} profile={getPayerProfile(t.to)} currentUid={currentUid} size={18} />
            </span>
          </span>
          <span className="expense-row-end">
            <span className="expense-row-value">{shekels(t.amount)}</span>
            <PaidButton items={t.open} label={`${name(t.from)} העביר/ה ל${name(t.to)} ${shekels(t.amount)}`}
              text={t.to === currentUid ? 'קיבלתי' : t.from === currentUid ? 'העברתי' : 'סמן ששולם'} onMark={onMark} canMark={canMark} />
          </span>
        </span>
      ))}
      {back >= SETTLED && (
        <span className="expense-balance-note done">
          <Check size={14} aria-hidden="true" />
          {`כבר הועברו ${shekels(back)}`}
        </span>
      )}
      {even && !allPaid && (
        <span className="expense-balance-note">
          <Check size={14} aria-hidden="true" />
          {splits ? 'אין מה להעביר' : 'עוד אין הוצאות שחולקו. ב"חלוקה" בטופס בוחרים עם מי מתחלקים'}
        </span>
      )}
    </div>
  );
}

// Mine: where I stand, then each one I split with — what is open between
// us, netted both ways, and "קיבלתי"/"העברתי" to close it. The headline
// is what is still open: "הכל שולם" once nothing is, and what was paid
// back already under it. Those all paid back stay under it, a tap to undo.
function MySettle({ balance, withMe, splits, getPayerProfile, onMark, canMark }) {
  const name = (uid) => getPayerProfile(uid)?.displayName || getPayerProfile(uid)?.email || 'משתתף';
  const even = Math.abs(balance) < SETTLED;
  const open = withMe.filter(p => p.open.length);
  const closed = withMe.filter(p => !p.open.length && p.closed.length);
  const allPaid = !open.length && closed.length > 0;
  const got = withMe.reduce((n, p) => n + Math.max(p.back, 0), 0);
  const gave = withMe.reduce((n, p) => n + Math.max(-p.back, 0), 0);
  const backNote = [got >= SETTLED && `קיבלת ${shekels(got)}`, gave >= SETTLED && `העברת ${shekels(gave)}`].filter(Boolean).join(' · ');
  const tone = allPaid ? 'up' : even ? '' : balance > 0 ? 'up' : 'down';
  return (
    <div className={`expense-balance${tone ? ' ' + tone : ''}`}>
      <span className="expense-balance-label">ההתחשבנות שלך</span>
      <span className="expense-balance-value">
        {allPaid ? <><Check size={22} strokeWidth={3} aria-hidden="true" />הכל שולם</>
          : even ? 'מאוזן' : `${balance > 0 ? 'מגיע לך' : 'עליך להעביר'} ${shekels(balance)}`}
      </span>
      {backNote && <span className="expense-balance-note done">{allPaid ? backNote : `כבר שולם: ${backNote}`}</span>}
      {open.map(p => {
        const toMe = p.balance >= SETTLED;
        const fromMe = p.balance <= -SETTLED;
        const sub = [
          toMe ? 'מעביר/ה לך' : fromMe ? 'עליך להעביר' : 'מתקזז',
          plural(p.open.length, 'הוצאה אחת', 'הוצאות'),
        ];
        if (Math.abs(p.back) >= SETTLED) sub.push(`${shekels(p.back)} כבר שולם`);
        return (
          <span key={p.uid} className="expense-row settle">
            <MemberAvatar profile={getPayerProfile(p.uid)} size={32} />
            <span className="expense-row-main">
              <span className={`expense-row-name${getPayerProfile(p.uid)?.former ? ' person-former' : ''}`}>{name(p.uid)}</span>
              <span className="expense-row-sub">{sub.join(' · ')}</span>
            </span>
            <span className="expense-row-end">
              <span className={`expense-row-value${toMe ? ' up' : fromMe ? ' down' : ''}`}>{shekels(p.balance)}</span>
              <PaidButton items={p.open}
                label={toMe ? `${name(p.uid)} שילם/ה לך ${shekels(p.balance)}` : fromMe ? `שילמתי ל${name(p.uid)} ${shekels(p.balance)}` : `סגירת החשבון עם ${name(p.uid)}`}
                text={toMe ? 'קיבלתי' : fromMe ? 'העברתי' : 'סגירה'} onMark={onMark} canMark={canMark} />
            </span>
          </span>
        );
      })}
      {closed.map(p => (
        <span key={p.uid} className="expense-row settle done">
          <MemberAvatar profile={getPayerProfile(p.uid)} size={32} />
          <span className="expense-row-main">
            <span className="expense-row-name">{name(p.uid)}</span>
            <span className="expense-row-sub paid">
              <Check size={12} strokeWidth={3} aria-hidden="true" />
              {p.back >= 0 ? `שילם/ה לך ${shekels(p.back)}` : `שילמת ${shekels(p.back)}`}
            </span>
          </span>
          {onMark && canMark?.(p.closed) && (
            <button type="button" className="settle-undo" onClick={() => onMark(p.closed, false)}
              aria-label={`ביטול הסימון ששולם, ${name(p.uid)}`} title="ביטול הסימון">
              <RotateCcw size={14} aria-hidden="true" />
              ביטול
            </button>
          )}
        </span>
      ))}
      {even && !open.length && !allPaid && (
        <span className="expense-balance-note">
          <Check size={14} aria-hidden="true" />
          {splits ? 'אין לך מה להעביר או לקבל'
            : 'עוד אין הוצאות שחולקו. ב"חלוקה" בטופס בוחרים עם מי מתחלקים'}
        </span>
      )}
    </div>
  );
}

// The split of the money, as bars. In "כולם" one button switches what
// it is split by, and opens the choice over the summary.
function Breakdown({ title, by, options, onBy, rows, empty }) {
  const [picking, setPicking] = useState(false);
  const current = options?.find(o => o.key === by);
  return (
    <div className="expense-card">
      <span className="expense-card-head">
        <span className="expense-card-title">{title}</span>
        {current && options.length > 1 && (
          <button type="button" className="expense-by" onClick={() => setPicking(true)} aria-haspopup="dialog"
            aria-label={`פילוג ${current.label}. החלפה`}>
            <current.Icon size={15} aria-hidden="true" />
            {current.label}
            <ChevronDown size={15} strokeWidth={2.6} aria-hidden="true" />
          </button>
        )}
      </span>
      {rows.length ? <ShareRows rows={rows} /> : <span className="expense-balance-note">{empty}</span>}
      {picking && (
        <Sheet title="פילוג" onClose={() => setPicking(false)}>
          {({ close }) => (
            <div className="list-group" role="radiogroup" aria-label="פילוג">
              {options.map(o => (
                <button key={o.key} type="button" role="radio" aria-checked={o.key === by} className="list-row"
                  onClick={() => { onBy(o.key); close(); }}>
                  <o.Icon size={18} className="list-row-icon" />
                  <span className="list-row-label">{o.label}</span>
                  {o.key === by && <Check size={16} aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

function useBy() {
  const [by, setBy] = useState(() => {
    try { return localStorage.getItem(BY) || 'category'; } catch { return 'category'; }
  });
  const choose = (k) => {
    setBy(k);
    try { localStorage.setItem(BY, k); } catch { /* private mode */ }
  };
  return [by, choose];
}

// paid: the summary of what the looker paid (paidExpenses), for "שלי".
// On a shared trip it opens on "שלי": what I paid, my settling up, and
// where my money went. "כולם": the trip's total, who pays whom, and the
// split by category, by who paid or by currency (one button switches).
// onMark(items, paid): marks parts paid back (or not); canMark(items):
// whether this phone may.
export default function ExpenseSummarySheet({ summary: s, paid, currentUid, getPayerProfile, onClose, onMark, canMark }) {
  const canScope = s.ils != null && s.people >= 2 && !!paid;
  const [scope, setScope] = useState('me');
  const mineOnly = canScope && scope === 'me';
  const [by, setBy] = useBy();

  const options = BY_OPTIONS.filter(o => o.key === 'category'
    || (o.key === 'payer' && s.people >= 2)
    || (o.key === 'currency' && s.byCurrency.length > 1));
  const shown = options.some(o => o.key === by) ? by : 'category';
  const grand = s.ils || 1;
  const rows = shown === 'payer'
    ? [
      ...s.byPerson.filter(p => p.paid >= SETTLED).sort((a, b) => b.paid - a.paid).map(p => {
        const prof = getPayerProfile(p.uid);
        return {
          key: p.uid, value: p.paid, frac: p.paid / grand, color: 'var(--brand)',
          name: <>{prof?.displayName || prof?.email || 'משתתף'}{p.uid === currentUid && <span className="share-row-note">(אני)</span>}</>,
          lead: <MemberAvatar profile={prof} size={32} />,
        };
      }),
      ...(s.unassigned >= SETTLED ? [{
        key: '-', name: 'בלי משלם', value: s.unassigned, frac: s.unassigned / grand, color: 'var(--ink-35)',
        lead: <CategoryDisc muted size={32}><Users size={16} /></CategoryDisc>,
      }] : []),
    ]
    : shown === 'currency'
      ? s.byCurrency.map(c => ({
        key: c.code, name: getCurrencyInfo(c.code).name, value: c.ils || 0, frac: (c.ils || 0) / grand, color: 'var(--brand)',
        note: c.code !== 'ILS' ? money(c.total, c.code) : null,
        lead: <span className="expense-cur-disc">{getCurrencyInfo(c.code).symbol}</span>,
      }))
      : categoryRows(s.byCategory);

  return (
    <Sheet title="סיכום הוצאות" onClose={onClose}>
      <div className="expense-summary">
        {canScope && (
          <div className="expense-scope">
            <Segmented label="של מי" value={scope} onChange={setScope} options={[
              { key: 'me', label: 'שלי', Icon: User },
              { key: 'all', label: 'כולם', Icon: Users },
            ]} />
          </div>
        )}

        {mineOnly ? (<>
          <Headline label="שילמתי" value={shekels(paid.ils || 0)}
            sub={paid.count ? plural(paid.count, 'הוצאה אחת', 'הוצאות') : 'עוד לא שילמת על הוצאה בטיול הזה'} />
          <MySettle balance={s.mine || 0} withMe={s.withMe} splits={s.splits}
            getPayerProfile={getPayerProfile} onMark={onMark} canMark={canMark} />
          {paid.count > 0 && <Breakdown title="לפי קטגוריה" rows={categoryRows(paid.byCategory)} />}
        </>) : s.ils != null ? (<>
          <Headline label='סה"כ הטיול' value={shekels(s.ils)}
            sub={[plural(s.count, 'הוצאה אחת', 'הוצאות'), s.people >= 2 ? `${s.people} משתתפים` : ''].filter(Boolean).join(' · ')} />
          {s.people >= 2 && (
            <Settle transfers={s.transfers} splits={s.splits} back={s.paidBack} currentUid={currentUid}
              getPayerProfile={getPayerProfile} onMark={onMark} canMark={canMark} />
          )}
          <Breakdown title="פילוג" by={shown} options={options} onBy={setBy} rows={rows} />
        </>) : (
          <div className="expense-card">
            <span className="expense-card-title">סה"כ לפי מטבע</span>
            {s.byCurrency.map(c => (
              <div key={c.code} className="expense-row">
                <span className="expense-cur-disc">{getCurrencyInfo(c.code).symbol}</span>
                <span className="expense-row-name">{getCurrencyInfo(c.code).name}</span>
                <span className="expense-row-value">{money(c.total, c.code)}</span>
              </div>
            ))}
            <span className="expense-balance-note">ההמרה לשקלים, הפילוג וההתחשבנות יופיעו כשיהיו שערי המרה.</span>
          </div>
        )}
      </div>
    </Sheet>
  );
}
