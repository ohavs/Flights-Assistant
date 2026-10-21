// A category can wear an emoji typed from the phone's keyboard instead of
// one of the icons. Whatever the keyboard sends is one grapheme: a plain
// emoji, one with a skin tone, a ZWJ family or profession, a flag (two
// regional letters, or a tag sequence like England's), a keycap. It is
// kept whole, never cut to its first code point.

// Is this one grapheme an emoji (and not a letter, a digit or a space)?
const IS_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

// Engines without Intl.Segmenter: the same sequences by hand.
const PART = String.raw`(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:️|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}])*`;
const SEQUENCE = new RegExp(String.raw`\p{Regional_Indicator}{2}|[#*0-9]️?⃣|${PART}(?:‍${PART})*`, 'gu');

function graphemes(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(s => s.segment);
  }
  return text.match(SEQUENCE) || [];
}

// The last emoji in what was typed, or '' when there is none. The field
// holds the current emoji, so a new one typed after it is the last.
export function lastEmoji(text) {
  const found = graphemes(String(text || '')).filter(g => IS_EMOJI.test(g));
  return found.length ? found[found.length - 1].trim() : '';
}
