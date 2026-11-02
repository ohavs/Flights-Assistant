import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/* ── Toast ───────────────────────────────────────────────────────────────
   A short message over the bottom of the screen after something changed
   that you might not see happen: two days swapped, an activity moved to
   another day. Above the floating button, below every sheet. It leaves by
   itself, or by its action (usually "ביטול").

     {toast && <Toast {...toast} onDone={() => setToast(null)} />}

   `id` restarts the timer when one message replaces another.          */
export default function Toast({ id, title, text, icon, action, onDone, ms = 5500 }) {
  useEffect(() => {
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [id, ms]); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div className="toast" role="status" aria-live="polite" key={id}>
      {icon && <span className="toast-icon" aria-hidden="true">{icon}</span>}
      <span className="toast-text">
        <span className="toast-title">{title}</span>
        {text && <span className="toast-sub">{text}</span>}
      </span>
      {action && (
        <button type="button" className="toast-action" onClick={() => { onDone(); action.run(); }}>
          {action.label}
        </button>
      )}
    </div>,
    document.querySelector('.app-container') || document.body,
  );
}
