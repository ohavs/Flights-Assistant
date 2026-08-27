import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { getIntermediatePoint } from '../services/flightSimulator';
import { useTheme } from '../ThemeContext';

/* ── Basemap ────────────────────────────────────────────────────────────
   Esri's Gray Canvas, in two layers: a pale ground with no lettering on
   it, and a transparent reference layer carrying the place names and
   borders. That split is why this style exists — the names sit on top of
   whatever is drawn between the two, and they are designed to stay
   legible on a near-white (or near-black) ground.

   It replaces a CSS filter over OpenStreetMap's standard tiles. Those
   tiles are drawn for reading at street zoom; pushed down to a whole
   continent inside a 148px card and then desaturated, their lettering
   thinned out to nothing. Filtering a finished map is guesswork —
   picking a style built for a quiet ground is not.

   A dark ground gets the real dark tileset rather than an inverted light
   one: inverting turns dark labels into glowing white-on-black smears.

   OSM stays as the fallback below, because a free tile host withdrawing
   is exactly what just happened with CARTO. */
const BASEMAPS = {
  light: {
    base:  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    label: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  },
  dark: {
    base:  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    label: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  },
};
const ESRI_ATTRIB = 'Esri, HERE, © OpenStreetMap';
const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Helper to calculate bearing/heading in degrees
function calculateHeading(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

export default function MapComponent({ depCoords, arrCoords, progressPercent }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({ dep: null, arr: null, plane: null, line: null });
  const tilesRef = useRef({ base: null, label: null });
  const { isDark } = useTheme();

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Leaflet map if not already done
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        scrollWheelZoom: false,
        dragging: true,
      });

      // Keep the data credit, drop Leaflet's own flag — the licence asks
      // for the former, not the latter. The map option is boolean-only in
      // Leaflet 1.x, so the prefix is cleared on the control itself.
      mapRef.current.attributionControl.setPrefix(false);

      // Labels get their own pane between Leaflet's overlay pane (400,
      // where the route line is) and its marker pane (600). So a place
      // name is never buried under the flight path, and never draws over
      // the plane or the two airport dots either.
      mapRef.current.createPane('labels');
      mapRef.current.getPane('labels').style.pointerEvents = 'none';
      mapRef.current.getPane('labels').style.zIndex = 450;
    }

    const map = mapRef.current;
    const markers = markersRef.current;

    // Remove existing layers if they exist
    if (markers.dep) map.removeLayer(markers.dep);
    if (markers.arr) map.removeLayer(markers.arr);
    if (markers.plane) map.removeLayer(markers.plane);
    if (markers.line) map.removeLayer(markers.line);

    // Coordinates
    const depLatLng = [depCoords.lat, depCoords.lng];
    const arrLatLng = [arrCoords.lat, arrCoords.lng];

    // Calculate current plane position
    const planeLatLng = getIntermediatePoint(
      depCoords.lat,
      depCoords.lng,
      arrCoords.lat,
      arrCoords.lng,
      progressPercent
    );

    // Calculate heading angle
    const heading = calculateHeading(
      depCoords.lat,
      depCoords.lng,
      arrCoords.lat,
      arrCoords.lng
    );

    // Create custom styled icons using SVGs for a modern look
    const depIcon = L.divIcon({
      html: `
        <div style="
          width: 14px;
          height: 14px;
          background: #ffffff;
          border: 3px solid #0b0b30;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        "></div>
      `,
      className: 'custom-dep-icon',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const arrIcon = L.divIcon({
      html: `
        <div style="
          width: 14px;
          height: 14px;
          background: #ffffff;
          border: 3px solid #0b0b30;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        "></div>
      `,
      className: 'custom-arr-icon',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    // Custom airplane icon rotated according to flight path heading
    const planeIcon = L.divIcon({
      html: `
        <div style="transform: rotate(${heading}deg); transition: transform 0.2s ease;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 16V14L13 9V3.5C13 2.67 12.33 2 11.5 2C10.67 2 10 2.67 10 3.5V9L2 14V16L10 13.5V19L8 20.5V22L11.5 21L15 22V20.5L13 19V13.5L21 16Z" fill="#0b0b30" stroke="#ffffff" stroke-width="1.5"/>
          </svg>
        </div>
      `,
      className: 'custom-plane-icon',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    // Add markers and line to map
    markers.dep = L.marker(depLatLng, { icon: depIcon }).addTo(map);
    markers.arr = L.marker(arrLatLng, { icon: arrIcon }).addTo(map);
    markers.plane = L.marker(planeLatLng, { icon: planeIcon }).addTo(map);

    // Draw blue flight path line
    markers.line = L.polyline([depLatLng, arrLatLng], {
      color: '#4f46e5',
      weight: 2,
      opacity: 0.8,
      dashArray: '6, 6', // dashed line for a clean design
    }).addTo(map);

    // Fit map view bounds containing all elements with some padding
    const bounds = L.latLngBounds([depLatLng, arrLatLng]);
    map.fitBounds(bounds, {
      // 40px of padding inside a 148px card left 68px of usable height and
      // cost a whole zoom level, which is where the place names went.
      padding: [22, 22],
      animate: true,
      duration: 0.8,
    });

  }, [depCoords, arrCoords, progressPercent]);

  // Basemap, swapped whole when the theme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const tiles = tilesRef.current;
    const set = BASEMAPS[isDark ? 'dark' : 'light'];

    if (tiles.base)  map.removeLayer(tiles.base);
    if (tiles.label) map.removeLayer(tiles.label);

    tiles.base = L.tileLayer(set.base, { maxZoom: 16, attribution: ESRI_ATTRIB }).addTo(map);
    tiles.label = L.tileLayer(set.label, { maxZoom: 16, pane: 'labels' }).addTo(map);

    // If the ground tiles stop arriving — a host withdrawing free access,
    // the way CARTO just did — drop to OSM rather than showing an empty
    // card. One swap only: the handler comes off with the layer.
    let fellBack = false;
    tiles.base.on('tileerror', () => {
      if (fellBack) return;
      fellBack = true;
      if (tiles.label) { map.removeLayer(tiles.label); tiles.label = null; }
      map.removeLayer(tiles.base);
      tiles.base = L.tileLayer(OSM_URL, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    });

    return () => {
      if (tiles.base)  { map.removeLayer(tiles.base);  tiles.base = null; }
      if (tiles.label) { map.removeLayer(tiles.label); tiles.label = null; }
    };
  }, [isDark]);

  // Clean up Leaflet map instance on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="map-wrapper">
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
