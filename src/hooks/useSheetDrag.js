import { useCallback, useRef, useState } from 'react';

/* ── useSheetDrag ────────────────────────────────────────────────────────
   Gives a bottom sheet the two things that make it feel native: you can
   drag it down to dismiss, and it slides out instead of vanishing.

   Attach the handlers and style to the sheet element itself (the same
   element that scrolls its content):

     const sheet = useSheetDrag(onClose);
     <div className="modal-content" {...sheet.handlers} style={sheet.style}>

   and close through `sheet.close()` so the exit animation plays.

   The drag only takes over when the content is already scrolled to the
   top and the finger moves downward — otherwise the gesture belongs to
   the scroll area, exactly as it does in a native sheet.               */

const DISMISS_PX = 96;        // far enough to mean it, close enough to be easy
const DISMISS_VELOCITY = 0.5; // px/ms — a quick flick dismisses from anywhere
const SLOP = 6;               // movement before we call it a drag at all
const EXIT_MS = 220;

export default function useSheetDrag(onClose, { enabled = true } = {}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const startRef = useRef(null);
  const movedRef = useRef(false);

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      onClose?.();
      // The hook outlives the sheet, so the exit state has to be cleared —
      // otherwise the next sheet would open already translated off-screen.
      setClosing(false);
      setOffset(0);
    }, EXIT_MS);
  }, [closing, onClose]);

  const onPointerDown = useCallback((e) => {
    if (!enabled || closing) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Only when the content is already at the top. A sheet either scrolls
    // itself, or has an inner scroll area marked [data-sheet-scroll].
    const scroller = e.target.closest?.('[data-sheet-scroll]');
    if (scroller ? scroller.scrollTop > 0 : e.currentTarget.scrollTop > 0) return;
    // Never hijack a gesture that starts inside a text field or a slider.
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    startRef.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
    movedRef.current = false;
  }, [enabled, closing]);

  const onPointerMove = useCallback((e) => {
    const start = startRef.current;
    if (!start || start.id !== e.pointerId) return;
    const dy = e.clientY - start.y;
    if (!movedRef.current) {
      if (dy < SLOP) {
        // Upward or tiny movement — hand the gesture back to the scroller.
        if (dy < -SLOP) startRef.current = null;
        return;
      }
      movedRef.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    // Resist a little past the top edge so it never flies up.
    setOffset(dy > 0 ? dy : dy / 4);
  }, []);

  const finish = useCallback((e) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start || !movedRef.current) { setDragging(false); return; }
    const dy = e.clientY - start.y;
    const velocity = dy / Math.max(1, performance.now() - start.t);
    setDragging(false);
    if (dy > DISMISS_PX || velocity > DISMISS_VELOCITY) close();
    else setOffset(0);
  }, [close]);

  // A drag that ended over a button must not also count as a tap on it.
  const onClickCapture = useCallback((e) => {
    if (movedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      movedRef.current = false;
    }
  }, []);

  const style = {
    transform: closing ? 'translateY(100%)' : (offset ? `translateY(${offset}px)` : undefined),
    transition: dragging ? 'none' : `transform ${EXIT_MS}ms var(--ease-out)`,
    // While dragging, the sheet must not scroll under the finger.
    ...(dragging ? { overflowY: 'hidden', touchAction: 'none' } : null),
    ...(closing ? { pointerEvents: 'none' } : null),
  };

  return {
    close,
    closing,
    dragging,
    style,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onClickCapture,
    },
  };
}
