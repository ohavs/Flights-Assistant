import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from './firebase';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  query, where, getDocs, updateDoc, arrayUnion, arrayRemove,
  getDoc, writeBatch
} from 'firebase/firestore';
import { defaultChecklist } from './components/ChecklistTab';
import FlightTab from './components/FlightTab';
import PlanningTab from './components/PlanningTab';
import ChecklistTab from './components/ChecklistTab';
import {
  Plane, Compass, ClipboardList, MapPin, Calendar,
  ChevronLeft, LogOut, Plus, UserPlus, Trash2, Users, X, Pencil,
  Check, RotateCcw
} from 'lucide-react';
import './index.css';

/* ══════════════════════════════════════════════════════════
   LOGIN SCREEN
   ══════════════════════════════════════════════════════════ */
function LoginScreen({ onSignIn }) {
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    setBusy(true);
    try { await onSignIn(); }
    catch { /* handled in AuthContext */ }
    finally { setBusy(false); }
  };

  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', gap: 32, padding: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', boxShadow: '0 8px 32px rgba(79,70,229,0.3)'
        }}>
          <Plane size={36} color="#fff" style={{ transform: 'rotate(-45deg)' }} />
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--primary)', marginBottom: 8 }}>
          עוזר טיסות
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.5 }}>
          תכנון טיולים, מעקב טיסות,<br />וצ'קליסט ציוד — הכל במקום אחד
        </p>
      </div>

      <button
        onClick={handleSignIn}
        disabled={busy}
        style={{
          width: '100%', maxWidth: 320, minHeight: 52,
          background: '#fff', color: 'var(--primary)',
          border: '1.5px solid rgba(11,11,48,0.12)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 24px',
          fontSize: 16, fontWeight: 700,
          fontFamily: 'var(--font-hebrew)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          boxShadow: 'var(--shadow-md)',
          opacity: busy ? 0.6 : 1,
          transition: 'transform 0.1s ease'
        }}
      >
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        {busy ? 'מתחבר...' : 'התחבר עם Google'}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   LOADING SCREEN
   ══════════════════════════════════════════════════════════ */
function LoadingScreen() {
  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <div className="pulsing-dot" style={{ width: 14, height: 14 }} />
      <p style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 15 }}>טוען...</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   HOMEPAGE — Trip list
   ══════════════════════════════════════════════════════════ */
function Homepage({ trips, onOpenTrip, onCreateTrip, onDeleteTrip, onShareTrip, userName, onOpenGlobalChecklist }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDest, setNewDest] = useState('');

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newName.trim() || !newDest.trim()) return;
    onCreateTrip(newName.trim(), newDest.trim());
    setNewName('');
    setNewDest('');
    setShowCreate(false);
  };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="homepage-greeting">
        <h1>שלום{userName ? `, ${userName.split(' ')[0]}` : ''} 👋</h1>
        <p>הטיולים שלך מחכים לך</p>
      </div>

      <button
        onClick={onOpenGlobalChecklist}
        className="btn-secondary"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          border: '1.5px dashed var(--accent)',
          background: 'rgba(79,70,229,0.04)',
          color: 'var(--accent)',
          borderRadius: 'var(--radius-md)',
          padding: '12px',
          fontWeight: 700,
          cursor: 'pointer',
          marginTop: -4,
          transition: 'all 0.2s ease'
        }}
      >
        <ClipboardList size={16} />
        <span>ניהול רשימת ציוד קבועה</span>
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span className="homepage-section-title" style={{ margin: 0 }}>טיולים מתוכננים</span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--accent)', color: '#fff', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.3)'
          }}
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Create trip form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="glass-card animate-fade">
          <h4 style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>טיול חדש</h4>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>שם הטיול</label>
            <input className="form-control" placeholder="למשל: סוף שבוע בפראג" value={newName} onChange={e => setNewName(e.target.value)} required />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>יעד</label>
            <input className="form-control" placeholder="למשל: פראג, צ'כיה" value={newDest} onChange={e => setNewDest(e.target.value)} required />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn-primary" style={{ flex: 1 }}>צור טיול</button>
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)} style={{ padding: '10px 16px' }}>ביטול</button>
          </div>
        </form>
      )}

      {/* Trip cards */}
      {trips.length === 0 && !showCreate && (
        <div className="glass-card" style={{ textAlign: 'center', padding: 32 }}>
          <Plane size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px', opacity: 0.4, transform: 'rotate(-45deg)' }} />
          <p style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 15 }}>
            עדיין אין טיולים.<br />לחץ על + כדי להוסיף אחד!
          </p>
        </div>
      )}

      {trips.map(trip => (
        <div className="trip-card" key={trip.id} onClick={() => onOpenTrip(trip.id)}>
          <div className="trip-card-header">
            <div className="trip-card-icon">
              <Plane size={24} style={{ transform: 'rotate(-45deg)' }} />
            </div>
            <div className="trip-card-info" style={{ flex: 1, minWidth: 0 }}>
              <h3>{trip.name || 'טיול ללא שם'}</h3>
              <p>{trip.destination || ''}</p>
            </div>
          </div>

          {trip.dates && (
            <div className="trip-card-meta">
              <span className="trip-card-badge"><Calendar size={13} />{trip.dates}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <div className="trip-card-arrow">
              <span>פתח טיול</span>
              <ChevronLeft size={16} />
            </div>
            <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onShareTrip(trip.id)}
                style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(79,70,229,0.08)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)' }}
                title="שתף טיול"
              >
                <UserPlus size={15} />
              </button>
              <button
                onClick={() => { if (window.confirm('למחוק את הטיול?')) onDeleteTrip(trip.id); }}
                style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(220,38,38,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#dc2626' }}
                title="מחק טיול"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SHARE MODAL — Invite user by email
   ══════════════════════════════════════════════════════════ */
function ShareModal({ tripId, onClose }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(''); // '', 'searching', 'success', 'not-found', 'already', 'error'

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('searching');

    try {
      // Find user by email in users collection
      const q = query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()));
      const snap = await getDocs(q);

      if (snap.empty) {
        setStatus('not-found');
        return;
      }

      const targetDoc = snap.docs[0];
      const targetUid = targetDoc.id;

      // Check if already member
      const tripDoc = await getDocs(query(collection(db, 'trips')));
      // Simpler: just add them directly
      const tripRef = doc(db, 'trips', tripId);

      // Add user to trip members
      await updateDoc(tripRef, {
        [`members.${targetUid}`]: 'member'
      });

      // Add tripId to user's tripIds array
      const userRef = doc(db, 'users', targetUid);
      await updateDoc(userRef, {
        tripIds: arrayUnion(tripId)
      });

      setStatus('success');
      setEmail('');
    } catch (err) {
      console.error('Share error:', err);
      setStatus('error');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ height: 'auto', maxHeight: '50%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>שתף טיול</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <p style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.5 }}>
          הזן את כתובת האימייל של משתמש רשום כדי לשתף אותו בטיול. הוא יוכל לצפות ולערוך את כל הנתונים.
        </p>

        <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-control"
            type="email"
            placeholder="example@gmail.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            dir="ltr"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary" style={{ padding: '12px 20px', flexShrink: 0 }} disabled={status === 'searching'}>
            <UserPlus size={16} />
          </button>
        </form>

        {status === 'searching' && <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 14 }}>מחפש משתמש...</p>}
        {status === 'success' && <p style={{ color: 'var(--text-success)', fontWeight: 700, fontSize: 14 }}>✅ המשתמש נוסף בהצלחה! הטיול יופיע אצלו באפליקציה.</p>}
        {status === 'not-found' && <p style={{ color: '#dc2626', fontWeight: 700, fontSize: 14 }}>❌ לא נמצא משתמש עם האימייל הזה. ודא שהוא רשום לאפליקציה.</p>}
        {status === 'error' && <p style={{ color: '#dc2626', fontWeight: 700, fontSize: 14 }}>שגיאה בשיתוף. נסה שוב.</p>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   GLOBAL CHECKLIST MODAL
   ══════════════════════════════════════════════════════════ */
function GlobalChecklistModal({ isOpen, onClose, globalChecklist, userId }) {
  const [newItemText, setNewItemText] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('מסמכים וסידורים');
  const [editingItemId, setEditingItemId] = useState(null);

  if (!isOpen) return null;

  const categories = [
    'מסמכים וסידורים',
    'בגדים',
    'אלקטרוניקה',
    'תרופות ועזרה ראשונה',
    'סידורים אחרונים בארץ'
  ];

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newItemText.trim() || !userId) return;

    let updatedList;
    if (editingItemId) {
      updatedList = globalChecklist.map(item =>
        item.id === editingItemId
          ? { ...item, text: newItemText.trim(), category: newItemCategory }
          : item
      );
      setEditingItemId(null);
    } else {
      const newItem = {
        id: 'global-' + Date.now(),
        text: newItemText.trim(),
        completed: false,
        category: newItemCategory
      };
      updatedList = [...globalChecklist, newItem];
    }

    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { globalChecklist: updatedList });
      setNewItemText('');
    } catch (err) {
      console.error('Error updating global checklist:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!userId) return;
    const updatedList = globalChecklist.filter(item => item.id !== id);
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { globalChecklist: updatedList });
    } catch (err) {
      console.error('Error deleting from global checklist:', err);
    }
  };

  const handleStartEdit = (item) => {
    setEditingItemId(item.id);
    setNewItemText(item.text);
    setNewItemCategory(item.category);
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setNewItemText('');
    setNewItemCategory('מסמכים וסידורים');
  };

  const handleReset = async () => {
    if (!window.confirm('האם אתה בטוח שברצונך לאפס את רשימת הציוד הקבועה לרשימת ברירת המחדל?')) return;
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { globalChecklist: defaultChecklist });
    } catch (err) {
      console.error('Error resetting global checklist:', err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2>רשימת ציוד קבועה</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.5, marginBottom: 12, flexShrink: 0 }}>
          נהל כאן את רשימת הציוד הקבועה שלך. פריטים אלו יועתקו אוטומטית לכל טיול חדש שתפתח, ותוכל להתאים אותם אישית לכל טיול בנפרד.
        </p>

        {/* Form Container */}
        <form onSubmit={handleAdd} className="glass-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, flexShrink: 0, border: '1px solid rgba(79,70,229,0.15)' }}>
          <h4 style={{ fontSize: 14, fontWeight: 800, borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: 4, margin: 0 }}>
            {editingItemId ? 'עריכת פריט קבוע' : 'הוספת פריט קבוע חדש'}
          </h4>
          
          <div className="row-2" style={{ gap: 8 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>שם הפריט</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="למשל: רישיון נהיגה, כפכפים" 
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                required
                style={{ padding: '8px 12px', fontSize: 14, minHeight: 38 }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>קטגוריה</label>
              <select 
                className="form-control" 
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value)}
                style={{ padding: '8px 12px', fontSize: 14, minHeight: 38 }}
              >
                {categories.map((cat, idx) => (
                  <option key={idx} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {editingItemId ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <button type="submit" className="btn-primary" style={{ flex: 1, minHeight: 36, fontSize: 14, padding: '6px 12px' }}>שמור</button>
              <button type="button" className="btn-secondary" onClick={handleCancelEdit} style={{ minHeight: 36, fontSize: 14, padding: '6px 12px' }}>ביטול</button>
            </div>
          ) : (
            <button type="submit" className="btn-primary" style={{ marginTop: 2, width: '100%', minHeight: 36, fontSize: 14, padding: '6px 12px' }}>
              <Plus size={16} />
              <span>הוסף לרשימה הקבועה</span>
            </button>
          )}
        </form>

        {/* Scrollable checklist items */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {categories.map((category, catIdx) => {
            const categoryItems = globalChecklist.filter(item => item.category === category);
            if (categoryItems.length === 0) return null;

            return (
              <div key={catIdx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={{ fontSize: 13, fontWeight: '800', color: 'var(--primary)', paddingRight: 2, margin: 0 }}>
                  {category}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {categoryItems.map((item) => (
                    <div 
                      key={item.id} 
                      className="glass-card" 
                      style={{ 
                        padding: '10px 12px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        background: 'var(--card-bg)',
                        border: 'var(--card-border)',
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: '600', color: 'var(--text-main)' }}>
                        {item.text}
                      </span>

                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button 
                          onClick={() => handleStartEdit(item)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                        >
                          <Pencil size={14} />
                        </button>

                        <button 
                          onClick={() => handleDelete(item.id)}
                          style={{ background: 'transparent', border: 'none', color: 'rgba(239, 68, 68, 0.6)', cursor: 'pointer', padding: 4 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {globalChecklist.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
              <p>הרשימה ריקה. הוסף פריטים או אפס לברירת המחדל.</p>
            </div>
          )}

          {/* Reset button */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8, paddingBottom: 16 }}>
            <button 
              onClick={handleReset} 
              className="btn-secondary" 
              style={{ fontSize: 12, padding: '8px 12px', gap: 6, color: 'var(--text-muted)', border: '1px dashed rgba(11, 11, 48, 0.15)', minHeight: 32 }}
            >
              <RotateCcw size={13} />
              <span>איפוס רשימה קבועה לברירת מחדל</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN APP
   ══════════════════════════════════════════════════════════ */
export default function App() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const [screen, setScreen] = useState('home'); // 'home' | 'trip'
  const [activeTab, setActiveTab] = useState('flight');
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [trips, setTrips] = useState([]);
  const [sharingTripId, setSharingTripId] = useState(null);
  const [globalChecklist, setGlobalChecklist] = useState([]);
  const [showGlobalChecklistModal, setShowGlobalChecklistModal] = useState(false);

  // Save user profile to Firestore on first login
  useEffect(() => {
    if (!user) return;
    const checkAndSeed = async () => {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        // New user — create profile with empty trip list (no seeded trip)
        await setDoc(userRef, {
          email: user.email?.toLowerCase() || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          tripIds: [],
          globalChecklist: defaultChecklist
        });
      } else {
        // Existing user — update info, ensure globalChecklist, and clean up seeded demo trip
        const userData = userSnap.data();
        const seededTripId = `trip_prague_${user.uid}`;
        const updates = {
          email: user.email?.toLowerCase() || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || ''
        };
        if (!userData?.globalChecklist) {
          updates.globalChecklist = defaultChecklist;
        }
        await setDoc(userRef, updates, { merge: true });

        // Remove the old auto-seeded Prague demo trip if it still exists in this user's list
        if (userData.tripIds?.includes(seededTripId)) {
          await updateDoc(userRef, {
            tripIds: arrayRemove(seededTripId)
          });
        }
      }
    };

    checkAndSeed().catch(err => console.error("Error in checkAndSeed:", err));
  }, [user]);

  // Listen to user's trips
  useEffect(() => {
    if (!user) { setTrips([]); return; }

    // Listen to the user doc to get tripIds
    const userRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (snap) => {
      const data = snap.data();
      const tripIds = data?.tripIds || [];
      setGlobalChecklist(data?.globalChecklist || []);

      if (tripIds.length === 0) {
        setTrips([]);
        return;
      }

      // Listen to each trip doc
      const unsubs = tripIds.map(tripId => {
        const tripRef = doc(db, 'trips', tripId);
        return onSnapshot(tripRef, (tripSnap) => {
          if (tripSnap.exists()) {
            setTrips(prev => {
              const filtered = prev.filter(t => t.id !== tripId);
              return [...filtered, { id: tripId, ...tripSnap.data() }];
            });
          } else {
            // Trip deleted — remove from list
            setTrips(prev => prev.filter(t => t.id !== tripId));
          }
        });
      });

      return () => unsubs.forEach(u => u());
    });

    return () => unsubUser();
  }, [user]);

  // Create a new trip
  const handleCreateTrip = async (name, destination) => {
    if (!user) return;
    const tripId = 'trip_' + Date.now();
    const tripRef = doc(db, 'trips', tripId);

    const emptyFlightDetails = {
      flightNumber: '',
      airline: '',
      depAirport: { code: '', city: '', name: '', lat: 0, lng: 0, timezone: 'UTC +02:00' },
      arrAirport: { code: '', city: '', name: '', lat: 0, lng: 0, timezone: 'UTC +02:00' },
      scheduledDep: '',
      actualDep: '',
      scheduledArr: '',
      estimatedArr: '',
      status: 'בזמן',
      aircraftType: '',
      registration: '',
      serialNumber: '',
      country: '',
      date: ''
    };

    const emptyHotelDetails = {
      name: '',
      address: '',
      checkIn: '',
      checkOut: '',
      bookingRef: '',
      roomNumber: '',
      notes: ''
    };

    // Initialize trip doc
    await setDoc(tripRef, {
      name,
      destination,
      dates: '',
      members: { [user.uid]: 'owner' },
      createdAt: new Date().toISOString(),
      outboundFlightDetails: emptyFlightDetails,
      returnFlightDetails: emptyFlightDetails,
      hotelDetails: emptyHotelDetails
    });

    // Fetch user's custom globalChecklist template
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    const userChecklist = userSnap.exists() && userSnap.data()?.globalChecklist
      ? userSnap.data().globalChecklist
      : defaultChecklist;

    // Batch write custom template items to the subcollection
    const batch = writeBatch(db);
    if (Array.isArray(userChecklist)) {
      userChecklist.forEach(item => {
        const itemRef = doc(db, 'trips', tripId, 'checklist', item.id);
        batch.set(itemRef, {
          text: item.text,
          completed: false,
          category: item.category
        });
      });
    }
    await batch.commit();

    // Add to user's tripIds
    await updateDoc(userRef, {
      tripIds: arrayUnion(tripId)
    }).catch(() => {
      // If user doc doesn't have tripIds yet
      setDoc(userRef, { tripIds: [tripId] }, { merge: true });
    });
  };

  // Delete a trip
  const handleDeleteTrip = async (tripId) => {
    if (!user) return;
    // Remove from user's tripIds
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, {
      tripIds: arrayRemove(tripId)
    });

    // Remove user from trip members (don't delete trip entirely — others might still be in it)
    const tripRef = doc(db, 'trips', tripId);
    await updateDoc(tripRef, {
      [`members.${user.uid}`]: null
    }).catch(() => {});

    // If we were viewing this trip, go back home
    if (selectedTripId === tripId) {
      setScreen('home');
      setSelectedTripId(null);
    }
  };

  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'flight':   return 'טיסה ומלון';
      case 'planning': return 'תכנון הטיול';
      case 'checklist': return 'רשימת ציוד';
      default:          return 'עוזר טיסות';
    }
  };

  const selectedTrip = trips.find(t => t.id === selectedTripId);

  // ── Loading ──
  if (loading) return <LoadingScreen />;

  // ── Not signed in ──
  if (!user) return <LoginScreen onSignIn={signInWithGoogle} />;

  // ── Homepage ──
  if (screen === 'home') {
    return (
      <div className="app-container">
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {user.photoURL ? (
              <img src={user.photoURL} alt="" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }} referrerPolicy="no-referrer" />
            ) : (
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                {(user.displayName || user.email || '?')[0]}
              </div>
            )}
            <h1 style={{ fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>עוזר טיסות</h1>
          </div>
          <button
            onClick={signOut}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(11,11,48,0.05)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0
            }}
            title="התנתק"
          >
            <LogOut size={16} />
          </button>
        </header>

        <main className="app-content">
          <Homepage
            trips={trips}
            onOpenTrip={(id) => { setSelectedTripId(id); setActiveTab('flight'); setScreen('trip'); }}
            onCreateTrip={handleCreateTrip}
            onDeleteTrip={handleDeleteTrip}
            onShareTrip={(id) => setSharingTripId(id)}
            userName={user.displayName}
            onOpenGlobalChecklist={() => setShowGlobalChecklistModal(true)}
          />
        </main>

        {sharingTripId && (
          <ShareModal tripId={sharingTripId} onClose={() => setSharingTripId(null)} />
        )}

        <GlobalChecklistModal
          isOpen={showGlobalChecklistModal}
          onClose={() => setShowGlobalChecklistModal(false)}
          globalChecklist={globalChecklist}
          userId={user.uid}
        />
      </div>
    );
  }

  // ── Trip Detail ──
  return (
    <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <button
            onClick={() => { setScreen('home'); setSelectedTripId(null); }}
            aria-label="חזרה"
            style={{
              background: 'rgba(11,11,48,0.05)', border: 'none',
              width: 34, height: 34, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--primary)', flexShrink: 0
            }}
          >
            <ChevronLeft size={18} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {getHeaderTitle()}
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selectedTrip?.destination || selectedTrip?.name || ''}
            </p>
          </div>
        </div>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'rgba(11,11,48,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--primary)', flexShrink: 0
        }}>
          <Plane size={14} style={{ transform: 'rotate(-45deg)' }} />
        </div>
      </header>

      <main className="app-content" key={activeTab}>
        {activeTab === 'flight'    && <FlightTab tripId={selectedTripId} />}
        {activeTab === 'planning'  && <PlanningTab tripId={selectedTripId} />}
        {activeTab === 'checklist' && <ChecklistTab tripId={selectedTripId} />}
      </main>

      <nav className="bottom-nav">
        <button onClick={() => setActiveTab('flight')}   className={`nav-item ${activeTab === 'flight' ? 'active' : ''}`}>
          <Plane /><span className="nav-label">טיסה ומלון</span>
        </button>
        <button onClick={() => setActiveTab('planning')}  className={`nav-item ${activeTab === 'planning' ? 'active' : ''}`}>
          <Compass /><span className="nav-label">תכנון טיול</span>
        </button>
        <button onClick={() => setActiveTab('checklist')} className={`nav-item ${activeTab === 'checklist' ? 'active' : ''}`}>
          <ClipboardList /><span className="nav-label">צ'קליסט</span>
        </button>
      </nav>
    </div>
  );
}
