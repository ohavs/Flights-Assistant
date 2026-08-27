import React, { useMemo } from 'react';
import { MapPin, Plane, ChevronLeft, Link2, X, LogIn } from 'lucide-react';
import { readCachedTrips } from '../services/shareTarget';

/* ── ShareTargetScreen ───────────────────────────────────────────────────
   The first thing you see after sharing a place from Google Maps: what was
   shared, and which trip it should go into. The trip list comes from the
   cached copy written on every trips snapshot, so it is on screen straight
   away — before auth resolves and before Firestore answers. Once the live
   list arrives it takes over.                                              */
export default function ShareTargetScreen({
  place,          // { name, url, note }
  trips,          // live trips (may be empty while loading / signed out)
  signedIn,
  onPickTrip,     // (tripId) => void
  onCancel,       // () => void
  onSignIn,       // () => void
}) {
  // Live list wins; the cache fills the gap while it loads.
  const cached = useMemo(() => readCachedTrips(), []);
  const list = (trips && trips.length > 0) ? trips : cached;

  return (
    <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: 'var(--accent)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MapPin size={17} />
          </div>
          <h1 style={{ fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            הוספה לטיול
          </h1>
        </div>
        <button
          onClick={onCancel}
          title="ביטול"
          style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: 'var(--ink-5)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <X size={16} />
        </button>
      </header>

      <main className="app-content">
        {/* What was shared */}
        <div className="glass-card" style={{ padding: '14px 16px', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.4px' }}>
            שותף מגוגל מפות
          </span>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: 'var(--p-10)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MapPin size={17} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 15, fontWeight: 800,
                color: place?.name ? 'var(--primary)' : 'var(--text-muted)',
                wordBreak: 'break-word', lineHeight: 1.3,
              }}>
                {place?.name || 'ללא שם — אפשר למלא בשלב הבא'}
              </div>
              {place?.note && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginTop: 3 }}>
                  {place.note}
                </div>
              )}
              {place?.url && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5, marginTop: 6,
                  fontSize: 12, color: 'var(--accent)', fontWeight: 700,
                  overflow: 'hidden',
                }}>
                  <Link2 size={12} style={{ flexShrink: 0 }} />
                  <span dir="ltr" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {place.url.replace(/^https?:\/\//i, '')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Trip picker */}
        <h2 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', margin: '4px 2px' }}>
          לאיזה טיול להוסיף?
        </h2>

        {list.length === 0 ? (
          <div className="glass-card" style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Plane size={28} style={{ margin: '0 auto 10px', opacity: 0.4, transform: 'rotate(-45deg)' }} />
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
              {signedIn ? 'אין עדיין טיולים' : 'התחבר כדי לראות את הטיולים שלך'}
            </p>
            {signedIn && (
              <p style={{ fontSize: 13, marginTop: 6 }}>צור טיול באפליקציה ואז שתף שוב מגוגל מפות</p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map(trip => {
              // `canEdit` is absent on entries cached before this flag existed —
              // treat those as editable rather than blocking the whole flow.
              const viewOnly = trip.canEdit === false;
              return (
              <button
                key={trip.id}
                type="button"
                disabled={viewOnly}
                onClick={() => onPickTrip(trip.id)}
                className="glass-card"
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  padding: '13px 14px', textAlign: 'right',
                  cursor: viewOnly ? 'default' : 'pointer',
                  opacity: viewOnly ? 0.55 : 1,
                  fontFamily: 'var(--font-hebrew)', width: '100%',
                }}
              >
                <span style={{
                  width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                  background: 'var(--p-10)', color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Plane size={18} style={{ transform: 'rotate(-45deg)' }} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontSize: 15, fontWeight: 800, color: 'var(--primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {trip.name || 'טיול ללא שם'}
                  </span>
                  {(trip.destination || viewOnly) && (
                    <span style={{
                      display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {viewOnly ? 'צפייה בלבד — אין הרשאת עריכה' : trip.destination}
                    </span>
                  )}
                </span>
                {!viewOnly && <ChevronLeft size={18} style={{ color: 'var(--ink-15)', flexShrink: 0 }} />}
              </button>
              );
            })}
          </div>
        )}

        {/* Signed out: the cached list is visible, but saving needs an account */}
        {!signedIn && (
          <div className="glass-card" style={{ padding: '14px 16px', gap: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              כדי לשמור את המקום צריך להתחבר לחשבון Google. הבחירה תישמר — אחרי ההתחברות נמשיך בדיוק מכאן.
            </p>
            <button onClick={onSignIn} className="btn-primary" style={{ width: '100%', minHeight: 44, gap: 8 }}>
              <LogIn size={17} />
              <span>התחבר והמשך</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
