import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  Plus, Trash2, Search, X, TrendingUp,
  Wallet, Receipt, Pencil, ChevronDown, Link2, MapPin
} from 'lucide-react';
import { CURRENCY_META, convert, refreshRatesIfStale } from '../services/currency';
import { useConfirm } from '../ConfirmContext';
import { CustomDropdown } from './CustomDatePicker';

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

const getCurrencyInfo = (code) => {
  const meta = CURRENCY_META[code];
  return meta ? { code, ...meta } : { code, symbol: code, name: code, flag: '' };
};

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

  const openForm = (expense = null) => {
    const base = [...new Set([...persistentQuickCurrencies])];
    if (expense) {
      setEditingId(expense.id);
      setAmount(String(expense.amount));
      setCurrency(expense.currency);
      setCategory(expense.category || 'כללי');
      setDescription(expense.description || '');
      setLinkedPlanId(expense.linkedPlanId || '');
      setCustomPlace(expense.customPlace || '');
      if (!base.includes(expense.currency)) base.push(expense.currency);
    } else {
      setEditingId(null);
      setAmount('');
      setCurrency(persistentQuickCurrencies[0] || 'ILS');
      setCategory('כללי');
      setDescription('');
      setLinkedPlanId('');
      setCustomPlace('');
    }
    setFormQuickCurrencies(base);
    setShowCurrencyList(false);
    setCurrencySearch('');
    setShowPlanDropdown(false);
    setPlanFilter('');
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
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

    await setDoc(doc(db, 'trips', tripId, 'expenses', id), {
      amount: parsedAmount,
      currency,
      category: category || 'כללי',
      description: description.trim(),
      linkedPlanId: linkedPlanId || null,
      customPlace: customPlace.trim() || null,
      ilsSnapshot: ilsSnapshot,
      createdAt: existing?.createdAt || new Date().toISOString(),
    });
    setShowForm(false);
    setEditingId(null);
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
  ])), [expenses, plans]);

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
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
        <div className="pulsing-dot" style={{ width: 12, height: 12 }} />
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>מעקב הוצאות</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {expenses.length > 0 && (
            <button
              onClick={() => setShowSummary(s => !s)}
              style={{
                padding: '8px 14px', borderRadius: 20, border: 'none',
                background: showSummary ? 'var(--accent)' : 'rgba(79,70,229,0.08)',
                color: showSummary ? '#fff' : 'var(--accent)',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              <TrendingUp size={14} />
              סיכום
            </button>
          )}
          <button onClick={() => openForm()} className="btn-primary" style={{ padding: '8px 16px', fontSize: 13, gap: 6 }}>
            <Plus size={16} />
            הוצאה חדשה
          </button>
        </div>
      </div>

      {/* Summary panel */}
      {showSummary && summary.length > 0 && (
        <div className="glass-card animate-fade" style={{ padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', marginBottom: 10 }}>סיכום לפי מטבע</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {summary.map(({ code, symbol, name, total }) => (
              <div key={code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(79,70,229,0.04)', borderRadius: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{name}</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--accent)' }}>
                  {symbol}{total.toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                </span>
              </div>
            ))}
            {ilsTotal !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 12px', background: 'rgba(22,163,74,0.07)', borderRadius: 10, marginTop: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'rgb(22,163,74)' }}>סה"כ מוערך בשקלים</span>
                <span style={{ fontSize: 17, fontWeight: 900, color: 'rgb(22,163,74)' }}>
                  ₪{ilsTotal.toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {ilsTotal !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'rgba(22,163,74,0.04)', borderRadius: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgb(22,163,74)', opacity: 0.85 }}>לאדם (÷2)</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'rgb(22,163,74)', opacity: 0.85 }}>
                  ₪{(ilsTotal / 2).toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginTop: 4, borderTop: '1px solid rgba(11,11,48,0.07)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>סה"כ רשומות</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)' }}>{expenses.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Expense list — grouped by category */}
      {expenses.length === 0 ? (
        <div className="glass-card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Wallet size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>אין עדיין הוצאות מתועדות</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>לחץ על "הוצאה חדשה" כדי להתחיל לעקוב</p>
        </div>
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
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', background: 'transparent', border: 'none',
                    padding: '2px 4px', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <ChevronDown
                    size={15}
                    style={{
                      color: 'var(--text-muted)', flexShrink: 0,
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', flex: 1, textAlign: 'right' }}>
                    {cat}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>
                    {catIlsTotal !== null
                      ? `₪${catIlsTotal.toLocaleString('he-IL', { maximumFractionDigits: 0 })} · ${catExpenses.length}`
                      : catExpenses.length}
                  </span>
                </button>

                {/* Expense rows */}
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {catExpenses.map(expense => {
                      const curr = getCurrencyInfo(expense.currency);
                      const linked = plans.find(p => p.id === expense.linkedPlanId);
                      const placeLabel = linked?.title || expense.customPlace || null;
                      return (
                        <div key={expense.id} className="glass-card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          {/* Icon badge */}
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(79,70,229,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Receipt size={15} style={{ color: 'var(--accent)' }} />
                          </div>

                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--primary)' }}>
                                {curr.symbol}{expense.amount.toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                                {expense.currency !== 'ILS' ? curr.name : 'ש"ח'}
                              </span>
                              {expense.currency !== 'ILS' && expense.ilsSnapshot != null && (
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', opacity: 0.75 }}>
                                  ≈ ₪{expense.ilsSnapshot.toLocaleString('he-IL', { maximumFractionDigits: 0 })}
                                </span>
                              )}
                            </div>
                            {expense.description ? (
                              <div style={{ fontSize: 12, color: '#334155', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {expense.description}
                              </div>
                            ) : null}
                            {placeLabel ? (
                              <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Link2 size={9} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{placeLabel}</span>
                              </div>
                            ) : null}
                          </div>

                          {/* Action buttons — LEFT side in RTL */}
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button onClick={() => openForm(expense)} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(11,11,48,0.04)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => handleDelete(expense.id)} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(239,68,68,0.06)', color: 'rgb(239,68,68)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
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
      {showForm && createPortal(
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h2>{editingId ? 'עריכת הוצאה' : 'הוצאה חדשה'}</h2>
              <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 4 }}>

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
                        style={{
                          padding: '6px 14px', borderRadius: 20, border: 'none',
                          background: currency === code ? 'var(--accent)' : 'rgba(11,11,48,0.06)',
                          color: currency === code ? '#fff' : 'var(--primary)',
                          fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        }}>
                        {c.symbol} {code}
                      </button>
                    );
                  })}
                  <button type="button"
                    onClick={() => { setShowCurrencyList(s => !s); setCurrencySearch(''); }}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontFamily: 'inherit',
                      border: '1.5px dashed rgba(79,70,229,0.3)', background: 'transparent',
                      color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4
                    }}>
                    <Plus size={13} /> מטבע
                  </button>
                </div>

                {/* Inline currency list — no nested modal */}
                {showCurrencyList && (
                  <div style={{ marginTop: 8, border: '1px solid rgba(11,11,48,0.08)', borderRadius: 14, overflow: 'hidden', background: '#fff', boxShadow: '0 4px 20px rgba(11,11,48,0.1)' }}>
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(11,11,48,0.06)', position: 'sticky', top: 0, background: '#fff' }}>
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
                          style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'right', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(11,11,48,0.04)' }}
                        >
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)' }}>{c.name}</span>
                          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{c.symbol} {c.code}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Section A: link to planning item ─────────────────── */}
              <div style={{
                padding: '14px', borderRadius: 14,
                background: linkedPlanId ? 'rgba(79,70,229,0.06)' : 'rgba(79,70,229,0.03)',
                border: `1.5px solid ${linkedPlanId ? 'rgba(79,70,229,0.22)' : 'rgba(79,70,229,0.12)'}`,
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(79,70,229,0.08)', borderRadius: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {linked?.title || linkedPlanId}
                          </div>
                          {linked?.category && (
                            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginTop: 2, opacity: 0.75 }}>{linked.category}</div>
                          )}
                        </div>
                        <button type="button"
                          onClick={() => { setLinkedPlanId(''); setShowPlanDropdown(false); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2, flexShrink: 0 }}>
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })()
                ) : (
                  <>
                    <button type="button"
                      onClick={() => { setShowPlanDropdown(s => !s); setPlanFilter(''); }}
                      className="form-control"
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit', fontSize: 13, color: 'var(--text-muted)', background: '#fff' }}
                    >
                      <span>{showPlanDropdown ? 'סגור רשימה' : 'בחר מהרשימה...'}</span>
                      <ChevronDown size={15} style={{ flexShrink: 0, transition: 'transform 0.2s', transform: showPlanDropdown ? 'rotate(180deg)' : 'none' }} />
                    </button>

                    {showPlanDropdown && (
                      <div style={{ border: '1px solid rgba(11,11,48,0.08)', borderRadius: 14, overflow: 'hidden', background: '#fff', boxShadow: '0 4px 20px rgba(11,11,48,0.1)' }}>
                        <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(11,11,48,0.06)', background: '#fff' }}>
                          <div style={{ position: 'relative' }}>
                            <input type="text" className="form-control"
                              placeholder="חפש אטרקציה, מסעדה..."
                              value={planFilter}
                              onChange={e => setPlanFilter(e.target.value)}
                              style={{ minHeight: 36, fontSize: 13, paddingRight: 36 }}
                            />
                            <Search size={15} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            {planFilter && (
                              <button type="button" onClick={() => setPlanFilter('')}
                                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                                <X size={13} />
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
                              style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', textAlign: 'right', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(11,11,48,0.04)' }}
                            >
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0, background: 'rgba(11,11,48,0.05)', padding: '2px 8px', borderRadius: 20 }}>{p.category}</span>
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
                <div style={{ flex: 1, height: 1, background: 'rgba(11,11,48,0.08)' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1 }}>— או —</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(11,11,48,0.08)' }} />
              </div>

              {/* ── Section B: manual entry ───────────────────────────── */}
              <div style={{
                padding: '14px', borderRadius: 14,
                background: (description.trim() || customPlace.trim()) ? 'rgba(11,11,48,0.04)' : 'rgba(11,11,48,0.02)',
                border: `1.5px solid ${(description.trim() || customPlace.trim()) ? 'rgba(11,11,48,0.12)' : 'rgba(11,11,48,0.07)'}`,
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

                <CustomDropdown
                  label="קטגוריה"
                  value={category}
                  onChange={setCategory}
                  options={expenseCategories}
                  addable
                  addLabel="הוסף קטגוריה חדשה"
                />

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

              <div style={{ display: 'flex', gap: 12, paddingBottom: 20, flexShrink: 0 }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>שמור הוצאה</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ביטול</button>
              </div>
            </form>
          </div>
        </div>,
        document.querySelector('.app-container') || document.body
      )}

    </div>
  );
}
