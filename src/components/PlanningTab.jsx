import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  writeBatch 
} from 'firebase/firestore';
import {
  Search,
  Plus,
  Trash2,
  MapPin,
  ExternalLink,
  DollarSign,
  Compass,
  UtensilsCrossed,
  Train,
  Info,
  CheckCircle2,
  Pencil,
  ArrowUp,
  ArrowDown,
  Calendar,
  ChevronDown,
  Link2,
  X
} from 'lucide-react';

export const defaultGironaPlans = [
  {
    id: 'plan-1',
    title: 'העיר העתיקה של ז\'ירונה (Barri Vell)',
    category: 'אטרקציות ודברים לעשות',
    description: 'שיטוט בסמטאות הציוריות, ביקור בקתדרלת ז\'ירונה המרהיבה ובחומות העיר המציעות תצפית פנורמית (לוקיישן מרכזי ממשחקי הכס).',
    address: 'Barri Vell, Girona',
    rating: 5,
    price: 'חינם',
    visited: false
  },
  {
    id: 'plan-2',
    title: 'מסעדת El Celler de Can Roca',
    category: 'מסעדות ומקומות אכילה',
    description: 'מסעדת עילית עם 3 כוכבי מישלן, שנבחרה מספר פעמים למסעדה הטובה בעולם. חוויה קולינרית בלתי נשכחת (חובה להזמין מקום חודשים מראש).',
    address: 'Carrer de Can Sunyer, 48, Girona',
    rating: 5,
    price: 'יקר מאוד',
    visited: false
  },
  {
    id: 'plan-3',
    title: 'הבתים הצבעוניים על נהר האוניאר (Onyar)',
    category: 'מקומות לבקר',
    description: 'אחד מסימני ההיכר של ז\'ירונה. מומלץ לעמוד על גשר אייפל (שתוכנן ע"י גוסטב אייפל) לצילום מושלם של הבתים הצבעוניים המשתקפים במים.',
    address: 'Pont de les Peixateries Velles, Girona',
    rating: 4.8,
    price: 'חינם',
    visited: false
  },
  {
    id: 'plan-4',
    title: 'רכבת מהירה מברצלונה (AVE / Avant)',
    category: 'תחבורה ציבורית',
    description: 'הדרך הנוחה ביותר להגיע ממרכז ברצלונה (תחנת Sants) לז\'ירונה. נסיעה של 38 דקות בלבד ברכבת ממוזגת ומהירה.',
    address: 'Girona Train Station',
    rating: 4.7,
    price: '15-25 €',
    visited: false
  },
  {
    id: 'plan-5',
    title: 'רכישת כרטיס סים מקומי בשדה התעופה',
    category: 'מידע כללי וטיפים',
    description: 'ניתן לרכוש כרטיס e-SIM מראש או לקנות סים פיזי של חברות כמו Vodafone או Orange בשדה התעופה או במרכז העיר לגלישה נוחה.',
    address: 'Girona Airport (GRO)',
    rating: 4.5,
    price: '10-20 €',
    visited: false
  }
];

export const defaultPraguePlans = [
  {
    id: 'plan-1',
    title: 'גשר קארל (Charles Bridge)',
    category: 'אטרקציות ודברים לעשות',
    description: 'הגשר ההיסטורי המפורסם ביותר בפראג, המחבר בין העיר העתיקה לרובע מאלה סטרנה. מומלץ לבקר מוקדם בבוקר או בשקיעה לצילומים מרהיבים ללא המוני תיירים.',
    address: 'Karlův most, 110 00 Praha 1',
    rating: 4.9,
    price: 'חינם',
    visited: false
  },
  {
    id: 'plan-2',
    title: 'מצודת פראג (Prague Castle)',
    category: 'מקומות לבקר',
    description: 'מתחם המצודות העתיק הגדול בעולם. כולל את קתדרלת ויטוס הקדוש המרשימה, סמטת הזהב וארמון המלוכה הישן. כדאי להקדיש למקום לפחות חצי יום.',
    address: 'Hradčany, 119 08 Prague 1',
    rating: 4.8,
    price: '250 CZK',
    visited: false
  },
  {
    id: 'plan-3',
    title: 'השעון האסטרונומי בכיכר העיר העתיקה (Astronomical Clock)',
    category: 'אטרקציות ודברים לעשות',
    description: 'שעון ימי-ביניימי מפורסם המציג מופע של דמויות השליחים בכל שעה עגולה. מומלץ לעלות גם לראש מגדל בית העירייה לתצפית פנורמית על פראג.',
    address: 'Staroměstské nám. 1, 110 00 Josefov',
    rating: 4.7,
    price: 'חינם',
    visited: false
  },
  {
    id: 'plan-4',
    title: 'בית הקפה קפה סאבוי (Café Savoy)',
    category: 'מסעדות ומקומות אכילה',
    description: 'בית קפה ומסעדה היסטורית בעיצוב ניאו-רנסנסי מרהיב. מומלץ במיוחד לארוחות בוקר עשירות או לשטרודל תפוחים מסורתי לצד קפה משובח.',
    address: 'Vítězná 124/5, Malá Strana, 150 00 Praha',
    rating: 4.6,
    price: '150-400 CZK',
    visited: false
  },
  {
    id: 'plan-5',
    title: 'רכישת כרטיס נסיעה יומי בתחבורה ציבורית',
    category: 'תחבורה ציבורית',
    description: 'החשמליות והמטרו בפראג יעילים וזולים במיוחד. מומלץ לקנות כרטיס ל-24 שעות או 72 שעות המאפשר נסיעה חופשית בכל אמצעי התחבורה.',
    address: 'Prague Metro Stations',
    rating: 4.8,
    price: '120 CZK',
    visited: false
  }
];

export default function PlanningTab({ tripId }) {
  const [plans, setPlans] = useState([]);
  const [days, setDays] = useState([]);
  const [subTab, setSubTab] = useState('pool'); // 'pool' | 'daily'
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('הכל');
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form states for pool items
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('אטרקציות ודברים לעשות');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [price, setPrice] = useState('');
  const [links, setLinks] = useState([]); // [{ label, url }]
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  // Expanded plan cards (default: collapsed)
  const [expandedPlanIds, setExpandedPlanIds] = useState({});

  // Form states for daily activities
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState('');
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [placeId, setPlaceId] = useState('');
  const [activityTitle, setActivityTitle] = useState('');
  const [activityTimeLabel, setActivityTimeLabel] = useState('');
  const [activityAddress, setActivityAddress] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [activityCategory, setActivityCategory] = useState('אטרקציות ודברים לעשות');

  // Day Title Editing states
  const [editingDayId, setEditingDayId] = useState(null);
  const [editingDayTitle, setEditingDayTitle] = useState('');

  const categories = [
    'אטרקציות ודברים לעשות',
    'מסעדות ומקומות אכילה',
    'מקומות לבקר',
    'תחבורה ציבורית',
    'מידע כללי וטיפים'
  ];

  // Listen to Firestore planning items (pool)
  useEffect(() => {
    if (!tripId) return;
    const unsubscribe = onSnapshot(collection(db, 'trips', tripId, 'planning'), (snapshot) => {
      const fetchedPlans = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPlans(fetchedPlans);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tripId]);

  // Listen to Firestore daily planner days
  useEffect(() => {
    if (!tripId) return;
    const unsubscribe = onSnapshot(collection(db, 'trips', tripId, 'days'), (snapshot) => {
      const fetchedDays = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort days by order ascending
      fetchedDays.sort((a, b) => (a.order || 0) - (b.order || 0));
      setDays(fetchedDays);
    });

    return () => unsubscribe();
  }, [tripId]);

  /* ══════════════════════════════════════════════════════════
     PLACES POOL (OLD PLANNING) OPERATIONS
     ══════════════════════════════════════════════════════════ */
  const handleOpenAdd = () => {
    setEditingId(null);
    setTitle('');
    setCategory('אטרקציות ודברים לעשות');
    setDescription('');
    setAddress('');
    setPrice('');
    setLinks([]);
    setNewLinkLabel('');
    setNewLinkUrl('');
    setShowAddForm(true);
  };

  const handleStartEdit = (plan) => {
    setEditingId(plan.id);
    setTitle(plan.title);
    setCategory(plan.category);
    setDescription(plan.description || '');
    setAddress(plan.address || '');
    setPrice(plan.price || '');
    setLinks(Array.isArray(plan.links) ? plan.links : []);
    setNewLinkLabel('');
    setNewLinkUrl('');
    setShowAddForm(true);
  };

  const handleAddLinkRow = () => {
    const url = newLinkUrl.trim();
    if (!url) return;
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    setLinks(prev => [...prev, { label: newLinkLabel.trim() || normalized, url: normalized }]);
    setNewLinkLabel('');
    setNewLinkUrl('');
  };

  const handleRemoveLinkRow = (idx) => {
    setLinks(prev => prev.filter((_, i) => i !== idx));
  };

  const togglePlanExpanded = (id) => {
    setExpandedPlanIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleVisited = async (plan) => {
    if (!tripId) return;
    const docRef = doc(db, 'trips', tripId, 'planning', plan.id);
    await updateDoc(docRef, {
      visited: !plan.visited
    });
  };

  const handleDelete = async (id) => {
    if (!tripId) return;
    if (window.confirm('האם למחוק פריט תכנון זה?')) {
      const docRef = doc(db, 'trips', tripId, 'planning', id);
      await deleteDoc(docRef);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !tripId) return;

    if (editingId) {
      const docRef = doc(db, 'trips', tripId, 'planning', editingId);
      await updateDoc(docRef, {
        title: title.trim(),
        category,
        description: description.trim(),
        address: address.trim(),
        price: price.trim() || 'חינם',
        links: links
      });
    } else {
      const id = 'plan-' + Date.now();
      const docRef = doc(db, 'trips', tripId, 'planning', id);
      await setDoc(docRef, {
        title: title.trim(),
        category,
        description: description.trim(),
        address: address.trim(),
        price: price.trim() || 'חינם',
        links: links,
        visited: false
      });
    }

    // Reset Form
    setTitle('');
    setDescription('');
    setAddress('');
    setPrice('');
    setLinks([]);
    setEditingId(null);
    setShowAddForm(false);
  };

  // Helper to resolve category icons
  const getCategoryIcon = (cat) => {
    switch (cat) {
      case 'אטרקציות ודברים לעשות':
        return <Compass size={18} />;
      case 'מסעדות ומקומות אכילה':
        return <UtensilsCrossed size={18} />;
      case 'תחבורה ציבורית':
        return <Train size={18} />;
      case 'מידע כללי וטיפים':
        return <Info size={18} />;
      default:
        return <MapPin size={18} />;
    }
  };

  // Filter plans
  const filteredPlans = plans.filter(plan => {
    const matchesCategory = selectedFilter === 'הכל' || plan.category === selectedFilter;
    const matchesSearch = plan.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          plan.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          plan.address.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  /* ══════════════════════════════════════════════════════════
     DAILY PLANNER OPERATIONS
     ══════════════════════════════════════════════════════════ */
  const handleAddDay = async () => {
    if (!tripId) return;
    const nextDayNum = days.length + 1;
    const dayId = 'day-' + Date.now();
    const docRef = doc(db, 'trips', tripId, 'days', dayId);
    
    await setDoc(docRef, {
      title: `יום ${nextDayNum}`,
      order: nextDayNum,
      activities: []
    });
  };

  const handleSaveDayTitle = async (dayId, newTitle) => {
    if (!tripId || !newTitle.trim()) return;
    const docRef = doc(db, 'trips', tripId, 'days', dayId);
    await updateDoc(docRef, { title: newTitle.trim() });
    setEditingDayId(null);
  };

  const handleDeleteDay = async (dayId) => {
    if (!tripId) return;
    if (window.confirm('האם למחוק את יום הטיול וכל הפעילויות שבו?')) {
      const docRef = doc(db, 'trips', tripId, 'days', dayId);
      await deleteDoc(docRef);
    }
  };

  const handleOpenAddActivity = (dayId) => {
    setSelectedDayId(dayId);
    setEditingActivityId(null);
    setPlaceId('');
    setActivityTitle('');
    setActivityTimeLabel('');
    setActivityAddress('');
    setActivityDescription('');
    setActivityCategory('אטרקציות ודברים לעשות');
    setShowActivityForm(true);
  };

  const handleStartEditActivity = (dayId, act) => {
    setSelectedDayId(dayId);
    setEditingActivityId(act.id);
    setPlaceId(act.placeId || '');
    setActivityTitle(act.title);
    setActivityTimeLabel(act.timeLabel || '');
    setActivityAddress(act.address || '');
    setActivityDescription(act.description || '');
    setActivityCategory(act.category || 'אטרקציות ודברים לעשות');
    setShowActivityForm(true);
  };

  const handleDeleteActivity = async (dayId, activityId) => {
    if (!tripId) return;
    if (!window.confirm('האם למחוק פעילות זו?')) return;

    const day = days.find(d => d.id === dayId);
    if (!day) return;

    const updatedActivities = day.activities.filter(act => act.id !== activityId);
    const docRef = doc(db, 'trips', tripId, 'days', dayId);
    await updateDoc(docRef, { activities: updatedActivities });
  };

  const moveActivity = async (dayId, activityId, direction) => {
    if (!tripId) return;
    const day = days.find(d => d.id === dayId);
    if (!day) return;

    const list = [...(day.activities || [])];
    const idx = list.findIndex(act => act.id === activityId);
    if (idx === -1) return;

    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    // Swap elements
    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;

    const docRef = doc(db, 'trips', tripId, 'days', dayId);
    await updateDoc(docRef, { activities: list });
  };

  const handleActivitySubmit = async (e) => {
    e.preventDefault();
    if (!activityTitle.trim() || !tripId || !selectedDayId) return;

    const day = days.find(d => d.id === selectedDayId);
    if (!day) return;

    const activityObj = {
      id: editingActivityId || 'act-' + Date.now(),
      title: activityTitle.trim(),
      timeLabel: activityTimeLabel.trim(),
      placeId: placeId || null,
      address: activityAddress.trim(),
      description: activityDescription.trim(),
      category: activityCategory
    };

    let updatedActivities = [...(day.activities || [])];
    if (editingActivityId) {
      updatedActivities = updatedActivities.map(act => 
        act.id === editingActivityId ? activityObj : act
      );
    } else {
      updatedActivities.push(activityObj);
    }

    try {
      const docRef = doc(db, 'trips', tripId, 'days', selectedDayId);
      await updateDoc(docRef, { activities: updatedActivities });
      setShowActivityForm(false);
      setEditingActivityId(null);
    } catch (err) {
      console.error('Error saving activity:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: '100%', padding: '40px 0' }}>
        <div className="pulsing-dot" style={{ width: '12px', height: '12px' }}></div>
        <span style={{ marginRight: '10px', color: 'var(--text-muted)', fontSize: '15px' }}>טוען תוכניות טיול...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      
      {/* Sub-tab Selector */}
      <div style={{ 
        display: 'flex', 
        background: 'rgba(11, 11, 48, 0.05)', 
        borderRadius: 'var(--radius-md)', 
        padding: 4, 
        gap: 4 
      }}>
        <button
          onClick={() => setSubTab('pool')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            border: 'none',
            borderRadius: 'calc(var(--radius-md) - 2px)',
            padding: '10px 0',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
            background: subTab === 'pool' ? '#fff' : 'transparent',
            color: subTab === 'pool' ? 'var(--primary)' : 'var(--text-muted)',
            boxShadow: subTab === 'pool' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <Compass size={16} />
          <span>אטרקציות ומקומות</span>
        </button>
        <button
          onClick={() => setSubTab('daily')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            border: 'none',
            borderRadius: 'calc(var(--radius-md) - 2px)',
            padding: '10px 0',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
            background: subTab === 'daily' ? '#fff' : 'transparent',
            color: subTab === 'daily' ? 'var(--primary)' : 'var(--text-muted)',
            boxShadow: subTab === 'daily' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <Calendar size={16} />
          <span>לוח זמנים יומי</span>
        </button>
      </div>

      {/* Render sub-tab content */}
      {subTab === 'pool' ? (
        <>
          {/* Search and Toggle Form */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="form-control"
                placeholder="חיפוש אטרקציות, מסעדות..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingRight: '40px' }}
              />
              <Search size={18} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>

            <button
              onClick={handleOpenAdd}
              className="btn-add-circle"
              aria-label="הוסף יעד חדש"
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Add/Edit Plan Slide-Up Modal */}
          {showAddForm && (
            <div className="modal-overlay" onClick={() => { setShowAddForm(false); setEditingId(null); }}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                
                <div className="modal-header">
                  <h2>{editingId ? 'עריכת פריט תכנון' : 'הוספת יעד / אטרקציה חדשה'}</h2>
                  <button className="btn-close" onClick={() => { setShowAddForm(false); setEditingId(null); }}>✕</button>
                </div>

                <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  <div className="form-group">
                    <label>שם המקום/הפעילות *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={title} 
                      onChange={(e) => setTitle(e.target.value)} 
                      required 
                      placeholder="למשל: תצפית שקיעה בגבעה"
                    />
                  </div>

                  <div className="form-group">
                    <label>קטגוריה</label>
                    <select className="category-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                      {categories.map((cat, idx) => (
                        <option key={idx} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>עלות/תקציב</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="למשל: 10 €, חינם"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>כתובת / מיקום</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="כתובת או קישור למפה"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>

                  {/* Free-form links */}
                  <div className="form-group">
                    <label>קישורים נוספים</label>
                    {links.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                        {links.map((link, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(79,70,229,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(79,70,229,0.12)' }}>
                            <Link2 size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.label}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="ltr">{link.url}</div>
                            </div>
                            <button type="button" onClick={() => handleRemoveLinkRow(idx)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.7)', padding: 4, display: 'flex' }}>
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="row-2" style={{ gap: 8 }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="שם הקישור (אופציונלי)"
                        value={newLinkLabel}
                        onChange={(e) => setNewLinkLabel(e.target.value)}
                      />
                      <input
                        type="url"
                        className="form-control"
                        placeholder="https://..."
                        value={newLinkUrl}
                        onChange={(e) => setNewLinkUrl(e.target.value)}
                        dir="ltr"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddLinkRow}
                      className="btn-secondary"
                      style={{ marginTop: 8, width: '100%', minHeight: 40, fontSize: 13, padding: '8px' }}
                    >
                      <Plus size={14} />
                      <span>הוסף קישור</span>
                    </button>
                  </div>

                  <div className="form-group">
                    <label>הערות / מידע חשוב</label>
                    <textarea
                      className="form-control"
                      rows="4"
                      placeholder="פרטים נוספים, שעות פתיחה, טיפים..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      style={{ resize: 'none', fontFamily: 'inherit' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px', paddingBottom: '20px' }}>
                    <button type="submit" className="btn-primary" style={{ flex: 1 }}>שמור שינויים</button>
                    <button type="button" onClick={() => { setShowAddForm(false); setEditingId(null); }} className="btn-secondary">ביטול</button>
                  </div>

                </form>
              </div>
            </div>
          )}

          {/* Category Horizontal Filter Chips — sticky, larger touch targets */}
          <div
            className="horizontal-scroll filter-chips-row"
            style={{
              marginRight: '-10px',
              marginLeft: '-10px',
              paddingRight: '10px',
              paddingLeft: '10px',
              paddingTop: '8px',
              paddingBottom: '10px',
              position: 'sticky',
              top: 0,
              zIndex: 5,
              gap: 10,
              background: 'linear-gradient(180deg, rgba(245,243,255,0.98) 0%, rgba(245,243,255,0.92) 85%, rgba(245,243,255,0) 100%)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)'
            }}
          >
            {['הכל', ...categories].map((filter, idx) => {
              const active = filter === selectedFilter;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedFilter(filter)}
                  className={`filter-chip ${active ? 'active' : ''}`}
                >
                  {filter !== 'הכל' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {getCategoryIcon(filter)}
                    </span>
                  )}
                  <span>{filter}</span>
                </button>
              );
            })}
          </div>

          {/* Planning Cards List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filteredPlans.length === 0 ? (
              <div className="glass-card" style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: '15px', fontWeight: '700' }}>לא נמצאו פריטי תכנון העונים לסינון.</p>
              </div>
            ) : (
              filteredPlans.map((plan) => {
                const isOpen = !!expandedPlanIds[plan.id];

                const renderChip = (icon, text, isLink = false) => {
                  if (!text) return null;
                  const isUrl = /^https?:\/\//i.test(text);
                  const targetUrl = isUrl ? text : `https://maps.google.com/?q=${encodeURIComponent(text)}`;

                  const content = (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(11, 11, 48, 0.04)',
                      padding: '5px 10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: '700',
                      color: 'var(--text-muted)',
                      border: '1px solid rgba(11,11,48,0.02)',
                      maxWidth: '100%',
                      boxSizing: 'border-box'
                    }}>
                      {icon}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                        {text}
                      </span>
                      {isLink && <ExternalLink size={10} style={{ marginRight: '2px', opacity: 0.7 }} />}
                    </div>
                  );

                  if (isLink) {
                    return (
                      <a
                        href={targetUrl}
                        target="_blank"
                        rel="noreferrer"
                        key={text}
                        onClick={(e) => e.stopPropagation()}
                        style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex' }}
                      >
                        {content}
                      </a>
                    );
                  }
                  return <span key={text}>{content}</span>;
                };

                return (
                  <div
                    key={plan.id}
                    className="glass-card"
                    onClick={() => togglePlanExpanded(plan.id)}
                    style={{
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: isOpen ? '12px' : '0',
                      borderRight: plan.visited ? '5px solid var(--text-success)' : '1px solid rgba(255,255,255,0.6)',
                      opacity: plan.visited ? 0.8 : 1,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Header — always visible */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                        <span style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '10px',
                          background: 'rgba(11, 11, 48, 0.05)',
                          color: 'var(--primary-color)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {getCategoryIcon(plan.category)}
                        </span>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <h3 style={{
                            fontSize: '14px',
                            fontWeight: '800',
                            color: 'var(--primary-color)',
                            textDecoration: plan.visited ? 'line-through' : 'none',
                            lineHeight: 1.25,
                            wordBreak: 'break-word'
                          }}>
                            {plan.title}
                          </h3>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700' }}>{plan.category}</span>
                        </div>
                      </div>

                      <ChevronDown
                        size={18}
                        style={{
                          color: 'var(--text-muted)',
                          transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                          transition: 'transform 0.2s ease',
                          flexShrink: 0
                        }}
                      />
                    </div>

                    {/* Expanded body */}
                    {isOpen && (
                      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleToggleVisited(plan)}
                            style={{
                              width: '40px', height: '40px', borderRadius: '50%',
                              background: plan.visited ? 'rgba(34, 197, 94, 0.1)' : 'rgba(11, 11, 48, 0.04)',
                              border: 'none',
                              color: plan.visited ? 'var(--text-success)' : 'var(--text-muted)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                            title="סמן שביקרתי"
                          >
                            <CheckCircle2 size={18} />
                          </button>

                          <button
                            onClick={() => handleStartEdit(plan)}
                            style={{
                              width: '40px', height: '40px', borderRadius: '50%',
                              background: 'rgba(11, 11, 48, 0.04)', border: 'none',
                              color: 'var(--text-muted)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                            title="ערוך"
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            onClick={() => handleDelete(plan.id)}
                            style={{
                              width: '40px', height: '40px', borderRadius: '50%',
                              background: 'rgba(239, 68, 68, 0.06)', border: 'none',
                              color: 'rgb(239, 68, 68)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                            title="מחק"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        {plan.description && (
                          <p style={{ fontSize: '14px', color: '#334155', lineHeight: '1.4', fontWeight: '500', margin: 0 }}>
                            {plan.description}
                          </p>
                        )}

                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '8px',
                          alignItems: 'center',
                          borderTop: '1px solid rgba(0,0,0,0.04)',
                          paddingTop: '10px'
                        }}>
                          {renderChip(<DollarSign size={12} />, plan.price)}
                          {renderChip(<MapPin size={12} />, plan.address, true)}
                          {Array.isArray(plan.links) && plan.links.map((link, idx) => (
                            <a
                              key={`lnk-${idx}`}
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex' }}
                            >
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: 'rgba(79, 70, 229, 0.08)',
                                padding: '5px 10px',
                                borderRadius: 10,
                                fontSize: 12,
                                fontWeight: 700,
                                color: 'var(--accent)',
                                border: '1px solid rgba(79, 70, 229, 0.15)',
                                maxWidth: '100%',
                                boxSizing: 'border-box'
                              }}>
                                <Link2 size={12} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                                  {link.label || link.url}
                                </span>
                                <ExternalLink size={10} style={{ marginRight: 2, opacity: 0.7 }} />
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        /* DAILY PLANNER SUB-TAB */
        <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>לוח זמנים לפי ימים</span>
            <button
              onClick={handleAddDay}
              className="btn-primary"
              style={{ padding: '8px 16px', fontSize: 13, gap: 6 }}
            >
              <Plus size={15} />
              <span>הוסף יום</span>
            </button>
          </div>

          {days.length === 0 ? (
            <div className="glass-card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Calendar size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <p style={{ fontSize: '15px', fontWeight: '700', margin: 0 }}>אין עדיין ימי טיול מתוכננים.</p>
              <p style={{ fontSize: '13px', marginTop: 4 }}>לחץ על "הוסף יום" כדי להתחיל לתכנן!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {days.map((day) => (
                <div key={day.id} className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Day Header */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    borderBottom: '1px solid rgba(11,11,48,0.06)', 
                    paddingBottom: 8,
                    minHeight: 36
                  }}>
                    {editingDayId === day.id ? (
                      <form 
                        onSubmit={(e) => { e.preventDefault(); handleSaveDayTitle(day.id, editingDayTitle); }} 
                        style={{ display: 'flex', gap: 6, width: '100%' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input 
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: 14, minHeight: 32, flex: 1 }} 
                          value={editingDayTitle} 
                          onChange={e => setEditingDayTitle(e.target.value)} 
                          required 
                        />
                        <button type="submit" className="btn-primary" style={{ padding: '4px 10px', fontSize: 12, minHeight: 32 }}>שמור</button>
                        <button type="button" className="btn-secondary" onClick={() => setEditingDayId(null)} style={{ padding: '4px 10px', fontSize: 12, minHeight: 32 }}>ביטול</button>
                      </form>
                    ) : (
                      <>
                        <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--primary)', margin: 0 }}>{day.title}</h3>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button 
                            onClick={() => { setEditingDayId(day.id); setEditingDayTitle(day.title); }} 
                            style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                            title="ערוך כותרת יום"
                          >
                            <Pencil size={15} />
                          </button>
                          <button 
                            onClick={() => handleDeleteDay(day.id)} 
                            style={{ border: 'none', background: 'transparent', color: 'rgba(220,38,38,0.6)', cursor: 'pointer', padding: 4 }}
                            title="מחק יום"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Day Activities Timeline */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                    {(day.activities || []).map((act, actIdx) => {
                      const isFirst = actIdx === 0;
                      const isLast = actIdx === (day.activities || []).length - 1;

                      return (
                        <div key={act.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative' }}>
                          {/* Timeline vertical node and line */}
                          <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            flexShrink: 0, 
                            position: 'relative', 
                            height: '100%', 
                            alignSelf: 'stretch'
                          }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: 'rgba(79,70,229,0.08)', color: 'var(--accent)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              zIndex: 2,
                              border: '1.5px solid rgba(79,70,229,0.15)'
                            }}>
                              {getCategoryIcon(act.category)}
                            </div>
                            {!isLast && (
                              <div style={{
                                position: 'absolute', 
                                top: 28, 
                                bottom: -12, 
                                width: 2,
                                background: 'rgba(11,11,48,0.06)', 
                                zIndex: 1
                              }} />
                            )}
                          </div>

                          {/* Activity Card */}
                          <div className="glass-card" style={{ 
                            flex: 1, 
                            padding: '12px 14px', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: 6, 
                            background: 'rgba(255,255,255,0.7)', 
                            border: '1px solid rgba(11,11,48,0.05)' 
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                              <div style={{ minWidth: 0 }}>
                                {act.timeLabel && (
                                  <span style={{ 
                                    fontSize: 10, 
                                    fontWeight: 900, 
                                    color: '#fff', 
                                    background: 'var(--accent)', 
                                    padding: '2px 6px', 
                                    borderRadius: 4, 
                                    marginLeft: 6,
                                    verticalAlign: 'middle',
                                    display: 'inline-block'
                                  }}>
                                    {act.timeLabel}
                                  </span>
                                )}
                                <h4 style={{ 
                                  fontSize: 14, 
                                  fontWeight: 800, 
                                  color: 'var(--primary)', 
                                  margin: 0,
                                  verticalAlign: 'middle',
                                  display: 'inline-block',
                                  wordBreak: 'break-word'
                                }}>
                                  {act.title}
                                </h4>
                              </div>

                              {/* Controls */}
                              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                <button 
                                  onClick={() => moveActivity(day.id, act.id, -1)} 
                                  disabled={isFirst} 
                                  style={{ border: 'none', background: 'transparent', color: isFirst ? '#cbd5e1' : 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button 
                                  onClick={() => moveActivity(day.id, act.id, 1)} 
                                  disabled={isLast} 
                                  style={{ border: 'none', background: 'transparent', color: isLast ? '#cbd5e1' : 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                                >
                                  <ArrowDown size={14} />
                                </button>
                                <button 
                                  onClick={() => handleStartEditActivity(day.id, act)} 
                                  style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                                >
                                  <Pencil size={13} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteActivity(day.id, act.id)} 
                                  style={{ border: 'none', background: 'transparent', color: 'rgba(220,38,38,0.6)', cursor: 'pointer', padding: 4 }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {act.description && (
                              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.3 }}>
                                {act.description}
                              </p>
                            )}

                            {act.address && (
                              <a 
                                href={`https://maps.google.com/?q=${encodeURIComponent(act.address)}`} 
                                target="_blank" 
                                rel="noreferrer" 
                                style={{ 
                                  fontSize: 11, 
                                  color: 'var(--accent)', 
                                  fontWeight: 700, 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: 3, 
                                  textDecoration: 'none',
                                  marginTop: 2
                                }}
                              >
                                <MapPin size={11} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.address}</span>
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {(day.activities || []).length === 0 && (
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0', margin: 0 }}>
                        אין עדיין פעילויות ליום זה.
                      </p>
                    )}
                  </div>

                  {/* Add Activity Button */}
                  <button
                    onClick={() => handleOpenAddActivity(day.id)}
                    className="btn-secondary"
                    style={{ 
                      width: '100%', 
                      padding: 10, 
                      fontSize: 13, 
                      fontWeight: 700, 
                      border: '1.5px dashed rgba(79,70,229,0.18)', 
                      background: 'rgba(79,70,229,0.03)',
                      color: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={14} />
                    <span>הוסף פעילות</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Activity Slide-Up Bottom Sheet Modal */}
      {showActivityForm && (
        <div className="modal-overlay" onClick={() => setShowActivityForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h2>{editingActivityId ? 'עריכת פעילות' : 'הוספת פעילות ליום'}</h2>
              <button className="btn-close" onClick={() => setShowActivityForm(false)}>✕</button>
            </div>

            <form onSubmit={handleActivitySubmit} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 4, paddingBottom: 16 }}>
              
              {/* Linked Places Selector */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>בחר מקום שמור מתוך האטרקציות (אופציונלי)</label>
                <select
                  className="category-select"
                  value={placeId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setPlaceId(pid);
                    if (pid) {
                      const found = plans.find(p => p.id === pid);
                      if (found) {
                        setActivityTitle(found.title);
                        setActivityAddress(found.address || '');
                        setActivityDescription(found.description || '');
                        setActivityCategory(found.category || 'אטרקציות ודברים לעשות');
                      }
                    }
                  }}
                >
                  <option value="">-- הזנה ידנית (לא מקושר למקום שמור) --</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.title} ({p.category})</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>שם הפעילות *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={activityTitle} 
                  onChange={(e) => setActivityTitle(e.target.value)} 
                  required 
                  placeholder="למשל: נסיעה ברכבת, ארוחת צהריים, ביקור במוזיאון"
                  style={{ minHeight: 40, fontSize: 14 }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>קטגוריה</label>
                <select
                  className="category-select"
                  value={activityCategory}
                  onChange={(e) => setActivityCategory(e.target.value)}
                >
                  {categories.map((cat, idx) => (
                    <option key={idx} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Time Label Tagging */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>תיוג זמן (שדה חופשי / בחירה מהירה)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="למשל: בוקר, 10:30, צהריים, 19:00" 
                  value={activityTimeLabel} 
                  onChange={(e) => setActivityTimeLabel(e.target.value)}
                  style={{ minHeight: 40, fontSize: 14 }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {['בוקר', 'צהריים', 'ערב', 'לילה'].map(label => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setActivityTimeLabel(label)}
                      style={{
                        border: '1px solid rgba(11,11,48,0.1)',
                        background: activityTimeLabel === label ? 'var(--accent)' : 'rgba(255,255,255,0.7)',
                        color: activityTimeLabel === label ? '#fff' : 'var(--text-muted)',
                        borderRadius: 12,
                        padding: '4px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>כתובת / מיקום</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="כתובת או קישור למפה" 
                  value={activityAddress} 
                  onChange={(e) => setActivityAddress(e.target.value)}
                  style={{ minHeight: 40, fontSize: 14 }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>הערות לפעילות זו</label>
                <textarea 
                  className="form-control" 
                  rows="3" 
                  placeholder="הערות מיוחדות, מספרי הזמנה, שעות פתיחה..." 
                  value={activityDescription} 
                  onChange={(e) => setActivityDescription(e.target.value)}
                  style={{ resize: 'none', fontFamily: 'inherit', fontSize: 14 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexShrink: 0 }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, minHeight: 44, fontSize: 15 }}>שמור פעילות</button>
                <button type="button" onClick={() => setShowActivityForm(false)} className="btn-secondary" style={{ minHeight: 44, fontSize: 15 }}>ביטול</button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
