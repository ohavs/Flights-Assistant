import { useLayoutEffect, useRef } from 'react';

/* Rows that change places glide to their new place instead of jumping.

   After every render, each child of `ref` that carries `data-flip` (a
   stable key) is measured against the list's own top, so a list that
   moves as a whole (a section opening above it) does not animate. A row
   whose place in the list changed is set back where it was and eased into
   the new one (FLIP). The row that travels furthest is drawn above the
   rest: a ticked item is seen going down past the others, and nobody
   mistakes it for deleted. Nothing moves for prefers-reduced-motion.    */
export default function useFlip(ref, duration = 520) {
  const last = useRef(new Map());
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) { last.current = new Map(); return; }
    const top = box.getBoundingClientRect().top;
    const rows = [...box.children].filter(el => el.dataset.flip);
    const now = new Map(rows.map(el => [el.dataset.flip, el.getBoundingClientRect().top - top]));
    const prev = last.current;
    last.current = now;
    if (!prev.size || !box.animate
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const moved = rows
      .map(el => ({ el, dy: prev.has(el.dataset.flip) ? prev.get(el.dataset.flip) - now.get(el.dataset.flip) : 0 }))
      .filter(m => Math.abs(m.dy) >= 1);
    if (!moved.length) return;
    const far = moved.reduce((a, b) => (Math.abs(b.dy) > Math.abs(a.dy) ? b : a));
    const easing = 'cubic-bezier(0.25, 0.8, 0.25, 1)';
    for (const { el, dy } of moved) {
      if (el === far.el) {
        el.style.position = 'relative';
        el.style.zIndex = '2';
        el.animate([
          { transform: `translateY(${dy}px) scale(1)` },
          { transform: `translateY(${dy * 0.85}px) scale(1.03)`, offset: 0.2 },
          { transform: 'none' },
        ], { duration, easing }).finished
          .catch(() => {})
          .then(() => { el.style.position = ''; el.style.zIndex = ''; });
      } else {
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration, easing });
      }
    }
  });
}
