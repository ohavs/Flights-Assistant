import { useState, useEffect } from 'react';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const WMO_ICONS = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  56: '🌧️', 57: '🌧️',
  61: '🌦️', 63: '🌧️', 65: '🌧️',
  66: '🌧️', 67: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️',
  77: '❄️',
  80: '🌦️', 81: '🌧️', 82: '🌧️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

const WMO_LABELS = {
  0: 'בהיר', 1: 'בהיר בעיקר', 2: 'מעונן חלקית', 3: 'מעונן',
  45: 'ערפל', 48: 'ערפל',
  51: 'טפטוף', 53: 'טפטוף', 55: 'טפטוף חזק',
  56: 'טפטוף קפוא', 57: 'טפטוף קפוא',
  61: 'גשם קל', 63: 'גשם', 65: 'גשם חזק',
  66: 'גשם קפוא', 67: 'גשם קפוא',
  71: 'שלג קל', 73: 'שלג', 75: 'שלג כבד',
  77: 'גרגרי שלג',
  80: 'ממטר קל', 81: 'ממטר', 82: 'ממטר חזק',
  85: 'ממטר שלג', 86: 'ממטר שלג כבד',
  95: 'סופת רעמים', 96: 'סופת רעמים עם ברד', 99: 'סופת רעמים חזקה',
};

export function getWeatherIcon(code) {
  return WMO_ICONS[code] ?? '🌡️';
}

export function getWeatherLabel(code) {
  return WMO_LABELS[code] ?? '';
}

function cacheKey(lat, lon) {
  return `weather_${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

function readCache(lat, lon) {
  try {
    const raw = localStorage.getItem(cacheKey(lat, lon));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.ts < CACHE_TTL) return cached.data;
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

export function useWeather(lat, lon) {
  const [data, setData] = useState(() => (lat && lon) ? readCache(lat, lon) : null);
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
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [lat, lon]);

  return { data, loading };
}
