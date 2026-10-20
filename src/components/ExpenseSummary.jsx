import { useState } from 'react';
import { ChevronLeft, ArrowLeft, Check } from 'lucide-react';
import Sheet from '../ui/Sheet';
import SectionHeader from '../ui/SectionHeader';
import { Pill, CategoryDisc } from '../ui/kit';
import { expenseCategoryStyle, getCurrencyInfo, shekels, money, expenseLabel, expenseDay } from './expenseStyle';

/* The expenses tab's numbers (src/lib/expenseSummary.js), twice:
   ExpenseHero, the card over the list — the total, big, the split by
   category, and a few figures; and ExpenseSummarySheet, everything, which
   the card opens, in sections that fold (kept on the phone). */

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

// What the one looking gets back or owes, from the expenses split with
// them (src/lib/expenseSummary.js); null when none was.
export function ExpenseHero({ summary: s, onOpen }) {
  const mine = s.mine;
  const tiles = [];
  if (s.perPerson != null) tiles.push(<Tile key="person" label={`לאדם (÷${s.people})`} value={shekels(s.perPerson)} />);
  if (s.daily && s.daily.days > 1) tiles.push(<Tile key="day" label="ממוצע ליום" value={shekels(s.daily.avg)} />);
  if (mine != null) tiles.push(<BalanceTile key="mine" balance={mine} />);
  else if (s.top.length) tiles.push(<Tile key="top" label="הגדולה ביותר" value={shekels(s.top[0].ils)} />);

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

export default function ExpenseSummarySheet({ summary: s, expenses, plans, currentUid, getPayerProfile, onClose }) {
  const anyPayer = expenses.some(e => e.paidBy);
  const foreign = s.byCurrency.some(c => c.code !== 'ILS');
  const [folded, toggle] = useFolded();
  const fold = (id) => ({ folded: !!folded[id], onToggle: () => toggle(id) });
  return (
    <Sheet title="סיכום הוצאות" onClose={onClose}>
      <div className="expense-summary">
        {s.ils != null ? (
          <div className="expense-tiles big" style={{ '--n': 2 }}>
            <Tile label='סה"כ בשקלים' value={shekels(s.ils)} />
            <Tile label="הוצאות" value={s.count.toLocaleString('he-IL')} />
            {s.perPerson != null && <Tile label={`לאדם (÷${s.people})`} value={shekels(s.perPerson)} />}
            {s.daily && s.daily.days > 1 && <Tile label={`ממוצע ליום (${s.daily.days} ימים)`} value={shekels(s.daily.avg)} />}
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

        {s.byPayer.length > 0 && (anyPayer || s.people >= 2) && (
          <Section title="מי שילם" {...fold('payers')}>
            {s.byPayer.map(({ uid, total, balance }) => (
              <div key={uid} className="expense-row">
                <PersonName uid={uid} profile={getPayerProfile(uid)} currentUid={currentUid} />
                <span className="expense-row-end">
                  <span className="expense-row-value">{shekels(total)}</span>
                  {/* Owed or owing, from the split expenses only. */}
                  {Math.abs(balance) >= 0.5 && (
                    <Pill size="sm" tone={balance > 0 ? 'mint' : 'red'}>
                      <span dir="ltr">{balance > 0 ? '+' : '−'}{shekels(balance)}</span>
                    </Pill>
                  )}
                </span>
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

        {s.ils != null && (s.splits > 0 || s.people >= 2) && (
          <Section title="מי מעביר למי" count={s.splits || null} {...fold('transfers')}
            hint={s.splits ? 'רק מהוצאות שחולקו: בכל הוצאה, המשלם בוחר עם מי היא מתחלקת.' : null}>
            {!s.splits ? (
              <div className="expense-row muted">
                <span className="expense-row-name">עוד אין הוצאות שחולקו. בטופס ההוצאה, ב"חלוקה", בוחרים עם מי מתחלקים, וכאן יופיע מי חייב למי.</span>
              </div>
            ) : s.transfers.length ? s.transfers.map(t => (
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
            )) : (
              <div className="expense-row muted">
                <Check size={18} aria-hidden="true" />
                <span className="expense-row-name">כולם מאוזנים, אין מה להעביר</span>
              </div>
            )}
          </Section>
        )}

        {s.byCategory.length > 0 && (
          <Section title="לפי קטגוריה" count={s.byCategory.length} {...fold('categories')}>
            <CategoryBar items={s.byCategory} height={12} />
            {s.byCategory.map(c => {
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
            {s.top.map(e => {
              const st = expenseCategoryStyle(e.category || 'כללי');
              const day = expenseDay(e.createdAt);
              return (
                <div key={e.id} className="expense-row">
                  <CategoryDisc color={st.color} size={34}><st.Icon size={16} /></CategoryDisc>
                  <span className="expense-row-main">
                    <span className="expense-row-name">{expenseLabel(e, plans)}</span>
                    {day && <span className="expense-row-sub">{day}</span>}
                  </span>
                  <span className="expense-row-end">
                    <span className="expense-row-value">{shekels(e.ils)}</span>
                    {e.currency !== 'ILS' && <span className="expense-row-sub">{money(e.amount, e.currency)}</span>}
                  </span>
                </div>
              );
            })}
          </Section>
        )}
      </div>
    </Sheet>
  );
}
