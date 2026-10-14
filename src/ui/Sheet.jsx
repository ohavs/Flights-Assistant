import { createPortal } from 'react-dom';
import { useConfirm } from '../ConfirmContext';
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
   so may `header`, which replaces the standard title row. They get
   `close`, which just closes (after a save), and `cancel`, which asks
   first when there are unsaved changes (the form's "ביטול").

   `dirty` is for forms: while true, the backdrop, ✕, back and `cancel`
   all ask "צא בלי לשמור?" before closing, and the drag is off. Put the
   save buttons in a `.sheet-footer` so they stay in reach.

   It is portalled into the app frame, so a sheet opened from inside a
   sticky toolbar or a transformed card is never clipped or stacked
   under something else, and it keeps the frame's width on desktop.    */
export default function Sheet({
  onClose,
  title,
  label,
  header,
  dirty = false,
  style,
  children,
}) {
  const confirm = useConfirm();
  const sheet = useSheetDrag(onClose, { enabled: !dirty });
  // While it asks, the confirm dialog sits over the sheet and takes the
  // taps and the back press, so it cannot ask twice.
  const requestClose = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'יש שינויים שלא נשמרו',
        message: 'הזנת פרטים שלא נשמרו. האם לצאת בלי לשמור?',
        confirmText: 'צא בלי לשמור',
        cancelText: 'המשך עריכה',
        danger: true,
      });
      if (!ok) return;
    }
    sheet.close();
  };
  useBackHandler(true, requestClose);
  const api = { close: sheet.close, cancel: requestClose };

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
        {typeof header === 'function' ? header(api) : header ?? (title != null && (
          <div className="modal-header">
            <h2>{title}</h2>
            <button type="button" aria-label="סגור" className="btn-close" onClick={requestClose}>✕</button>
          </div>
        ))}
        {typeof children === 'function' ? children(api) : children}
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
