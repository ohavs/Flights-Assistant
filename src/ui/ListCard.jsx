import { ChevronLeft } from 'lucide-react';
import SwipeRow from '../components/SwipeRow';
import ActionsMenu from './ActionsMenu';

/* ── ListCard ────────────────────────────────────────────────────────────
   The one list row. A booking, an expense, an info item and a place all
   read the same way and answer a finger the same way:

     [lead] [icon]  Title (up to two lines)         [trailing] [⋯ or ›]
                    meta line
                    (tags)
     (children: anything the item needs below — a code, quick actions)

   - Tap the card: `onOpen` (its details, or its form). A quiet › says so
     when there is no ⋯.
   - ⋯ opens a sheet with `actions` ({ key, label, Icon, run, danger?,
     disabled?, swipe? }). Visible on every device — no hover-only icons.
   - Swiping the row aside reveals the actions marked `swipe`, as a
     shortcut to the same thing.
   - `muted`: done, visited, cancelled — a quieter card, no strike-through.

     <ListCard
       icon={<CategoryDisc color={c}><Icon size={19} /></CategoryDisc>}
       title={b.title} meta="12.10 · 20:00" tags={[<Pill …/>]}
       onOpen={() => edit(b)}
       actions={[{ key: 'edit', label: 'עריכה', Icon: Pencil, run: …, swipe: true }]}
     />                                                                    */
export default function ListCard({
  lead,
  icon,
  title,
  meta,
  metaIcon,
  tags,
  trailing,
  onOpen,
  actions = [],
  menuTitle,
  muted = false,
  className = '',
  style,
  children,
}) {
  const live = actions.filter(Boolean);
  const swipe = live.filter(a => a.swipe).map(a => ({
    key: a.key, label: a.label, Icon: a.Icon,
    tone: a.danger ? 'danger' : undefined,
    onAction: a.run,
  }));
  const name = menuTitle || (typeof title === 'string' ? title : '');
  const tagList = (Array.isArray(tags) ? tags : [tags]).filter(Boolean);

  const content = (
    <>
      <div className="list-card-row">
        {lead}
        {icon}
        <div className="list-card-text">
          <h3 className="list-card-title">{title}</h3>
          {meta && (
            <div className="list-card-meta">
              {metaIcon}
              <span>{meta}</span>
            </div>
          )}
          {tagList.length > 0 && <div className="list-card-tags">{tagList}</div>}
        </div>
        {trailing}
        {live.length > 0 ? (
          <ActionsMenu title={name} actions={live} className="list-card-more" />
        ) : onOpen ? (
          <ChevronLeft size={18} className="list-card-chevron" aria-hidden="true" />
        ) : null}
      </div>
      {/* Below the row, lined up under the title. */}
      {children && <div className={`list-card-body${icon || lead ? ' indent' : ''}`}>{children}</div>}
    </>
  );

  const cls = `glass-card list-card${muted ? ' muted' : ''}${className ? ' ' + className : ''}`;
  const open = onOpen ? {
    role: 'button',
    tabIndex: 0,
    onKeyDown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } },
  } : {};

  return swipe.length > 0 ? (
    <SwipeRow actions={swipe} onClick={onOpen} className={cls} style={style} {...open}>
      {content}
    </SwipeRow>
  ) : (
    <div className={cls} style={style} onClick={onOpen} {...open}>
      {content}
    </div>
  );
}
