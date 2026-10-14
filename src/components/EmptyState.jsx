/* One shape for "there is nothing here yet".
 *
 * Each tab had grown its own: a bare line of grey text in one, an icon
 * and two lines in another, an icon and a button in a third — and one
 * of them said "לחץ על +" long after the + had moved. A person hitting
 * an empty tab is at the point where they most need telling what the
 * screen is for and what to do next, which is exactly where the app was
 * least consistent.
 *
 * `action` is a node rather than a label + handler: some empty states
 * offer a button, some two, and some none.
 */
export default function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="glass-card empty-state">
      {Icon && (
        <span className="empty-state-icon" aria-hidden="true">
          <Icon size={24} />
        </span>
      )}
      <p className="empty-state-title">{title}</p>
      {hint && <p className="empty-state-hint">{hint}</p>}
      {action}
    </div>
  );
}
