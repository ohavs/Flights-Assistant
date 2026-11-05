import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* ── Toast ───────────────────────────────────────────────────────────────
   A short message over the bottom of the screen after something changed
   that you might not see happen: two days swapped, an activity moved to
   another day. Above the floating button, below every sheet. It leaves by
   itself, by its action (usually "ביטול"), or swiped to either side.

     {toast && <Toast {...toast} onDone={() => setToast(null)} />}

   A bar along its bottom shows the time left (8.85.0). A finger on it, or
   the mouse over it, holds the time.

   `id` restarts it when one message replaces another.                 */
export default function Toast(props) {
  return <ToastBody key={props.id} {...props} />;
}

const SWIPE = 0.3;   // of its width: past this it goes
const FLICK = 0.5;   // px/ms: or this fast

function ToastBody({ title, text, icon, action, onDone, ms = 5500 }) {
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });

  const [dx, setDx] = useState(0);        // dragged sideways, px
  const [gone, setGone] = useState(0);    // -1 / 1: swiped away that way
  const [pressed, setPressed] = useState(false);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const held = pressed || hover;
  const drag = useRef(null);
  const moved = useRef(false);

  // The time left runs only while nothing holds it.
  const left = useRef(ms);
  useEffect(() => {
    if (held || gone) return undefined;
    const start = Date.now();
    const t = setTimeout(() => done.current(), left.current);
    return () => { clearTimeout(t); left.current -= Date.now() - start; };
  }, [held, gone]);

  // Swiped away: gone once it is off screen (or soon, if no transition runs).
  useEffect(() => {
    if (!gone) return undefined;
    const t = setTimeout(() => done.current(), 260);
    return () => clearTimeout(t);
  }, [gone]);

  const down = (e) => {
    if (gone || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { x: e.clientX, y: e.clientY, on: false, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
    moved.current = false;
    setPressed(true);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    if (!d.on) {
      if (Math.abs(mx) < 8) return;
      // Up or down is a scroll, not a swipe.
      if (Math.abs(e.clientY - d.y) > Math.abs(mx)) { drag.current = null; setPressed(false); return; }
      d.on = true;
      moved.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    setDx(mx);
  };
  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    setPressed(false);
    setDragging(false);
    if (!d?.on) return;
    const w = e.currentTarget.offsetWidth || 1;
    const mx = e.clientX - d.x;
    if (Math.abs(mx) > w * SWIPE || (Math.abs(d.v) > FLICK && Math.sign(d.v) === Math.sign(mx))) setGone(Math.sign(mx) || 1);
    else setDx(0);
  };
  const cancel = () => { drag.current = null; setPressed(false); setDragging(false); setDx(0); };

  const style = {
    '--dx': gone ? `${gone * 120}%` : `${dx}px`,
    opacity: gone ? 0 : 1 - Math.min(0.6, Math.abs(dx) / 400),
    transition: dragging ? 'none' : undefined,
  };

  return createPortal(
    <div
      className={`toast${held ? ' held' : ''}${gone ? ' gone' : ''}`}
      role="status"
      aria-live="polite"
      style={style}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(false); }}
      // A swipe that ends over the button is not a tap on it.
      onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; } }}
    >
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
      <span className="toast-left" aria-hidden="true"><i style={{ '--toast-ms': `${ms}ms` }} /></span>
    </div>,
    document.querySelector('.app-container') || document.body,
  );
}
