const KEY = process.env.KEY;
const m = (a, b) => { const r = d => d * Math.PI / 180; const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(h)); };
async function nearest(c) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'places.id,places.location,places.displayName' },
    body: JSON.stringify({ locationRestriction: { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: 50 } }, maxResultCount: 3, rankPreference: 'DISTANCE' }),
  });
  const d = await r.json();
  if (!r.ok) return `HTTP ${r.status} ${JSON.stringify(d).slice(0, 300)}`;
  return (d.places || []).map(p => `${p.displayName?.text} ${Math.round(m(c, { lat: p.location.latitude, lng: p.location.longitude }))}m`).join(' ; ') || 'none';
}
for (const c of [
  { lat: 47.4979898, lng: 19.0381875 }, { lat: 47.4979898, lng: 19.0386875 },
  { lat: 47.4962048, lng: 19.0395666 }, { lat: 47.5021827, lng: 19.0347813 },
]) console.log(c, '→', await nearest(c));
