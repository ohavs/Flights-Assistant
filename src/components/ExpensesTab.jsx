import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import { listen } from '../lib/listen';
import { collection, doc, setDoc, updateDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { changedFields } from '../lib/changes';
import {
  Plus, Trash2, Search, X, Check,
  Wallet, Pencil, ChevronDown, ChevronLeft, MapPin, Users, Link2, ArrowLeftRight,
} from 'lucide-react';
import { CURRENCY_META, convert, refreshRatesIfStale, getInitialRates } from '../services/currency';
import { expenseSummary, paidExpenses, splitGroup, GUEST } from '../lib/expenseSummary';
import { expenseCategoryStyle, getCurrencyInfo, shekels, money, expenseLabel, expenseDay } from './expenseStyle';
import ExpenseSummarySheet, { ExpenseHero, MemberAvatar } from './ExpenseSummary';
import { DEFAULT_CURRENCIES, DEFAULT_EXPENSE_CATEGORIES } from '../lib/expenseDefaults';
import { tripCurrencies, destinationCurrency } from '../lib/destinationCurrency';
import { useConfirm } from '../ConfirmContext';
import Sheet, { Segmented } from '../ui/Sheet';
import { CustomDropdown } from './CustomDatePicker';
import PlacePicker from './PlacePicker';
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

  // Categories added this session
  const [sessionCategories, setSessionCategories] = useState([]);

  // The form's own pickers, each over the form: the currency (with the
  // trip's own on top), the split, a place from the plan (at the top of the
  // form, the owner's ask; a place not on the list is a line under it).
  const [formQuickCurrencies, setFormQuickCurrencies] = useState([...DEFAULT_CURRENCIES]);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [splitOpen, setSplitOpen] = useState(false);
  const [placePickOpen, setPlacePickOpen] = useState(false);
  // "מקום שלא ברשימה": the typed place, shown when asked for or when set.
  const [otherPlace, setOtherPlace] = useState(false);

  // Exchange rates for ILS conversion
  // The last rates fetched (cached) at once, or none: a save before the
  // fetch finishes still snapshots the amount in shekels.
  const [rates, setRates] = useState(() => {
    const r = getInitialRates();
    return r.fetchedAt ? r.rates : null;
  });

  const confirm = useConfirm();
  // "הוספה" adds expenses, and changes only the ones they added.
  const { currentUid, currentUserProfile, memberProfiles, tripMembers, formerMembers, canAdd, canEdit, mayChange, trip } = useTrip();

  // Payer state
  const [paidBy, setPaidBy] = useState('');

  // Split: who shares it with the payer (uids, or GUEST + a name), and
  // whether the payer is in it ("רק הם" when not). Nothing chosen: no one
  // owes anyone for it.
  const [splitWith, setSplitWith] = useState([]);
  const [splitSelf, setSplitSelf] = useState(true);
  const [showNewName, setShowNewName] = useState(false);
  const [newNameDraft, setNewNameDraft] = useState('');
  const [sessionNames, setSessionNames] = useState([]);

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

  // Someone named on a split, not on the trip: their name is all there is.
  const personProfile = useCallback(
    (id) => (id?.startsWith(GUEST) ? { displayName: id.slice(GUEST.length), guest: true } : getPayerProfile(id)),
    [getPayerProfile]
  );

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

  // The trip's currencies: by its destination (Budapest: shekels, euros,
  // forints), those it saved (`expenseCurrencies`, a currency added in the
  // form), any added on this phone, then any its expenses used.
  const savedKey = `expenseCurrencies_${tripId}`;
  const [phoneCurrencies, setPhoneCurrencies] = useState(() => {
    try { return JSON.parse(localStorage.getItem(savedKey)) || []; } catch { return []; }
  });
  const persistentQuickCurrencies = useMemo(() => {
    const used = expenses.map(e => e.currency).filter(Boolean);
    return [...new Set([...tripCurrencies(trip, DEFAULT_CURRENCIES), ...phoneCurrencies, ...used])];
  }, [expenses, trip, phoneCurrencies]);
  // A new expense starts in the destination's money, else the latest one's.
  const startCurrency = destinationCurrency(trip)
    || [...expenses].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0]?.currency
    || persistentQuickCurrencies[0] || 'ILS';
  // A currency added in the form is kept for the trip: on the trip for
  // everyone (an editor may write it), else on this phone.
  const keepCurrency = (code) => {
    if (persistentQuickCurrencies.includes(code)) return;
    if (canEdit && tripId) {
      updateDoc(doc(db, 'trips', tripId), { expenseCurrencies: arrayUnion(code) })
        .catch(err => console.error('Save currency failed:', err));
    } else {
      setPhoneCurrencies(prev => {
        const next = [...new Set([...prev, code])];
        try { localStorage.setItem(savedKey, JSON.stringify(next)); } catch { /* private mode */ }
        return next;
      });
    }
  };

  // What the form held when it opened: closing it unchanged is free.
  const [formBaseline, setFormBaseline] = useState(null);
  const [openedWith, setOpenedWith] = useState(null);   // the form's values when it opened
  const expenseKey = (f) => JSON.stringify([f.amount, f.currency, f.category, f.description, f.linkedPlanId, f.customPlace, f.paidBy, f.splitWith, f.splitSelf]);

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
      splitWith: expense.splitWith || [],
      splitSelf: expense.splitSelf !== false,
    } : {
      amount: '',
      currency: startCurrency,
      category: 'כללי',
      description: '',
      linkedPlanId: '',
      customPlace: '',
      paidBy: currentUid || '',
      splitWith: [],
      splitSelf: true,
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
    setSplitWith(f.splitWith);
    setSplitSelf(f.splitSelf);
    setShowNewName(false);
    setNewNameDraft('');
    setFormBaseline(expenseKey(f));
    setOpenedWith(f);
    setFormQuickCurrencies(base);
    setCurrencyOpen(false);
    setCurrencySearch('');
    setSplitOpen(false);
    setPlacePickOpen(false);
    setOtherPlace(!!f.customPlace);
    setShowForm(true);
  };

  const formDirty = () => expenseKey({ amount, currency, category, description, linkedPlanId, customPlace, paidBy, splitWith, splitSelf }) !== formBaseline;

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
      splitWith: (f.splitWith || []).filter(id => id !== (f.paidBy || currentUid)),
      splitSelf: f.splitSelf !== false,
    });
    const fields = fieldsOf({ amount, currency, category, description, linkedPlanId, customPlace, paidBy, splitWith, splitSelf });
    const ref = doc(db, 'trips', tripId, 'expenses', id);
    // A new expense; an edit of one a partner deleted meanwhile stays deleted
    // (its update fails), rather than coming back.
    if (!editingId) {
      setDoc(ref, { ...fields, ilsSnapshot, createdAt: new Date().toISOString(), createdBy: currentUid || null })
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

  // Names of people not on the trip, from the splits so far: once used, a
  // name is there to pick again.
  const guestNames = useMemo(() => [...new Set([
    ...expenses.flatMap(e => (e.splitWith || []).filter(id => id.startsWith(GUEST))),
    ...sessionNames,
  ])], [expenses, sessionNames]);

  const toggleSplit = (id) => setSplitWith(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const addGuest = () => {
    const name = newNameDraft.trim();
    if (!name) return;
    const id = GUEST + name;
    setSessionNames(prev => (prev.includes(id) ? prev : [...prev, id]));
    setSplitWith(prev => (prev.includes(id) ? prev : [...prev, id]));
    setNewNameDraft('');
    setShowNewName(false);
  };

  // The total, by category and currency, who paid and who owes whom; and
  // the same for what the looker paid ("שלי"), only while the summary is
  // open (src/lib/expenseSummary.js).
  const summary = useMemo(
    () => expenseSummary(expenses, { rates, members: memberUids, currentUid }),
    [expenses, rates, memberUids, currentUid]
  );
  const paidSummary = useMemo(
    () => (showSummary && currentUid
      ? expenseSummary(paidExpenses(expenses, currentUid, { members: memberUids }), { rates, members: memberUids, currentUid })
      : null),
    [showSummary, expenses, rates, memberUids, currentUid]
  );

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
          paid={paidSummary}
          currentUid={currentUid}
          getPayerProfile={personProfile}
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
                      const group = splitGroup(expense, expense.paidBy || (payerUids.length === 1 ? payerUids[0] : null));
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
                            group.length > 0 && (
                              <Pill key="split" size="sm" tone="sky" icon={<Users size={11} />}
                                title={group.map(id => personProfile(id)?.displayName || '').join(', ')}>
                                {`מתחלק ל־${group.length}`}
                              </Pill>
                            ),
                          ]}
                          trailing={
                            <span className="expense-amount">
                              <span className="expense-amount-main">{money(expense.amount, expense.currency)}</span>
                              {ils != null && <span className="expense-amount-ils">≈ {shekels(ils)}</span>}
                            </span>
                          }
                          onOpen={mayChange(expense) ? () => openForm(expense) : undefined}
                          actions={mayChange(expense) ? [
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

              {/* How much, and in what: one field, the currency at its end */}
              <div className="exp-amount">
                <label htmlFor="exp-amount" className="exp-amount-label">סכום *</label>
                <div className="exp-amount-field">
                  <input
                    id="exp-amount"
                    type="number" min="0" step="0.01" inputMode="decimal"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                    placeholder="0.00"
                  />
                  <button type="button" className="exp-currency" onClick={() => setCurrencyOpen(true)}
                    aria-haspopup="dialog" aria-label={`מטבע: ${getCurrencyInfo(currency).name}`}>
                    <span className="exp-currency-symbol">{getCurrencyInfo(currency).symbol}</span>
                    <span className="exp-currency-code">{currency}</span>
                    <ChevronDown size={15} strokeWidth={2.6} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Where: a place from the plan (it brings the category), or
                  one that is not on the list. */}
              <div className="act-form-block">
                <span className="act-form-label">מקום מהתכנון</span>
                {linkedPlanId ? (
                  (() => {
                    const linked = plans.find(p => p.id === linkedPlanId);
                    return (
                      <div className="act-place">
                        <span className="dp-disc lavender"><MapPin size={18} /></span>
                        <div className="act-place-text">
                          <span className="act-place-title">{linked?.title || 'מקום מהתכנון'}</span>
                          {linked?.category && <span className="act-place-sub">{linked.category}</span>}
                        </div>
                        <button type="button" className="round-btn" aria-label="החלפת מקום" title="החלפת מקום" onClick={() => setPlacePickOpen(true)}>
                          <ArrowLeftRight size={16} />
                        </button>
                        <button type="button" className="btn-x" aria-label="נקה קישור למקום" title="נקה קישור למקום" onClick={() => setLinkedPlanId('')}>
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })()
                ) : (<>
                  {plans.length > 0 && (
                    <button type="button" className="act-pick" onClick={() => setPlacePickOpen(true)}>
                      <Search size={17} aria-hidden="true" />
                      <span>חיפוש מקום ברשימה</span>
                    </button>
                  )}
                  {otherPlace || !plans.length ? (
                    <input type="text" className="form-control"
                      aria-label="מיקום"
                      placeholder={plans.length ? 'מקום שלא ברשימה...' : 'מקום (לא חובה)'}
                      value={customPlace}
                      onChange={e => setCustomPlace(e.target.value)}
                    />
                  ) : (
                    <button type="button" className="exp-other-place" onClick={() => setOtherPlace(true)}>
                      מקום שלא ברשימה?
                    </button>
                  )}
                </>)}
              </div>

              {/* What for */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{linkedPlanId ? 'הערה (לא חובה)' : 'על מה'}</label>
                <input type="text" className="form-control"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="למשל: ארוחת ערב, כרטיסי כניסה..."
                />
              </div>

              {/* Category, and who paid */}
              <div className={payerUids.length > 1 ? 'row-2' : ''} style={{ gap: 10 }}>
                <CustomDropdown
                  label="קטגוריה"
                  value={category}
                  onChange={setCategory}
                  options={expenseCategories.map(cat => {
                    const st = expenseCategoryStyle(cat);
                    return { value: cat, label: cat, icon: <st.Icon size={16} style={{ color: st.color }} /> };
                  })}
                  addable
                  addLabel="קטגוריה חדשה"
                  onCommit={(val) => setSessionCategories(prev => [...new Set([...prev, val])])}
                />
                {payerUids.length > 1 && (
                  <CustomDropdown
                    label="שילם/ה"
                    value={paidBy || currentUid}
                    onChange={(uid) => { setPaidBy(uid); setSplitWith(prev => prev.filter(id => id !== uid)); }}
                    options={payerUids.map(uid => {
                      const prof = getPayerProfile(uid);
                      return {
                        value: uid,
                        label: uid === currentUid ? 'אני' : (prof?.displayName || prof?.email || 'משתתף'),
                        icon: <MemberAvatar profile={prof} size={22} />,
                      };
                    })}
                  />
                )}
              </div>

              {/* Split: one line; the choice opens over the form. Who owes
                  whom comes only from here (the owner's ask). */}
              {(() => {
                const payer = paidBy || currentUid;
                const chosen = splitWith.filter(id => id !== payer);
                const n = chosen.length + (splitSelf ? 1 : 0);
                const each = chosen.length && parseFloat(amount) > 0 ? parseFloat(amount) / n : null;
                const names = chosen.map(id => personProfile(id)?.displayName || personProfile(id)?.email || '').filter(Boolean);
                const payerName = payer === currentUid ? 'אני' : (personProfile(payer)?.displayName || 'המשלם');
                return (
                  <button type="button" className="exp-split" onClick={() => setSplitOpen(true)} aria-haspopup="dialog">
                    <span className="exp-split-icon" aria-hidden="true"><Users size={17} /></span>
                    <span className="exp-split-text">
                      <span className="exp-split-label">חלוקה</span>
                      <span className="exp-split-value">
                        {chosen.length
                          ? `${names.join(', ')}${splitSelf ? ` + ${payerName}` : ''}`
                          : 'בלי חלוקה, אף אחד לא חייב'}
                      </span>
                    </span>
                    {chosen.length > 0 && (
                      <span className="exp-split-each">
                        {each != null ? `${money(each, currency)} כל אחד` : `${n} אנשים`}
                      </span>
                    )}
                    <ChevronLeft size={16} className="exp-split-chev" aria-hidden="true" />
                  </button>
                );
              })()}

              <div className="sheet-footer">
                <button type="submit" className="btn-primary">שמור</button>
                <button type="button" onClick={cancel} className="btn-secondary">ביטול</button>
                {editingId && <SheetDelete close={close} onDelete={() => handleDelete(editingId)} />}
              </div>
            </form>
          )}
        </Sheet>
      )}

      {/* The currency: the trip's own on top, every other under them. */}
      {showForm && currencyOpen && (
        <Sheet
          label="מטבע"
          onClose={() => setCurrencyOpen(false)}
          style={{ maxHeight: '80vh' }}
          header={({ close }) => (
            <div className="modal-header origin-picker-head">
              <div className="origin-picker-title">
                <h2>מטבע</h2>
                <button type="button" aria-label="סגור" className="btn-close" onClick={close}>✕</button>
              </div>
              <div className="origin-picker-search">
                <Search size={18} aria-hidden="true" />
                <input type="search" enterKeyHint="search" className="form-control" placeholder="חיפוש מטבע"
                  aria-label="חיפוש מטבע" value={currencySearch} onChange={(e) => setCurrencySearch(e.target.value)} />
              </div>
            </div>
          )}
        >
          {({ close }) => {
            const q = currencySearch.trim().toLowerCase();
            const match = (c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
            const quick = formQuickCurrencies.map(getCurrencyInfo).filter(match);
            const rest = ALL_CURRENCIES.filter(c => !formQuickCurrencies.includes(c.code)).filter(match);
            const row = (c) => (
              <button key={c.code} type="button" role="radio" aria-checked={currency === c.code} className="list-row"
                onClick={() => {
                  setCurrency(c.code);
                  if (!formQuickCurrencies.includes(c.code)) setFormQuickCurrencies(prev => [...prev, c.code]);
                  keepCurrency(c.code);
                  close();
                }}>
                <span className="exp-cur-symbol" aria-hidden="true">{c.symbol}</span>
                <span className="list-row-label">{c.name}<span className="list-row-hint">{c.code}</span></span>
                {currency === c.code && <Check size={16} aria-hidden="true" />}
              </button>
            );
            return (
              <div className="place-picker">
                {quick.length > 0 && (
                  <section className="origin-picker-group">
                    <SectionHeader title="בטיול הזה" />
                    <div className="list-group" role="radiogroup" aria-label="בטיול הזה">{quick.map(row)}</div>
                  </section>
                )}
                {rest.length > 0 && (
                  <section className="origin-picker-group">
                    <SectionHeader title="כל המטבעות" />
                    <div className="list-group" role="radiogroup" aria-label="כל המטבעות">{rest.map(row)}</div>
                  </section>
                )}
                {!quick.length && !rest.length && <div className="place-picker-empty">לא נמצא מטבע</div>}
              </div>
            );
          }}
        </Sheet>
      )}

      {/* The split: who shares it with the payer. */}
      {showForm && splitOpen && (() => {
        const payer = paidBy || currentUid;
        const people = [...payerUids.filter(uid => uid !== payer), ...guestNames];
        const chosen = splitWith.filter(id => id !== payer);
        const n = chosen.length + (splitSelf ? 1 : 0);
        const each = chosen.length && parseFloat(amount) > 0 ? parseFloat(amount) / n : null;
        const payerName = payer === currentUid ? 'אותי' : (personProfile(payer)?.displayName || 'המשלם');
        return (
          <Sheet title="חלוקה" onClose={() => setSplitOpen(false)}>
            {({ close }) => (
              <div className="exp-split-sheet">
                <p className="dp-sheet-note" style={{ marginTop: 0 }}>עם מי מתחלקים בהוצאה. בלי חלוקה, אף אחד לא חייב עליה.</p>
                <div className="list-group" role="group" aria-label="עם מי מתחלקים">
                  {people.map(id => {
                    const prof = personProfile(id);
                    const on = chosen.includes(id);
                    return (
                      <button key={id} type="button" role="checkbox" aria-checked={on}
                        className={`list-row place-pick-row${on ? ' on' : ''}`} onClick={() => toggleSplit(id)}>
                        <MemberAvatar profile={prof} size={26} />
                        <span className="list-row-label">
                          {prof?.displayName || prof?.email || ''}
                          {prof?.guest && <span className="list-row-hint">לא בטיול</span>}
                        </span>
                        <span className={`place-pick-tick${on ? ' on' : ''}`} aria-hidden="true">{on && <Check size={14} strokeWidth={3} />}</span>
                      </button>
                    );
                  })}
                  {showNewName ? (
                    <div className="list-row exp-new-name">
                      <input
                        type="text" autoFocus className="form-control"
                        value={newNameDraft}
                        onChange={e => setNewNameDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); addGuest(); }
                          if (e.key === 'Escape') { setShowNewName(false); setNewNameDraft(''); }
                        }}
                        placeholder="שם של מי שלא בטיול"
                      />
                      <button type="button" onClick={addGuest} className="round-btn on" aria-label="הוסף שם" title="הוסף שם">
                        <Check size={16} />
                      </button>
                      <button type="button" className="btn-x" aria-label="ביטול" title="ביטול" onClick={() => { setShowNewName(false); setNewNameDraft(''); }}>
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="list-row" onClick={() => { setShowNewName(true); setNewNameDraft(''); }}>
                      <Plus size={16} className="list-row-icon" />
                      <span className="list-row-label">שם של מי שלא בטיול</span>
                    </button>
                  )}
                </div>
                {chosen.length > 0 && (
                  <Segmented label="מי בחלוקה" value={splitSelf ? 'all' : 'them'} onChange={(k) => setSplitSelf(k === 'all')}
                    options={[{ key: 'all', label: `כולל ${payerName}` }, { key: 'them', label: 'רק הם' }]} />
                )}
                <p className="exp-split-sum">
                  {chosen.length
                    ? <>{n === 1 ? 'אדם אחד' : `${n} אנשים`}{each != null && <> · <b>{money(each, currency)}</b> כל אחד</>}</>
                    : 'בלי חלוקה'}
                </p>
                <div className="sheet-footer">
                  <button type="button" className="btn-primary" onClick={close}>סיום</button>
                </div>
              </div>
            )}
          </Sheet>
        );
      })()}

      {showForm && placePickOpen && (
        <PlacePicker
          places={plans}
          value={linkedPlanId}
          title="מקום מהתכנון"
          hintOf={(p) => p.category}
          onPick={(id) => {
            const p = plans.find(x => x.id === id);
            setLinkedPlanId(id);
            if (p?.category) setCategory(p.category);
            setCustomPlace('');
          }}
          onClose={() => setPlacePickOpen(false)}
        />
      )}

      {/* Adding lives in the app-wide floating button, same as every tab. */}
      {canAdd && <Fab label="הוצאה חדשה" onClick={() => openForm()} />}

    </div>
  );
}
