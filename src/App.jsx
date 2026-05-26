import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from './firebase';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  query, where, getDocs, updateDoc, arrayUnion, arrayRemove,
  getDoc, writeBatch
} from 'firebase/firestore';
import ConfirmModal from './components/ConfirmModal';
import ExportMenu from './components/ExportMenu';
import { TripProvider } from './TripContext';
import { defaultPraguePlans } from './components/PlanningTab';
import { defaultChecklist } from './components/ChecklistTab';
import FlightTab, { defaultTrip } from './components/FlightTab';
import { CustomDropdown } from './components/CustomDatePicker';
import PlanningTab from './components/PlanningTab';
import ChecklistTab from './components/ChecklistTab';
import InfoTab, { defaultInfoItems } from './components/InfoTab';
import ExpensesTab from './components/ExpensesTab';
import CurrencyConverter from './components/CurrencyConverter';
import {
  Plane, Compass, ClipboardList, MapPin, Calendar,
  ChevronLeft, LogOut, Plus, UserPlus, Trash2, Users, X, Pencil,
  Check, RotateCcw, ChevronDown, AlertCircle, Coins, Wallet
} from 'lucide-react';
import { useConfirm } from './ConfirmContext';
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
   STANDALONE CONVERTER SCREEN — opened from the manifest shortcut
   so the user can long-press the installed icon → "המרת מטבעות"
   and get straight to the converter without the app navigation.
   ══════════════════════════════════════════════════════════ */
function ConverterScreen() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'rgba(5, 150, 105, 0.12)', color: 'var(--text-success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <Coins size={18} />
          </div>
          <div>
            <h1 style={{ fontSize: 18 }}>המרת מטבעות</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginTop: 1 }}>
              עובד אופליין
            </p>
          </div>
        </div>
        <button
          onClick={() => { window.location.href = '/'; }}
          style={{
            background: 'rgba(11,11,48,0.05)', border: 'none',
            width: 34, height: 34, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--primary)'
          }}
          title="פתח את האפליקציה המלאה"
        >
          <Plane size={14} style={{ transform: 'rotate(-45deg)' }} />
        </button>
      </header>
      <main className="app-content" style={{ paddingBottom: 24 }}>
        <CurrencyConverter />
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   HOMEPAGE — Trip list
   ══════════════════════════════════════════════════════════ */
function Homepage({ trips, currentUid, memberProfiles, currentUserProfile, onOpenTrip, onCreateTrip, onDeleteTrip, onShareTrip, userName, onOpenGlobalChecklist }) {
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

      <div className="trip-list-grid">
      {trips.map(trip => {
        const myRole = trip.members?.[currentUid];
        const isOwner = myRole === 'owner';
        const memberEntries = Object.entries(trip.members || {}).filter(([, role]) => role);
        const ownerEntry = memberEntries.find(([, r]) => r === 'owner');
        const ownerUid = ownerEntry?.[0];
        const ownerProfile = ownerUid
          ? (ownerUid === currentUid ? currentUserProfile : memberProfiles?.[ownerUid])
          : null;
        // Avatar stack data — owner first, then others. Cap to 4 visible.
        const stackEntries = [
          ...(ownerEntry ? [ownerEntry] : []),
          ...memberEntries.filter(([uid, r]) => r !== 'owner').sort((a, b) => a[0].localeCompare(b[0])),
        ];
        const visibleStack = stackEntries.slice(0, 4);
        const overflowCount = stackEntries.length - visibleStack.length;
        const showStack = stackEntries.length > 1; // only when actually shared

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

            {showStack && (
              <div className="member-stack" title={`${stackEntries.length} חברים בטיול`}>
                {visibleStack.map(([uid, role]) => {
                  const profile = uid === currentUid ? currentUserProfile : memberProfiles?.[uid];
                  const isOwnerAvatar = role === 'owner';
                  const initial = (profile?.displayName || profile?.email || '?')[0];
                  return (
                    <div
                      key={uid}
                      className={`member-stack-avatar${isOwnerAvatar ? ' owner' : ''}`}
                      title={`${profile?.displayName || profile?.email || ''}${isOwnerAvatar ? ' · בעלים' : ''}`}
                    >
                      {profile?.photoURL ? (
                        <img src={profile.photoURL} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <span>{initial}</span>
                      )}
                      {isOwnerAvatar && (
                        <svg className="member-stack-crown" viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true">
                          <path d="M5 19h14l1-9-4 3-4-7-4 7-4-3z" />
                        </svg>
                      )}
                    </div>
                  );
                })}
                {overflowCount > 0 && (
                  <div className="member-stack-avatar more">+{overflowCount}</div>
                )}
              </div>
            )}
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
  const confirm = useConfirm();
  const [newItemText, setNewItemText] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('מסמכים וסידורים');
  const [editingItemId, setEditingItemId] = useState(null);
  const [collapsedCategories, setCollapsedCategories] = useState({});

  const defaultCategoryNames = [
    'מסמכים וסידורים',
    'בגדים',
    'אלקטרוניקה',
    'תרופות ועזרה ראשונה',
    'סידורים אחרונים בארץ'
  ];
  // Categories shown in the dropdown = defaults + any used by existing items.
  const categories = Array.from(new Set([
    ...defaultCategoryNames,
    ...(globalChecklist || []).map(i => i.category).filter(Boolean),
  ]));

  if (!isOpen) return null;

  const toggleCategory = (cat) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const isDirty = !!newItemText.trim();

  const attemptClose = async () => {
    if (isDirty || editingItemId) {
      const ok = await confirm({
        title: 'יש שינויים שלא נשמרו',
        message: 'הזנת טקסט בטופס שלא נשמר. האם לצאת בלי לשמור?',
        confirmText: 'צא בלי לשמור',
        cancelText: 'המשך עריכה',
        danger: true,
      });
      if (!ok) return;
    }
    setEditingItemId(null);
    setNewItemText('');
    setNewItemCategory('מסמכים וסידורים');
    onClose();
  };

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
    const item = globalChecklist.find(i => i.id === id);
    const ok = await confirm({
      title: 'מחיקת פריט קבוע',
      message: item?.text ? <>האם למחוק את <strong>{item.text}</strong> מהרשימה הקבועה?</> : 'האם למחוק את הפריט הזה?',
      confirmText: 'מחק',
      cancelText: 'בטל',
      danger: true,
    });
    if (!ok) return;
    const updatedList = globalChecklist.filter(item => item.id !== id);
    try {
      await updateDoc(doc(db, 'users', userId), { globalChecklist: updatedList });
    } catch (err) {
      console.error('Error deleting from global checklist:', err);
    }
  };

  const handleStartEdit = (item) => {
    setEditingItemId(item.id);
    setNewItemText(item.text);
    setNewItemCategory(item.category);
  };

  const handleCancelEdit = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: 'יש שינויים שלא נשמרו',
        message: 'הזנת טקסט שלא נשמר. האם לבטל את העריכה?',
        confirmText: 'בטל עריכה',
        cancelText: 'המשך עריכה',
        danger: true,
      });
      if (!ok) return;
    }
    setEditingItemId(null);
    setNewItemText('');
    setNewItemCategory('מסמכים וסידורים');
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: 'איפוס הרשימה הקבועה',
      message: 'כל הפריטים האישיים יימחקו ויוחלפו ברשימת ברירת המחדל. הפעולה לא תשפיע על טיולים קיימים.',
      confirmText: 'אפס לברירת מחדל',
      cancelText: 'בטל',
      danger: true,
    });
    if (!ok) return;
    try {
      await updateDoc(doc(db, 'users', userId), { globalChecklist: defaultChecklist });
    } catch (err) {
      console.error('Error resetting global checklist:', err);
    }
  };

  return (
    <div className="modal-overlay" onClick={attemptClose}>
      <div className="modal-content" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2>רשימת ציוד קבועה</h2>
          <button className="btn-close" onClick={attemptClose}>✕</button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.5, marginBottom: 12, flexShrink: 0 }}>
          נהל כאן את רשימת הציוד הקבועה שלך. פריטים אלו יועתקו אוטומטית לכל טיול חדש שתפתח, ותוכל להתאים אותם אישית לכל טיול בנפרד.
        </p>

        {/* Form Container — inputs share the same height as the trip checklist */}
        <form onSubmit={handleAdd} className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, flexShrink: 0, border: '1px solid rgba(79,70,229,0.15)' }}>
          <h4 style={{ fontSize: 15, fontWeight: 800, borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: 6, margin: 0 }}>
            {editingItemId ? 'עריכת פריט קבוע' : 'הוספת פריט קבוע חדש'}
          </h4>

          <div className="row-2" style={{ gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>מה להביא?</label>
              <input
                type="text"
                className="form-control"
                placeholder="למשל: רישיון נהיגה, כפכפים"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                required
              />
            </div>
            <CustomDropdown
              label="קטגוריה"
              value={newItemCategory}
              onChange={setNewItemCategory}
              options={categories}
              addable
              addLabel="הוסף קטגוריה חדשה"
            />
          </div>

          {editingItemId ? (
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="submit" className="btn-primary" style={{ flex: 1 }}>שמור שינויים</button>
              <button type="button" className="btn-secondary" onClick={handleCancelEdit}>ביטול</button>
            </div>
          ) : (
            <button type="submit" className="btn-primary" style={{ marginTop: 4, width: '100%' }}>
              <Plus size={18} />
              <span>הוסף פריט לרשימה</span>
            </button>
          )}
        </form>

        {/* Scrollable checklist items — uses the same .checklist-item-row layout as the trip tab */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {categories.map((category, catIdx) => {
            const categoryItems = globalChecklist.filter(item => item.category === category);
            if (categoryItems.length === 0) return null;
            const isCollapsed = !!collapsedCategories[category];

            return (
              <div key={catIdx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  style={{
                    background: 'transparent', border: 'none',
                    padding: '4px 4px', display: 'flex', alignItems: 'center', gap: 8,
                    cursor: 'pointer', width: '100%',
                    fontFamily: 'var(--font-hebrew)'
                  }}
                >
                  <ChevronDown
                    size={16}
                    style={{
                      color: 'var(--text-muted)',
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease', flexShrink: 0
                    }}
                  />
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.2px', textAlign: 'right', flex: 1, margin: 0 }}>
                    {category}
                  </h3>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
                    {categoryItems.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {categoryItems.map((item) => (
                      <div
                        key={item.id}
                        className="glass-card checklist-item-row"
                        style={{
                          padding: '12px 14px',
                          background: 'var(--card-bg)',
                          border: 'var(--card-border)',
                        }}
                      >
                        {/* RTL grid: text(right via flex) | actions(left) — no checkbox here (this is a template, not a tracked list) */}
                        <div />
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-main)', textAlign: 'right', wordBreak: 'break-word' }}>
                          {item.text}
                        </span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="ערוך"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            style={{ background: 'transparent', border: 'none', color: 'rgba(239, 68, 68, 0.6)', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="מחק"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {globalChecklist.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
              <p>הרשימה ריקה. הוסף פריטים או אפס לברירת המחדל.</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8, paddingBottom: 16 }}>
            <button
              onClick={handleReset}
              className="btn-secondary"
              style={{ fontSize: 13, padding: '10px 16px', gap: 6, color: 'var(--text-muted)', border: '1px dashed rgba(11, 11, 48, 0.15)' }}
            >
              <RotateCcw size={14} />
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
  const [memberProfiles, setMemberProfiles] = useState({}); // uid -> profile
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

        // Seed the info / emergency contacts subcollection with the
        // default emergency numbers + Israeli MFA / embassy placeholders.
        if (Array.isArray(defaultInfoItems)) {
          defaultInfoItems.forEach(item => {
            const itemRef = doc(db, 'trips', defaultTripId, 'info', item.id);
            batch.set(itemRef, {
              title: item.title,
              value: item.value || '',
              type: item.type,
              category: item.category,
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

  // Listen for trips where this user is a member. We always clear the
  // trips + cached profiles immediately when the user changes so a brief
  // stale render of the previous user's trips can't leak across accounts.
  // We also filter client-side as a defensive check that the current uid
  // really appears in members/memberIds.
  useEffect(() => {
    setTrips([]);
    setMemberProfiles({});
    if (!user) return;
    const uid = user.uid;
    const q = query(collection(db, 'trips'), where('memberIds', 'array-contains', uid));
    return onSnapshot(q, (snap) => {
      const filtered = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t =>
          (Array.isArray(t.memberIds) && t.memberIds.includes(uid)) ||
          (t.members && t.members[uid])
        );
      setTrips(filtered);
    }, (err) => {
      console.error('Trips listener error:', err);
    });
  }, [user]);

  // Pre-load profile docs for every trip owner so the homepage card can
  // show "טיול של ..." badges without lazy-loading per card.
  useEffect(() => {
    if (!user || trips.length === 0) return;
    const uids = new Set();
    for (const t of trips) {
      const members = t.members || {};
      for (const uid of Object.keys(members)) {
        if (uid !== user.uid) uids.add(uid);
      }
    }
    let cancelled = false;
    (async () => {
      const updates = {};
      await Promise.all([...uids].map(async (uid) => {
        if (memberProfiles[uid]) return;
        try {
          const u = await getDoc(doc(db, 'users', uid));
          if (u.exists()) updates[uid] = u.data();
        } catch { /* ignore */ }
      }));
      if (!cancelled && Object.keys(updates).length > 0) {
        setMemberProfiles(prev => ({ ...prev, ...updates }));
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
    // Seed the default info / emergency contacts subcollection
    if (Array.isArray(defaultInfoItems)) {
      defaultInfoItems.forEach(item => {
        const itemRef = doc(db, 'trips', tripId, 'info', item.id);
        batch.set(itemRef, {
          title: item.title,
          value: item.value || '',
          type: item.type,
          category: item.category,
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
      case 'info':      return 'מידע חשוב';
      case 'expenses':  return 'מעקב הוצאות';
      default:          return 'עוזר טיסות';
    }
  };

  const selectedTrip = trips.find(t => t.id === selectedTripId);

  // ── Loading ──
  if (loading) return <LoadingScreen />;

  // ── Standalone converter — opened from the manifest shortcut on the
  // installed app icon (long-press → "המרת מטבעות"). No auth required.
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('screen') === 'converter') {
    return <ConverterScreen />;
  }

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
            memberProfiles={memberProfiles}
            currentUserProfile={{ displayName: user.displayName, email: user.email, photoURL: user.photoURL }}
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
          {selectedTripId && selectedTrip && (
            <ExportMenu tripId={selectedTripId} trip={selectedTrip} activeTab={activeTab} />
          )}
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
            return ownerUid && ownerUid !== user.uid ? memberProfiles[ownerUid] : null;
          })(),
        }}>
          {activeTab === 'flight'    && <FlightTab tripId={selectedTripId} />}
          {activeTab === 'planning'  && <PlanningTab tripId={selectedTripId} />}
          {activeTab === 'checklist' && <ChecklistTab tripId={selectedTripId} />}
          {activeTab === 'info'      && <InfoTab tripId={selectedTripId} />}
          {activeTab === 'expenses'  && <ExpensesTab tripId={selectedTripId} />}
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
        <button onClick={() => setActiveTab('info')}      className={`nav-item ${activeTab === 'info' ? 'active' : ''}`}>
          <AlertCircle /><span className="nav-label">מידע חשוב</span>
        </button>
        <button onClick={() => setActiveTab('expenses')}  className={`nav-item ${activeTab === 'expenses' ? 'active' : ''}`}>
          <Wallet /><span className="nav-label">הוצאות</span>
        </button>
      </nav>
    </div>
  );
}
