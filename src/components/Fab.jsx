import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';

/* ══════════════════════════════════════════════════════════
   The app's one "add" control.

   Every tab used to grow its own: a circle beside the planner's
   search box, a pill in the expenses header, a card that unfolds in
   the checklist, a full-width bar in the info tab. Same job, four
   shapes, four places to look. This is the single one — an extended
   floating button in the same corner of every tab, just above the nav.

   Rendered through a portal because `position: fixed` resolves against
   the nearest transformed or filtered ancestor, and the tab wrappers
   animate with a transform: left in place, the button would be pinned
   inside the tab instead of the viewport. The portal goes to
   `.app-container` and not to <body>: the container is `isolation:
   isolate`, so anything outside it — a button included — paints above
   every sheet inside it, whatever its z-index. (Its `overflow: hidden`
   can't clip the button, which is fixed to the viewport.)

   While one is mounted <body> carries `data-fab`, so `.app-content` can
   reserve room for it — the button covers a bottom corner and the last
   row of a list has to stay reachable.
   ══════════════════════════════════════════════════════════ */

let mountedCount = 0;

export default function Fab({ label, onClick, icon }) {
  useEffect(() => {
    mountedCount += 1;
    document.body.setAttribute('data-fab', '');
    return () => {
      mountedCount -= 1;
      // Two tabs can overlap for a frame while one is unmounting.
      if (mountedCount <= 0) {
        mountedCount = 0;
        document.body.removeAttribute('data-fab');
      }
    };
  }, []);

  return createPortal(
    <button type="button" className="fab" onClick={onClick}>
      {icon || <Plus size={20} />}
      <span>{label}</span>
    </button>,
    document.querySelector('.app-container') || document.body
  );
}
