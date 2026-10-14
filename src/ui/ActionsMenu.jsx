import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import Sheet from './Sheet';

/* ⋯ and the sheet it opens: an item's actions, the same way everywhere
   (a list card, a group header). actions: [{ key, label, Icon, run,
   danger?, disabled? }]. Falsy entries are skipped.

   The sheet is rendered next to the button, not inside it, and the tap
   stops at the button: a portal still bubbles React events to its
   parents, and choosing an action must not also open the card.         */
export default function ActionsMenu({ title, actions, size = 34, className = '' }) {
  const [open, setOpen] = useState(false);
  const live = (actions || []).filter(Boolean);
  if (!live.length) return null;
  return (
    <>
      <button
        type="button"
        className={`round-btn actions-more ${className}`}
        style={{ width: size, height: size, minWidth: size }}
        aria-label={`פעולות: ${title}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <Sheet title={title} onClose={() => setOpen(false)}>
          {({ close }) => (
            <div className="list-group">
              {live.map(({ key, label, Icon, run, danger, disabled }) => (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  className={`list-row${danger ? ' danger' : ''}`}
                  onClick={() => { close(); run(); }}
                >
                  <Icon size={18} className="list-row-icon" />
                  <span className="list-row-label">{label}</span>
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
