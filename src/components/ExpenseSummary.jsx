import { useState } from 'react';
import { ChevronLeft, ArrowLeft, Check, Users, User } from 'lucide-react';
import Sheet, { Segmented } from '../ui/Sheet';
import SectionHeader from '../ui/SectionHeader';
import { Pill, CategoryDisc } from '../ui/kit';
import { expenseCategoryStyle, getCurrencyInfo, shekels, money, expenseLabel, expenseDay } from './expenseStyle';

/* The expenses tab's numbers (src/lib/expenseSummary.js), twice:
   ExpenseHero, the card over the list — the total, big, the split by
   category, and the looker's own figures; and ExpenseSummarySheet,
   everything, which the card opens, in sections that fold (kept on the
   phone), for the whole trip or for the looker alone ("שלי"). */

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


function BalanceTile({ balance }) {
  if (Math.abs(balance) < 0.5) return <Tile label="ההתחשבנות שלך" value="מאוזן" />;
  return balance > 0
    ? <Tile label="מגיע לך" value={shekels(balance)} tone="up" />
    : <Tile label="עליך להעביר" value={shekels(balance)} tone="down" />;
}

// The looker's own: their part of the costs (on a shared trip), and what
// they get back or owe from the expenses split with them (null when none
// was). Otherwise the biggest expense.
export function ExpenseHero({ summary: s, onOpen }) {
  const tiles = [];
  if (s.ils != null && s.people >= 2 && s.myShare != null) tiles.push(<Tile key="share" label="החלק שלי" value={shekels(s.myShare)} />);
  if (s.mine != null) tiles.push(<BalanceTile key="mine" balance={s.mine} />);
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

// Which sections of the summary are folded, on this phone.
const FOLDED = 'expenses.summaryFolded';
function useFolded() {
  const [folded, setFolded] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FOLDED)) || {}; } catch { return {}; }
  });
  const toggle = (id) => setFolded(prev => {
    const next = { ...prev, [id]: !prev[id] };
    try { localStorage.setItem(FOLDED, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });
  return [folded, toggle];
}

function Section({ title, hint, count, folded, onToggle, children }) {
  return (
    <section className="expense-section">
      <SectionHeader title={title} count={count} collapsed={folded} onToggle={onToggle} />
      {!folded && hint && <p className="expense-section-hint">{hint}</p>}
      {!folded && <div className="expense-rows">{children}</div>}
    </section>
  );
}

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

// The biggest expenses, in shekels; in "שלי" an expense split is the
// looker's part, with the whole under it.
function TopRows({ items, plans }) {
  return items.map(e => {
    const st = expenseCategoryStyle(e.category || 'כללי');
    const day = expenseDay(e.createdAt);
    const part = e.part && e.part < 1;
    return (
      <div key={e.id} className="expense-row">
        <CategoryDisc color={st.color} size={34}><st.Icon size={16} /></CategoryDisc>
        <span className="expense-row-main">
          <span className="expense-row-name">{expenseLabel(e, plans)}</span>
          {day && <span className="expense-row-sub">{day}</span>}
        </span>
        <span className="expense-row-end">
          <span className="expense-row-value">{shekels(e.ils)}</span>
          {part
            ? <span className="expense-row-sub">מתוך {money(e.amount / e.part, e.currency)}</span>
            : e.currency !== 'ILS' && <span className="expense-row-sub">{money(e.amount, e.currency)}</span>}
        </span>
      </div>
    );
  });
}

function CategoryRows({ items }) {
  return (<>
    <CategoryBar items={items} height={12} />
    {items.map(c => {
      const st = expenseCategoryStyle(c.cat);
      return (
        <div key={c.cat} className="expense-row">
          <CategoryDisc color={st.color} size={34}><st.Icon size={16} /></CategoryDisc>
          <span className="expense-row-main">
            <span className="expense-row-name">{c.cat}</span>
            <span className="expense-meter"><span style={{ width: `${Math.max(c.pct, 1)}%`, background: st.color }} /></span>
          </span>
          <span className="expense-row-end">
            <span className="expense-row-value">{shekels(c.total)}</span>
            <span className="expense-row-sub">{c.pct}%</span>
          </span>
        </div>
      );
    })}
  </>);
}

function TransferRows({ transfers, getPayerProfile, currentUid }) {
  return transfers.map(t => (
    <div key={`${t.from}-${t.to}`} className="expense-row transfer">
      <span className="expense-row-main">
        <PersonName uid={t.from} profile={getPayerProfile(t.from)} currentUid={currentUid} />
        <span className="expense-transfer-to">
          <ArrowLeft size={14} aria-hidden="true" />
          אל
          <PersonName uid={t.to} profile={getPayerProfile(t.to)} currentUid={currentUid} size={18} />
        </span>
      </span>
      <span className="expense-row-value">{shekels(t.amount)}</span>
    </div>
  ));
}

// One number that matters, big, with a line under it.
function Headline({ label, value, sub, tone }) {
  return (
    <div className={`expense-headline${tone ? ' ' + tone : ''}`}>
      <span className="expense-headline-label">{label}</span>
      <span className="expense-headline-value">{value}</span>
      {sub && <span className="expense-headline-sub">{sub}</span>}
    </div>
  );
}

// My settling up, said from where I stand: who pays me, whom I pay.
function MyBalance({ balance, transfers, currentUid, getPayerProfile }) {
  const name = (uid) => getPayerProfile(uid)?.displayName || getPayerProfile(uid)?.email || 'משתתף';
  const even = Math.abs(balance) < 0.5;
  const tone = even ? '' : balance > 0 ? 'up' : 'down';
  return (
    <div className={`expense-balance${tone ? ' ' + tone : ''}`}>
      <span className="expense-balance-head">
        <span className="expense-balance-label">{even ? 'ההתחשבנות שלך' : balance > 0 ? 'מגיע לך' : 'עליך להעביר'}</span>
        <span className="expense-balance-value">{even ? 'מאוזן' : shekels(balance)}</span>
      </span>
      {transfers.map(t => {
        const toMe = t.to === currentUid;
        const other = toMe ? t.from : t.to;
        return (
          <span key={`${t.from}-${t.to}`} className="expense-row transfer mine">
            <MemberAvatar profile={getPayerProfile(other)} size={26} />
            <span className="expense-row-name">{toMe ? `${name(other)} מעביר/ה לך` : `להעביר ל${name(other)}`}</span>
            <span className={`expense-row-value ${toMe ? 'up' : 'down'}`}>{shekels(t.amount)}</span>
          </span>
        );
      })}
      {even && !transfers.length && (
        <span className="expense-balance-note"><Check size={14} aria-hidden="true" />אין לך מה להעביר או לקבל</span>
      )}
    </div>
  );
}

// own: the summary of the looker's own part (personalExpenses), for "שלי".
// On a shared trip it opens on "שלי": my part, my settling up, then my
// categories and biggest. "כולם": the trip's total, who pays whom, each
// one's part, then categories, currencies and the biggest. The key numbers
// are the big cards on top; the rest folds.
export default function ExpenseSummarySheet({ summary: s, own, expenses, plans, currentUid, getPayerProfile, onClose }) {
  const anyPayer = expenses.some(e => e.paidBy);
  const foreign = s.byCurrency.some(c => c.code !== 'ILS');
  const [folded, toggle] = useFolded();
  const fold = (id) => ({ folded: !!folded[id], onToggle: () => toggle(id) });
  const canScope = s.ils != null && s.people >= 2 && !!own;
  const [scope, setScope] = useState('me');
  const mineOnly = canScope && scope === 'me';
  const me = s.byPerson.find(p => p.uid === currentUid);
  const myTransfers = s.transfers.filter(t => t.from === currentUid || t.to === currentUid);

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
          <div className="expense-headlines">
            <Headline label="החלק שלי" value={shekels(own.ils || 0)}
              sub={plural(own.count, 'הוצאה אחת', 'הוצאות')} />
            <Headline label="שילמתי" value={shekels(me?.paid || 0)} sub="מכיסי, כולל מה שחילקתי" />
          </div>
          <p className="expense-section-hint">
            החלק שלי: כל הוצאה ששילמתי ולא חילקתי, וחלק שווה בכל הוצאה שחולקה איתי.
          </p>

          {s.splits > 0 && (
            <MyBalance balance={s.mine || 0} transfers={myTransfers} currentUid={currentUid} getPayerProfile={getPayerProfile} />
          )}

          {own.byCategory.length > 0 ? (
            <Section title="שלי, לפי קטגוריה" count={own.byCategory.length} {...fold('categories')}>
              <CategoryRows items={own.byCategory} />
            </Section>
          ) : (
            <div className="expense-row muted">
              <span className="expense-row-name">עוד אין הוצאות שלך בטיול הזה.</span>
            </div>
          )}

          {own.top.length > 0 && (
            <Section title="ההוצאות הגדולות שלי" {...fold('top')}>
              <TopRows items={own.top} plans={plans} />
            </Section>
          )}
        </>) : (<>
          {s.ils != null ? (
            <div className="expense-headlines">
              <Headline label='סה"כ הטיול' value={shekels(s.ils)}
                sub={[plural(s.count, 'הוצאה אחת', 'הוצאות'), s.people >= 2 ? `${s.people} משתתפים` : ''].filter(Boolean).join(' · ')} />
            </div>
          ) : (
            <Section title='סה"כ לפי מטבע' hint="ההמרה לשקלים, החלוקה וההתחשבנות יופיעו כשיהיו שערי המרה." {...fold('currency')}>
              {s.byCurrency.map(c => (
                <div key={c.code} className="expense-row">
                  <span className="expense-cur-disc">{getCurrencyInfo(c.code).symbol}</span>
                  <span className="expense-row-name">{getCurrencyInfo(c.code).name}</span>
                  <span className="expense-row-value">{money(c.total, c.code)}</span>
                </div>
              ))}
            </Section>
          )}

          {s.ils != null && (s.splits > 0 || s.people >= 2) && (
            <div className="expense-card">
              <span className="expense-card-title">מי מעביר למי</span>
              <span className="expense-section-hint">רק מהוצאות שחולקו: בכל הוצאה, המשלם בוחר עם מי היא מתחלקת.</span>
              {!s.splits ? (
                <div className="expense-row muted">
                  <span className="expense-row-name">עוד אין הוצאות שחולקו. ב"חלוקה" בטופס בוחרים עם מי מתחלקים, וכאן יופיע מי חייב למי.</span>
                </div>
              ) : s.transfers.length ? (
                <TransferRows transfers={s.transfers} getPayerProfile={getPayerProfile} currentUid={currentUid} />
              ) : (
                <div className="expense-row muted">
                  <Check size={18} aria-hidden="true" />
                  <span className="expense-row-name">כולם מאוזנים, אין מה להעביר</span>
                </div>
              )}
            </div>
          )}

          {s.byPerson.length > 0 && (anyPayer || s.people >= 2) && (
            <Section title="לכל משתתף" {...fold('payers')}
              hint="החלק של כל אחד, וכמה שילם. הוצאה שלא חולקה היא של מי ששילם.">
              {s.byPerson.map(({ uid, paid, share, balance }) => (
                <div key={uid} className="expense-row">
                  <PersonName uid={uid} profile={getPayerProfile(uid)} currentUid={currentUid} />
                  <span className="expense-row-end">
                    <span className="expense-row-value">{shekels(share)}</span>
                    <span className="expense-row-sub">
                      {paid >= 0.5 ? `שילם ${shekels(paid)}` : 'לא שילם'}
                    </span>
                  </span>
                  {Math.abs(balance) >= 0.5 && (
                    <Pill size="sm" tone={balance > 0 ? 'mint' : 'red'}>
                      <span dir="ltr">{balance > 0 ? '+' : '−'}{shekels(balance)}</span>
                    </Pill>
                  )}
                </div>
              ))}
              {s.unassigned >= 0.5 && (
                <div className="expense-row muted">
                  <span className="expense-row-name">בלי משלם</span>
                  <span className="expense-row-value">{shekels(s.unassigned)}</span>
                </div>
              )}
            </Section>
          )}

          {s.byCategory.length > 0 && (
            <Section title="לפי קטגוריה" count={s.byCategory.length} {...fold('categories')}>
              <CategoryRows items={s.byCategory} />
            </Section>
          )}

          {s.ils != null && foreign && (
            <Section title="לפי מטבע מקורי" {...fold('currencies')}>
              {s.byCurrency.map(c => (
                <div key={c.code} className="expense-row">
                  <span className="expense-cur-disc">{getCurrencyInfo(c.code).symbol}</span>
                  <span className="expense-row-name">{getCurrencyInfo(c.code).name}</span>
                  <span className="expense-row-end">
                    <span className="expense-row-value">{money(c.total, c.code)}</span>
                    {c.code !== 'ILS' && <span className="expense-row-sub">≈ {shekels(c.ils)}</span>}
                  </span>
                </div>
              ))}
            </Section>
          )}

          {s.top.length > 0 && (
            <Section title="ההוצאות הגדולות" {...fold('top')}>
              <TopRows items={s.top} plans={plans} />
            </Section>
          )}
        </>)}
      </div>
    </Sheet>
  );
}
