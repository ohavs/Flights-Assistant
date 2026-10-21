import { Check } from 'lucide-react';

/* Small building blocks of the Payments-2026 design language. */

// Pastel background + text colour per tone. Pastels come from index.css
// (--butter, --mint, --sky, --lavender, --peach) and switch with the theme.
const TONES = {
  neutral:  ['var(--surface-2)', 'var(--text)'],
  butter:   ['var(--butter)', 'var(--text)'],
  mint:     ['var(--mint)', 'var(--c-green)'],
  sky:      ['var(--sky)', 'var(--text)'],
  lavender: ['var(--lavender)', 'var(--text)'],
  peach:    ['var(--peach)', 'var(--text)'],
  red:      ['var(--c-red-8)', 'var(--c-red)'],
  muted:    ['var(--surface-2)', 'var(--text-muted)'],
};

/* A pill-shaped tag: a status or a fact about a card ("חובה", "הוזמן").
   `size="sm"` for dense rows. */
export function Pill({ tone = 'neutral', icon, size, title, children, style }) {
  const [bg, fg] = TONES[tone] || TONES.neutral;
  const sm = size === 'sm';
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
      padding: sm ? '3px 8px' : '5px 10px', borderRadius: 999,
      background: bg, color: fg,
      fontSize: sm ? 11.5 : 12.5, fontWeight: 700, lineHeight: 1.15, whiteSpace: 'nowrap',
      ...style,
    }}>
      {icon}
      {children}
    </span>
  );
}

/* A category's icon on a disc tinted with the category's colour. */
export function CategoryDisc({ color, size = 42, radius, children, muted }) {
  return (
    <span className={`cat-disc${muted ? ' muted' : ''}`} style={{
      width: size, height: size, borderRadius: radius ?? Math.round(size / 3),
      background: muted ? 'var(--surface-2)' : `${color}1F`,
      color: muted ? 'var(--text-muted)' : color,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {children}
    </span>
  );
}

/* "Done" — one circle for every list: a place visited, a checklist item,
   a reminder. Empty ring; ticked, a check on a quiet disc that recedes
   with its card (no strike-through anywhere). Without `onToggle` it only
   shows the state. */
export function CheckCircle({ checked, onToggle, label }) {
  if (!onToggle) {
    return (
      <span className={`check-circle${checked ? ' on' : ''}`} aria-hidden="true">
        {checked && <Check size={18} strokeWidth={3} />}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`check-circle${checked ? ' on' : ''}`}
      aria-pressed={!!checked}
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      {checked && <Check size={18} strokeWidth={3} />}
    </button>
  );
}
