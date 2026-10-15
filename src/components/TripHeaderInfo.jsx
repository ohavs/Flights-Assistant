import { useEffect, useState, lazy, Suspense } from 'react';
import { CircleAlert, ChevronLeft } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Pill } from '../ui/kit';
import { useWeather, getWeatherIcon, getWeatherLabel } from '../hooks/useWeather';
import Sheet from '../ui/Sheet';
import Skeleton from './Skeleton';

const InfoTab = lazy(() => import('./InfoTab'));

/* Two quiet helpers on the flight tab, each opening its own sheet: the
   weather at the destination (a chip by the destination city on the
   flight cards) and the trip's important info (a card under the hotel). */

const todayIso = () => new Date().toISOString().slice(0, 10);

/* Weather at the destination airport. Nothing until the trip has one. */
export function WeatherChip({ trip }) {
  const [open, setOpen] = useState(false);
  const out = trip?.outboundFlightDetails || {};
  const ret = trip?.returnFlightDetails || {};
  const dest = out.arrAirport || ret.depAirport;
  const { data: weather } = useWeather(dest?.lat, dest?.lng);
  if (!weather) return null;

  const city = dest?.city || trip?.destination || 'היעד';
  const today = weather.daily?.find(d => d.date === todayIso()) || null;
  const tripDays = (weather.daily && out.date && ret.date)
    ? weather.daily.filter(d => d.date >= out.date && d.date <= ret.date)
    : [];

  return (
    <>
      <button
        type="button"
        className="weather-chip"
        onClick={() => setOpen(true)}
        aria-label={`מזג האוויר ביעד: ${weather.current.temp} מעלות`}
      >
        <span aria-hidden="true">{getWeatherIcon(weather.current.code)}</span>
        {weather.current.temp}°
      </button>

      {open && (
        <Sheet title="מזג האוויר ביעד" onClose={() => setOpen(false)}>
          <div className="weather-card">
            <div className="weather-now">
              <span className="weather-now-icon" aria-hidden="true">{getWeatherIcon(weather.current.code)}</span>
              <div className="weather-now-place">
                <span className="weather-now-city">{city}</span>
                <span className="weather-now-cond">{getWeatherLabel(weather.current.code) || 'עכשיו'}</span>
              </div>
              <span className="weather-now-temp">{weather.current.temp}°</span>
            </div>

            <div className="weather-facts">
              <span><b>{weather.current.wind}</b> קמ״ש רוח</span>
              <span><b>{weather.current.humidity}%</b> לחות</span>
              {today && <span><b>{today.max}°</b> / {today.min}° היום</span>}
            </div>

            {tripDays.length > 0 && (
              <div className="weather-days">
                {tripDays.map((d) => {
                  const day = new Date(d.date);
                  const dow = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'][day.getDay()];
                  const dd = String(day.getDate()).padStart(2, '0');
                  const mm = String(day.getMonth() + 1).padStart(2, '0');
                  return (
                    <div key={d.date} className={`weather-day${d.date === todayIso() ? ' today' : ''}`}>
                      <span className="weather-day-dow">{dow}</span>
                      <span className="weather-day-date">{dd}.{mm}</span>
                      <span className="weather-day-icon">{getWeatherIcon(d.code)}</span>
                      <span className="weather-day-max">{d.max}°</span>
                      <span className="weather-day-min">{d.min}°</span>
                      {/* Only a rain chance worth planning around earns a line. */}
                      {d.rain >= 20 && <span className="weather-day-rain">💧{d.rain}%</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}

/* Emergency numbers, contacts, addresses: a card on the flight tab, with
   the flights and the hotel, that opens them in a sheet. */
export function InfoCard({ tripId }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!tripId) return;
    return onSnapshot(collection(db, 'trips', tripId, 'info'),
      snap => setItems(snap.docs.map(d => d.data())),
      () => setItems([]));
  }, [tripId]);

  // The categories in use, for a glance at what is there.
  const cats = items ? [...new Set(items.map(i => i.category).filter(Boolean))] : [];
  const hint = cats.length ? cats.slice(0, 3).join(' · ') : 'מספרי חירום, אנשי קשר, כתובות';

  return (
    <>
      <button type="button" className="glass-card info-card" onClick={() => setOpen(true)} aria-label="מידע חשוב">
        <span className="info-card-icon"><CircleAlert size={20} /></span>
        <span className="info-card-text">
          <span className="info-card-title">מידע חשוב</span>
          <span className="info-card-hint">{hint}</span>
        </span>
        {items?.length > 0 && <Pill size="sm" tone="neutral">{items.length}</Pill>}
        <ChevronLeft size={18} className="list-row-chevron" />
      </button>
      {open && (
        <Sheet
          label="מידע חשוב"
          title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CircleAlert size={19} style={{ color: 'var(--c-red)' }} />מידע חשוב</span>}
          onClose={() => setOpen(false)}
          style={{ maxHeight: '92vh' }}
        >
          <div data-sheet-scroll style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 8 }}>
            <Suspense fallback={<Skeleton rows={3} header={false} label="טוען מידע חשוב" />}>
              <InfoTab tripId={tripId} embedded />
            </Suspense>
          </div>
        </Sheet>
      )}
    </>
  );
}
