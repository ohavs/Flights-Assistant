import { useCallback, useEffect, useRef, useState } from 'react';

/* ── SwipeRow ────────────────────────────────────────────────────────────
   Wraps a list row so it can be swiped aside to reveal its actions, the
   way a native list behaves.

   Direction, in RTL: the actions sit at the *end* edge (left) and the row
   gives up width to them rather than sliding off the screen. Sliding is
   what iOS does, but its rows carry their text across the full width; ours
   pack a short label against the start edge, so a translate pushes the
   very thing you are acting on out of view. Shrinking keeps the item
   readable while its actions are open — which is the point of showing
   them next to it.

   Touch is handled with native listeners registered { passive: false }:
   React's synthetic touch handlers are passive, so they cannot stop the
   page from scrolling once the browser has claimed the gesture. The
   gesture is only claimed when the finger is clearly moving sideways —
   a vertical drag stays a scroll, always.

   Only one row is open at a time; opening another closes the previous.  */

const ACTION_W = 68;   // per action
const SLOP = 8;        // before the direction is decided
const OPEN_RATIO = 0.5;

let closeOpenRow = null;   // the row currently open, app-wide

export default function SwipeRow({
  actions = [],
  enabled = true,
  className = '',
  style,
  onClick,
  children,
}) {
  const [node, setNode] = useState(null);
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [sliding, setSliding] = useState(false);
  const gesture = useRef({ x: 0, y: 0, axis: null, base: 0 });
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  const maxOpen = actions.length * ACTION_W;

  const close = useCallback(() => {
    setOpen(false);
    setDx(0);
    if (closeOpenRow === close) closeOpenRow = null;
  }, []);

  // Swiping is a touch idiom. On a mouse the row keeps its inline buttons.
  const touchOnly = typeof window !== 'undefined'
    && window.matchMedia?.('(hover: none)').matches;
  const active = enabled && actions.length > 0 && touchOnly;

  useEffect(() => {
    if (!node || !active) return undefined;

    const onStart = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      gesture.current = { x: t.clientX, y: t.clientY, axis: null, base: openRef.current ? maxOpen : 0 };
    };

    const onMove = (e) => {
      const g = gesture.current;
      if (g.axis === 'y' || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dX = t.clientX - g.x;
      const dY = t.clientY - g.y;

      if (!g.axis) {
        if (Math.abs(dX) < SLOP && Math.abs(dY) < SLOP) return;
        // Vertical wins ties: scrolling the list must never feel sticky.
        g.axis = Math.abs(dX) > Math.abs(dY) ? 'x' : 'y';
        if (g.axis === 'y') return;
        setSliding(true);
        if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
      }

      e.preventDefault();
      // Rubber-band past the fully open position, and don't travel the
      // wrong way at all.
      const next = g.base + dX;
      setDx(Math.max(0, next > maxOpen ? maxOpen + (next - maxOpen) * 0.25 : next));
    };

    const onEnd = () => {
      const g = gesture.current;
      if (g.axis !== 'x') return;
      g.axis = null;
      setSliding(false);
      setDx(prev => {
        const shouldOpen = prev > maxOpen * OPEN_RATIO;
        setOpen(shouldOpen);
        if (shouldOpen) closeOpenRow = close;
        else if (closeOpenRow === close) closeOpenRow = null;
        return shouldOpen ? maxOpen : 0;
      });
    };

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', onEnd);
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    };
  }, [node, active, maxOpen, close]);

  // Leaving the list (or unmounting) must not leave a stale opener behind.
  useEffect(() => () => { if (closeOpenRow === close) closeOpenRow = null; }, [close]);

  const handleClick = (e) => {
    if (open) { e.stopPropagation(); close(); return; }   // first tap just closes
    onClick?.(e);
  };

  if (!active) {
    return (
      <div className={className} style={style} onClick={onClick}>
        {children}
      </div>
    );
  }

  return (
    <div className="swipe-row" style={{ borderRadius: 'var(--radius-lg)' }}>
      {/* Action layer — sits at the end edge (left in RTL), uncovered as
          the row slides toward the start. Rendered only while the row is
          actually engaged: the rows are translucent glass, so a layer left
          sitting behind a closed row would show through it. */}
      {(sliding || open || dx > 0) && (
        <div className="swipe-row-actions" style={{ width: maxOpen }}>
          {actions.map(({ key, label, Icon, tone, onAction }) => (
            <button
              key={key}
              type="button"
              className={`swipe-action${tone === 'danger' ? ' danger' : ''}`}
              style={{ width: ACTION_W }}
              aria-label={label}
              tabIndex={open ? 0 : -1}
              onClick={(e) => { e.stopPropagation(); close(); onAction(); }}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={setNode}
        className={className}
        onClick={handleClick}
        style={{
          ...style,
          // Logical property: in RTL this frees space on the left, where the
          // actions are, and leaves the row's own content anchored right.
          marginInlineEnd: dx || undefined,
          transition: sliding ? 'none' : 'margin var(--dur-base) var(--ease-out)',
          position: 'relative',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  );
}
