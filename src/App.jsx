import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from './firebase';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  query, where, getDocs, updateDoc, arrayUnion, arrayRemove,
  getDoc, writeBatch
} from 'firebase/firestore';
import ConfirmModal from './components/ConfirmModal';
import { TripProvider } from './TripContext';
import { defaultPraguePlans } from './components/PlanningTab';
import { defaultChecklist } from './components/ChecklistTab';
import FlightTab, { defaultTrip } from './components/FlightTab';
import { CustomDropdown } from './components/CustomDatePicker';
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
function Homepage({ trips, currentUid, ownerProfiles, onOpenTrip, onCreateTrip, onDeleteTrip, onShareTrip, userName, onOpenGlobalChecklist }) {
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

      {trips.map(trip => {
        const myRole = trip.members?.[currentUid];
        const isOwner = myRole === 'owner';
        const ownerUid = Object.keys(trip.members || {}).find(uid => trip.members[uid] === 'owner');
        const ownerProfile = ownerUid ? ownerProfiles?.[ownerUid] : null;
        return (
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

          {!isOwner && ownerProfile && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', background: 'rgba(79,70,229,0.08)',
              border: '1px solid rgba(79,70,229,0.18)', borderRadius: 999,
              alignSelf: 'flex-start'
            }}>
              {ownerProfile.photoURL ? (
                <img src={ownerProfile.photoURL} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} referrerPolicy="no-referrer" />
              ) : (
                <Users size={14} style={{ color: 'var(--accent)' }} />
              )}
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                טיול של {ownerProfile.displayName || ownerProfile.email || ''}
                {' · '}
                {myRole === 'viewer' ? 'צפייה' : 'עריכה'}
              </span>
            </div>
          )}

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
                title={isOwner ? 'שתף וניהול חברים' : 'הצג חברי טיול'}
              >
                <UserPlus size={15} />
              </button>
              <button
                onClick={() => onDeleteTrip(trip.id, isOwner)}
                style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(220,38,38,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#dc2626' }}
                title={isOwner ? 'מחק טיול' : 'צא מהטיול'}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SHARE MODAL — Invite + manage trip members
   ══════════════════════════════════════════════════════════ */
function ShareModal({ tripId, currentUid, onClose }) {
  const [trip, setTrip] = useState(null);
  const [members, setMembers] = useState([]); // [{ uid, role, profile? }]
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState('viewer'); // viewer | editor
  const [status, setStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Live-listen to the trip so members list refreshes when roles change
  useEffect(() => {
    if (!tripId) return;
    return onSnapshot(doc(db, 'trips', tripId), (snap) => {
      if (!snap.exists()) { setTrip(null); setMembers([]); return; }
      setTrip(snap.data());
    });
  }, [tripId]);

  // Load each member's profile (displayName/email)
  useEffect(() => {
    if (!trip?.members) { setMembers([]); return; }
    const entries = Object.entries(trip.members).filter(([, role]) => role);
    let cancelled = false;
    (async () => {
      const enriched = await Promise.all(entries.map(async ([uid, role]) => {
        try {
          const u = await getDoc(doc(db, 'users', uid));
          return { uid, role, profile: u.exists() ? u.data() : null };
        } catch {
          return { uid, role, profile: null };
        }
      }));
      if (!cancelled) setMembers(enriched);
    })();
    return () => { cancelled = true; };
  }, [trip]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('searching');
    setErrorMsg('');

    try {
      const q = query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()));
      const snap = await getDocs(q);

      if (snap.empty) {
        setStatus('not-found');
        return;
      }

      const targetUid = snap.docs[0].id;
      if (targetUid === currentUid) {
        setStatus('self');
        return;
      }
      if (trip?.members?.[targetUid]) {
        setStatus('already');
        return;
      }

      const tripRef = doc(db, 'trips', tripId);
      await updateDoc(tripRef, {
        [`members.${targetUid}`]: newRole,
        memberIds: arrayUnion(targetUid),
      });

      setStatus('success');
      setEmail('');
    } catch (err) {
      console.error('Share error:', err);
      setStatus('error');
      setErrorMsg(err?.message || 'Unknown error');
    }
  };

  const changeRole = async (uid, role) => {
    try {
      await updateDoc(doc(db, 'trips', tripId), {
        [`members.${uid}`]: role,
      });
    } catch (err) {
      console.error('Change role failed:', err);
      setStatus('error');
      setErrorMsg(err?.message || 'Unknown error');
    }
  };

  const removeMember = async (uid) => {
    try {
      // Build the new members map without that uid
      const newMembers = { ...(trip?.members || {}) };
      delete newMembers[uid];
      await updateDoc(doc(db, 'trips', tripId), {
        members: newMembers,
        memberIds: arrayRemove(uid),
      });
    } catch (err) {
      console.error('Remove member failed:', err);
      setStatus('error');
      setErrorMsg(err?.message || 'Unknown error');
    }
  };

  const currentRole = trip?.members?.[currentUid];
  const isOwner = currentRole === 'owner';

  // For non-owners: this modal only shows members + leave button (no controls)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ height: 'auto', maxHeight: '90%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>שיתוף וניהול חברי הטיול</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {isOwner && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.55 }}>
              הזן אימייל של משתמש רשום, בחר הרשאה, והוא יראה את הטיול אצלו באפליקציה.
              {' '}אתה תמיד נשאר הבעלים ויכול לשנות הרשאות או להוריד גישה בכל זמן.
            </p>

            <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                className="form-control"
                type="email"
                placeholder="example@gmail.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                dir="ltr"
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: 'rgba(11,11,48,0.04)', padding: 4, borderRadius: 12 }}>
                {[
                  { val: 'viewer', label: 'צפייה בלבד', desc: 'יראה את הטיול אבל לא יוכל לערוך' },
                  { val: 'editor', label: 'עריכה', desc: 'יוכל לערוך טיסות, מלון, תכנון וצ\'קליסט' },
                ].map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setNewRole(opt.val)}
                    style={{
                      border: 'none', borderRadius: 8, padding: '10px 12px',
                      fontFamily: 'var(--font-hebrew)',
                      background: newRole === opt.val ? '#fff' : 'transparent',
                      color: newRole === opt.val ? 'var(--primary)' : 'var(--text-muted)',
                      boxShadow: newRole === opt.val ? '0 2px 6px rgba(0,0,0,0.05)' : 'none',
                      cursor: 'pointer', textAlign: 'right'
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 900 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>

              <button type="submit" className="btn-primary" disabled={status === 'searching'}>
                <UserPlus size={16} />
                <span>{status === 'searching' ? 'מחפש...' : 'שתף'}</span>
              </button>
            </form>

            {status === 'success' && <p style={{ color: 'var(--text-success)', fontWeight: 700, fontSize: 13 }}>✅ נוסף בהצלחה.</p>}
            {status === 'not-found' && <p style={{ color: '#dc2626', fontWeight: 700, fontSize: 13 }}>❌ אין משתמש רשום עם האימייל הזה.</p>}
            {status === 'self' && <p style={{ color: '#dc2626', fontWeight: 700, fontSize: 13 }}>❌ אי אפשר לשתף את עצמך.</p>}
            {status === 'already' && <p style={{ color: 'rgb(146, 64, 14)', fontWeight: 700, fontSize: 13 }}>ⓘ המשתמש כבר חבר בטיול.</p>}
            {status === 'error' && (
              <p style={{ color: '#dc2626', fontWeight: 700, fontSize: 13, lineHeight: 1.5 }}>
                ❌ שגיאה.{errorMsg && <><br /><span style={{ fontWeight: 600, fontSize: 11 }} dir="ltr">{errorMsg}</span></>}
              </p>
            )}
          </>
        )}

        {!isOwner && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.55 }}>
            רק הבעלים של הטיול יכול להוסיף או להסיר חברים.
          </p>
        )}

        <h4 style={{ fontSize: 14, fontWeight: 900, color: 'var(--primary)', marginTop: 4 }}>חברי הטיול ({members.length})</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {members.map(({ uid, role, profile }) => {
            const isSelf = uid === currentUid;
            const isOwnerRow = role === 'owner';
            return (
              <div
                key={uid}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px',
                  background: 'rgba(11,11,48,0.03)',
                  border: '1px solid rgba(11,11,48,0.06)',
                  borderRadius: 12,
                }}
              >
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="" style={{ width: 34, height: 34, borderRadius: '50%' }} referrerPolicy="no-referrer" />
                ) : (
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: 'var(--accent)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800
                  }}>
                    {(profile?.displayName || profile?.email || '?')[0]}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {profile?.displayName || profile?.email || uid}
                    {isSelf && <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, marginRight: 6 }}>(אתה)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
                    {isOwnerRow ? 'בעלים' : (role === 'editor' || role === 'member') ? 'עריכה' : 'צפייה'}
                  </div>
                </div>

                {isOwner && !isOwnerRow && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => changeRole(uid, (role === 'editor' || role === 'member') ? 'viewer' : 'editor')}
                      className="btn-secondary"
                      style={{ minHeight: 32, padding: '4px 10px', fontSize: 12 }}
                      title={(role === 'editor' || role === 'member') ? 'הפוך לצפייה בלבד' : 'אפשר עריכה'}
                    >
                      {(role === 'editor' || role === 'member') ? 'הפוך לצופה' : 'אפשר עריכה'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMember(uid)}
                      style={{
                        background: 'rgba(220,38,38,0.08)', border: 'none',
                        color: '#dc2626', borderRadius: 8, width: 32, height: 32,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      title="הסר מהטיול"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
            <CustomDropdown
              label="קטגוריה"
              value={newItemCategory}
              onChange={setNewItemCategory}
              options={categories}
            />
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
  const [ownerProfiles, setOwnerProfiles] = useState({}); // uid -> profile
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
        // User profile doesn't exist, this is a first-time login
        // Seed the Prague trip
        const defaultTripId = `trip_prague_${user.uid}`;
        const tripRef = doc(db, 'trips', defaultTripId);

        // Prepare the Prague trip document data
        const pragueTripDoc = {
          name: defaultTrip?.name || 'פראג - סוף שבוע אירופאי קלאסי',
          destination: defaultTrip?.destination || 'פראג, צ\'כיה',
          dates: defaultTrip?.dates || '15.06.2026 - 22.06.2026',
          members: { [user.uid]: 'owner' },
          memberIds: [user.uid],
          createdAt: new Date().toISOString(),
          outboundFlightDetails: defaultTrip?.outboundFlightDetails || {},
          returnFlightDetails: defaultTrip?.returnFlightDetails || {},
          hotelDetails: defaultTrip?.hotelDetails || {}
        };

        // Create the trip document
        await setDoc(tripRef, pragueTripDoc);

        // Batch write the planning plans to the subcollection
        const batch = writeBatch(db);
        if (Array.isArray(defaultPraguePlans)) {
          defaultPraguePlans.forEach(plan => {
            const planRef = doc(db, 'trips', defaultTripId, 'planning', plan.id);
            batch.set(planRef, {
              title: plan.title,
              category: plan.category,
              description: plan.description || '',
              address: plan.address || '',
              rating: plan.rating || 5,
              price: plan.price || '',
              visited: plan.visited || false
            });
          });
        }

        // Batch write the checklist items to the subcollection
        if (Array.isArray(defaultChecklist)) {
          defaultChecklist.forEach(item => {
            const itemRef = doc(db, 'trips', defaultTripId, 'checklist', item.id);
            batch.set(itemRef, {
              text: item.text,
              completed: item.completed || false,
              category: item.category
            });
          });
        }

        await batch.commit();

        // Save user profile with this trip in their tripIds list and the globalChecklist template
        await setDoc(userRef, {
          email: user.email?.toLowerCase() || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          tripIds: [defaultTripId],
          globalChecklist: defaultChecklist
        });
      } else {
        // User profile already exists, update info and ensure globalChecklist exists
        const userData = userSnap.data();
        if (!userData?.globalChecklist) {
          await setDoc(userRef, {
            email: user.email?.toLowerCase() || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            globalChecklist: defaultChecklist
          }, { merge: true });
        } else {
          await setDoc(userRef, {
            email: user.email?.toLowerCase() || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || ''
          }, { merge: true });
        }

        // One-shot migration: trips listed in user.tripIds need to have
        // memberIds populated so the new array-contains query finds them.
        const legacyTripIds = userData?.tripIds || [];
        for (const tid of legacyTripIds) {
          try {
            const tref = doc(db, 'trips', tid);
            const tsnap = await getDoc(tref);
            if (!tsnap.exists()) continue;
            const td = tsnap.data();
            if (!Array.isArray(td.memberIds)) {
              const memberIds = td.members ? Object.keys(td.members) : [user.uid];
              await updateDoc(tref, { memberIds });
            }
          } catch (err) {
            console.warn('memberIds migration failed for', tid, err);
          }
        }
      }
    };

    checkAndSeed().catch(err => console.error("Error in checkAndSeed:", err));
  }, [user]);

  // Listen for the user's globalChecklist
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    return onSnapshot(userRef, (snap) => {
      setGlobalChecklist(snap.data()?.globalChecklist || []);
    });
  }, [user]);

  // Listen for trips where this user is a member. We use the memberIds array
  // (parallel to the members map) so shared trips show up without writing
  // to the invited user's profile.
  useEffect(() => {
    if (!user) { setTrips([]); return; }
    const q = query(collection(db, 'trips'), where('memberIds', 'array-contains', user.uid));
    return onSnapshot(q, (snap) => {
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('Trips listener error:', err);
    });
  }, [user]);

  // Pre-load profile docs for every trip owner so the homepage card can
  // show "טיול של ..." badges without lazy-loading per card.
  useEffect(() => {
    if (!user || trips.length === 0) return;
    const ownerUids = new Set();
    for (const t of trips) {
      const members = t.members || {};
      for (const [uid, role] of Object.entries(members)) {
        if (role === 'owner' && uid !== user.uid) ownerUids.add(uid);
      }
    }
    let cancelled = false;
    (async () => {
      const updates = {};
      await Promise.all([...ownerUids].map(async (uid) => {
        if (ownerProfiles[uid]) return;
        try {
          const u = await getDoc(doc(db, 'users', uid));
          if (u.exists()) updates[uid] = u.data();
        } catch { /* ignore */ }
      }));
      if (!cancelled && Object.keys(updates).length > 0) {
        setOwnerProfiles(prev => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, user]);

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
      memberIds: [user.uid],
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

  // Full delete: remove the trip doc *and* all its subcollection docs.
  // Also removes it from any legacy user.tripIds (best-effort).
  const deleteTripFully = async (tripId) => {
    const tripRef = doc(db, 'trips', tripId);

    // Delete all docs in the known subcollections, batched.
    const subcollections = ['planning', 'days', 'checklist'];
    for (const name of subcollections) {
      try {
        const snap = await getDocs(collection(db, 'trips', tripId, name));
        if (snap.size === 0) continue;
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
      } catch (err) {
        console.warn(`Failed to clear subcollection "${name}":`, err);
      }
    }

    // Delete the trip document itself. Hosts are members → rules allow it.
    await deleteDoc(tripRef);

    // Best-effort: clean up our own user.tripIds legacy field
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      updateDoc(userRef, { tripIds: arrayRemove(tripId) }).catch(() => {});
    }
  };

  const leaveTrip = async (tripId) => {
    if (!user) return;
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;
    const newMembers = { ...(trip.members || {}) };
    delete newMembers[user.uid];
    await updateDoc(doc(db, 'trips', tripId), {
      members: newMembers,
      memberIds: arrayRemove(user.uid),
    });
    // Best-effort legacy cleanup
    updateDoc(doc(db, 'users', user.uid), { tripIds: arrayRemove(tripId) }).catch(() => {});
  };

  const [confirmDelete, setConfirmDelete] = useState(null); // { tripId, name, mode: 'delete'|'leave' } | null
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const requestDeleteTrip = (tripId, isOwner) => {
    const t = trips.find(x => x.id === tripId);
    setConfirmDelete({
      tripId,
      name: t?.name || 'הטיול הזה',
      mode: isOwner ? 'delete' : 'leave',
    });
    setDeleteError('');
  };

  const handleConfirmDelete = async () => {
    if (!user || !confirmDelete?.tripId) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      if (confirmDelete.mode === 'delete') {
        await deleteTripFully(confirmDelete.tripId);
      } else {
        await leaveTrip(confirmDelete.tripId);
      }
      if (selectedTripId === confirmDelete.tripId) {
        setScreen('home');
        setSelectedTripId(null);
      }
      setConfirmDelete(null);
    } catch (err) {
      console.error('Trip delete failed:', err);
      setDeleteError(err?.message || 'מחיקה נכשלה');
    } finally {
      setDeleteBusy(false);
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
            currentUid={user.uid}
            ownerProfiles={ownerProfiles}
            onOpenTrip={(id) => { setSelectedTripId(id); setActiveTab('flight'); setScreen('trip'); }}
            onCreateTrip={handleCreateTrip}
            onDeleteTrip={requestDeleteTrip}
            onShareTrip={(id) => setSharingTripId(id)}
            userName={user.displayName}
            onOpenGlobalChecklist={() => setShowGlobalChecklistModal(true)}
          />
        </main>

        {sharingTripId && (
          <ShareModal tripId={sharingTripId} currentUid={user.uid} onClose={() => setSharingTripId(null)} />
        )}

        <GlobalChecklistModal
          isOpen={showGlobalChecklistModal}
          onClose={() => setShowGlobalChecklistModal(false)}
          globalChecklist={globalChecklist}
          userId={user.uid}
        />

        <ConfirmModal
          isOpen={!!confirmDelete}
          title={confirmDelete?.mode === 'leave' ? 'יציאה מהטיול' : 'מחיקת טיול'}
          message={
            confirmDelete?.mode === 'leave' ? (
              <>
                האם לצאת מ-<strong>{confirmDelete?.name}</strong>?
                <br />
                הטיול לא יימחק — הוא פשוט יוסר מהרשימה שלך. רק הבעלים של הטיול יכול למחוק אותו לכולם.
                {deleteError && (
                  <><br /><span style={{ color: '#dc2626', fontSize: 12 }}>שגיאה: {deleteError}</span></>
                )}
              </>
            ) : (
              <>
                האם למחוק את <strong>{confirmDelete?.name}</strong> לצמיתות?
                <br />
                כל הנתונים — טיסות, מלון, תכנון, צ'קליסט — יימחקו לכל חברי הטיול ולא ניתן יהיה לשחזר אותם.
                {deleteError && (
                  <><br /><span style={{ color: '#dc2626', fontSize: 12 }}>שגיאה: {deleteError}</span></>
                )}
              </>
            )
          }
          confirmText={confirmDelete?.mode === 'leave' ? 'צא מהטיול' : 'מחק לצמיתות'}
          cancelText="בטל"
          onConfirm={handleConfirmDelete}
          onClose={() => { if (!deleteBusy) { setConfirmDelete(null); setDeleteError(''); } }}
          danger
          busy={deleteBusy}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {activeTab === 'flight' && ['owner', 'editor', 'member'].includes(selectedTrip?.members?.[user.uid]) && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('flight:openEdit'))}
              title="ערוך פרטי טיסה ומלון"
              style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'rgba(79,70,229,0.1)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--accent)'
              }}
            >
              <Pencil size={15} />
            </button>
          )}
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'rgba(11,11,48,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--primary)'
          }}>
            <Plane size={14} style={{ transform: 'rotate(-45deg)' }} />
          </div>
        </div>
      </header>

      <main className="app-content" key={activeTab}>
        <TripProvider value={{
          tripId: selectedTripId,
          role: selectedTrip?.members?.[user.uid] || null,
          canEdit: ['owner', 'editor', 'member'].includes(selectedTrip?.members?.[user.uid]),
          isOwner: selectedTrip?.members?.[user.uid] === 'owner',
          ownerProfile: (() => {
            const ownerUid = Object.keys(selectedTrip?.members || {}).find(uid => selectedTrip?.members?.[uid] === 'owner');
            return ownerUid && ownerUid !== user.uid ? ownerProfiles[ownerUid] : null;
          })(),
        }}>
          {activeTab === 'flight'    && <FlightTab tripId={selectedTripId} />}
          {activeTab === 'planning'  && <PlanningTab tripId={selectedTripId} />}
          {activeTab === 'checklist' && <ChecklistTab tripId={selectedTripId} />}
        </TripProvider>
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
