const KEY = process.env.KEY;
const anchor = { latitude: 47.4979, longitude: 19.0402 };
async function find(q) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'places.id,places.location,places.displayName' },
    body: JSON.stringify({ textQuery: q, locationBias: { circle: { center: anchor, radius: 50000 } } }),
  });
  const d = await r.json();
  if (!r.ok) { console.log('places', r.status, JSON.stringify(d).slice(0, 300)); return null; }
  const p = d.places?.[0];
  console.log(q, '→', p?.displayName?.text, p?.location, p?.id);
  return p;
}
async function route(o, d, mode) {
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters' },
    body: JSON.stringify({ origin: o, destination: d, travelMode: mode }),
  });
  const j = await r.json();
  if (!r.ok) return `${r.status} ${JSON.stringify(j).slice(0, 200)}`;
  const x = j.routes?.[0];
  return x ? `${Math.round(parseInt(x.duration) / 60)}min ${x.distanceMeters}m` : 'no route';
}
const names = ['Buda Castle, Budapest', 'Sándor Palace, Budapest', "Fisherman's Bastion, Budapest", 'Cirkusz Cafe, Budapest', 'Hungarian National Gallery, Budapest'];
const ps = [];
for (const n of names) ps.push(await find(n));
const ll = p => ({ location: { latLng: p.location } });
const pid = p => ({ placeId: p.id });
const pairs = [[0, 1], [1, 2], [3, 0], [4, 1], [0, 2]];
for (const [a, b] of pairs) {
  const A = ps[a], B = ps[b];
  if (!A || !B) continue;
  for (const mode of ['WALK', 'TRANSIT']) {
    console.log(`${names[a]} → ${names[b]} ${mode}: latlng=${await route(ll(A), ll(B), mode)} | placeId=${await route(pid(A), pid(B), mode)}`);
  }
}
