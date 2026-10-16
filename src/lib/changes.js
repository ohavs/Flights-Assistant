// What an edit changed: the fields of `next` that differ from `prev`, the
// item as the form opened it. An edit writes only these (updateDoc).
// Writing the whole item put back what a trip partner, or this phone
// offline, changed meanwhile, and brought back an item a partner deleted.
// Pure: tests/changes.test.mjs.
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function changedFields(prev, next) {
  const out = {};
  for (const [key, value] of Object.entries(next || {})) {
    if (!same(value, prev?.[key])) out[key] = value;
  }
  return out;
}
