import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  Plus, Trash2, Search, X, Check, TrendingUp,
  Wallet, Receipt, Pencil, ChevronDown, Link2, MapPin,
  Utensils, Bus, BedDouble, Ticket, ShoppingBag,
} from 'lucide-react';
import { CURRENCY_META, convert, refreshRatesIfStale } from '../services/currency';
import { useConfirm } from '../ConfirmContext';
import Sheet from '../ui/Sheet';
import { useTrip } from '../TripContext';
import Skeleton from './Skeleton';
import Fab from './Fab';
import EmptyState from './EmptyState';
import ListCard from '../ui/ListCard';
import SectionHeader from '../ui/SectionHeader';
import { Pill, CategoryDisc } from '../ui/kit';

const ALL_CURRENCIES = Object.entries(CURRENCY_META).map(([code, meta]) => ({ code, ...meta }));

const DEFAULT_CURRENCIES = ['ILS', 'EUR', 'USD'];

const DEFAULT_EXPENSE_CATEGORIES = [
  'אוכל ושתייה',
  'תחבורה',
  'לינה',
  'בידור ותיירות',
  'קניות',
  'כללי',
];

// An icon and a colour per category, so a row reads at a glance like a
// place in the planning tab. A category the trip added gets the receipt.
const EXPENSE_CATEGORY_STYLE = {
  'אוכל ושתייה': { Icon: Utensils, color: '#F97316' },
  'תחבורה': { Icon: Bus, color: '#3B82F6' },
  'לינה': { Icon: BedDouble, color: '#8B5CF6' },
  'בידור ותיירות': { Icon: Ticket, color: '#EC4899' },
  'קניות': { Icon: ShoppingBag, color: '#14B8A6' },
};
const expenseCategoryStyle = (cat) => EXPENSE_CATEGORY_STYLE[cat] || { Icon: Receipt, color: '#64748B' };

const getCurrencyInfo = (code) => {
  const meta = CURRENCY_META[code];
  return meta ? { code, ...meta } : { code, symbol: code, name: code, flag: '' };
};

function MemberAvatar({ profile, size = 22 }) {
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

export default function ExpensesTab({ tripId }) {
  const [expenses, setExpenses] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [editingId, setEditingId] = useState(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('ILS');
  const [category, setCategory] = useState('כללי');
  const [description, setDescription] = useState('');
  const [linkedPlanId, setLinkedPlanId] = useState('');
  const [customPlace, setCustomPlace] = useState('');

  // Collapsed state per expense category group
  const [collapsedCategories, setCollapsedCategories] = useState({});

  // Inline new-category input in form + categories added this session
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatDraft, setNewCatDraft] = useState('');
  const [sessionCategories, setSessionCategories] = useState([]);

  // Detailed statistics section inside summary
  const [showStats, setShowStats] = useState(false);

  // Currency selector in form
  const [formQuickCurrencies, setFormQuickCurrencies] = useState([...DEFAULT_CURRENCIES]);
  const [showCurrencyList, setShowCurrencyList] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');

  // Planning items dropdown
  const [showPlanDropdown, setShowPlanDropdown] = useState(false);
  const [planFilter, setPlanFilter] = useState('');

  // Exchange rates for ILS conversion
  const [rates, setRates] = useState(null);

  const confirm = useConfirm();
  const { currentUid, currentUserProfile, memberProfiles, tripMembers, formerMembers, canEdit } = useTrip();

  // Payer state
  const [paidBy, setPaidBy] = useState('');
  const [showPayerDropdown, setShowPayerDropdown] = useState(false);

  /* An expense keeps its payer even after that person leaves the trip.
     Their uid drops out of `members`, so `memberProfiles` stops carrying
     them — without the `formerMembers` snapshot the row would show an
     avatar with no name against real money. */
  const getPayerProfile = useCallback((uid) => {
    if (!uid) return null;
    if (uid === currentUid) return currentUserProfile;
    if (memberProfiles?.[uid]) return memberProfiles[uid];
    const gone = formerMembers?.[uid];
    if (gone) return { ...gone, former: true };
    // Left before the snapshot existed: the name is gone, the expense is
    // not. Naming the gap beats an avatar with nothing beside it.
    return { displayName: 'משתתף שעזב', former: true };
  }, [currentUid, currentUserProfile, memberProfiles, formerMembers]);

  const memberUids = useMemo(() => Object.keys(tripMembers), [tripMembers]);
  // Effective payer list: trip members or, for new trips, just the current user
  const payerUids = useMemo(
    () => memberUids.length > 0 ? memberUids : (currentUid ? [currentUid] : []),
    [memberUids, currentUid]
  );

  // Load expenses
  useEffect(() => {
    if (!tripId) return;
    const unsub = onSnapshot(collection(db, 'trips', tripId, 'expenses'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setExpenses(data);
      setLoading(false);
    });
    return () => unsub();
  }, [tripId]);

  useEffect(() => {
    refreshRatesIfStale().then(r => setRates(r.rates)).catch(() => {});
  }, []);

  // Load planning items for linking
  useEffect(() => {
    if (!tripId) return;
    const unsub = onSnapshot(collection(db, 'trips', tripId, 'planning'), snap => {
      setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [tripId]);

  // Derive persistent quick currencies: defaults + ever-used in expenses
  const persistentQuickCurrencies = useMemo(() => {
    const used = [...new Set(expenses.map(e => e.currency))];
    return [...new Set([...DEFAULT_CURRENCIES, ...used])];
  }, [expenses]);

  // What the form held when it opened: closing it unchanged is free.
  const [formBaseline, setFormBaseline] = useState(null);
  const expenseKey = (f) => JSON.stringify([f.amount, f.currency, f.category, f.description, f.linkedPlanId, f.customPlace, f.paidBy]);

  const openForm = (expense = null) => {
    const base = [...new Set([...persistentQuickCurrencies])];
    const f = expense ? {
      amount: String(expense.amount),
      currency: expense.currency,
      category: expense.category || 'כללי',
      description: expense.description || '',
      linkedPlanId: expense.linkedPlanId || '',
      customPlace: expense.customPlace || '',
      paidBy: expense.paidBy || currentUid || '',
    } : {
      amount: '',
      currency: persistentQuickCurrencies[0] || 'ILS',
      category: 'כללי',
      description: '',
      linkedPlanId: '',
      customPlace: '',
      paidBy: currentUid || '',
    };
    if (expense && !base.includes(expense.currency)) base.push(expense.currency);
    setEditingId(expense ? expense.id : null);
    setAmount(f.amount);
    setCurrency(f.currency);
    setCategory(f.category);
    setDescription(f.description);
    setLinkedPlanId(f.linkedPlanId);
    setCustomPlace(f.customPlace);
    setPaidBy(f.paidBy);
    setFormBaseline(expenseKey(f));
    setFormQuickCurrencies(base);
    setShowCurrencyList(false);
    setCurrencySearch('');
    setShowNewCatInput(false);
    setNewCatDraft('');
    setShowPlanDropdown(false);
    setPlanFilter('');
    setShowPayerDropdown(false);
    setShowForm(true);
  };

  const formDirty = () => expenseKey({ amount, currency, category, description, linkedPlanId, customPlace, paidBy }) !== formBaseline;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || !tripId) return;
    const id = editingId || 'exp-' + Date.now();
    const existing = editingId ? expenses.find(x => x.id === editingId) : null;
    const parsedAmount = parseFloat(amount);

    // Snapshot the ILS equivalent at the moment of saving — stored permanently,
    // not recalculated on later rate changes.
    let ilsSnapshot = null;
    if (currency !== 'ILS' && rates) {
      ilsSnapshot = convert(parsedAmount, currency, 'ILS', rates);
    } else if (currency !== 'ILS' && existing?.ilsSnapshot) {
      // Preserve existing snapshot if rates unavailable
      ilsSnapshot = existing.ilsSnapshot;
    }

    // Close the form immediately (fire-and-forget write — offline persistence queues locally)
    setShowForm(false);
    setEditingId(null);

    setDoc(doc(db, 'trips', tripId, 'expenses', id), {
      amount: parsedAmount,
      currency,
      category: category || 'כללי',
      description: description.trim(),
      linkedPlanId: linkedPlanId || null,
      customPlace: customPlace.trim() || null,
      ilsSnapshot: ilsSnapshot,
      paidBy: paidBy || currentUid || null,
      createdAt: existing?.createdAt || new Date().toISOString(),
    }).catch(err => console.error('Expense save error:', err));
  };

  const handleDelete = async (id) => {
    if (!tripId) return;
    const expense = expenses.find(e => e.id === id);
    const ok = await confirm({
      title: 'מחיקת הוצאה',
      message: expense?.description
        ? <span>האם למחוק את <strong>{expense.description}</strong>?</span>
        : 'האם למחוק הוצאה זו?',
      confirmText: 'מחק',
      cancelText: 'בטל',
      danger: true,
    });
    if (!ok) return;
    await deleteDoc(doc(db, 'trips', tripId, 'expenses', id));
  };

  const ilsTotal = useMemo(() => {
    if (!rates) return null;
    return expenses.reduce((sum, e) => sum + convert(e.amount, e.currency, 'ILS', rates), 0);
  }, [expenses, rates]);

  // All categories: defaults + used in expenses + all planning item categories
  const expenseCategories = useMemo(() => Array.from(new Set([
    ...DEFAULT_EXPENSE_CATEGORIES,
    ...expenses.map(e => e.category || 'כללי'),
    ...plans.map(p => p.category).filter(Boolean),
    ...sessionCategories,
  ])), [expenses, plans, sessionCategories]);

  // Expenses grouped by category, only categories with items
  const expensesByCategory = useMemo(() => {
    const groups = {};
    expenses.forEach(e => {
      const cat = e.category || 'כללי';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(e);
    });
    return groups;
  }, [expenses]);

  const toggleCategory = (cat) =>
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  const summary = useMemo(() => {
    const totals = {};
    expenses.forEach(e => {
      totals[e.currency] = (totals[e.currency] || 0) + e.amount;
    });
    return Object.entries(totals).map(([code, total]) => ({
      ...getCurrencyInfo(code), total,
    })).sort((a, b) => b.total - a.total);
  }, [expenses]);

  // Per-payer ILS totals for the summary breakdown
  const summaryByPayer = useMemo(() => {
    if (!rates) return [];
    const totals = {};
    expenses.forEach(e => {
      const uid = e.paidBy || currentUid || 'unknown';
      totals[uid] = (totals[uid] || 0) + convert(e.amount, e.currency, 'ILS', rates);
    });
    return Object.entries(totals)
      .map(([uid, total]) => ({ uid, total, profile: getPayerProfile(uid) }))
      .sort((a, b) => b.total - a.total);
  }, [expenses, rates, currentUid, getPayerProfile]);

  // ── Statistics breakdowns (all in ILS) ──────────────────────────────────
  const statsByCategory = useMemo(() => {
    if (!rates) return [];
    const totals = {};
    expenses.forEach(e => {
      const cat = e.category || 'כללי';
      totals[cat] = (totals[cat] || 0) + convert(e.amount, e.currency, 'ILS', rates);
    });
    const grand = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(totals)
      .map(([cat, total]) => ({ cat, total, pct: Math.round((total / grand) * 100) }))
      .sort((a, b) => b.total - a.total);
  }, [expenses, rates]);

  const topExpenses = useMemo(() => {
    if (!rates) return [];
    return expenses
      .map(e => ({ ...e, ils: convert(e.amount, e.currency, 'ILS', rates) }))
      .sort((a, b) => b.ils - a.ils)
      .slice(0, 3);
  }, [expenses, rates]);

  const dailyAvg = useMemo(() => {
    if (ilsTotal == null || expenses.length === 0) return null;
    // createdAt is written as an ISO string, but a document from an older
    // version (or a hand edit) can hold a number — coerce rather than crash.
    const days = new Set(
      expenses.map(e => String(e.createdAt ?? '').slice(0, 10)).filter(Boolean)
    ).size || 1;
    return { avg: ilsTotal / days, days };
  }, [expenses, ilsTotal]);

  const memberCount = Math.max(memberUids.length, 1);

  // Currencies available to add (not yet in formQuickCurrencies)
  const addableCurrencies = useMemo(
    () => ALL_CURRENCIES.filter(c => !formQuickCurrencies.includes(c.code) &&
      (currencySearch === '' || c.name.includes(currencySearch) || c.code.toLowerCase().includes(currencySearch.toLowerCase()))
    ),
    [formQuickCurrencies, currencySearch]
  );

  const filteredDropdownPlans = planFilter.trim()
    ? plans.filter(p =>
        p.title.toLowerCase().includes(planFilter.toLowerCase()) ||
        (p.category || '').includes(planFilter)
      )
    : plans;

  const linkedPlan = plans.find(p => p.id === linkedPlanId);
  const linkedLabel = linkedPlan?.title || customPlace || '';

  if (loading) {
    return <Skeleton rows={4} label="טוען הוצאות" />;
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>מעקב הוצאות</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {expenses.length > 0 && (
            <button
              type="button"
              className="chip"
              aria-pressed={showSummary}
              onClick={() => setShowSummary(s => !s)}
            >
              <TrendingUp size={14} />
              סיכום
            </button>
          )}
        </div>
      </div>

      {/* Summary panel — condensed: total → per person → per payer → stats */}
      {showSummary && expenses.length > 0 && (
        <div className="glass-card animate-fade" style={{ padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* 1. Grand total in ILS */}
            {ilsTotal !== null ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 14px', background: 'var(--c-green-7)', borderRadius: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-green)' }}>סה"כ בשקלים</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--c-green)' }}>
                  ₪{ilsTotal.toLocaleString('he-IL', { maximumFractionDigits: 0 })}
                </span>
              </div>
            ) : (
              summary.map(({ code, symbol, name, total }) => (
                <div key={code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--p-4)', borderRadius: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{name}</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--accent)' }}>
                    {symbol}{total.toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))
            )}

            {/* 2. Per person */}
            {ilsTotal !== null && memberCount >= 2 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', background: 'var(--c-green-7)', borderRadius: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-green)', opacity: 0.85 }}>לאדם (÷{memberCount})</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-green)', opacity: 0.85 }}>
                  ₪{(ilsTotal / memberCount).toLocaleString('he-IL', { maximumFractionDigits: 0 })}
                </span>
              </div>
            )}

            {/* 3. Per payer */}
            {summaryByPayer.length > 0 && expenses.some(e => e.paidBy) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {summaryByPayer.map(({ uid, total, profile }) => (
                  <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'var(--p-4)', borderRadius: 9 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>
                      ₪{total.toLocaleString('he-IL', { maximumFractionDigits: 0 })}
                    </span>
                    <div
                      className={profile?.former ? 'person-former' : undefined}
                      style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                        {profile?.displayName || profile?.email || uid}
                        {uid === currentUid && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 4 }}>(אני)</span>}
                        {/* Their share still counts — the money was spent. */}
                        {profile?.former && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 4 }}>(כבר לא בטיול)</span>}
                      </span>
                      <MemberAvatar profile={profile} size={20} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 4. Statistics toggle */}
            <button
              type="button"
              onClick={() => setShowStats(s => !s)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 0', borderRadius: 10, border: '1.5px dashed var(--p-30)',
                background: showStats ? 'var(--p-6)' : 'transparent', color: 'var(--accent)',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 2,
              }}
            >
              <TrendingUp size={14} />
              סטטיסטיקות
              <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: showStats ? 'rotate(180deg)' : 'none' }} />
            </button>

            {showStats && (
              <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>

                {/* By category — bar per category */}
                {statsByCategory.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)', margin: 0 }}>לפי קטגוריות</p>
                    {statsByCategory.map(({ cat, total, pct }) => (
                      <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{cat}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                            ₪{total.toLocaleString('he-IL', { maximumFractionDigits: 0 })} · {pct}%
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'var(--ink-6)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Daily average */}
                {dailyAvg && dailyAvg.days > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--p-4)', borderRadius: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>ממוצע ליום ({dailyAvg.days} ימים)</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>
                      ₪{dailyAvg.avg.toLocaleString('he-IL', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                )}

                {/* Top expenses */}
                {topExpenses.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)', margin: 0 }}>ההוצאות הגדולות</p>
                    {topExpenses.map(e => {
                      const linked = plans.find(p => p.id === e.linkedPlanId);
                      const label = e.description || linked?.title || e.customPlace || e.category || 'הוצאה';
                      return (
                        <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'var(--ink-3)', borderRadius: 9, gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'right' }}>{label}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
                            ₪{e.ils.toLocaleString('he-IL', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Original currency totals — only when foreign currencies used */}
                {ilsTotal !== null && summary.some(s => s.code !== 'ILS') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)', margin: 0 }}>לפי מטבע מקורי</p>
                    {summary.map(({ code, symbol, name, total }) => (
                      <div key={code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--ink-3)', borderRadius: 9 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{name}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>
                          {symbol}{total.toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--ink-7)' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>סה"כ רשומות</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>{expenses.length}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expense list — grouped by category */}
      {expenses.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="עוד לא תועדו הוצאות"
          hint="כל הוצאה נשמרת במטבע שבו שילמתם, עם המרה לשקלים ועם מי שילם — כדי שבסוף הטיול יהיה ברור מי חייב למי."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(expensesByCategory).map(([cat, catExpenses]) => {
            const isCollapsed = !!collapsedCategories[cat];
            const catIlsTotal = rates
              ? catExpenses.reduce((s, e) => s + convert(e.amount, e.currency, 'ILS', rates), 0)
              : null;

            return (
              <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Category header */}
                {(() => {
                  const st = expenseCategoryStyle(cat);
                  return (
                    <SectionHeader
                      title={cat}
                      icon={<st.Icon size={15} />}
                      color={st.color}
                      count={catExpenses.length}
                      meta={catIlsTotal !== null ? `₪${catIlsTotal.toLocaleString('he-IL', { maximumFractionDigits: 0 })}` : null}
                      collapsed={isCollapsed}
                      onToggle={() => toggleCategory(cat)}
                    />
                  );
                })()}

                {/* Expense rows */}
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {catExpenses.map(expense => {
                      const curr = getCurrencyInfo(expense.currency);
                      const linked = plans.find(p => p.id === expense.linkedPlanId);
                      const placeLabel = linked?.title || expense.customPlace || null;
                      const style = expenseCategoryStyle(expense.category || cat);
                      const ils = expense.currency !== 'ILS'
                        ? (expense.ilsSnapshot != null
                            ? expense.ilsSnapshot
                            : (rates ? convert(expense.amount, expense.currency, 'ILS', rates) : null))
                        : null;
                      const payer = expense.paidBy ? getPayerProfile(expense.paidBy) : null;
                      const payerName = payer?.displayName || payer?.email || '';
                      return (
                        <ListCard
                          key={expense.id}
                          icon={<CategoryDisc color={style.color} size={42}><style.Icon size={19} /></CategoryDisc>}
                          title={
                            <>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {curr.symbol}{expense.amount.toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                              </span>
                              {ils != null && (
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginInlineStart: 6 }}>
                                  ≈ ₪{ils.toLocaleString('he-IL', { maximumFractionDigits: 0 })}
                                </span>
                              )}
                            </>
                          }
                          menuTitle={expense.description || `${curr.symbol}${expense.amount}`}
                          meta={expense.description || null}
                          tags={[
                            placeLabel && (
                              <Pill key="place" size="sm" tone="lavender" icon={<Link2 size={11} />}>{placeLabel}</Pill>
                            ),
                            payer && (
                              <span key="payer" className={payer.former ? 'person-former' : undefined}
                                title={payer.former ? `${payerName} — כבר לא בטיול` : undefined}>
                                <Pill size="sm" icon={<MemberAvatar profile={payer} size={14} />}>{payerName || 'שילם'}</Pill>
                              </span>
                            ),
                          ]}
                          onOpen={canEdit ? () => openForm(expense) : undefined}
                          actions={canEdit ? [
                            { key: 'edit', label: 'עריכה', Icon: Pencil, run: () => openForm(expense), swipe: true },
                            { key: 'del', label: 'מחיקה', Icon: Trash2, run: () => handleDelete(expense.id), danger: true, swipe: true },
                          ] : []}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Expense Modal */}
      {showForm && (
        <Sheet
          title={editingId ? 'עריכת הוצאה' : 'הוצאה חדשה'}
          onClose={() => setShowForm(false)}
          dirty={formDirty()}
          style={{ maxHeight: '92vh' }}
        >
          {({ cancel }) => (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Amount */}
              <div className="form-group">
                <label>סכום *</label>
                <input
                  type="number" min="0" step="0.01"
                  className="form-control"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                  placeholder="0.00"
                  style={{ fontSize: 20, fontWeight: 700 }}
                />
              </div>

              {/* Currency — inline chips + expandable full list */}
              <div className="form-group">
                <label>מטבע</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {formQuickCurrencies.map(code => {
                    const c = getCurrencyInfo(code);
                    return (
                      <button key={code} type="button" onClick={() => setCurrency(code)}
                        className="chip" aria-pressed={currency === code}>
                        {c.symbol} {code}
                      </button>
                    );
                  })}
                  <button type="button"
                    onClick={() => { setShowCurrencyList(s => !s); setCurrencySearch(''); }}
                    className="chip add">
                    <Plus size={13} /> מטבע
                  </button>
                </div>

                {/* Inline currency list — no nested modal */}
                {showCurrencyList && (
                  <div style={{ marginTop: 8, border: '1px solid var(--ink-8)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--ink-6)', position: 'sticky', top: 0, background: 'var(--surface)' }}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="חפש מטבע..."
                          value={currencySearch}
                          onChange={e => setCurrencySearch(e.target.value)}
                          style={{ minHeight: 36, fontSize: 13, paddingRight: 36 }}
                          autoFocus
                        />
                        <Search size={15} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                      </div>
                    </div>
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {addableCurrencies.length === 0 ? (
                        <p style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                          {currencySearch ? 'לא נמצאו תוצאות' : 'כל המטבעות כבר נוספו'}
                        </p>
                      ) : addableCurrencies.map(c => (
                        <button key={c.code} type="button"
                          onClick={() => {
                            setFormQuickCurrencies(prev => [...prev, c.code]);
                            setCurrency(c.code);
                            setShowCurrencyList(false);
                            setCurrencySearch('');
                          }}
                          style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'right', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--ink-4)' }}
                        >
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)' }}>{c.name}</span>
                          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{c.symbol} {c.code}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Payer picker ──────────────────────────────────────── */}
              {payerUids.length > 0 && (
                <div className="form-group" style={{ position: 'relative' }}>
                  <label>מי שילם</label>
                  <button type="button"
                    onClick={() => payerUids.length > 1 && setShowPayerDropdown(s => !s)}
                    className="custom-dropdown-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={showPayerDropdown}
                    style={{ cursor: payerUids.length > 1 ? 'pointer' : 'default', paddingTop: 8, paddingBottom: 8 }}
                  >
                    <MemberAvatar profile={getPayerProfile(paidBy || currentUid)} size={24} />
                    <span style={{ flex: 1, textAlign: 'right' }}>
                      {getPayerProfile(paidBy || currentUid)?.displayName || getPayerProfile(paidBy || currentUid)?.email || 'אני'}
                      {(paidBy || currentUid) === currentUid && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>(אני)</span>}
                    </span>
                    {payerUids.length > 1 && (
                      <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: showPayerDropdown ? 'rotate(180deg)' : 'none' }} />
                    )}
                  </button>
                  {showPayerDropdown && payerUids.length > 1 && (
                    <div className="custom-dropdown-popup" role="listbox">
                      {payerUids.map(uid => {
                        const profile = getPayerProfile(uid);
                        return (
                          <button key={uid} type="button"
                            onClick={() => { setPaidBy(uid); setShowPayerDropdown(false); }}
                            role="option"
                            aria-selected={uid === (paidBy || currentUid)}
                            className={`custom-dropdown-option${uid === (paidBy || currentUid) ? ' active' : ''}`}
                          >
                            <MemberAvatar profile={profile} size={30} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {profile?.displayName || profile?.email || uid}
                              </div>
                              {uid === currentUid && (
                                <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>אני</div>
                              )}
                            </div>
                            {uid === (paidBy || currentUid) && (
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Section A: link to planning item ─────────────────── */}
              <div style={{
                padding: '14px', borderRadius: 14,
                background: linkedPlanId ? 'var(--p-6)' : 'var(--p-3)',
                border: `1.5px solid ${linkedPlanId ? 'var(--p-22)' : 'var(--p-12)'}`,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Link2 size={13} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>בחירה מרשימת הטיול</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>— קטגוריה תמולא אוטומטית</span>
                </div>

                {linkedPlanId ? (
                  (() => {
                    const linked = plans.find(p => p.id === linkedPlanId);
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--p-8)', borderRadius: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {linked?.title || linkedPlanId}
                          </div>
                          {linked?.category && (
                            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginTop: 2, opacity: 0.75 }}>{linked.category}</div>
                          )}
                        </div>
                        <button type="button" className="btn-x" aria-label="נקה קישור למקום" title="נקה קישור למקום" onClick={() => { setLinkedPlanId(''); setShowPlanDropdown(false); }}>
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })()
                ) : (
                  <>
                    <button type="button"
                      onClick={() => { setShowPlanDropdown(s => !s); setPlanFilter(''); }}
                      className="form-control"
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit', fontSize: 13, color: 'var(--text-muted)', background: 'var(--surface)' }}
                    >
                      <span>{showPlanDropdown ? 'סגור רשימה' : 'בחר מהרשימה...'}</span>
                      <ChevronDown size={15} style={{ flexShrink: 0, transition: 'transform 0.2s', transform: showPlanDropdown ? 'rotate(180deg)' : 'none' }} />
                    </button>

                    {showPlanDropdown && (
                      <div style={{ border: '1px solid var(--ink-8)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--ink-6)', background: 'var(--surface)' }}>
                          <div style={{ position: 'relative' }}>
                            <input type="text" className="form-control"
                              placeholder="חפש אטרקציה, מסעדה..."
                              value={planFilter}
                              onChange={e => setPlanFilter(e.target.value)}
                              style={{ minHeight: 36, fontSize: 13, paddingRight: 36 }}
                            />
                            <Search size={15} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            {planFilter && (
                              <button type="button" className="btn-x" aria-label="נקה חיפוש" title="נקה חיפוש" style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)' }} onClick={() => setPlanFilter('')}>
                                <X size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          {plans.length === 0 ? (
                            <p style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>אין פריטים בתכנון הטיול עדיין</p>
                          ) : filteredDropdownPlans.length === 0 ? (
                            <p style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>לא נמצאו תוצאות</p>
                          ) : filteredDropdownPlans.map(p => (
                            <button key={p.id} type="button"
                              onClick={() => {
                                setLinkedPlanId(p.id);
                                setCategory(p.category || 'כללי'); // auto-fill category
                                setCustomPlace('');
                                setShowPlanDropdown(false);
                                setPlanFilter('');
                              }}
                              style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', textAlign: 'right', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--ink-4)' }}
                            >
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0, background: 'var(--ink-5)', padding: '2px 8px', borderRadius: 20 }}>{p.category}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── OR separator ─────────────────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--ink-8)' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1 }}>— או —</span>
                <div style={{ flex: 1, height: 1, background: 'var(--ink-8)' }} />
              </div>

              {/* ── Section B: manual entry ───────────────────────────── */}
              <div style={{
                padding: '14px', borderRadius: 14,
                background: (description.trim() || customPlace.trim()) ? 'var(--ink-4)' : 'var(--ink-2)',
                border: `1.5px solid ${(description.trim() || customPlace.trim()) ? 'var(--ink-12)' : 'var(--ink-7)'}`,
                display: 'flex', flexDirection: 'column', gap: 12,
                opacity: linkedPlanId ? 0.5 : 1,
                pointerEvents: linkedPlanId ? 'none' : 'auto',
                transition: 'opacity 0.2s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Pencil size={12} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)' }}>הוספה ידנית</span>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 12 }}>תיאור ההוצאה</label>
                  <input type="text" className="form-control"
                    value={description}
                    onChange={e => { setDescription(e.target.value); if (e.target.value.trim()) setLinkedPlanId(''); }}
                    placeholder="למשל: ארוחת ערב, כרטיסי כניסה..."
                    style={{ fontSize: 14 }}
                  />
                </div>

                {/* Category — inline chips (same pattern as currency above) */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>קטגוריה</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {expenseCategories.map(cat => (
                      <button key={cat} type="button" onClick={() => setCategory(cat)}
                        className="chip" aria-pressed={category === cat}>
                        {cat}
                      </button>
                    ))}
                    {showNewCatInput ? (
                      <div style={{ display: 'flex', gap: 6, width: '100%', alignItems: 'center' }}>
                        <input
                          type="text" autoFocus className="form-control"
                          value={newCatDraft}
                          onChange={e => setNewCatDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = newCatDraft.trim();
                              if (val) {
                                setSessionCategories(prev => [...new Set([...prev, val])]);
                                setCategory(val);
                              }
                              setShowNewCatInput(false); setNewCatDraft('');
                            }
                            if (e.key === 'Escape') { setShowNewCatInput(false); setNewCatDraft(''); }
                          }}
                          placeholder="שם קטגוריה חדשה"
                          style={{ flex: 1, minHeight: 38, fontSize: 13 }}
                        />
                        <button type="button"
                          onClick={() => {
                            const val = newCatDraft.trim();
                            if (val) {
                              setSessionCategories(prev => [...new Set([...prev, val])]);
                              setCategory(val);
                            }
                            setShowNewCatInput(false); setNewCatDraft('');
                          }}
                          className="round-btn on" aria-label="הוסף" title="הוסף">
                          <Check size={16} />
                        </button>
                        <button type="button" className="btn-x" aria-label="ביטול" title="ביטול" onClick={() => { setShowNewCatInput(false); setNewCatDraft(''); }}>
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button type="button"
                        onClick={() => { setShowNewCatInput(true); setNewCatDraft(''); }}
                        className="chip add">
                        <Plus size={13} /> קטגוריה
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <MapPin size={11} style={{ color: 'var(--text-muted)' }} />
                    מיקום (אופציונלי)
                  </label>
                  <input type="text" className="form-control"
                    placeholder="שם מקום שלא נמצא ברשימה..."
                    value={customPlace}
                    onChange={e => { setCustomPlace(e.target.value); if (e.target.value.trim()) setLinkedPlanId(''); }}
                    style={{ fontSize: 14 }}
                  />
                </div>
              </div>

              {/* ── Shared notes field ────────────────────────────────── */}
              {linkedPlanId && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 12 }}>הערות (אופציונלי)</label>
                  <input type="text" className="form-control"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="הערות לתשלום זה..."
                    style={{ fontSize: 14 }}
                  />
                </div>
              )}

              <div className="sheet-footer">
                <button type="submit" className="btn-primary">שמור</button>
                <button type="button" onClick={cancel} className="btn-secondary">ביטול</button>
              </div>
            </form>
          )}
        </Sheet>
      )}

      {/* Adding lives in the app-wide floating button, same as every tab. */}
      {canEdit && <Fab label="הוצאה חדשה" onClick={() => openForm()} />}

    </div>
  );
}
