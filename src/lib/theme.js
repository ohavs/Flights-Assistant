// The palettes of settings → "מראה" (index.css, [data-palette]) and the
// light/dark choices. Each is shown as the app icon drawn in its colours
// (public/app-icons/<icon>.png, scripts/app-icons.mjs) and named after it;
// a tap changes the colours and the background, never the app's own icon.
export const PALETTES = [
  { key: 'green',  label: 'קלאסי', icon: 'classic' },
  { key: 'coral',  label: 'שקיעה', icon: 'sunset' },
  { key: 'violet', label: 'לילה',  icon: 'night' },
  { key: 'sand',   label: 'מפה',   icon: 'map' },
  { key: 'ocean',  label: 'ים',    icon: 'sea' },
];
export const MODES = ['light', 'dark', 'system'];
