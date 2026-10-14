import { ChevronDown } from 'lucide-react';
import { Pill } from './kit';
import ActionsMenu from './ActionsMenu';

/* ── SectionHeader ───────────────────────────────────────────────────────
   The title over a group in a list — a category of places, of checklist
   items, of expenses, of info; upcoming / past bookings. One look in
   every tab: 16/800, the count in a Pill, a chevron that turns −90° when
   the group is folded.

     <SectionHeader title="בגדים" count="2/5" collapsed={!open}
       onToggle={() => toggle(cat)}
       lead={<DragHandle/>}
       actions={[{ key: 'rename', label: 'שינוי שם', Icon: Pencil, run }]}>
       <button aria-label="הוסף">+</button>
     </SectionHeader>

   `icon` + `color`: a category's icon, tinted. `meta`: quiet text after
   the count (a total). `children`: small trailing buttons. `actions`: the
   group's own ⋯ menu (rename, delete…) — visible, not a long press.   */
export default function SectionHeader({
  title,
  icon,
  color,
  count,
  meta,
  collapsed,
  onToggle,
  lead,
  actions,
  children,
  style,
  className = '',
  toggleProps,
}) {
  const inner = (
    <>
      {onToggle && (
        <ChevronDown
          size={16}
          className="section-header-chevron"
          style={{ color: color || undefined, transform: collapsed ? 'rotate(-90deg)' : 'none' }}
          aria-hidden="true"
        />
      )}
      {icon && <span className="section-header-icon" style={{ color: color || undefined }}>{icon}</span>}
      <span className="section-header-title">{title}</span>
      {count != null && count !== '' && <Pill size="sm" tone="neutral">{count}</Pill>}
      {meta && <span className="section-header-meta">{meta}</span>}
    </>
  );
  return (
    <div className={`section-header ${className}`} style={style}>
      {lead}
      {onToggle ? (
        <button
          type="button"
          className="section-header-toggle"
          onClick={onToggle}
          aria-expanded={!collapsed}
          {...toggleProps}
        >
          {inner}
        </button>
      ) : (
        <div className="section-header-toggle" role="heading" aria-level={3}>{inner}</div>
      )}
      {children}
      {actions && <ActionsMenu title={typeof title === 'string' ? title : ''} actions={actions} size={30} />}
    </div>
  );
}
