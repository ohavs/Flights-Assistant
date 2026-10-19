// A link as people type it ("booking.com/abc", "maps.app.goo.gl/x"): with
// https:// in front unless it already has a scheme. The link fields are
// type="text" inputMode="url", not type="url": the browser refused to save
// a form whose link lacked https://, with a message in English.
export function withScheme(url) {
  const s = String(url ?? '').trim();
  return !s || /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
}
