const KEY = process.env.KEY;
const NEAR = 150;
const m = (a, b) => { const r = d => d * Math.PI / 180; const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(h)); };
async function near(c, text) {
  const dLat = NEAR / 111000, dLng = dLat / Math.cos(c.lat * Math.PI / 180);
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'places.id,places.location,places.displayName' },
    body: JSON.stringify({ textQuery: text, pageSize: 5, locationRestriction: { rectangle: { low: { latitude: c.lat - dLat, longitude: c.lng - dLng }, high: { latitude: c.lat + dLat, longitude: c.lng + dLng } } } }),
  });
  const d = await r.json();
  if (!r.ok) return `HTTP ${r.status} ${JSON.stringify(d).slice(0, 300)}`;
  return (d.places || []).map(p => `${p.displayName?.text} ${Math.round(m(c, { lat: p.location.latitude, lng: p.location.longitude }))}m ${p.id}`).join(' ; ') || 'none';
}
const cases = [
  [{ lat: 47.4962048 + 0.0004, lng: 19.0395666 }, ['הארמון המלכותי', 'Buda Castle']],
  [{ lat: 47.4979898, lng: 19.0381875 + 0.0005 }, ['החלפת משמרות בשעה 12', 'Sándor-palota']],
  [{ lat: 47.5021827, lng: 19.0347813 }, ['באסטיון הדייגים']],
  [{ lat: 47.4984569, lng: 19.061539 }, ['Cirkusz cafe']],
];
for (const [c, texts] of cases) for (const t of texts) console.log(t, '→', await near(c, t));
