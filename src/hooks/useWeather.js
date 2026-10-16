import { useState, useEffect } from 'react';

export { getWeatherIcon, getWeatherLabel } from '../lib/weatherCodes.js';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
// Offline, an older forecast beats none: it covers 16 days.
const STALE_OK = 7 * 24 * 60 * 60 * 1000;
const CACHE_VER = 2;

function cacheKey(lat, lon) {
  return `weather_v${CACHE_VER}_${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

function readCache(lat, lon, maxAge = CACHE_TTL) {
  try {
    const raw = localStorage.getItem(cacheKey(lat, lon));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.ts < maxAge && cached.data?.hourlyByDate) return cached.data;
  } catch { /* ignore */ }
  return null;
}

function writeCache(lat, lon, data) {
  try {
    localStorage.setItem(cacheKey(lat, lon), JSON.stringify({ ts: Date.now(), data }));
  } catch { /* ignore */ }
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast`
    + `?latitude=${lat}&longitude=${lon}`
    + `&current=temperature_2m,weathercode,windspeed_10m,relative_humidity_2m`
    + `&hourly=temperature_2m,weathercode,precipitation_probability`
    + `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max`
    + `&timezone=auto&forecast_days=16`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather fetch failed');
  const json = await res.json();

  const hourlyByDate = {};
  if (json.hourly?.time) {
    json.hourly.time.forEach((t, i) => {
      const date = t.slice(0, 10);
      const hour = parseInt(t.slice(11, 13), 10);
      if (!hourlyByDate[date]) hourlyByDate[date] = [];
      hourlyByDate[date].push({
        hour,
        temp: Math.round(json.hourly.temperature_2m[i]),
        code: json.hourly.weathercode[i],
        rain: json.hourly.precipitation_probability[i],
      });
    });
  }

  return {
    current: {
      temp: Math.round(json.current.temperature_2m),
      code: json.current.weathercode,
      wind: Math.round(json.current.windspeed_10m),
      humidity: json.current.relative_humidity_2m,
    },
    daily: json.daily.time.map((date, i) => ({
      date,
      code: json.daily.weathercode[i],
      max: Math.round(json.daily.temperature_2m_max[i]),
      min: Math.round(json.daily.temperature_2m_min[i]),
      rain: json.daily.precipitation_probability_max[i],
    })),
    hourlyByDate,
  };
}

// The forecast without a component (the morning summary): from the cache,
// or fetched and cached. null when it cannot be had (offline).
export async function loadWeather(lat, lon) {
  if (!lat || !lon) return null;
  const cached = readCache(lat, lon);
  if (cached) return cached;
  try {
    const data = await fetchWeather(lat, lon);
    writeCache(lat, lon, data);
    return data;
  } catch { return readCache(lat, lon, STALE_OK); }
}

export function useWeather(lat, lon) {
  const [data, setData] = useState(() => (lat && lon) ? readCache(lat, lon, STALE_OK) : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lat || !lon) return;

    const cached = readCache(lat, lon);
    if (cached) {
      setData(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchWeather(lat, lon)
      .then(result => {
        if (cancelled) return;
        writeCache(lat, lon, result);
        setData(result);
      })
      // Offline: the last forecast this phone saw, up to a week old.
      .catch(() => { if (!cancelled) setData(readCache(lat, lon, STALE_OK)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [lat, lon]);

  return { data, loading };
}
