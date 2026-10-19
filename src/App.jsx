import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { useAuth } from './AuthContext';
import { db } from './firebase';
import { listen } from './lib/listen';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  query, where, updateDoc, arrayUnion, arrayRemove,
  getDoc, writeBatch, deleteField, getDocsFromServer
} from 'firebase/firestore';
import { DELETE_DELAY_MS, useDeleteCode, validCode, checkCode, saveCode, pendingDelete, deleteAtText } from './lib/deleteCode';
import { TripProvider } from './TripContext';
import { ThemeProvider, useTheme } from './ThemeContext';
import useBackHandler, { installBackGuard } from './hooks/useBackHandler';
import { isNative, haptic } from './lib/platform';
import { isMorningTrip, tripPlace, morningAlerts } from './lib/morningAlerts';
import { widgetTrips, widgetSnapshot, offlineTrips } from './lib/widgetData';
import { loadWeather } from './hooks/useWeather';
import { NavIcon } from './ui/icons';
import { CustomDropdown } from './components/CustomDatePicker';
import { defaultChecklist, defaultInfoItems } from './data/seedData';

/* The five tabs are loaded on demand.
 *
 * Only one is ever on screen, but all five used to be parsed before the
 * first paint — PlanningTab alone is over 4,000 lines. The service worker
 * still precaches every chunk (`globPatterns` covers all built JS), so a
 * tab that was never opened online still opens offline; what changes is
 * how much JavaScript the phone has to compile before showing anything.
 *
 * Each lazy tab already sits inside a per-tab ErrorBoundary, so a chunk
 * that fails to arrive degrades to that tab's error card. */
const FlightTab    = lazy(() => import('./components/FlightTab'));
const PlanningTab  = lazy(() => import('./components/PlanningTab'));
const ChecklistTab = lazy(() => import('./components/ChecklistTab'));
const BookingsTab  = lazy(() => import('./components/BookingsTab'));
const ExpensesTab  = lazy(() => import('./components/ExpensesTab'));
// Android app only — never loaded on the web.
const AppSettingsSheet = lazy(() => import('./components/AppSettingsSheet'));
import ShareTargetScreen from './components/ShareTargetScreen';
import ErrorBoundary from './components/ErrorBoundary';
import EmptyState from './components/EmptyState';
import Sheet from './ui/Sheet';
import Notice from './ui/Notice';
import Skeleton from './components/Skeleton';
import { readSharedPlace, receiveSharedPlace, clearShareUrl, clearSharedPlace, cacheTripsForShare } from './services/shareTarget';
import {
  Plane, Calendar,
  ChevronLeft, LogOut, Plus, UserPlus, Trash2, Users, X, Pencil,
  Check, ChevronDown, ChevronUp,
  AlertTriangle, Moon, Sun, Pin, PinOff, ClipboardList, Settings, Download, WifiOff } from 'lucide-react';
import { useConfirm } from './ConfirmContext';

/* ══════════════════════════════════════════════════════════
   LOGIN SCREEN
   ══════════════════════════════════════════════════════════ */
function LoginScreen({ onSignIn }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Signing in is the one thing that needs the internet; after it, the app
  // works without it.
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // A version that cannot sign in must still reach the next one: the app
  // looks for an update here too, before sign-in.
  const [update, setUpdate] = useState(null);
  const [showUpdate, setShowUpdate] = useState(false);
  useEffect(() => {
    if (!isNative) return;
    import('./lib/updater').then(m => m.checkForUpdate())
      .then(r => { if (r?.available) setUpdate(r); })
      .catch(() => {});
  }, []);

  const handleSignIn = async () => {
    setBusy(true);
    setError('');
    try { await onSignIn(); }
    catch (e) {
      const msg = String(e?.message || e || '');
      // Closing Google's account sheet is a choice, not a failure.
      if (!/cancel|popup-closed/i.test(msg)) setError(msg || 'unknown');
    }
    finally { setBusy(false); }
  };

  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', gap: 32, padding: 32 }}>
      {update && !showUpdate && (
        <button type="button" className="update-banner" onClick={() => setShowUpdate(true)}
          style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', insetInline: 0 }}>
          <Download size={16} />
          <span>גרסה {update.latest.versionName} זמינה · הקישו לעדכון</span>
        </button>
      )}
      {showUpdate && (
        <ErrorBoundary label="הגדרות">
          <Suspense fallback={null}>
            <AppSettingsSheet initial={update} onClose={() => { setShowUpdate(false); setUpdate(null); }} />
          </Suspense>
        </ErrorBoundary>
      )}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: 'var(--brand)', color: 'var(--brand-fg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', boxShadow: 'var(--shadow-md)'
        }}>
          <Plane size={36} style={{ transform: 'rotate(-45deg)' }} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--primary)', marginBottom: 8 }}>
          עוזר טיסות
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.5 }}>
          תכנון טיולים, מעקב טיסות,<br />וצ'קליסט ציוד — הכל במקום אחד
        </p>
      </div>

      {!online && (
        <Notice tone="offline">כניסה לחשבון דורשת חיבור לאינטרנט. אחרי הכניסה האפליקציה עובדת גם בלי חיבור.</Notice>
      )}
      <button type="button" className="google-btn" onClick={handleSignIn} disabled={busy || !online}>
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        {busy ? 'מתחבר...' : 'התחבר עם Google'}
      </button>
      {error && (
        <p role="alert" className="login-error">
          {/no credential/i.test(error)
            ? 'אין חשבון Google בטלפון. הוסיפו חשבון בהגדרות הטלפון ונסו שוב.'
            : /network/i.test(error)
              ? 'אין חיבור לאינטרנט. נסו שוב כשיש חיבור.'
              : 'הכניסה עם Google נכשלה. נסו שוב.'}
          <span dir="ltr">{error}</span>
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   LOADING SCREEN
   ══════════════════════════════════════════════════════════ */
function LoadingScreen({ slow }) {
  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <div className="pulsing-dot" style={{ width: 14, height: 14 }} />
      <p style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 15 }}>{slow ? 'מתחבר… החיבור איטי' : 'טוען...'}</p>
      {slow && <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>הטיולים שלך שמורים בטלפון ויופיעו בעוד רגע</p>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   HOMEPAGE — Trip list
   ══════════════════════════════════════════════════════════ */
/* A trip whose delete is on its way: when, and for the owner, a way back. */
function DeleteNotice({ at, onCancel, banner }) {
  return (
    <div className={`delete-notice${banner ? ' banner' : ''}`} role="status" onClick={e => e.stopPropagation()}>
      <AlertTriangle size={16} aria-hidden="true" />
      <span className="delete-notice-text">יימחק ב־{deleteAtText(at)}</span>
      {onCancel && <button type="button" className="delete-notice-undo" onClick={onCancel}>בטל מחיקה</button>}
    </div>
  );
}

function Homepage({ trips, currentUid, memberProfiles, currentUserProfile, onOpenTrip, onCreateTrip, onDeleteTrip, onCancelDelete, onShareTrip, userName, onOpenGlobalChecklist, pinnedTripId, onTogglePinned }) {
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

      {/* A pastel feature card (Payments-2026), same place and action. */}
      <button
        onClick={onOpenGlobalChecklist}
        className="press-card"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          border: 'none',
          background: 'var(--brand-soft)',
          color: 'var(--text)',
          borderRadius: 22,
          padding: '14px 16px',
          fontFamily: 'inherit',
          fontSize: 15,
          fontWeight: 800,
          textAlign: 'right',
          cursor: 'pointer',
          marginTop: -4,
        }}
      >
        <span style={{ width: 40, height: 40, borderRadius: 14, background: 'var(--card-bg-solid)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <NavIcon name="checklist" active size={24} />
        </span>
        <span style={{ flex: 1 }}>ניהול רשימת ציוד קבועה</span>
        <ChevronLeft size={18} style={{ color: 'var(--text-muted)' }} />
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span className="homepage-section-title" style={{ margin: 0 }}>טיולים מתוכננים</span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          aria-label={showCreate ? 'סגור טופס טיול חדש' : 'טיול חדש'}
          aria-expanded={showCreate}
          className="btn-primary"
          style={{ width: 44, height: 44, minHeight: 0, padding: 0, borderRadius: '50%' }}
        >
          <Plus size={20} strokeWidth={3} />
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
        <EmptyState
          icon={Plane}
          title="עוד אין טיולים"
          hint="טיול מחזיק את הטיסות, המקומות, רשימת הציוד וההוצאות במקום אחד."
          action={
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus size={16} /><span>צור טיול ראשון</span>
            </button>
          }
        />
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
          ...memberEntries.filter(([, r]) => r !== 'owner').sort((a, b) => a[0].localeCompare(b[0])),
        ];
        const visibleStack = stackEntries.slice(0, 4);
        const overflowCount = stackEntries.length - visibleStack.length;
        const showStack = stackEntries.length > 1; // only when actually shared

        return (
        <div className="trip-card" key={trip.id} onClick={() => onOpenTrip(trip.id)}>
          <div className="trip-card-header">
            <div className="trip-card-icon">
              <NavIcon name="flight" active size={32} />
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
              padding: '7px 12px', background: 'var(--lavender)',
              borderRadius: 999, alignSelf: 'flex-start'
            }}>
              {ownerProfile.photoURL ? (
                <img src={ownerProfile.photoURL} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} referrerPolicy="no-referrer" />
              ) : (
                <Users size={14} />
              )}
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                טיול של {ownerProfile.displayName || ownerProfile.email || ''}
                {' · '}
                {myRole === 'viewer' ? 'צפייה' : 'עריכה'}
              </span>
            </div>
          )}

          {(trip.dates || pinnedTripId === trip.id) && (
            <div className="trip-card-meta">
              {pinnedTripId === trip.id && (
                <span className="trip-card-badge" style={{ background: 'var(--butter)' }}>
                  <Pin size={13} />נפתח אוטומטית
                </span>
              )}
              {trip.dates && <span className="trip-card-badge"><Calendar size={13} />{trip.dates}</span>}
            </div>
          )}

          {pendingDelete(trip) && (
            <DeleteNotice at={trip.deleteAt} onCancel={isOwner ? () => onCancelDelete(trip.id) : null} />
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <div className="trip-card-arrow">
              <span>פתח טיול</span>
              <ChevronLeft size={16} />
            </div>
            <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onTogglePinned(trip.id)}
                className={`round-btn ${pinnedTripId === trip.id ? 'on' : 'butter'}`}
                title={pinnedTripId === trip.id ? 'בטל טיול נוכחי' : 'קבע כטיול הנוכחי'}
                aria-pressed={pinnedTripId === trip.id}
              >
                {pinnedTripId === trip.id ? <Pin size={15} /> : <PinOff size={15} />}
              </button>
              <button
                onClick={() => onShareTrip(trip.id)}
                className="round-btn lavender"
                title={isOwner ? 'שתף וניהול חברים' : 'הצג חברי טיול'}
              >
                <UserPlus size={15} />
              </button>
              {!(isOwner && pendingDelete(trip)) && (
              <button
                onClick={() => onDeleteTrip(trip.id, isOwner)}
                className="round-btn danger"
                title={isOwner ? 'מחק טיול' : 'צא מהטיול'}
              >
                <Trash2 size={15} />
              </button>
              )}
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
  const confirm = useConfirm();
  const [trip, setTrip] = useState(null);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState('viewer'); // viewer | editor
  const [status, setStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Live-listen to the trip so members list refreshes when roles change
  useEffect(() => {
    if (!tripId) return;
    return listen(doc(db, 'trips', tripId), (snap) => {
      if (!snap.exists()) { setTrip(null); return; }
      setTrip(snap.data());
    });
  }, [tripId]);

  // Each member's profile (displayName/email), live: from the phone offline,
  // and filled in once the connection returns.
  const [profiles, setProfiles] = useState({});
  const uidsKey = Object.keys(trip?.members || {}).sort().join(',');
  useEffect(() => {
    if (!uidsKey) return;
    const unsubs = uidsKey.split(',').map(uid => onSnapshot(doc(db, 'users', uid),
      (snap) => setProfiles(prev => ({ ...prev, [uid]: snap.exists() ? snap.data() : null })),
      () => {}));
    return () => unsubs.forEach(u => u());
  }, [uidsKey]);
  const members = useMemo(() => Object.entries(trip?.members || {})
    .filter(([, role]) => role)
    .map(([uid, role]) => ({ uid, role, profile: profiles[uid] ?? null })), [trip, profiles]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    // Finding the user needs the server: offline, the phone's copy said
    // "no such user" for anyone it had not seen.
    if (!navigator.onLine) { setStatus('offline'); return; }
    setStatus('searching');
    setErrorMsg('');

    try {
      const q = query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()));
      const snap = await getDocsFromServer(q);

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
      // Not awaited: if the connection drops now, the add waits on the phone.
      updateDoc(tripRef, {
        [`members.${targetUid}`]: newRole,
        memberIds: arrayUnion(targetUid),
      }).catch(err => { setStatus('error'); setErrorMsg(err?.message || 'Unknown error'); });

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
    const who = members.find(m => m.uid === uid);
    const name = who?.profile?.displayName || who?.profile?.email || 'החבר';
    const ok = await confirm({
      title: 'הסרה מהטיול',
      message: `להסיר את ${name} מהטיול? מה שהוסיף נשאר בטיול.`,
      confirmText: 'הסר', cancelText: 'בטל', danger: true,
    });
    if (!ok) return;
    try {
      const gone = members.find(m => m.uid === uid);
      // Only this uid's key: rewriting the whole map from the state would
      // drop anyone added meanwhile from `members` (left in memberIds, no role).
      await updateDoc(doc(db, 'trips', tripId), {
        [`members.${uid}`]: deleteField(),
        memberIds: arrayRemove(uid),
        // Nothing they added is deleted — the content belongs to the trip,
        // not to the person. But once the uid leaves `members` their
        // profile is never fetched again, so every expense they paid and
        // every item assigned to them would go nameless. Keep a snapshot.
        [`formerMembers.${uid}`]: {
          displayName: gone?.profile?.displayName || '',
          email: gone?.profile?.email || '',
          photoURL: gone?.profile?.photoURL || '',
          leftAt: new Date().toISOString(),
        },
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
    <Sheet title="שיתוף וניהול חברי הטיול" onClose={onClose} style={{ maxHeight: '90%' }}>

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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, background: 'var(--surface-2)', padding: 4, borderRadius: 16 }}>
                {[
                  { val: 'viewer', label: 'צפייה בלבד', desc: 'יראה את הטיול אבל לא יוכל לערוך' },
                  { val: 'editor', label: 'עריכה', desc: 'יוכל לערוך טיסות, מלון, תכנון וצ\'קליסט' },
                ].map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setNewRole(opt.val)}
                    style={{
                      border: 'none', borderRadius: 12, padding: '10px 12px',
                      fontFamily: 'var(--font-hebrew)',
                      background: newRole === opt.val ? 'var(--card-bg-solid)' : 'transparent',
                      color: newRole === opt.val ? 'var(--text)' : 'var(--text-muted)',
                      boxShadow: newRole === opt.val ? 'var(--shadow-sm)' : 'none',
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

            {status === 'success' && <Notice tone="success">נוסף בהצלחה.</Notice>}
            {status === 'offline' && <Notice tone="offline">שיתוף דורש חיבור לאינטרנט, כדי למצוא את המשתמש. נסו שוב כשיש חיבור.</Notice>}
            {status === 'not-found' && <Notice tone="error">אין משתמש רשום עם האימייל הזה.</Notice>}
            {status === 'self' && <Notice tone="error">אי אפשר לשתף את עצמך.</Notice>}
            {status === 'already' && <Notice tone="info">המשתמש כבר חבר בטיול.</Notice>}
            {status === 'error' && (
              <Notice tone="error">
                שגיאה.{errorMsg && <><br /><span style={{ fontWeight: 600, fontSize: 11 }} dir="ltr">{errorMsg}</span></>}
              </Notice>
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
                  background: 'var(--ink-3)',
                  border: '1px solid var(--ink-6)',
                  borderRadius: 12,
                }}
              >
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="" style={{ width: 34, height: 34, borderRadius: '50%' }} referrerPolicy="no-referrer" />
                ) : (
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: 'var(--brand)', color: 'var(--brand-fg)',
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
                        background: 'var(--c-red-8)', border: 'none',
                        color: 'var(--c-red)', borderRadius: 8, width: 32, height: 32,
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
    </Sheet>
  );
}

/* ══════════════════════════════════════════════════════════
   GLOBAL CHECKLIST MODAL
   ══════════════════════════════════════════════════════════ */
function GlobalChecklistModal({ isOpen, onClose, globalChecklist, extraCategories = [], userId }) {
  const confirm = useConfirm();
  const [newItemText, setNewItemText] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('מסמכים וסידורים');
  const [editingItemId, setEditingItemId] = useState(null);
  const [openCategories, setOpenCategories] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [quickAddCat, setQuickAddCat] = useState(null);
  const [quickAddText, setQuickAddText] = useState('');
  const quickAddInputRef = useRef(null);
  const [longPressedCat, setLongPressedCat] = useState(null);
  const longPressTimer = useRef(null);
  const longPressActive = useRef(false);
  const [editingCat, setEditingCat] = useState(null);
  const [editCatText, setEditCatText] = useState('');

  const defaultCategoryNames = [
    'מסמכים וסידורים',
    'בגדים',
    'אלקטרוניקה',
    'תרופות ועזרה ראשונה',
    'סידורים אחרונים בארץ'
  ];
  const categories = Array.from(new Set([
    ...defaultCategoryNames,
    ...extraCategories,
    ...(globalChecklist || []).map(i => i.category).filter(Boolean),
  ]));

  const duplicateSuggestions = useMemo(() => {
    if (!newItemText.trim() || newItemText.trim().length < 2) return [];
    const q = newItemText.toLowerCase();
    return (globalChecklist || []).filter(i => i.id !== editingItemId && i.text.toLowerCase().includes(q));
  }, [globalChecklist, newItemText, editingItemId]);

  if (!isOpen) return null;

  const toggleCategory = (cat) =>
    setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  const startLongPress = (cat) => {
    longPressActive.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressActive.current = true;
      setLongPressedCat(cat);
    }, 550);
  };
  const cancelLongPress = () => clearTimeout(longPressTimer.current);

  const saveExtraCategory = async (cat) => {
    if (!cat || !userId || extraCategories.includes(cat)) return;
    // Opens at once; the write is not awaited (offline it waits on the phone),
    // and adds just this one (another phone of the user may add one too).
    setOpenCategories(prev => ({ ...prev, [cat]: true }));
    setDoc(doc(db, 'users', userId), { globalExtraCategories: arrayUnion(cat) }, { merge: true })
      .catch(err => console.error('Error saving extra category:', err));
  };

  const handleDeleteCategory = async (cat) => {
    const catItems = (globalChecklist || []).filter(i => i.category === cat);
    const ok = await confirm({
      title: 'מחיקת קטגוריה',
      message: catItems.length > 0
        ? `האם למחוק את "${cat}" ואת ${catItems.length} הפריטים שבה?`
        : `האם למחוק את הקטגוריה "${cat}"?`,
      confirmText: 'מחק', cancelText: 'בטל', danger: true,
    });
    setLongPressedCat(null);
    if (!ok) return;
    const updatedList = (globalChecklist || []).filter(i => i.category !== cat);
    updateDoc(doc(db, 'users', userId), {
      globalChecklist: updatedList,
      globalExtraCategories: arrayRemove(cat),
    }).catch(err => console.error('Error deleting category:', err));
  };

  const handleRenameCategory = (oldCat, newCat) => {
    const trimmed = newCat.trim();
    setEditingCat(null);
    if (!trimmed || trimmed === oldCat) return;
    const updatedList = (globalChecklist || []).map(item =>
      item.category === oldCat ? { ...item, category: trimmed } : item
    );
    updateDoc(doc(db, 'users', userId), { globalChecklist: updatedList })
      .catch(err => console.error('Error renaming category:', err));
  };

  const isDirty = !!newItemText.trim();

  // Closing drops a half-typed item; the sheet asks first while there is one.
  const closeSheet = () => {
    setEditingItemId(null);
    setNewItemText('');
    setNewItemCategory('מסמכים וסידורים');
    onClose();
  };

  const doAdd = (overrideCategory) => {
    const text = newItemText.trim();
    if (!text || !userId) return;
    const cat = overrideCategory !== undefined ? overrideCategory : newItemCategory;
    let updatedList;
    if (editingItemId) {
      updatedList = globalChecklist.map(item =>
        item.id === editingItemId ? { ...item, text, category: cat } : item
      );
      setEditingItemId(null);
    } else {
      updatedList = [...globalChecklist, { id: 'global-' + Date.now(), text, completed: false, category: cat }];
    }
    setNewItemText('');
    updateDoc(doc(db, 'users', userId), { globalChecklist: updatedList })
      .catch(err => console.error('Error updating global checklist:', err));
  };

  const handleAdd = (e) => {
    e.preventDefault();
    doAdd();
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
    updateDoc(doc(db, 'users', userId), { globalChecklist: updatedList })
      .catch(err => console.error('Error deleting from global checklist:', err));
  };

  const handleStartEdit = (item) => {
    setEditingItemId(item.id);
    setNewItemText(item.text);
    setNewItemCategory(item.category);
    setShowAddForm(true);
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

  const handleQuickAdd = (e, cat) => {
    e.preventDefault();
    if (!quickAddText.trim() || !userId) return;
    const updatedList = [
      ...globalChecklist,
      { id: 'global-' + Date.now(), text: quickAddText.trim(), completed: false, category: cat },
    ];
    setQuickAddText('');
    setQuickAddCat(null);
    updateDoc(doc(db, 'users', userId), { globalChecklist: updatedList })
      .catch(err => console.error('Error adding to global checklist:', err));
  };

  return (
    <Sheet title="רשימת ציוד קבועה" onClose={closeSheet} dirty={isDirty || !!editingItemId} style={{ maxHeight: '90vh' }}>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.5, marginBottom: 12, flexShrink: 0 }}>
          נהל כאן את רשימת הציוד הקבועה שלך. פריטים אלו יועתקו אוטומטית לכל טיול חדש שתפתח, ותוכל להתאים אותם אישית לכל טיול בנפרד.
        </p>

        {/* Form Container — collapsible */}
        <div className="glass-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 16, flexShrink: 0, border: '1px solid var(--p-15)' }}>
          <button
            type="button"
            onClick={() => setShowAddForm(s => !s)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', width: '100%', padding: 0 }}
          >
            {showAddForm
              ? <ChevronUp size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              : <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)', flex: 1, textAlign: 'right' }}>
              {editingItemId ? 'עריכת פריט קבוע' : 'הוספת פריט קבוע חדש'}
            </span>
            {!showAddForm && <Plus size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
          </button>

          {showAddForm && (
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--ink-6)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                  {duplicateSuggestions.length > 0 && (
                    <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 10, background: 'var(--butter)', border: 'none', direction: 'rtl' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>פריטים דומים ברשימה הקבועה:</span>
                      {duplicateSuggestions.slice(0, 4).map(s => (
                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 13, color: 'var(--text-main)' }}>
                          <span style={{ flex: 1, textAlign: 'right' }}>{s.text}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 8, flexShrink: 0 }}>{s.category}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <CustomDropdown
                  label="קטגוריה"
                  value={newItemCategory}
                  onChange={setNewItemCategory}
                  options={categories}
                  addable
                  addLabel="הוסף קטגוריה חדשה"
                  onCommit={(cat) => saveExtraCategory(cat)}
                />
              </div>

              {editingItemId ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>שמור</button>
                  <button type="button" className="btn-secondary" onClick={handleCancelEdit}>ביטול</button>
                </div>
              ) : (
                <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                  <Plus size={18} />
                  <span>הוסף פריט לרשימה</span>
                </button>
              )}
            </form>
          )}
        </div>

        {/* Scrollable checklist items — all categories closed by default */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {categories.map((category, catIdx) => {
            const categoryItems = globalChecklist.filter(item => item.category === category);
            if (categoryItems.length === 0 && !extraCategories.includes(category)) return null;
            const isOpen = !!openCategories[category];

            return (
              <div key={catIdx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Category header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {editingCat === category ? (
                    <form onSubmit={e => { e.preventDefault(); handleRenameCategory(category, editCatText); }}
                      style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text" autoFocus className="form-control"
                        value={editCatText} onChange={e => setEditCatText(e.target.value)}
                        style={{ flex: 1, minHeight: 34, fontSize: 13 }}
                      />
                      <button type="submit" className="round-btn on" aria-label="שמור" title="שמור">
                        <Check size={16} />
                      </button>
                      <button type="button" className="btn-x" aria-label="ביטול" title="ביטול" onClick={() => setEditingCat(null)}>
                        <X size={16} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (longPressActive.current) { longPressActive.current = false; return; }
                          toggleCategory(category);
                        }}
                        onMouseDown={() => startLongPress(category)}
                        onMouseUp={cancelLongPress}
                        onTouchStart={e => { e.stopPropagation(); startLongPress(category); }}
                        onTouchEnd={cancelLongPress}
                        onTouchMove={cancelLongPress}
                        style={{
                          flex: 1, background: 'transparent', border: 'none',
                          padding: '4px 4px', display: 'flex', alignItems: 'center', gap: 8,
                          cursor: 'pointer', fontFamily: 'var(--font-hebrew)'
                        }}
                      >
                        <ChevronDown
                          size={16}
                          style={{
                            color: 'var(--text-muted)',
                            transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
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

                      {longPressedCat === category && (
                        <>
                          <button type="button"
                            onClick={() => { setEditingCat(category); setEditCatText(category); setLongPressedCat(null); }}
                            style={{ padding: 6, borderRadius: 8, border: 'none', background: 'var(--p-10)', color: 'var(--accent)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={() => handleDeleteCategory(category)}
                            style={{ padding: 6, borderRadius: 8, border: 'none', background: 'var(--c-red2-10)', color: 'var(--c-red)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                            <Trash2 size={13} />
                          </button>
                          <button type="button" className="btn-x" aria-label="סגור" title="סגור" onClick={() => setLongPressedCat(null)}>
                            <X size={16} />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>

                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {categoryItems.map((item) => (
                      <div
                        key={item.id}
                        className="glass-card checklist-item-row"
                        style={{ padding: '12px 14px', background: 'var(--card-bg)', border: 'var(--card-border)' }}
                      >
                        <div />
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-main)', textAlign: 'right', wordBreak: 'break-word' }}>
                          {item.text}
                        </span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--c-red)', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Quick-add at bottom of open category */}
                    {quickAddCat === category ? (
                      <form onSubmit={e => handleQuickAdd(e, category)}
                        style={{ display: 'flex', gap: 6, padding: '2px 0' }}>
                        <input
                          ref={quickAddInputRef}
                          type="text"
                          className="form-control"
                          autoFocus
                          placeholder={`פריט ב${category}...`}
                          value={quickAddText}
                          onChange={e => setQuickAddText(e.target.value)}
                          style={{ flex: 1, minHeight: 38, fontSize: 13 }}
                        />
                        <button type="submit" className="round-btn on" aria-label="הוסף" title="הוסף">
                          <Plus size={16} />
                        </button>
                        <button type="button" className="btn-x" aria-label="ביטול" title="ביטול" onClick={() => { setQuickAddCat(null); setQuickAddText(''); }}>
                          <X size={16} />
                        </button>
                      </form>
                    ) : (
                      <button type="button"
                        onClick={() => { setQuickAddCat(category); setQuickAddText(''); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10, border: '1px dashed var(--p-22)', background: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, alignSelf: 'flex-start' }}>
                        <Plus size={14} />
                        הוסף לרשימה
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {globalChecklist.length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title="הרשימה הקבועה ריקה"
              hint="מה שתוסיפו כאן יופיע בצ'קליסט של כל טיול חדש."
            />
          )}
        </div>
    </Sheet>
  );
}


/* ══════════════════════════════════════════════════════════
   MAIN APP
   ══════════════════════════════════════════════════════════ */
export default function App() {
  return <ThemeProvider><AppInner /></ThemeProvider>;
}

/* Light/dark switch — replaces the palette picker in both headers. The
   choice is remembered on the device (ThemeContext). */
function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? 'עבור למצב בהיר' : 'עבור למצב כהה';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      onClick={toggleTheme}
      className="theme-toggle"
    >
      <span className="theme-toggle-knob" aria-hidden="true">
        {isDark ? <Moon size={14} /> : <Sun size={14} />}
      </span>
    </button>
  );
}

/* The five tabs, in nav order. Kept in one place so the travelling
   indicator's index and the buttons can never drift apart. */
// `key` is also the NavIcon name (src/ui/icons.jsx).
const NAV_TABS = [
  { key: 'flight',    label: 'טיסה ומלון' },
  { key: 'planning',  label: 'תכנון טיול' },
  { key: 'checklist', label: "צ'קליסט" },
  { key: 'bookings',  label: 'הזמנות' },
  { key: 'expenses',  label: 'הוצאות' },
];

// A short tick on tab change: the haptics engine in the app, vibrate where
// the browser offers it (Android, desktop Chrome; iOS Safari ignores it).
function tick(ms = 8) {
  if (isNative) { haptic('tap'); return; }
  try { navigator.vibrate?.(ms); } catch { /* not supported — no feedback */ }
}

function AppInner() {
  const { user, loading, slow, signInWithGoogle, signOut } = useAuth();
  const confirm = useConfirm();
  const [screen, setScreen] = useState('home'); // 'home' | 'trip'
  const [activeTab, setActiveTab] = useState('flight');
  const [selectedTripId, setSelectedTripId] = useState(null);
  // Every trip the user is on; `trips` leaves out those whose delete is
  // due (the owner's app is deleting them), so nothing shows them.
  const [allTrips, setAllTrips] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const trips = useMemo(() => allTrips.filter(t => !(pendingDelete(t) && t.deleteAt <= now)), [allTrips, now]);
  const [memberProfiles, setMemberProfiles] = useState({}); // uid -> profile
  const [sharingTripId, setSharingTripId] = useState(null);
  const [globalChecklist, setGlobalChecklist] = useState([]);
  const hasOwnChecklist = useRef(false);   // the profile has a globalChecklist (else the default)
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  // Offline work lives in the browser's database (IndexedDB). Without it
  // (private browsing, storage blocked) Firestore silently keeps changes in
  // memory only, and they are gone when the page closes: say so.
  const [storageOk, setStorageOk] = useState(() => typeof indexedDB !== 'undefined');
  useEffect(() => {
    try {
      const req = indexedDB.open('storage-probe');
      req.onsuccess = () => { req.result.close(); };
      req.onerror = () => setStorageOk(false);
    } catch { queueMicrotask(() => setStorageOk(false)); }
    // Ask the browser not to clear the app's data when space runs low.
    navigator.storage?.persist?.().catch(() => {});
  }, []);
  // ── Share target (Google Maps → share → this app) ──
  // Read once, on the very first render, before anything can rewrite the URL.
  const [sharedPlace, setSharedPlace] = useState(() => readSharedPlace());
  // Trip chosen in the picker while signed out — replayed after sign-in.
  const [pendingTripPick, setPendingTripPick] = useState(null);
  // Handed to PlanningTab, which opens the add-place form pre-filled with it.
  const [pendingSharedPlace, setPendingSharedPlace] = useState(null);
  // Header elevation + "scroll to top" both need the scrolling element.
  const contentRef = useRef(null);
  const [contentScrolled, setContentScrolled] = useState(false);
  // The trip the app opens into. Kept on the device rather than in
  // Firestore: it is a "this phone opens here" preference, and reading it
  // from localStorage means the app can jump straight in on a cold start,
  // without waiting for the trips query.
  const [pinnedTripId, setPinnedTripId] = useState(null);
  // Auto-open happens once per session — otherwise going back to the trip
  // list would immediately bounce you into the trip again.
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  const [globalExtraCategories, setGlobalExtraCategories] = useState([]);
  const [showGlobalChecklistModal, setShowGlobalChecklistModal] = useState(false);
  // Android app: settings sheet ("check for updates"), and a newer release
  // found by the quiet check on launch.
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);

  const signedInUid = user?.uid;

  // Flight reminders (Android app): reschedule whenever the trips change —
  // a moved flight moves its reminders. The first time there is one to
  // schedule, ask for the notification permission, once.
  const [notifyVersion, setNotifyVersion] = useState(0);
  useEffect(() => {
    if (!isNative || !signedInUid) return;
    let cancelled = false;
    Promise.all([import('./lib/native/notify'), import('./lib/flightAlerts')]).then(async ([n, f]) => {
      const alerts = f.flightAlerts(trips);
      if (cancelled) return;
      if (alerts.length && n.notifyPrefs().flight) await n.askPermissionOnce();
      await n.syncNotifications('flight', alerts);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [trips, signedInUid, notifyVersion]);

  // Reminders with a time (Android app): listen to every trip's reminders
  // and keep the owner's notifications in step — added, moved, ticked off.
  const tripsRef = useRef(trips);
  useEffect(() => { tripsRef.current = trips; }, [trips]);
  const tripIdsKey = trips.map(t => t.id).sort().join(',');
  useEffect(() => {
    if (!isNative || !signedInUid || !tripIdsKey) return undefined;
    const byTrip = {};
    let timer;
    const sync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        Promise.all([import('./lib/native/notify'), import('./lib/reminderAlerts')]).then(async ([n, r]) => {
          const alerts = r.reminderAlerts(tripsRef.current, byTrip, signedInUid);
          if (alerts.length && n.notifyPrefs().reminder) await n.askPermissionOnce();
          await n.syncNotifications('reminder', alerts);
        }).catch(() => {});
      }, 400);
    };
    const offs = tripIdsKey.split(',').map(id => listen(
      collection(db, 'trips', id, 'reminders'),
      (snap) => { byTrip[id] = snap.docs.map(d => ({ id: d.id, ...d.data() })); sync(); },
      () => {},
    ));
    return () => { offs.forEach(off => off()); clearTimeout(timer); };
  }, [tripIdsKey, signedInUid, notifyVersion]);

  // Bookings (Android app): listen to every trip's bookings and notify each
  // member at the time they picked, on the booking's day or the day before.
  useEffect(() => {
    if (!isNative || !signedInUid || !tripIdsKey) return undefined;
    const byTrip = {};
    let timer;
    const sync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        Promise.all([import('./lib/native/notify'), import('./lib/bookingAlerts')]).then(async ([n, b]) => {
          const list = tripsRef.current.filter(t => !pendingDelete(t));
          const alerts = b.bookingAlerts(list, byTrip, n.bookingTime(), n.bookingDay());
          if (alerts.length && n.notifyPrefs().booking) await n.askPermissionOnce();
          await n.syncNotifications('booking', alerts);
        }).catch(() => {});
      }, 400);
    };
    const offs = tripIdsKey.split(',').map(id => listen(
      collection(db, 'trips', id, 'bookings'),
      (snap) => { byTrip[id] = snap.docs.map(d => ({ id: d.id, ...d.data() })); sync(); },
      () => {},
    ));
    return () => { offs.forEach(off => off()); clearTimeout(timer); };
  }, [tripIdsKey, signedInUid, notifyVersion]);

  // Morning summary (Android app): for the trips with a day in the coming
  // week, listen to their planner days and schedule each morning with that
  // day's plan and the forecast at scheduling time. The key carries the
  // dates and name, so a moved flight or a renamed trip schedules again.
  const morningKey = trips
    .filter(t => !pendingDelete(t) && isMorningTrip(t))
    .map(t => [t.id, t.outboundFlightDetails?.date, t.returnFlightDetails?.date, t.name].join('|'))
    .sort().join(',');
  useEffect(() => {
    if (!isNative || !signedInUid) return undefined;
    const ids = morningKey ? morningKey.split(',').map(k => k.split('|')[0]) : [];
    const daysByTrip = {};
    let timer;
    let cancelled = false;
    const sync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        import('./lib/native/notify').then(async (n) => {
          const on = n.notifyPrefs().morning;
          const list = tripsRef.current.filter(t => ids.includes(t.id));
          const weather = {};
          if (on) {
            await Promise.all(list.map(async (t) => {
              const p = tripPlace(t);
              if (p) weather[t.id] = await loadWeather(p.lat, p.lng);
            }));
          }
          if (cancelled) return;
          const alerts = morningAlerts(list, daysByTrip, weather, n.morningTime());
          if (alerts.length && on) await n.askPermissionOnce();
          await n.syncNotifications('morning', alerts);
        }).catch(() => {});
      }, 400);
    };
    const offs = ids.map(id => listen(
      collection(db, 'trips', id, 'days'),
      (snap) => { daysByTrip[id] = snap.docs.map(d => ({ id: d.id, ...d.data() })); sync(); },
      () => {},
    ));
    if (!ids.length) sync();   // nothing ahead: cancel what was scheduled
    return () => { cancelled = true; offs.forEach(off => off()); clearTimeout(timer); };
  }, [morningKey, signedInUid, notifyVersion]);

  // Home screen widget (Android app): the current or next trips, their
  // planner days, packing and reminders, saved for the widget whenever any
  // of it changes (widgetData.js). Signed out, the widget says so.
  const { palette, mode: themeMode } = useTheme();
  const widgetKey = widgetTrips(trips).map(t => t.id).join(',');
  const widgetSync = useRef(null);
  useEffect(() => {
    if (!isNative || loading) return undefined;
    if (!signedInUid) { import('./lib/native/widget').then(w => w.saveWidget(null)).catch(() => {}); return undefined; }
    const ids = widgetKey ? widgetKey.split(',') : [];
    const data = { days: {}, checklist: {}, reminders: {}, expenses: {}, planning: {} };
    let timer;
    const sync = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const current = document.documentElement.getAttribute('data-palette') || 'green';
        // Light or dark as the app is set (ThemeContext), not the phone.
        let theme = 'system';
        try { theme = localStorage.getItem('theme') || 'system'; } catch { /* private mode */ }
        // The expense widget values a foreign expense in shekels at these.
        const rates = await import('./services/currency').then(c => c.refreshRatesIfStale()).then(r => r?.rates).catch(() => null);
        import('./lib/native/widget').then(w => w.saveWidget(widgetSnapshot({
          trips: tripsRef.current,
          daysByTrip: data.days, checklistByTrip: data.checklist, remindersByTrip: data.reminders,
          expensesByTrip: data.expenses, plansByTrip: data.planning, rates,
          palette: current, theme,
        }))).catch(() => {});
      }, 600);
    };
    widgetSync.current = sync;
    const offs = ids.flatMap(id => ['days', 'checklist', 'reminders', 'expenses', 'planning'].map(sub => listen(
      collection(db, 'trips', id, sub),
      (snap) => { data[sub][id] = snap.docs.map(d => ({ id: d.id, ...d.data() })); sync(); },
      () => {},
    )));
    sync();
    return () => { offs.forEach(off => off()); clearTimeout(timer); widgetSync.current = null; };
  }, [widgetKey, signedInUid, loading]);
  // A renamed trip, a moved flight, another palette or theme: the same data, saved again.
  useEffect(() => { widgetSync.current?.(); }, [trips, palette, themeMode]);

  // Everything of the coming and current trips stays on the phone, web and
  // app alike: a trip not opened lately is all there offline too, not just
  // what its last visit happened to load. Firestore shares one listener per
  // query, so the tabs and the widget add nothing on top of these.
  const offlineKey = offlineTrips(trips).map(t => t.id).join(',');
  useEffect(() => {
    if (!signedInUid || !offlineKey) return undefined;
    const offs = offlineKey.split(',').flatMap(id =>
      ['planning', 'days', 'checklist', 'reminders', 'expenses', 'info', 'bookings', 'settings']
        .map(sub => listen(collection(db, 'trips', id, sub), () => {}, () => {})));
    return () => offs.forEach(off => off());
  }, [offlineKey, signedInUid]);

  // The expense and reminders widgets save on their own with the user's
  // sign-in (the refresh token, kept on the phone; the name and picture go
  // on a reminder); signed out, it is taken back.
  useEffect(() => {
    if (!isNative) return undefined;
    let off = () => {};
    Promise.all([import('firebase/auth'), import('./firebase')]).then(([{ onIdTokenChanged }, { auth }]) => {
      off = onIdTokenChanged(auth, (u) => {
        const { apiKey, projectId } = auth.app.options;
        import('./lib/native/widget').then(w => w.saveWidgetAuth(
          u ? { uid: u.uid, refreshToken: u.refreshToken, apiKey, projectId, name: u.displayName || u.email || '', photo: u.photoURL || '' } : null,
        )).catch(() => {});
      });
    }).catch(() => {});
    return () => off();
  }, []);

  // What the widgets saved offline or before they had the sign-in (an
  // expense, a tick in a list): written now, and whenever the app comes back
  // to the front. Queued in Firestore's own offline store is enough; it sends it.
  useEffect(() => {
    if (!isNative || !signedInUid) return undefined;
    const queued = (write) => Promise.race([write, new Promise(resolve => setTimeout(resolve, 3000))]);
    const send = () => import('./lib/native/widget').then(w => w.sendWidgetWrites(signedInUid, {
      addExpense: (tripId, id, data) => queued(setDoc(doc(db, 'trips', tripId, 'expenses', id), data)),
      addReminder: (tripId, id, data) => queued(setDoc(doc(db, 'trips', tripId, 'reminders', id), data)),
      setField: (path, field, value) => queued(updateDoc(doc(db, ...path.split('/')), { [field]: value })),
    })).catch(() => {});
    send();
    let sub;
    let gone = false;
    import('@capacitor/app').then(({ App: CapApp }) => CapApp.addListener('resume', send))
      .then(s => { if (gone) s?.remove?.(); else sub = s; }).catch(() => {});
    return () => { gone = true; sub?.remove?.(); };
  }, [signedInUid]);

  // "Share" from Google Maps to the Android app: the same trip picker as a
  // share to the web app (ShareTargetScreen), whatever screen was open.
  useEffect(() => {
    if (!isNative) return undefined;
    let off = () => {};
    import('./lib/native/appTools').then(t => {
      off = t.onShared((shared) => {
        setPendingTripPick(null);
        setSharedPlace(receiveSharedPlace(shared));
      });
    }).catch(() => {});
    return () => off();
  }, []);

  // A tap on a notification or on the widget opens its trip on the right tab.
  useEffect(() => {
    if (!isNative) return undefined;
    const openAt = (extra) => {
      if (!extra?.tripId) return;
      setSelectedTripId(extra.tripId);
      if (extra.tab) setActiveTab(extra.tab);
      setScreen('trip');
    };
    const offs = [];
    import('./lib/native/notify').then(n => { offs.push(n.onNotificationTap(openAt)); }).catch(() => {});
    import('./lib/native/push').then(p => { offs.push(p.onPushTap(openAt)); }).catch(() => {});
    import('./lib/native/widget').then(w => { offs.push(w.onWidgetOpen(openAt)); }).catch(() => {});
    return () => offs.forEach(off => off());
  }, []);

  // Push from trip partners (N5): this phone is on the server's list while
  // its switch is on (Settings → התראות), and off it otherwise.
  useEffect(() => {
    if (!isNative) return;
    import('./lib/native/notify').then(n => {
      const on = !!signedInUid && n.notifyPrefs().partners;
      return import('./lib/native/push').then(p => p.syncPush(signedInUid, on));
    }).catch(() => {});
  }, [signedInUid, notifyVersion]);

  // Quietly look for a newer APK once signed in (at most every 6 hours).
  useEffect(() => {
    if (!isNative || !signedInUid) return;
    import('./lib/updater').then(m => m.checkForUpdateQuietly())
      .then(r => { if (r?.available) setUpdateInfo(r); })
      .catch(() => {});
  }, [signedInUid]);

  /* The back gesture is the app's own: it unwinds sheets and screens
     instead of dropping the traveller out mid-trip. */
  useEffect(() => installBackGuard(), []);

  // Leaving a trip is the step back the trip screen itself owns; any sheet
  // open on top of it registers later and so closes first.
  useBackHandler(screen === 'trip', () => {
    setScreen('home');
    setSelectedTripId(null);
  });

  // Save user profile to Firestore on first login
  useEffect(() => {
    if (!user) return;
    const checkAndSeed = async () => {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        // First-time login: create ONLY the user profile — no pre-seeded
        // trip. Every trip must be created explicitly by the user and stay
        // fully self-contained, so a newly-added member never inherits any
        // other trip's content. We keep a personal checklist template
        // (generic packing items) that new trips can start from.
        await setDoc(userRef, {
          email: user.email?.toLowerCase() || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          tripIds: [],
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

  // Read the pinned trip for whoever is signed in.
  useEffect(() => {
    if (!user) { setPinnedTripId(null); autoOpenedRef.current = false; return; }
    try { setPinnedTripId(localStorage.getItem(`currentTrip_${user.uid}`) || null); }
    catch { setPinnedTripId(null); }
  }, [user]);

  // Open straight into the pinned trip. Guarded so it happens only on the
  // first load, only from the trip list, and never over a share in progress.
  useEffect(() => {
    if (autoOpenedRef.current || !user || !pinnedTripId) return;
    if (sharedPlace || screen !== 'home' || selectedTripId) return;
    if (!trips.some(t => t.id === pinnedTripId)) return;   // deleted or not shared any more
    autoOpenedRef.current = true;
    setSelectedTripId(pinnedTripId);
    setActiveTab('flight');
    setScreen('trip');
  }, [user, pinnedTripId, trips, sharedPlace, screen, selectedTripId]);

  const handleTogglePinned = (tripId) => {
    const next = pinnedTripId === tripId ? null : tripId;
    setPinnedTripId(next);
    // Pinning from the list is a deliberate act — don't also jump into it.
    autoOpenedRef.current = true;
    if (!user) return;
    try {
      if (next) localStorage.setItem(`currentTrip_${user.uid}`, next);
      else localStorage.removeItem(`currentTrip_${user.uid}`);
    } catch { /* private mode — the pin just won't persist */ }
  };

  // A share hands us /share?title=…&text=…&url=… — take it out of the address
  // bar right away so a refresh or the back button can't replay it.
  useEffect(() => {
    if (sharedPlace) clearShareUrl();
    // Intentionally runs once: sharedPlace only ever goes from set to null.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a light copy of the trip list on the device, so the share picker can
  // list the trips immediately — before auth resolves and before Firestore
  // answers on a cold start from the share sheet.
  useEffect(() => {
    if (user && trips.length > 0) cacheTripsForShare(trips, user.uid);
  }, [trips, user]);

  // Listen for the user's globalChecklist
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    return onSnapshot(userRef, (snap) => {
      hasOwnChecklist.current = Array.isArray(snap.data()?.globalChecklist);
      setGlobalChecklist(snap.data()?.globalChecklist || []);
      setGlobalExtraCategories(snap.data()?.globalExtraCategories || []);
    });
  }, [user]);

  // Listen for trips where this user is a member. We always clear the
  // trips + cached profiles immediately when the user changes so a brief
  // stale render of the previous user's trips can't leak across accounts.
  // We also filter client-side as a defensive check that the current uid
  // really appears in members/memberIds.
  useEffect(() => {
    setAllTrips([]);
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
      setAllTrips(filtered);
      setNow(Date.now());   // a deleteAt that just passed counts at once
    }, (err) => {
      console.error('Trips listener error:', err);
    });
  }, [user]);

  // Pre-load profile docs for every trip owner so the homepage card can
  // show "טיול של ..." badges without lazy-loading per card.
  const memberUidsKey = useMemo(() => {
    if (!user) return '';
    const uids = new Set();
    for (const t of trips) {
      for (const uid of Object.keys(t.members || {})) {
        if (uid !== user.uid) uids.add(uid);
      }
    }
    return [...uids].sort().join(',');
  }, [trips, user]);
  // One listener per member: served from the phone offline, and filled in
  // when the connection returns. A one-time read that failed offline left
  // the names empty until the app restarted.
  useEffect(() => {
    if (!memberUidsKey) return;
    const unsubs = memberUidsKey.split(',').map(uid => onSnapshot(doc(db, 'users', uid),
      (snap) => { if (snap.exists()) setMemberProfiles(prev => ({ ...prev, [uid]: snap.data() })); },
      () => { /* not readable: the name stays unknown */ }));
    return () => unsubs.forEach(u => u());
  }, [memberUidsKey]);

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

    // Nothing here waits for the server: offline the writes queue on the
    // phone, in order (the trip first: the rules for its sub-collections read
    // it), and go out together when the connection returns.
    // Initialize trip doc
    setDoc(tripRef, {
      name,
      destination,
      dates: '',
      members: { [user.uid]: 'owner' },
      memberIds: [user.uid],
      createdAt: new Date().toISOString(),
      outboundFlightDetails: emptyFlightDetails,
      returnFlightDetails: emptyFlightDetails,
      hotelDetails: emptyHotelDetails
    }).catch(err => console.error('Trip create error:', err));

    // The user's own checklist template, from their profile as this phone has
    // it (asking the server waited offline), or the default one.
    const userRef = doc(db, 'users', user.uid);
    const userChecklist = hasOwnChecklist.current ? globalChecklist : defaultChecklist;

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
    batch.commit().catch(err => console.error('Trip seed error:', err));

    // Add to user's tripIds
    setDoc(userRef, { tripIds: arrayUnion(tripId) }, { merge: true }).catch(() => {});
  };

  // Full delete: remove the trip doc *and* all its subcollection docs.
  // Also removes it from any legacy user.tripIds (best-effort).
  // Online only, from the server's copy: the phone's cache holds only what it
  // has seen, and deleting that much and then the trip left the rest on the
  // server. Any failure stops it before the trip doc goes (tried again later).
  const deleteTripFully = async (tripId) => {
    const tripRef = doc(db, 'trips', tripId);

    // Delete all docs in the known subcollections, batched.
    const subcollections = ['planning', 'days', 'checklist', 'reminders', 'info', 'bookings', 'expenses', 'settings'];
    for (const name of subcollections) {
      const snap = await getDocsFromServer(collection(db, 'trips', tripId, name));
      if (snap.size === 0) continue;
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 450) {
        const batch = writeBatch(db);
        docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
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
    // Not awaited: offline the dialog closed only once the server answered.
    updateDoc(doc(db, 'trips', tripId), {
      [`members.${user.uid}`]: deleteField(),   // see removeMember
      memberIds: arrayRemove(user.uid),
      // See removeMember: leaving takes the person out, never their work.
      // The snapshot is what keeps their name on it afterwards.
      [`formerMembers.${user.uid}`]: {
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        leftAt: new Date().toISOString(),
      },
    }).catch(err => console.error('Leaving the trip failed:', err));
    // Best-effort legacy cleanup
    updateDoc(doc(db, 'users', user.uid), { tripIds: arrayRemove(tripId) }).catch(() => {});
  };

  // A delete is due: the owner's app deletes the trip, once per session
  // (again a minute later if it failed). Members only stop seeing it.
  const deletingRef = useRef(new Set());
  useEffect(() => {
    if (!user) return;
    if (!navigator.onLine) return;   // see deleteTripFully
    for (const t of allTrips) {
      if (!pendingDelete(t) || t.deleteAt > now || t.members?.[user.uid] !== 'owner') continue;
      if (deletingRef.current.has(t.id)) continue;
      deletingRef.current.add(t.id);
      deleteTripFully(t.id).catch(err => {
        console.error('Scheduled trip delete failed:', err);
        setTimeout(() => deletingRef.current.delete(t.id), 60 * 1000);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTrips, now, user]);

  // The open trip's delete came due: back to the list.
  useEffect(() => {
    if (screen === 'trip' && selectedTripId && allTrips.some(t => t.id === selectedTripId) && !trips.some(t => t.id === selectedTripId)) {
      setScreen('home');
      setSelectedTripId(null);
    }
  }, [screen, selectedTripId, allTrips, trips]);

  const deleteCodeHash = useDeleteCode(user?.uid);

  const [confirmDelete, setConfirmDelete] = useState(null); // { tripId, name, mode: 'delete'|'leave' } | null

  // Home-screen layers, each one back press deep.
  useBackHandler(!!confirmDelete, () => setConfirmDelete(null));
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteCodeAgain, setDeleteCodeAgain] = useState('');
  const closeDeleteDialog = () => {
    setConfirmDelete(null); setDeleteError(''); setDeleteCode(''); setDeleteCodeAgain('');
  };

  const requestDeleteTrip = (tripId, isOwner) => {
    const t = trips.find(x => x.id === tripId);
    setConfirmDelete({
      tripId,
      name: t?.name || 'הטיול הזה',
      mode: isOwner ? 'delete' : 'leave',
    });
    setDeleteError('');
  };

  // The owner: the delete code (set here the first time), then the trip
  // is marked to go in 24 hours. Fire-and-forget, so it works offline.
  // Online only: the 24 hours count from when the server has it, and the
  // members see the notice only then.
  const scheduleDelete = async () => {
    const tripId = confirmDelete.tripId;
    if (!navigator.onLine) { setDeleteError('מחיקת טיול דורשת חיבור לאינטרנט'); return false; }
    if (!deleteCodeHash) {
      if (!validCode(deleteCode)) { setDeleteError('קוד של 4 עד 8 ספרות'); return false; }
      if (deleteCode !== deleteCodeAgain) { setDeleteError('האימות לא תואם לקוד'); return false; }
      await saveCode(user.uid, deleteCode);
    } else if (!(await checkCode(user.uid, deleteCode, deleteCodeHash))) {
      setDeleteError('קוד שגוי');
      return false;
    }
    updateDoc(doc(db, 'trips', tripId), { deleteAt: Date.now() + DELETE_DELAY_MS })
      .catch(err => console.error('Scheduling the delete failed:', err));
    return true;
  };

  // Online only too: a cancel waiting offline can lose to the delete.
  const cancelDelete = async (tripId) => {
    if (!navigator.onLine) {
      await confirm({
        title: 'אין חיבור לאינטרנט',
        message: 'ביטול המחיקה צריך להגיע לשרת לפני מועד המחיקה. נסו שוב כשיש חיבור.',
        confirmText: 'הבנתי', cancelText: 'סגור',
      });
      return;
    }
    updateDoc(doc(db, 'trips', tripId), { deleteAt: deleteField() })
      .catch(err => console.error('Cancelling the delete failed:', err));
  };

  const handleConfirmDelete = async () => {
    if (!user || !confirmDelete?.tripId || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      if (confirmDelete.mode === 'delete') {
        if (!(await scheduleDelete())) return;
      } else {
        await leaveTrip(confirmDelete.tripId);
        if (selectedTripId === confirmDelete.tripId) {
          setScreen('home');
          setSelectedTripId(null);
        }
      }
      closeDeleteDialog();
    } catch (err) {
      console.error('Trip delete failed:', err);
      setDeleteError(err?.message || 'הפעולה נכשלה');
    } finally {
      setDeleteBusy(false);
    }
  };

  // Trip picked in the share screen: jump straight into that trip's planning
  // tab and hand the place to PlanningTab, which opens the add form filled in.
  const openSharedPlaceInTrip = (tripId) => {
    if (!tripId) return;
    setSelectedTripId(tripId);
    setActiveTab('planning');
    setScreen('trip');
    setPendingSharedPlace(sharedPlace);
    setSharedPlace(null);
    setPendingTripPick(null);
    clearSharedPlace();
  };

  // Signing in from the share screen resumes the pick that triggered it.
  useEffect(() => {
    if (user && pendingTripPick && sharedPlace) openSharedPlaceInTrip(pendingTripPick);
  }, [user, pendingTripPick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tapping the tab you are already on scrolls back to the top — the
  // gesture every mobile app answers this way.
  const selectTab = (key) => {
    if (key === activeTab) {
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    tick();
    setActiveTab(key);
  };

  // The header gains an edge once the content has scrolled beneath it.
  const handleContentScroll = (e) => {
    const scrolled = e.currentTarget.scrollTop > 4;
    setContentScrolled(prev => (prev === scrolled ? prev : scrolled));
  };

  useEffect(() => { setContentScrolled(false); }, [activeTab, screen]);

  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'flight':   return 'טיסה ומלון';
      case 'planning': return 'תכנון הטיול';
      case 'checklist': return 'רשימת ציוד';
      case 'bookings':  return 'ההזמנות שלנו';
      case 'expenses':  return 'מעקב הוצאות';
      default:          return 'עוזר טיסות';
    }
  };

  const selectedTrip = trips.find(t => t.id === selectedTripId);

  // ── Loading ──
  if (loading) return <LoadingScreen slow={slow} />;

  // ── Opened from the share sheet ── shown before the auth gate: the trips
  // (from the local cache) are on screen straight away, and signing in only
  // becomes necessary at the moment we actually need to save.
  if (sharedPlace) {
    return (
      <ShareTargetScreen
        place={sharedPlace}
        trips={trips.map(t => ({
          id: t.id,
          name: t.name || '',
          destination: t.destination || '',
          canEdit: ['owner', 'editor', 'member'].includes(t.members?.[user?.uid]),
        }))}
        signedIn={!!user}
        onPickTrip={(tripId) => {
          if (user) openSharedPlaceInTrip(tripId);
          else { setPendingTripPick(tripId); signInWithGoogle(); }
        }}
        onCancel={() => { setSharedPlace(null); setPendingTripPick(null); clearSharedPlace(); }}
        onSignIn={signInWithGoogle}
      />
    );
  }

  // ── Not signed in ──
  if (!user) return <LoginScreen onSignIn={signInWithGoogle} />;

  // ── Homepage ──
  // Offline banner — rendered inside each screen container
  const bannerStyle = {
    background: '#dc2626', color: '#fff', textAlign: 'center',
    fontSize: 12, fontWeight: 700, padding: '6px 16px',
    letterSpacing: 0.2, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  };
  const OfflineBanner = !storageOk ? (
    <div style={bannerStyle} role="alert">
      <AlertTriangle size={14} aria-hidden="true" />
      הדפדפן לא שומר נתונים בטלפון (גלישה פרטית?) — בלי חיבור, שינויים לא יישמרו
    </div>
  ) : !isOnline ? (
    <div style={bannerStyle}>
      <WifiOff size={14} aria-hidden="true" />
      אין חיבור לאינטרנט — שינויים נשמרים ויסונכרנו בהתחברות
    </div>
  ) : null;

  // Settings: from the home header, and from a trip's header with that
  // trip and tab preselected for export.
  const settingsSheet = showAppSettings ? (
    <ErrorBoundary label="הגדרות">
    <Suspense fallback={null}>
      <AppSettingsSheet
        initial={updateInfo}
        onNotifyChange={() => setNotifyVersion(v => v + 1)}
        trips={trips}
        uid={user.uid}
        tripId={screen === 'trip' ? selectedTripId : pinnedTripId}
        activeTab={screen === 'trip' ? activeTab : null}
        onClose={() => { setShowAppSettings(false); setUpdateInfo(null); }}
      />
    </Suspense>
    </ErrorBoundary>
  ) : null;

  if (screen === 'home') {
    return (
      <div className="app-container">
        {OfflineBanner}
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {user.photoURL ? (
              <img src={user.photoURL} alt="" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }} referrerPolicy="no-referrer" />
            ) : (
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-fg)', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                {(user.displayName || user.email || '?')[0]}
              </div>
            )}
            <h1 style={{ fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>עוזר טיסות</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <ThemeToggle />
            <button onClick={() => setShowAppSettings(true)} className="icon-btn" title="הגדרות" aria-label="הגדרות">
              <Settings size={16} />
            </button>
            <button
              onClick={async () => {
                // Offline, changes still waiting on this phone go out only
                // when the same account signs in here again.
                const ok = await confirm({
                  title: 'התנתקות',
                  message: isOnline
                    ? 'האם להתנתק מהחשבון?'
                    : 'אין חיבור לאינטרנט. שינויים שעשית בלי חיבור יישלחו רק כשתתחבר שוב לחשבון הזה בטלפון הזה. להתנתק בכל זאת?',
                  confirmText: 'התנתק', cancelText: 'ביטול', danger: true,
                });
                if (ok) signOut();
              }}
              className="icon-btn"
              title="התנתק"
              aria-label="התנתק"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* A newer version of the Android app was found on launch. */}
        {updateInfo?.available && !showAppSettings && (
          <button type="button" className="update-banner" onClick={() => setShowAppSettings(true)}>
            <Download size={16} />
            <span>גרסה {updateInfo.latest.versionName} זמינה · הקישו לעדכון</span>
          </button>
        )}
        {settingsSheet}

        <main className="app-content">
          <Homepage
            trips={trips}
            currentUid={user.uid}
            memberProfiles={memberProfiles}
            currentUserProfile={{ displayName: user.displayName, email: user.email, photoURL: user.photoURL }}
            onOpenTrip={(id) => { setSelectedTripId(id); setActiveTab('flight'); setScreen('trip'); }}
            onCreateTrip={handleCreateTrip}
            onDeleteTrip={requestDeleteTrip}
            onCancelDelete={cancelDelete}
            onShareTrip={(id) => setSharingTripId(id)}
            userName={user.displayName}
            pinnedTripId={pinnedTripId}
            onTogglePinned={handleTogglePinned}
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
          extraCategories={globalExtraCategories}
          userId={user.uid}
        />

        {confirmDelete && (() => {
          const leave = confirmDelete.mode === 'leave';
          const firstCode = !leave && deleteCodeHash === null;   // no code yet: set it here
          const ready = leave || (deleteCodeHash !== undefined && deleteCode.length >= 4 && (!firstCode || deleteCodeAgain.length >= 4));
          const codeField = (id, label, value, set, autoFocus) => (
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label htmlFor={id} style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{label}</label>
              <input
                id={id}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                className="form-control code-input"
                value={value}
                onChange={e => { set(e.target.value.replace(/\D/g, '')); setDeleteError(''); }}
                onKeyDown={e => { if (e.key === 'Enter' && ready) handleConfirmDelete(); }}
                autoFocus={autoFocus}
              />
            </div>
          );
          return (
          <div
            className="modal-overlay"
            onClick={deleteBusy ? undefined : closeDeleteDialog}
            style={{ alignItems: 'center' }}
          >
            <div
              className="modal-content"
              role="dialog"
              aria-label={leave ? 'יציאה מהטיול' : 'מחיקת טיול'}
              style={{ height: 'auto', maxHeight: '80%', maxWidth: 420, borderRadius: 'var(--radius-xl)', margin: 16, padding: '24px 20px' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--c-red-12)', color: 'var(--c-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AlertTriangle size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--primary)', marginBottom: 6 }}>
                    {leave ? 'יציאה מהטיול' : 'מחיקת טיול'}
                  </h3>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, fontWeight: 600, marginBottom: 0 }}>
                    {leave ? (
                      <>האם לצאת מ-<strong>{confirmDelete.name}</strong>?<br />מה שהוספת — הוצאות, מקומות, פריטים ברשימה — נשאר בטיול על שמך. הטיול עצמו לא יימחק, הוא רק יוסר מהרשימה שלך; רק הבעלים יכול למחוק אותו לכולם.</>
                    ) : (
                      <><strong>{confirmDelete.name}</strong> יימחק לכל חברי הטיול בעוד 24 שעות, עם כל הנתונים שבו. עד אז אפשר לבטל מכרטיס הטיול.</>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="סגור"
                  className="btn-close"
                  onClick={() => { if (!deleteBusy) closeDeleteDialog(); }}
                  disabled={deleteBusy}
                >✕</button>
              </div>
              {!leave && !isOnline && (
                <Notice tone="offline" style={{ marginTop: 16 }}>מחיקת טיול דורשת חיבור לאינטרנט. נסו שוב כשיש חיבור.</Notice>
              )}
              {!leave && isOnline && (
                <div style={{ marginTop: 16 }}>
                  {firstCode && (
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.5, margin: '0 0 10px' }}>
                      עוד אין לך קוד מחיקה. בחר קוד של 4 עד 8 ספרות. הוא יישמר, ואפשר לשנות אותו בהגדרות.
                    </p>
                  )}
                  {deleteCodeHash !== undefined && codeField('delete-code', firstCode ? 'קוד מחיקה חדש' : 'קוד מחיקה', deleteCode, setDeleteCode, true)}
                  {firstCode && codeField('delete-code-again', 'שוב, לאימות', deleteCodeAgain, setDeleteCodeAgain, false)}
                </div>
              )}
              {deleteError && (
                <p role="alert" style={{ color: 'var(--c-red)', fontSize: 13, marginTop: 4, fontWeight: 700 }}>{deleteError}</p>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => { if (!deleteBusy) closeDeleteDialog(); }}
                  disabled={deleteBusy}
                  className="btn-secondary"
                  style={{ flex: 1, opacity: deleteBusy ? 0.5 : 1 }}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleteBusy || !ready}
                  className="btn-primary danger"
                  style={{ flex: 1.6, opacity: (deleteBusy || !ready) ? 0.45 : 1 }}
                >
                  {deleteBusy ? 'פועל...' : (leave ? 'צא מהטיול' : 'מחק בעוד 24 שעות')}
                </button>
              </div>
            </div>
          </div>
          );
        })()}
      </div>
    );
  }

  // ── Trip Detail ──
  return (
    <div className="app-container">
      {OfflineBanner}
      <TripProvider value={{
        tripId: selectedTripId,
        role: selectedTrip?.members?.[user.uid] || null,
        canEdit: ['owner', 'editor', 'member'].includes(selectedTrip?.members?.[user.uid]),
        isOwner: selectedTrip?.members?.[user.uid] === 'owner',
        ownerProfile: (() => {
          const ownerUid = Object.keys(selectedTrip?.members || {}).find(uid => selectedTrip?.members?.[uid] === 'owner');
          return ownerUid && ownerUid !== user.uid ? memberProfiles[ownerUid] : null;
        })(),
        currentUid: user.uid,
        currentUserProfile: { displayName: user.displayName, email: user.email, photoURL: user.photoURL },
        memberProfiles: memberProfiles,
        tripMembers: selectedTrip?.members || {},
        // People who were on the trip and are not any more. Their work
        // stays; the tabs render them greyed so it is clear why they
        // can no longer be picked.
        formerMembers: selectedTrip?.formerMembers || {},
      }}>
      <header className={`app-header${contentScrolled ? ' scrolled' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <button
            onClick={() => { setScreen('home'); setSelectedTripId(null); }}
            aria-label="חזרה לרשימת הטיולים"
            className="icon-btn filled"
          >
            <ChevronLeft size={18} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {getHeaderTitle()}
            </h1>
            <div className="app-header-sub">
              <span>{selectedTrip?.destination || selectedTrip?.name || ''}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={() => setShowAppSettings(true)} className="icon-btn" title="הגדרות, ייצוא וגיבוי" aria-label="הגדרות">
            <Settings size={16} />
          </button>
          <ThemeToggle />
        </div>
      </header>
      {selectedTrip && pendingDelete(selectedTrip) && (
        <DeleteNotice banner at={selectedTrip.deleteAt}
          onCancel={selectedTrip.members?.[user.uid] === 'owner' ? () => cancelDelete(selectedTrip.id) : null} />
      )}
      {settingsSheet}

      <main
        className="app-content"
        key={activeTab}
        ref={contentRef}
        onScroll={handleContentScroll}
      >
          {/* One boundary per tab: a failure stays inside the tab it came
              from, leaving the nav and every other tab usable. */}
          <ErrorBoundary label={getHeaderTitle()} resetKey={activeTab}>
            {/* The skeleton stands in while the tab's chunk arrives. After
                the first install that is a read from the service worker's
                cache, so it is usually a single frame. */}
            <Suspense fallback={<Skeleton rows={4} label="טוען" />}>
            {activeTab === 'flight'    && <FlightTab tripId={selectedTripId} />}
            {activeTab === 'planning'  && (
              <PlanningTab
                tripId={selectedTripId}
                sharedPlace={pendingSharedPlace}
                onSharedPlaceHandled={() => setPendingSharedPlace(null)}
              />
            )}
            {activeTab === 'checklist' && <ChecklistTab tripId={selectedTripId} />}
            {activeTab === 'bookings'  && <BookingsTab tripId={selectedTripId} />}
            {activeTab === 'expenses'  && <ExpensesTab tripId={selectedTripId} />}
            </Suspense>
          </ErrorBoundary>
      </main>
      </TripProvider>

      {/* Bottom nav — a floating pill. The active tab is marked by one
          indicator that travels between the icons, so the eye follows the
          move instead of noticing a colour change. */}
      <nav className="bottom-nav">
        {NAV_TABS.map(({ key, label }) => {
          const on = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => selectTab(key)}
              className={`nav-item ${on ? 'active' : ''}`}
              aria-label={label}
              aria-current={on ? 'page' : undefined}
            >
              {/* Re-keyed on change so the pop plays each time a tab activates. */}
              <span key={on ? 'on' : 'off'} className="nav-icon">
                <NavIcon name={key} active={on} />
              </span>
              <span className="nav-label">{label}</span>
              <span className="nav-dot" aria-hidden="true" />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
