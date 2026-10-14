import { createPortal } from 'react-dom';
import useSheetDrag from '../hooks/useSheetDrag';
import useBackHandler from '../hooks/useBackHandler';

/* ── Sheet ───────────────────────────────────────────────────────────────
   The one bottom sheet. Every sheet in the app is this, so they all look
   and behave the same: grab handle, title + close button, drag down to
   dismiss, the phone's back gesture closes it, and it slides out.

     {show && (
       <Sheet title="מיון ותצוגה" onClose={() => setShow(false)}>
         {({ close }) => <button onClick={close}>…</button>}
       </Sheet>
     )}

   Render it only while open. `onClose` runs after the exit animation.
   Children may be a function, to close with the animation from inside;
   so may `header`, which replaces the standard title row.

   `onAttemptClose` is for forms with unsaved changes: the backdrop, the
   close button and back call it instead of closing, and the drag is off
   while `dragEnabled` is false.

   It is portalled into the app frame, so a sheet opened from inside a
   sticky toolbar or a transformed card is never clipped or stacked
   under something else, and it keeps the frame's width on desktop.    */
export default function Sheet({
  onClose,
  title,
  label,
  header,
  onAttemptClose,
  dragEnabled = true,
  style,
  children,
}) {
  const sheet = useSheetDrag(onClose, { enabled: dragEnabled });
  const requestClose = onAttemptClose || sheet.close;
  useBackHandler(true, requestClose);

  const host = document.querySelector('.app-container') || document.body;
  return createPortal(
    <div className="modal-overlay" data-closing={sheet.closing || undefined} onClick={requestClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={label || (typeof title === 'string' ? title : undefined)}
        onClick={e => e.stopPropagation()}
        {...sheet.handlers}
        style={{ ...style, ...sheet.style }}
      >
        <div className="sheet-grab" />
        {typeof header === 'function' ? header({ close: requestClose }) : header ?? (title != null && (
          <div className="modal-header">
            <h2>{title}</h2>
            <button type="button" aria-label="סגור" className="btn-close" onClick={requestClose}>✕</button>
          </div>
        ))}
        {typeof children === 'function' ? children({ close: sheet.close }) : children}
      </div>
    </div>,
    host
  );
}

/* A titled group inside a sheet: a quiet label over its controls. */
export function SheetSection({ label, children }) {
  return (
    <section className="sheet-section">
      {label && <div className="sheet-section-label">{label}</div>}
      {children}
    </section>
  );
}

/* A segmented control: one choice out of a few, icon over label.
   options: [{ key, label, Icon?, disabled?, title? }]                   */
export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(({ key, label: text, Icon, disabled, title }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          disabled={disabled}
          title={title || text}
          onClick={() => onChange(key)}
        >
          {Icon && <Icon size={16} />}
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}
