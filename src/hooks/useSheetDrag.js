import { useCallback, useEffect, useRef, useState } from 'react';

/* ── useSheetDrag ────────────────────────────────────────────────────────
   Gives a bottom sheet the two things that make it feel native: you can
   drag it down to dismiss, and it slides out instead of vanishing.

     const sheet = useSheetDrag(onClose);
     <div className="modal-content" {...sheet.handlers} style={sheet.style}>

   and close through `sheet.close()` so the exit animation plays.

   Touch is handled with native listeners registered `{ passive: false }`,
   not React's synthetic ones. React attaches touch handlers passively at
   the root, so a handler there cannot call preventDefault — the browser
   keeps the vertical gesture for scrolling and the drag never starts.
   That is exactly what happens on a phone while a mouse works fine.
   Mouse dragging (desktop) still goes through pointer events.

   The gesture only takes over when the content is already scrolled to the
   top and the finger moves down; otherwise it belongs to the scroll area,
   as it does in a native sheet.                                          */

const DISMISS_PX = 96;        // far enough to mean it, close enough to be easy
const DISMISS_VELOCITY = 0.5; // px/ms — a quick flick dismisses from anywhere
const SLOP = 6;               // movement before we call it a drag at all
const EXIT_MS = 220;

export default function useSheetDrag(onClose, { enabled = true } = {}) {
  const [node, setNode] = useState(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);

  // Live values for the native listeners, which are attached once.
  const enabledRef = useRef(enabled);
  const closingRef = useRef(closing);
  const gesture = useRef({ startY: 0, startT: 0, active: false, moved: false });
  const movedRecently = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { closingRef.current = closing; }, [closing]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => {
      onCloseRef.current?.();
      // The hook outlives the sheet, so the exit state has to be cleared —
      // otherwise the next sheet would open already translated off-screen.
      closingRef.current = false;
      setClosing(false);
      setOffset(0);
    }, EXIT_MS);
  }, []);

  // Shared decision: may a gesture starting on this target become a drag?
  const canStart = useCallback((target, el) => {
    if (!enabledRef.current || closingRef.current) return false;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return false;
    // Only from the top of the scroll. A sheet either scrolls itself or has
    // an inner scroll area marked [data-sheet-scroll].
    const scroller = target?.closest?.('[data-sheet-scroll]');
    return scroller ? scroller.scrollTop <= 0 : el.scrollTop <= 0;
  }, []);

  const settle = useCallback((endY, endT) => {
    const g = gesture.current;
    g.active = false;
    if (!g.moved) { setDragging(false); return; }
    const dy = endY - g.startY;
    const velocity = dy / Math.max(1, endT - g.startT);
    setDragging(false);
    movedRecently.current = true;
    // A click that lands right after a drag is part of the drag.
    setTimeout(() => { movedRecently.current = false; }, 120);
    if (dy > DISMISS_PX || velocity > DISMISS_VELOCITY) close();
    else setOffset(0);
  }, [close]);

  /* ── Touch: native, non-passive ── */
  useEffect(() => {
    if (!node) return undefined;

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) { gesture.current.active = false; return; }
      const t = e.touches[0];
      if (!canStart(t.target, node)) { gesture.current.active = false; return; }
      gesture.current = { startY: t.clientY, startT: performance.now(), active: true, moved: false };
    };

    const onTouchMove = (e) => {
      const g = gesture.current;
      if (!g.active || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - g.startY;
      if (!g.moved) {
        // Upward or tiny movement — hand the gesture back to the scroller.
        if (dy < SLOP) { if (dy < -SLOP) g.active = false; return; }
        g.moved = true;
        setDragging(true);
      }
      // Non-passive, so this actually stops the page from scrolling.
      e.preventDefault();
      setOffset(dy > 0 ? dy : dy / 4);
    };

    const onTouchEnd = (e) => {
      const g = gesture.current;
      if (!g.active) return;
      const t = e.changedTouches?.[0];
      settle(t ? t.clientY : g.startY, performance.now());
    };

    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd);
    node.addEventListener('touchcancel', onTouchEnd);
    return () => {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [node, canStart, settle]);

  /* ── Mouse: pointer events are enough, nothing to preventDefault ── */
  const onPointerDown = useCallback((e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (!canStart(e.target, e.currentTarget)) return;
    gesture.current = { startY: e.clientY, startT: performance.now(), active: true, moved: false };
  }, [canStart]);

  const onPointerMove = useCallback((e) => {
    const g = gesture.current;
    if (e.pointerType !== 'mouse' || !g.active) return;
    const dy = e.clientY - g.startY;
    if (!g.moved) {
      if (dy < SLOP) { if (dy < -SLOP) g.active = false; return; }
      g.moved = true;
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setOffset(dy > 0 ? dy : dy / 4);
  }, []);

  const onPointerUp = useCallback((e) => {
    if (e.pointerType !== 'mouse' || !gesture.current.active) return;
    settle(e.clientY, performance.now());
  }, [settle]);

  // A drag that ended over a button must not also count as a tap on it.
  const onClickCapture = useCallback((e) => {
    if (movedRecently.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const style = {
    transform: closing ? 'translateY(100%)' : (offset ? `translateY(${offset}px)` : undefined),
    transition: dragging ? 'none' : `transform ${EXIT_MS}ms var(--ease-out)`,
    ...(dragging ? { overflowY: 'hidden' } : null),
    ...(closing ? { pointerEvents: 'none' } : null),
  };

  return {
    close,
    closing,
    dragging,
    style,
    handlers: {
      ref: setNode,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
    },
  };
}
