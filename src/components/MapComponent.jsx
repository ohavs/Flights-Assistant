import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { getIntermediatePoint } from '../services/flightSimulator';

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

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Leaflet map if not already done
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: true,
      });

      // Use a clean, modern, light tile template (CartoDB Positron is very beautiful and clean)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(mapRef.current);
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
      padding: [40, 40],
      animate: true,
      duration: 0.8,
    });

  }, [depCoords, arrCoords, progressPercent]);

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
