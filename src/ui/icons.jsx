/* Sticker-style icons (the Payments-2026 language): flat colour fills with
   an ink outline. Nav icons take an `active` flag; inactive ones go grey
   (--nav-off-fill / --nav-off-stroke). 24×24 grid, 2px outline. In dark
   mode the outline turns light (--icon-ink), as the Payments plan says. */

// Outline colour: ink on light, light on dark (--icon-ink).
const INK = 'var(--icon-ink, #141414)';
const sw = { strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' };

function Svg({ size, children }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{children}</svg>;
}

export function NavIcon({ name, active, size = 28 }) {
  const on = (c) => (active ? c : 'var(--nav-off-fill)');
  const st = { ...sw, stroke: active ? INK : 'var(--nav-off-stroke)' };
  switch (name) {
    case 'flight': return (
      <Svg size={size}>
        <g transform="rotate(45 12 12)">
          <path d="M12 9.2 21 13.4v1.6l-9-2.2-9 2.2v-1.6Z" fill={on('#5C9BFF')} {...st} />
          <path d="M12 17.2 15.6 19.6v1.3l-3.6-1-3.6 1v-1.3Z" fill={on('#F25C54')} {...st} />
          <rect x="10.5" y="2.4" width="3" height="18" rx="1.5" fill={active ? '#FFFFFF' : 'var(--nav-off-fill)'} {...st} />
        </g>
      </Svg>
    );
    case 'planning': return (
      <Svg size={size}>
        <path d="M3.4 6.2 9 4.2l6 2 5.6-2v13.6l-5.6 2-6-2-5.6 2Z" fill={on('#FFC93C')} {...st} />
        <path d="M9 4.2v13.6M15 6.2v13.6" {...st} fill="none" />
        <path d="M15 15.6s-3.4-3.2-3.4-5.7a3.4 3.4 0 0 1 6.8 0c0 2.5-3.4 5.7-3.4 5.7Z" fill={on('#F25C54')} {...st} />
        <circle cx="15" cy="9.9" r="1.1" fill={active ? '#FFFFFF' : 'var(--nav-off-stroke)'} />
      </Svg>
    );
    case 'checklist': return (
      <Svg size={size}>
        <rect x="4.4" y="4" width="15.2" height="17" rx="2.6" fill={active ? '#FFFFFF' : 'var(--nav-off-fill)'} {...st} />
        <rect x="8.4" y="2.4" width="7.2" height="4" rx="1.6" fill={on('#4F46E5')} {...st} />
        <path d="m7.8 11.6 1.6 1.6 3-3M7.8 16.6l1.6 1.6 3-3" fill="none" {...st} stroke={active ? '#22A45D' : 'var(--nav-off-stroke)'} strokeWidth="2.2" />
        <path d="M14.6 12h1.8M14.6 17h1.8" {...st} />
      </Svg>
    );
    case 'bookings': return (
      <Svg size={size}>
        <rect x="3.4" y="5" width="17.2" height="15.6" rx="3" fill={active ? '#FFFFFF' : 'var(--nav-off-fill)'} {...st} />
        <path d="M3.4 8a3 3 0 0 1 3-3h11.2a3 3 0 0 1 3 3v2.2H3.4Z" fill={on('#F25C54')} {...st} />
        <path d="M8 3.2v3.6M16 3.2v3.6" {...st} />
        <path d="m8.8 15 2.2 2.2 4.2-4.2" fill="none" {...st} stroke={active ? '#22A45D' : 'var(--nav-off-stroke)'} strokeWidth="2.2" />
      </Svg>
    );
    case 'expenses': return (
      <Svg size={size}>
        <path d="M5.2 6.6 15.4 3.7a1.1 1.1 0 0 1 1.4 1.06V6.6" fill={on('#FFC93C')} {...st} />
        <rect x="3" y="6.6" width="18" height="13.6" rx="3" fill={on('#22A45D')} {...st} />
        <rect x="14" y="11.2" width="7" height="5" rx="1.6" fill={active ? '#FFFFFF' : 'var(--nav-off-fill)'} {...st} />
        <circle cx="16.8" cy="13.7" r="0.9" fill={active ? INK : 'var(--nav-off-stroke)'} />
      </Svg>
    );
    default: return null;
  }
}
