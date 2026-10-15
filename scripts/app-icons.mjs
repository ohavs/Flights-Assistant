// The app's launcher icons: five designs the user picks from in settings →
// "מראה" (AppToolsPlugin.setIcon switches the launcher alias). Each is an
// SVG on Android's 108dp adaptive-icon grid, rendered with Chromium into
//   android/app/src/main/res/mipmap-*/ic_launcher[_key]_{background,foreground,monochrome}.png
//   android/app/src/main/res/mipmap-*/ic_launcher[_key][_round].png   (Android 7)
//   android/app/src/main/res/mipmap-anydpi-v26/ic_launcher[_key][_round].xml
//   public/app-icons/<key>.png                                         (the picker)
// Classic keeps the plain names (ic_launcher*), so the app's own icon is it.
//   node scripts/app-icons.mjs [--preview out.png]
// Keep what matters inside the 66dp circle in the middle (21..87): a
// launcher may crop anything past it.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const RES = 'android/app/src/main/res';
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// An airliner pointing up in a 100 box, centred on 50,50.
const PLANE = 'M50 5C55.5 5 57.5 11 57.5 17.5V37.5L92.5 57.5C94.2 58.5 95 60.2 95 62V66L57.5 55.5V77.5L67 84.5C67.7 85 68 85.8 68 86.6V90L50 85.5L32 90V86.6C32 85.8 32.3 85 33 84.5L42.5 77.5V55.5L5 66V62C5 60.2 5.8 58.5 7.5 57.5L42.5 37.5V17.5C42.5 11 44.5 5 50 5Z';
// Heading north-east: the plane centred on (cx, cy), `size` dp from nose to tail.
const plane = (cx, cy, size, attrs = '') =>
  `<path d="${PLANE}" transform="translate(${cx} ${cy}) rotate(45) scale(${size / 85}) translate(-50 -50)" ${attrs}/>`;

// A small deterministic random, so the stars stay where they are.
function rand(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// A trail behind a plane flying north-east, from its tail towards (x, y).
const trail = (id, from, to, color, opacity) => `
  <linearGradient id="${id}" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
  </linearGradient>`;

const ICONS = [
  {
    key: 'classic', label: 'קלאסי', palette: 'green',
    background: `
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#36C97A"/><stop offset="1" stop-color="#13854A"/></linearGradient>
        <radialGradient id="hl" cx="0.3" cy="0.25" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="108" height="108" fill="url(#g)"/>
      <g fill="none" stroke="#fff" stroke-opacity="0.13" stroke-width="0.8">
        <circle cx="54" cy="54" r="30"/>
        <ellipse cx="54" cy="54" rx="14" ry="30"/>
        <line x1="54" y1="24" x2="54" y2="84"/>
        <path d="M27 42Q54 36 81 42M24 54H84M27 66Q54 72 81 66"/>
      </g>
      <rect width="108" height="108" fill="url(#hl)"/>`,
    foreground: `
      <defs>
        ${trail('t1', [46, 62], [22, 86], '#fff', 0.9)}
        <filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="1.2" dy="2.2" stdDeviation="1.4" flood-color="#00361A" flood-opacity="0.45"/></filter>
      </defs>
      <path d="M44 60L23 81M48 64L27 85" stroke="url(#t1)" stroke-width="1.6" stroke-linecap="round"/>
      ${plane(57, 51, 44, 'fill="#141414" filter="url(#s)"')}`,
    mono: plane(57, 51, 44, 'fill="#fff"'),
  },
  {
    key: 'sunset', label: 'שקיעה', palette: 'coral',
    background: `
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB86B"/><stop offset="0.5" stop-color="#FF7A6E"/><stop offset="1" stop-color="#B9417F"/></linearGradient>
        <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1B0"/><stop offset="1" stop-color="#FFB25C"/></linearGradient>
        <clipPath id="cut"><rect x="0" y="0" width="108" height="64"/><rect x="0" y="66.5" width="108" height="3.5"/><rect x="0" y="72.5" width="108" height="2.5"/><rect x="0" y="77.5" width="108" height="1.6"/></clipPath>
      </defs>
      <rect width="108" height="108" fill="url(#sky)"/>
      <circle cx="54" cy="64" r="24" fill="url(#sun)" clip-path="url(#cut)"/>
      <path d="M0 84Q20 79 40 83T80 82T108 81V108H0Z" fill="#8E2F6B" opacity="0.55"/>
      <path d="M0 91Q24 86 48 90T108 88V108H0Z" fill="#6B1F55" opacity="0.6"/>`,
    foreground: `
      <defs>${trail('t2', [45, 58], [20, 82], '#fff', 0.75)}</defs>
      <path d="M46 59L21 84" stroke="url(#t2)" stroke-width="2.2" stroke-linecap="round"/>
      ${plane(58, 47, 40, 'fill="#3A1636"')}`,
    mono: plane(58, 47, 40, 'fill="#fff"'),
  },
  {
    key: 'night', label: 'לילה', palette: 'violet',
    background: (() => {
      const r = rand(7);
      let stars = '';
      for (let i = 0; i < 46; i++) {
        const x = 4 + r() * 100, y = 4 + r() * 100;
        stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.25 + r() * 0.65).toFixed(2)}" fill="#fff" opacity="${(0.35 + r() * 0.65).toFixed(2)}"/>`;
      }
      const sparkle = (x, y, s) => `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="#fff"/>`;
      return `
      <defs>
        <radialGradient id="n" cx="0.7" cy="0.25" r="0.95"><stop offset="0" stop-color="#4A3A9C"/><stop offset="0.55" stop-color="#261E5E"/><stop offset="1" stop-color="#120F33"/></radialGradient>
        <mask id="moon"><circle cx="39" cy="30" r="6.5" fill="#fff"/><circle cx="42.3" cy="27.6" r="5.6" fill="#000"/></mask>
      </defs>
      <rect width="108" height="108" fill="url(#n)"/>
      ${stars}
      ${sparkle(76, 30, 2.6)}${sparkle(30, 74, 1.8)}${sparkle(84, 70, 1.6)}
      <circle cx="39" cy="30" r="6.5" fill="#FFE9A8" mask="url(#moon)"/>`;
    })(),
    foreground: `
      <defs>
        ${trail('t3', [46, 62], [24, 84], '#CFC4FF', 0.8)}
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="1.8" flood-color="#B9A8FF" flood-opacity="0.8"/></filter>
      </defs>
      <path d="M45 61L24 82" stroke="url(#t3)" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="2.4 2"/>
      ${plane(57, 51, 42, 'fill="#F1EDFF" filter="url(#glow)"')}
      <circle cx="37" cy="40.5" r="1.2" fill="#FF5A6E"/><circle cx="67.5" cy="71" r="1.2" fill="#4BE08A"/>`,
    mono: plane(57, 51, 42, 'fill="#fff"'),
  },
  {
    key: 'map', label: 'מפה', palette: 'sand',
    background: `
      <defs>
        <filter id="paper" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n"/>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.18  0 0 0 0.16 0"/>
          <feComposite in2="SourceGraphic" operator="in"/>
        </filter>
      </defs>
      <rect width="108" height="108" fill="#F4E7CD"/>
      <g stroke="#C9AE80" stroke-opacity="0.35" stroke-width="0.5">
        ${[18, 36, 54, 72, 90].map(v => `<line x1="${v}" y1="0" x2="${v}" y2="108"/><line x1="0" y1="${v}" x2="108" y2="${v}"/>`).join('')}
      </g>
      <g fill="none" stroke="#B8946A" stroke-opacity="0.45" stroke-width="0.7">
        <path d="M60 14C78 12 92 22 94 38S82 60 70 52 58 26 60 14Z"/>
        <path d="M64 21C75 20 85 27 86 37S78 51 70 46 62 28 64 21Z"/>
        <path d="M68 29C73 28 78 32 78 37S74 43 70 41 66 32 68 29Z"/>
        <path d="M8 70C20 62 34 66 40 76S34 100 20 98 0 80 8 70Z"/>
        <path d="M14 75C22 70 31 73 34 80S30 93 21 92 9 82 14 75Z"/>
      </g>
      <rect width="108" height="108" fill="#F4E7CD" filter="url(#paper)"/>`,
    foreground: `
      <path d="M36 69C39 63 37 61 42 60S48 61 49 58" fill="none" stroke="#C0582A" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 3.6"/>
      <path d="M35 81.5C35 81.5 29.5 75.8 29.5 72.2A5.5 5.5 0 0 1 40.5 72.2C40.5 75.8 35 81.5 35 81.5Z" fill="#C0582A"/>
      <circle cx="35" cy="72.2" r="2" fill="#F4E7CD"/>
      ${plane(61, 45, 38, 'fill="#3A2A1A"')}`,
    mono: plane(61, 45, 38, 'fill="#fff"'),
  },
  {
    key: 'sea', label: 'ים', palette: 'ocean',
    background: `
      <defs>
        <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5AD8E6"/><stop offset="0.55" stop-color="#2AA3D6"/><stop offset="1" stop-color="#155F9E"/></linearGradient>
      </defs>
      <rect width="108" height="108" fill="url(#w)"/>
      ${[[62, 0.24], [71, 0.2], [80, 0.16], [89, 0.12]].map(([y, o], i) =>
        `<path d="M${-9 + (i % 2) * 4.5} ${y}q4.5 -2.6 9 0${'t9 0'.repeat(13)}" fill="none" stroke="#fff" stroke-opacity="${o}" stroke-width="1.5" stroke-linecap="round"/>`).join('')}
      <circle cx="80" cy="24" r="10" fill="#fff" opacity="0.18"/><circle cx="80" cy="24" r="6" fill="#fff" opacity="0.25"/>`,
    foreground: `
      <defs>
        ${trail('t5', [45, 58], [24, 79], '#fff', 0.9)}
        <filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter>
      </defs>
      ${plane(62, 64, 30, 'fill="#0B3F6E" opacity="0.35" filter="url(#b)"')}
      <path d="M44 57L24 77M48 61L28 81" stroke="url(#t5)" stroke-width="1.4" stroke-linecap="round"/>
      ${plane(56, 46, 40, 'fill="#fff"')}`,
    mono: plane(56, 46, 40, 'fill="#fff"'),
  },
];

const svg = (inner, px, view = '0 0 108 108') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${view}">${inner}</svg>`;

// The whole icon (background + foreground), cut to a launcher shape.
const whole = (icon, px, view, shape) => {
  const [x, y, w] = view.split(' ').map(Number);
  const clip = shape === 'circle'
    ? `<circle cx="${x + w / 2}" cy="${y + w / 2}" r="${w / 2}"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="${w * 0.24}"/>`;
  return svg(`<defs><clipPath id="shape">${clip}</clipPath></defs><g clip-path="url(#shape)"><g>${icon.background}</g><g>${icon.foreground}</g></g>`, px, view);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(markup, px, out) {
  await page.setViewportSize({ width: Math.max(px, 16), height: Math.max(px, 16) });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
  if (out) writeFileSync(out, buf);
  return buf;
}

const previewAt = process.argv.indexOf('--preview');
if (previewAt > 0) {
  // One sheet to look at: each icon as a phone shows it, round and squircle.
  const cell = 200;
  const tiles = ICONS.map((icon, i) => `
    <div style="position:absolute;left:${i * (cell + 24) + 24}px;top:24px;text-align:center;font:600 16px sans-serif">
      ${whole(icon, cell, '18 18 72 72', 'rr')}<br>${whole(icon, 120, '18 18 72 72', 'circle')}<br>${icon.key}
    </div>`).join('');
  const w = ICONS.length * (cell + 24) + 24;
  await page.setViewportSize({ width: w, height: 420 });
  await page.setContent(`<html><body style="margin:0;background:#E9E9EE">${tiles}</body></html>`);
  writeFileSync(process.argv[previewAt + 1], await page.screenshot());
  await browser.close();
  process.exit(0);
}

for (const icon of ICONS) {
  const name = icon.key === 'classic' ? 'ic_launcher' : `ic_launcher_${icon.key}`;
  for (const [d, k] of Object.entries(DENSITIES)) {
    const dir = `${RES}/mipmap-${d}`;
    mkdirSync(dir, { recursive: true });
    const layer = Math.round(108 * k), legacy = Math.round(48 * k);
    await render(svg(icon.background, layer), layer, `${dir}/${name}_background.png`);
    await render(svg(icon.foreground, layer), layer, `${dir}/${name}_foreground.png`);
    await render(svg(icon.mono, layer), layer, `${dir}/${name}_monochrome.png`);
    await render(whole(icon, legacy, '12 12 84 84', 'rr'), legacy, `${dir}/${name}.png`);
    await render(whole(icon, legacy, '12 12 84 84', 'circle'), legacy, `${dir}/${name}_round.png`);
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/${name}_background"/>
    <foreground android:drawable="@mipmap/${name}_foreground"/>
    <monochrome android:drawable="@mipmap/${name}_monochrome"/>
</adaptive-icon>
`;
  mkdirSync(`${RES}/mipmap-anydpi-v26`, { recursive: true });
  writeFileSync(`${RES}/mipmap-anydpi-v26/${name}.xml`, xml);
  writeFileSync(`${RES}/mipmap-anydpi-v26/${name}_round.xml`, xml);
  mkdirSync('public/app-icons', { recursive: true });
  await render(whole(icon, 144, '18 18 72 72', 'rr'), 144, `public/app-icons/${icon.key}.png`);
}
await browser.close();
console.log(ICONS.map(i => i.key).join(' '));
