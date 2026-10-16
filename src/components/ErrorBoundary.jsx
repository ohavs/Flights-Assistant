import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/* ── ErrorBoundary ───────────────────────────────────────────────────────
   Wraps one tab. Without it, a single bad field anywhere in the tree takes
   the whole app down to a white screen — including the navigation, so there
   is no way back. Here the failure stays inside the tab: the other tabs, the
   nav and the data are untouched, and "נסה שוב" re-mounts just this subtree.

   A screen whose code could not be fetched says why (offline before the
   app had it all on the phone, or, online, an old page after an update),
   and its retry reloads the page: React.lazy keeps a failed import and
   never asks again.

   Deliberately a class component: this is the one thing hooks cannot do.    */

const isChunkError = (e) => /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i
  .test(String(e?.message || e || ''));
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept in the console so a real failure is still diagnosable.
    console.error(`[${this.props.label || 'tab'}] render failed:`, error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Moving to another tab clears the failure, so a one-off error doesn't
    // leave the tab stuck on the message forever.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = isChunkError(this.state.error);

    return (
      <div className="glass-card animate-fade" style={{
        padding: '28px 22px', textAlign: 'center', gap: 14,
        alignItems: 'center', direction: 'rtl',
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: 14, flexShrink: 0,
          background: 'var(--c-orange-12)', color: 'var(--c-orange)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <AlertTriangle size={22} />
        </div>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)', margin: '0 0 6px' }}>
            {chunk
              ? (navigator.onLine ? 'יש גרסה חדשה של האפליקציה' : 'המסך הזה לא נטען בלי חיבור לאינטרנט')
              : <>משהו השתבש ב{this.props.label ? `"${this.props.label}"` : 'מסך הזה'}</>}
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            {chunk
              ? (navigator.onLine
                ? 'המידע שלך שמור. "נסה שוב" יטען את הגרסה החדשה.'
                : 'שאר האפליקציה והמידע שלך זמינים. כשהחיבור יחזור, "נסה שוב" יטען אותו.')
              : 'שאר האפליקציה והמידע שלך בסדר גמור. אפשר לנסות לטעון את המסך מחדש, או לעבור לטאב אחר ולחזור.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => (chunk ? window.location.reload() : this.setState({ error: null }))}
          className="btn-primary"
          style={{ minHeight: 44, gap: 8, paddingInline: 22 }}
        >
          <RotateCcw size={16} />
          <span>נסה שוב</span>
        </button>
      </div>
    );
  }
}
