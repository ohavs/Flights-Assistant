/* A planning category's theme (the owner's ask, 8.69.0): what its cards
   look like — a texture over a tint of the category's colour, and for some
   an ornament (a Santa hat on a Christmas market). Read from the
   category's name, and failing that from the emoji picked for it, since
   categories are the user's own and named freely ("שווקי כריסמס",
   "ברים", "Coffee"). Pure: tests/categoryTheme.test.mjs.

   `hue` is the colour a category gets when none was picked for it and it
   has no default one — a Christmas market red rather than the stock
   indigo. The textures and the ornament are in index.css ([data-ct]). */

export const THEMES = {
  christmas:   { hue: '#C62F2F', ornament: 'santa' },
  events:      { hue: '#C2410C' },
  bars:        { hue: '#C77A0A' },
  cafe:        { hue: '#8A5A3B' },
  food:        { hue: '#E5484D' },
  museums:     { hue: '#7C3AED' },
  spa:         { hue: '#0E87A8' },
  nature:      { hue: '#15803D' },
  shopping:    { hue: '#D9367A' },
  attractions: { hue: '#F2701D' },
  sights:      { hue: '#16874A' },
  transport:   { hue: '#2563EB' },
  info:        { hue: '#6E56CF' },
};

/* In order: the first theme a name matches wins, so "שווקי כריסמס" is
   Christmas before it is a market. A word of three letters or more
   matches the start of a word in the name ("מסעד" → "מסעדות"); a shorter
   one, or one marked "=", only the whole word ("בר" but not "ברזל",
   "bar=" but not "Barcelona"). */
const RULES = [
  ['christmas', ['כריסמס', 'קריסמס', 'המולד', 'אדוונט', 'christmas', 'xmas', 'advent', 'weihnacht', 'noel'],
    ['🎄', '🎅', '🤶', '⛄', '☃', '❄', '🎁', '🦌', '🔔']],
  ['events', ['אירוע', 'הופע', 'קונצרט', 'מופע', 'הצג', 'פסטיב', 'תיאטר', 'אופר', 'event', 'concert', 'show', 'festival', 'theat', 'opera', 'gig='],
    ['🎭', '🎤', '🎵', '🎶', '🎉', '🎪', '🎻', '🎸', '🎷', '🎺']],
  ['bars', ['בר', 'ברים', 'פאב', 'בירה', 'בירות', 'יין=', 'יינות', 'קוקטייל', 'משקא', 'מועדונ', 'bar=', 'bars=', 'pub=', 'beer', 'wine', 'cocktail', 'drink', 'nightlife', 'club', 'brewer'],
    ['🍻', '🍺', '🍷', '🍸', '🍹', '🥂', '🥃', '🍾', '🪩']],
  ['cafe', ['קפה', 'מאפ', 'קינוח', 'גלידה', 'גלידות', 'עוגות', 'cafe', 'café', 'coffee', 'bakery', 'bakeries', 'dessert', 'gelato', 'sweets'],
    ['☕', '🍰', '🧁', '🍩', '🍦', '🥐', '🍨', '🍪', '🥨']],
  ['food', ['מסעד', 'אוכל', 'אכיל', 'ארוח', 'מזון', 'food', 'restaurant', 'eat=', 'eats=', 'dining', 'lunch', 'dinner', 'brunch', 'breakfast'],
    ['🍽', '🍴', '🍕', '🍔', '🍜', '🍣', '🥘', '🍝', '🌮', '🥗', '🍲', '🥙', '🍛', '🥟']],
  ['museums', ['מוזיאו', 'גלרי', 'אמנות', 'תערוכ', 'museum', 'galler', 'art=', 'arts=', 'exhibit'],
    ['🖼', '🎨']],
  ['spa', ['מרחצ', 'ספא', 'בריכ', 'חוף', 'חופים', 'ים', 'רחצה', 'תרמ', 'spa=', 'spas=', 'bath', 'baths', 'thermal', 'beach', 'beaches', 'pool=', 'pools=', 'sea='],
    ['♨', '🏖', '🏊', '🌊', '🧖', '🛁']],
  ['nature', ['טבע', 'פארק', 'גן', 'גנים', 'גינ', 'הר', 'הרים', 'אגם', 'נהר', 'מסלול', 'יער', 'nature', 'park', 'parks', 'garden', 'hike', 'hiking', 'trail', 'lake', 'mountain', 'forest', 'river'],
    ['🌳', '🌲', '🏞', '⛰', '🌿', '🌷', '🌸', '🏔', '🌻', '🍃']],
  ['shopping', ['קני', 'שופינג', 'חנו', 'שוק', 'שווק', 'אאוטלט', 'מתנות', 'מזכרו', 'shop', 'mall', 'market', 'outlet', 'souvenir', 'store', 'boutique'],
    ['🛍', '🛒', '👗', '👜', '💍', '👠', '🧥']],
  ['attractions', ['אטרקצי', 'פעילו', 'לעשות', 'בילוי', 'כיף', 'ילדים', 'attraction', 'activit', 'things', 'fun=', 'kids', 'experienc'],
    ['🎡', '🎢', '🎠', '🎟', '🎫', '🎳', '🎯', '🧩']],
  ['sights', ['לבקר', 'אתר', 'אתרים', 'תצפית', 'תצפיות', 'נקודות', 'היסטור', 'ארמונ', 'כנסי', 'sight', 'landmark', 'viewpoint', 'monument', 'histor', 'palace', 'church', 'visit'],
    ['🏛', '🕌', '⛪', '🏰', '🗽', '🗼', '🕍', '🏯', '⛩', '🌉', '📸']],
  ['transport', ['תחבור', 'רכבת', 'אוטובוס', 'מטרו', 'תחנ', 'נסיע', 'הסע', 'transport', 'train', 'bus=', 'metro', 'transit', 'taxi', 'ferry'],
    ['🚇', '🚌', '🚆', '🚕', '🚊', '🚋', '⛴', '🚉', '🚲']],
  ['info', ['מידע', 'טיפ', 'שימושי', 'מסמכ', 'info', 'tips=', 'useful', 'notes'],
    ['ℹ', '💡', '📝', '📌', '📋']],
];

// Hebrew joins "and", "the", "in"… to the word: "ומקומות", "וטיפים".
const PREFIX = /^[והבלמש]/;

function words(name) {
  const out = [];
  String(name || '').toLowerCase().normalize('NFC')
    .replace(/[֑-ׇ]/g, '')               // niqqud and cantillation
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .forEach(w => {
      out.push(w);
      if (w.length > 3 && PREFIX.test(w)) out.push(w.slice(1));
    });
  return out;
}

const matches = (ws, word) => {
  if (word.endsWith('=')) return ws.includes(word.slice(0, -1));
  return ws.some(w => (word.length >= 3 ? w.startsWith(word) : w === word));
};

// Variation selectors and skin tones do not change what an emoji is.
const bare = (e) => String(e || '').replace(/[︎️]|\p{Emoji_Modifier}/gu, '');

/* The theme's key for a category, or null for a plain card. */
export function categoryTheme(name, emoji) {
  const ws = words(name);
  for (const [key, list] of RULES) if (list.some(w => matches(ws, w))) return key;
  const e = bare(emoji);
  if (e) for (const [key, , emojis] of RULES) if (emojis.some(x => e.includes(x))) return key;
  return null;
}
