import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import {
  Plus, Trash2, Search, Check, X, TrendingUp,
  Wallet, Receipt, Pencil, ChevronDown, Link2, ArrowLeft
} from 'lucide-react';

const ALL_CURRENCIES = [
  { code: 'ILS', symbol: '₪', name: 'שקל ישראלי' },
  { code: 'EUR', symbol: '€', name: 'יורו' },
  { code: 'USD', symbol: '$', name: 'דולר אמריקאי' },
  { code: 'GBP', symbol: '£', name: 'פאונד בריטי' },
  { code: 'CZK', symbol: 'Kč', name: "קורונה צ'כית" },
  { code: 'HUF', symbol: 'Ft', name: 'פורינט הונגרי' },
  { code: 'PLN', symbol: 'zł', name: 'זלוטי פולני' },
  { code: 'CHF', symbol: 'CHF', name: 'פרנק שוויצרי' },
  { code: 'SEK', symbol: 'kr', name: 'קרונה שוודית' },
  { code: 'NOK', symbol: 'kr', name: 'קרונה נורווגית' },
  { code: 'DKK', symbol: 'kr', name: 'קרונה דנית' },
  { code: 'JPY', symbol: '¥', name: 'ין יפני' },
  { code: 'AUD', symbol: 'A$', name: 'דולר אוסטרלי' },
  { code: 'CAD', symbol: 'C$', name: 'דולר קנדי' },
  { code: 'TRY', symbol: '₺', name: 'לירה טורקית' },
  { code: 'THB', symbol: '฿', name: 'באט תאילנדי' },
  { code: 'SGD', symbol: 'S$', name: 'דולר סינגפורי' },
  { code: 'MXN', symbol: '$', name: 'פסו מקסיקני' },
  { code: 'BRL', symbol: 'R$', name: 'ריאל ברזילאי' },
  { code: 'CNY', symbol: '¥', name: 'יואן סיני' },
  { code: 'RON', symbol: 'lei', name: 'לאו רומני' },
  { code: 'HRK', symbol: '€', name: 'יורו (קרואטיה)' },
  { code: 'ZAR', symbol: 'R', name: 'רנד דרום אפריקאי' },
];

const DEFAULT_CURRENCIES = ['ILS', 'EUR', 'USD'];

const getCurrencyInfo = (code) =>
  ALL_CURRENCIES.find(c => c.code === code) || { code, symbol: code, name: code };

export default function ExpensesTab({ tripId }) {
  const [expenses, setExpenses] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showAddCurrencyModal, setShowAddCurrencyModal] = useState(false);

  // Form state
  const [editingId, setEditingId] = useState(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('ILS');
  const [description, setDescription] = useState('');
  const [linkedPlanId, setLinkedPlanId] = useState('');
  const [planSearch, setPlanSearch] = useState('');

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

  // Load planning items for linking
  useEffect(() => {
    if (!tripId) return;
    const unsub = onSnapshot(collection(db, 'trips', tripId, 'planning'), snap => {
      setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [tripId]);

  // Derive quick-select currencies: defaults + any currency used in expenses
  const quickCurrencies = useMemo(() => {
    const used = [...new Set(expenses.map(e => e.currency))];
    const merged = [...new Set([...DEFAULT_CURRENCIES, ...used])];
    return merged;
  }, [expenses]);

  // Currencies not yet in quick-select (for the "add" modal)
  const addableCurrencies = useMemo(
    () => ALL_CURRENCIES.filter(c => !quickCurrencies.includes(c.code)),
    [quickCurrencies]
  );

  const openForm = (expense = null) => {
    if (expense) {
      setEditingId(expense.id);
      setAmount(String(expense.amount));
      setCurrency(expense.currency);
      setDescription(expense.description || '');
      setLinkedPlanId(expense.linkedPlanId || '');
    } else {
      setEditingId(null);
      setAmount('');
      setCurrency(expenses[0]?.currency || 'ILS');
      setDescription('');
      setLinkedPlanId('');
    }
    setPlanSearch('');
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !tripId) return;
    const id = editingId || 'exp-' + Date.now();
    const existing = editingId ? expenses.find(x => x.id === editingId) : null;
    await setDoc(doc(db, 'trips', tripId, 'expenses', id), {
      amount: parseFloat(amount),
      currency,
      description: description.trim(),
      linkedPlanId: linkedPlanId || null,
      createdAt: existing?.createdAt || new Date().toISOString(),
    });
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!tripId || !window.confirm('למחוק הוצאה זו?')) return;
    await deleteDoc(doc(db, 'trips', tripId, 'expenses', id));
  };

  // Summary: total per currency
  const summary = useMemo(() => {
    const totals = {};
    expenses.forEach(e => {
      totals[e.currency] = (totals[e.currency] || 0) + e.amount;
    });
    return Object.entries(totals).map(([code, total]) => ({
      ...getCurrencyInfo(code),
      total,
    })).sort((a, b) => b.total - a.total);
  }, [expenses]);

  const filteredPlans = planSearch.trim()
    ? plans.filter(p => p.title.toLowerCase().includes(planSearch.toLowerCase()) || p.category?.includes(planSearch))
    : plans;

  const linkedPlan = plans.find(p => p.id === linkedPlanId);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
        <div className="pulsing-dot" style={{ width: 12, height: 12 }} />
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header row */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginTop: 4, borderTop: '1px solid rgba(11,11,48,0.07)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>סה"כ רשומות</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)' }}>{expenses.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Expense list */}
      {expenses.length === 0 ? (
        <div className="glass-card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Wallet size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>אין עדיין הוצאות מתועדות</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>לחץ על "הוצאה חדשה" כדי להתחיל לעקוב</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {expenses.map(expense => {
            const curr = getCurrencyInfo(expense.currency);
            const linked = plans.find(p => p.id === expense.linkedPlanId);
            return (
              <div key={expense.id} className="glass-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(79,70,229,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Receipt size={18} style={{ color: 'var(--accent)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--primary)' }}>
                    {curr.symbol}{expense.amount.toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginRight: 6 }}>{expense.currency}</span>
                  </div>
                  {expense.description ? (
                    <div style={{ fontSize: 13, color: '#334155', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {expense.description}
                    </div>
                  ) : null}
                  {linked ? (
                    <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Link2 size={10} />
                      {linked.title}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => openForm(expense)} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(11,11,48,0.04)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleDelete(expense.id)} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(239,68,68,0.06)', color: 'rgb(239,68,68)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Expense Modal */}
      {showForm && createPortal(
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'עריכת הוצאה' : 'הוצאה חדשה'}</h2>
              <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
            </div>

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

              {/* Currency quick-select */}
              <div className="form-group">
                <label>מטבע</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {quickCurrencies.map(code => {
                    const c = getCurrencyInfo(code);
                    return (
                      <button key={code} type="button" onClick={() => setCurrency(code)}
                        style={{
                          padding: '6px 14px', borderRadius: 20, border: 'none',
                          background: currency === code ? 'var(--accent)' : 'rgba(11,11,48,0.06)',
                          color: currency === code ? '#fff' : 'var(--primary)',
                          fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4
                        }}>
                        {c.symbol} {code}
                      </button>
                    );
                  })}
                  <button type="button"
                    onClick={() => setShowAddCurrencyModal(true)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontFamily: 'inherit',
                      border: '1.5px dashed rgba(79,70,229,0.3)', background: 'transparent',
                      color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer'
                    }}>
                    + הוסף מטבע
                  </button>
                </div>
              </div>

              {/* Description */}
              <div className="form-group">
                <label>תיאור</label>
                <input type="text" className="form-control" value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="למשל: ארוחת ערב, כרטיסי כניסה, תחבורה..." />
              </div>

              {/* Link to plan item */}
              <div className="form-group">
                <label>קישור לאטרקציה / מסעדה (אופציונלי)</label>
                {linkedPlan ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(79,70,229,0.06)', borderRadius: 10, marginBottom: 8 }}>
                    <Link2 size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--accent)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {linkedPlan.title}
                    </span>
                    <button type="button" onClick={() => setLinkedPlanId('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
                <div style={{ position: 'relative' }}>
                  <input type="text" className="form-control"
                    placeholder="חפש מתוך רשימת האטרקציות..."
                    value={planSearch}
                    onChange={e => setPlanSearch(e.target.value)}
                    style={{ paddingRight: 40 }}
                  />
                  <Search size={16} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  {planSearch && (
                    <button type="button" onClick={() => setPlanSearch('')}
                      style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                {planSearch && (
                  <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 4px 20px rgba(11,11,48,0.12)', border: '1px solid rgba(11,11,48,0.06)', marginTop: 4, maxHeight: 180, overflowY: 'auto' }}>
                    {filteredPlans.length === 0 ? (
                      <p style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>לא נמצאו תוצאות</p>
                    ) : filteredPlans.map(p => (
                      <button key={p.id} type="button"
                        onClick={() => { setLinkedPlanId(p.id); setPlanSearch(''); }}
                        style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'right', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--primary)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(11,11,48,0.04)' }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{p.category}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  ניתן להוסיף הוצאה גם ללא קישור לפריט בתכנון
                </p>
              </div>

              <div style={{ display: 'flex', gap: 12, paddingBottom: 20 }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>שמור הוצאה</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ביטול</button>
              </div>
            </form>
          </div>
        </div>,
        document.querySelector('.app-container') || document.body
      )}

      {/* Add Currency Modal */}
      {showAddCurrencyModal && createPortal(
        <div className="modal-overlay" onClick={() => setShowAddCurrencyModal(false)}>
          <div className="modal-content" style={{ height: 'auto', maxHeight: '75vh' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>בחר מטבע להוסיף</h2>
              <button className="btn-close" onClick={() => setShowAddCurrencyModal(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 20 }}>
              {addableCurrencies.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>כל המטבעות כבר נוספו</p>
              ) : addableCurrencies.map(c => (
                <button key={c.code} type="button"
                  onClick={() => { setCurrency(c.code); setShowAddCurrencyModal(false); }}
                  style={{ padding: '12px 16px', border: '1px solid rgba(11,11,48,0.08)', borderRadius: 12, background: '#fff', textAlign: 'right', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>{c.name}</span>
                  <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{c.symbol} {c.code}</span>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.querySelector('.app-container') || document.body
      )}

    </div>
  );
}
