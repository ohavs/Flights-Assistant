import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import { listen } from '../lib/listen';
import { collection, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { changedFields } from '../lib/changes';
import {
  Plus, Trash2, Search, X, Check,
  Wallet, Pencil, ChevronDown, Link2, MapPin,
} from 'lucide-react';
import { CURRENCY_META, convert, refreshRatesIfStale, getInitialRates } from '../services/currency';
import { expenseSummary } from '../lib/expenseSummary';
import { expenseCategoryStyle, getCurrencyInfo, shekels, money, expenseLabel, expenseDay } from './expenseStyle';
import ExpenseSummarySheet, { ExpenseHero, MemberAvatar } from './ExpenseSummary';
import { DEFAULT_CURRENCIES, DEFAULT_EXPENSE_CATEGORIES } from '../lib/expenseDefaults';
import { useConfirm } from '../ConfirmContext';
import Sheet from '../ui/Sheet';
import { useTrip } from '../TripContext';
import Skeleton from './Skeleton';
import Fab from './Fab';
import EmptyState from './EmptyState';
import ListCard from '../ui/ListCard';
import SheetDelete from '../ui/SheetDelete';
import SectionHeader from '../ui/SectionHeader';
import { Pill, CategoryDisc } from '../ui/kit';

const ALL_CURRENCIES = Object.entries(CURRENCY_META).map(([code, meta]) => ({ code, ...meta }));


export default function ExpensesTab({ tripId }) {
  const [expenses, setExpenses] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);   // the full summary sheet
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

  // Currency selector in form
  const [formQuickCurrencies, setFormQuickCurrencies] = useState([...DEFAULT_CURRENCIES]);
  const [showCurrencyList, setShowCurrencyList] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');

  // Planning items dropdown
  const [showPlanDropdown, setShowPlanDropdown] = useState(false);
  const [planFilter, setPlanFilter] = useState('');

  // Exchange rates for ILS conversion
  // The last rates fetched (cached) at once, or none: a save before the
  // fetch finishes still snapshots the amount in shekels.
  const [rates, setRates] = useState(() => {
    const r = getInitialRates();
    return r.fetchedAt ? r.rates : null;
  });

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
    // Still on the trip, the profile not read yet (offline, loading).
    if (tripMembers?.[uid]) return { displayName: 'משתתף' };
    // Left before the snapshot existed: the name is gone, the expense is
    // not. Naming the gap beats an avatar with nothing beside it.
    return { displayName: 'משתתף שעזב', former: true };
  }, [currentUid, currentUserProfile, memberProfiles, formerMembers, tripMembers]);

  const memberUids = useMemo(() => Object.keys(tripMembers), [tripMembers]);
  // Effective payer list: trip members or, for new trips, just the current user
  const payerUids = useMemo(
    () => memberUids.length > 0 ? memberUids : (currentUid ? [currentUid] : []),
    [memberUids, currentUid]
  );

  // Load expenses
  useEffect(() => {
    if (!tripId) return;
    const unsub = listen(collection(db, 'trips', tripId, 'expenses'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setExpenses(data);
      setLoading(false);
    }, () => setLoading(false));   // refused for good: the empty list, not a skeleton forever
    return () => unsub();
  }, [tripId]);

  useEffect(() => {
    refreshRatesIfStale().then(r => setRates(r.rates)).catch(() => {});
  }, []);

  // Load planning items for linking
  useEffect(() => {
    if (!tripId) return;
    const unsub = listen(collection(db, 'trips', tripId, 'planning'), snap => {
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
  const [openedWith, setOpenedWith] = useState(null);   // the form's values when it opened
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
    setOpenedWith(f);
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
    } else if (currency !== 'ILS' && existing?.ilsSnapshot != null
      && existing.currency === currency && Number(existing.amount) === parsedAmount) {
      // No rates: keep the snapshot, but only of the same amount. A changed
      // one has none, and the list converts it live once the rates arrive.
      ilsSnapshot = existing.ilsSnapshot;
    }

    // Close the form immediately (fire-and-forget write — offline persistence queues locally)
    setShowForm(false);
    setEditingId(null);

    const fieldsOf = (f) => ({
      amount: parseFloat(f.amount),
      currency: f.currency,
      category: f.category || 'כללי',
      description: f.description.trim(),
      linkedPlanId: f.linkedPlanId || null,
      customPlace: f.customPlace.trim() || null,
      paidBy: f.paidBy || currentUid || null,
    });
    const fields = fieldsOf({ amount, currency, category, description, linkedPlanId, customPlace, paidBy });
    const ref = doc(db, 'trips', tripId, 'expenses', id);
    // A new expense; an edit of one a partner deleted meanwhile stays deleted
    // (its update fails), rather than coming back.
    if (!editingId) {
      setDoc(ref, { ...fields, ilsSnapshot, createdAt: new Date().toISOString() })
        .catch(err => console.error('Expense save error:', err));
      return;
    }
    // An edit writes only what it changed (src/lib/changes.js).
    const updates = changedFields(openedWith ? fieldsOf(openedWith) : {}, fields);
    if ('amount' in updates || 'currency' in updates) updates.ilsSnapshot = ilsSnapshot;
    if (Object.keys(updates).length) {
      updateDoc(ref, updates).catch(err => console.error('Expense save error:', err));
    }
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
    if (!ok) return false;
    // Not awaited: offline the write waits for the network, and the sheet
    // (SheetDelete) closes now, or its Save would write the expense back.
    deleteDoc(doc(db, 'trips', tripId, 'expenses', id)).catch(err => console.error('Delete expense failed:', err));
    return true;
  };

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

  // The total, per person, per day, by category and currency, who paid
  // and who owes whom (src/lib/expenseSummary.js).
  const summary = useMemo(
    () => expenseSummary(expenses, { rates, members: memberUids, currentUid }),
    [expenses, rates, memberUids, currentUid]
  );

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

  if (loading) {
    return <Skeleton rows={4} label="טוען הוצאות" />;
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* The total, big, over the list; a tap opens the full summary. */}
      {expenses.length > 0 && (
        <ExpenseHero summary={summary} currentUid={currentUid} onOpen={() => setShowSummary(true)} />
      )}
      {showSummary && (
        <ExpenseSummarySheet
          summary={summary}
          expenses={expenses}
          plans={plans}
          currentUid={currentUid}
          getPayerProfile={getPayerProfile}
          onClose={() => setShowSummary(false)}
        />
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
                      meta={catIlsTotal !== null ? shekels(catIlsTotal) : null}
                      collapsed={isCollapsed}
                      onToggle={() => toggleCategory(cat)}
                    />
                  );
                })()}

                {/* Expense rows */}
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {catExpenses.map(expense => {
                      const linked = plans.find(p => p.id === expense.linkedPlanId);
                      const placeLabel = linked?.title || expense.customPlace || null;
                      const label = expenseLabel(expense, plans);
                      const day = expenseDay(expense.createdAt);
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
                          title={label}
                          menuTitle={expense.description || money(expense.amount, expense.currency)}
                          meta={day}
                          tags={[
                            placeLabel && placeLabel !== label && (
                              <Pill key="place" size="sm" tone="lavender" icon={<Link2 size={11} />}>{placeLabel}</Pill>
                            ),
                            payer && (
                              <span key="payer" className={payer.former ? 'person-former' : undefined}
                                title={payer.former ? `${payerName} — כבר לא בטיול` : undefined}>
                                <Pill size="sm" icon={<MemberAvatar profile={payer} size={14} />}>{payerName || 'שילם'}</Pill>
                              </span>
                            ),
                          ]}
                          trailing={
                            <span className="expense-amount">
                              <span className="expense-amount-main">{money(expense.amount, expense.currency)}</span>
                              {ils != null && <span className="expense-amount-ils">≈ {shekels(ils)}</span>}
                            </span>
                          }
                          onOpen={canEdit ? () => openForm(expense) : undefined}
                          actions={canEdit ? [
                            { key: 'edit', label: 'עריכה', Icon: Pencil, run: () => openForm(expense) },
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
          {({ cancel, close }) => (
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
                    className="form-control picker-field custom-dropdown-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={showPayerDropdown}
                    style={{ cursor: payerUids.length > 1 ? 'pointer' : 'default' }}
                  >
                    <MemberAvatar profile={getPayerProfile(paidBy || currentUid)} size={24} />
                    <span style={{ flex: 1, textAlign: 'right' }}>
                      {getPayerProfile(paidBy || currentUid)?.displayName || getPayerProfile(paidBy || currentUid)?.email || 'אני'}
                      {(paidBy || currentUid) === currentUid && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>(אני)</span>}
                    </span>
                    {payerUids.length > 1 && (
                      <span className="picker-field-chev" aria-hidden="true"><ChevronDown size={16} strokeWidth={2.6} /></span>
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
                      className="form-control picker-field custom-dropdown-trigger"
                      aria-expanded={showPlanDropdown}
                    >
                      <span className="picker-field-text is-empty">{showPlanDropdown ? 'סגור רשימה' : 'בחר מהרשימה...'}</span>
                      <span className="picker-field-chev" aria-hidden="true"><ChevronDown size={16} strokeWidth={2.6} /></span>
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
                {editingId && <SheetDelete close={close} onDelete={() => handleDelete(editingId)} />}
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
