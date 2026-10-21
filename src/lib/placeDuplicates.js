// Places on the list that look like the same place: the same name, or the
// same location (the link or the address in the place's address field),
// once case, spaces, marks and a link's https://, www. and trailing slash
// are set aside. Pure (tests/placeDuplicates.test.mjs).

export const nameKey = (title) => String(title || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[‎‏]/g, '')
  .replace(/["'`׳״.,!?()\-–—:;]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const placeKey = (address) => String(address || '')
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/^www\./, '')
  .replace(/\/+$/, '')
  .replace(/\s+/g, ' ');

// groups: the ids of each set of duplicates (two or more), in list order.
// byId: id → { group, name, place } (does its name / location match one
// of the others).
export function findDuplicates(plans) {
  const list = plans || [];
  const parent = new Map(list.map(p => [p.id, p.id]));
  const find = (id) => {
    while (parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); }
    return id;
  };
  const why = new Map(list.map(p => [p.id, { name: false, place: false }]));
  const join = (key, kind) => {
    const seen = new Map();
    for (const p of list) {
      const k = key(p);
      if (!k) continue;
      if (seen.has(k)) {
        const first = seen.get(k);
        parent.set(find(p.id), find(first));
        why.get(p.id)[kind] = true;
        why.get(first)[kind] = true;
      } else seen.set(k, p.id);
    }
  };
  join(p => nameKey(p.title), 'name');
  join(p => placeKey(p.address), 'place');

  const byRoot = new Map();
  for (const p of list) {
    const r = find(p.id);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(p.id);
  }
  const groups = [...byRoot.values()].filter(g => g.length > 1);
  const byId = new Map();
  for (const group of groups) for (const id of group) byId.set(id, { group, ...why.get(id) });
  return { groups, byId };
}
