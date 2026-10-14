// Currency exchange rates via Frankfurter (free, no key, CORS-open, HTTPS).
// Rates are cached in localStorage so the converter keeps working offline.
// Reference base = EUR. amount_to = amount_from * (rate[to] / rate[from]).

const STORAGE_KEY = 'currencyRatesV2';
const CACHE_TTL_MS = 60 * 60 * 1000; // refresh after 1 hour

// Seeded fallback so even a first-visit-while-offline gets a reasonable
// number. Overwritten by the first successful network fetch.
const FALLBACK_RATES = {
  EUR: 1,    USD: 1.10, ILS: 4.05, GBP: 0.84, JPY: 162,  AUD: 1.65,
  CAD: 1.50, CHF: 0.96, CNY: 7.90, SEK: 11.4, NOK: 11.8, DKK: 7.46,
  PLN: 4.25, CZK: 25.0, HUF: 395,  TRY: 38,   RUB: 105,  INR: 92,
  BRL: 5.8,  ZAR: 20.5, MXN: 20.0, THB: 40,   SGD: 1.47, HKD: 8.60,
  KRW: 1490, AED: 4.04, SAR: 4.13, EGP: 55,   NZD: 1.82, RON: 4.97,
  BGN: 1.96, ISK: 148,
};

export const CURRENCY_META = {
  ILS: { name: 'שקל ישראלי',           flag: '🇮🇱', symbol: '₪' },
  USD: { name: 'דולר אמריקאי',         flag: '🇺🇸', symbol: '$' },
  EUR: { name: 'יורו',                  flag: '🇪🇺', symbol: '€' },
  GBP: { name: 'לירה שטרלינג',         flag: '🇬🇧', symbol: '£' },
  JPY: { name: 'ין יפני',               flag: '🇯🇵', symbol: '¥' },
  CHF: { name: 'פרנק שוויצרי',         flag: '🇨🇭', symbol: 'CHF' },
  CAD: { name: 'דולר קנדי',            flag: '🇨🇦', symbol: 'CA$' },
  AUD: { name: 'דולר אוסטרלי',         flag: '🇦🇺', symbol: 'A$' },
  CNY: { name: 'יואן סיני',             flag: '🇨🇳', symbol: '¥' },
  HKD: { name: 'דולר הונג קונג',       flag: '🇭🇰', symbol: 'HK$' },
  SGD: { name: 'דולר סינגפורי',        flag: '🇸🇬', symbol: 'S$' },
  KRW: { name: 'וון דרום קוריאני',     flag: '🇰🇷', symbol: '₩' },
  INR: { name: 'רופי הודי',            flag: '🇮🇳', symbol: '₹' },
  THB: { name: 'באט תאילנדי',          flag: '🇹🇭', symbol: '฿' },
  AED: { name: 'דירהם איחוד האמירויות', flag: '🇦🇪', symbol: 'د.إ' },
  SAR: { name: 'ריאל סעודי',           flag: '🇸🇦', symbol: '﷼' },
  EGP: { name: 'לירה מצרית',           flag: '🇪🇬', symbol: 'EGP' },
  TRY: { name: 'לירה טורקית',          flag: '🇹🇷', symbol: '₺' },
  PLN: { name: 'זלוטי פולני',           flag: '🇵🇱', symbol: 'zł' },
  CZK: { name: 'קורונה צ׳כית',         flag: '🇨🇿', symbol: 'Kč' },
  HUF: { name: 'פורינט הונגרי',         flag: '🇭🇺', symbol: 'Ft' },
  RON: { name: 'לאו רומני',            flag: '🇷🇴', symbol: 'lei' },
  BGN: { name: 'לב בולגרי',            flag: '🇧🇬', symbol: 'лв' },
  SEK: { name: 'קרונה שוודית',         flag: '🇸🇪', symbol: 'kr' },
  NOK: { name: 'קרונה נורבגית',         flag: '🇳🇴', symbol: 'kr' },
  DKK: { name: 'קרונה דנית',           flag: '🇩🇰', symbol: 'kr' },
  ISK: { name: 'קרונה איסלנדית',        flag: '🇮🇸', symbol: 'kr' },
  RUB: { name: 'רובל רוסי',            flag: '🇷🇺', symbol: '₽' },
  BRL: { name: 'ריאל ברזילאי',          flag: '🇧🇷', symbol: 'R$' },
  MXN: { name: 'פסו מקסיקני',           flag: '🇲🇽', symbol: 'MX$' },
  ZAR: { name: 'ראנד דרום אפריקאי',     flag: '🇿🇦', symbol: 'R' },
  NZD: { name: 'דולר ניו זילנדי',       flag: '🇳🇿', symbol: 'NZ$' },
};

function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.rates || !parsed?.fetchedAt) return null;
    return parsed;
  } catch { return null; }
}

function writeCache(rates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rates, fetchedAt: Date.now() }));
  } catch { /* ignore */ }
}

export function getInitialRates() {
  return readCache() || { rates: FALLBACK_RATES, fetchedAt: 0 };
}

async function fetchFromFrankfurter() {
  const list = Object.keys(CURRENCY_META).filter(c => c !== 'EUR').join(',');
  const res = await fetch(`https://api.frankfurter.app/latest?from=EUR&to=${list}`);
  if (!res.ok) throw new Error('frankfurter error');
  const data = await res.json();
  return { EUR: 1, ...data.rates };
}

async function fetchFromCDN() {
  const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json');
  if (!res.ok) throw new Error('cdn error');
  const data = await res.json();
  const raw = data.eur || {};
  const supported = new Set(Object.keys(CURRENCY_META).map(c => c.toLowerCase()));
  const rates = { EUR: 1 };
  for (const [k, v] of Object.entries(raw)) {
    const upper = k.toUpperCase();
    if (supported.has(k)) rates[upper] = v;
  }
  return rates;
}

async function fetchLatestRates() {
  try {
    let rates;
    try {
      rates = await fetchFromCDN();
    } catch {
      rates = await fetchFromFrankfurter();
    }
    writeCache(rates);
    return { rates, fetchedAt: Date.now() };
  } catch { return null; }
}

export async function refreshRatesIfStale() {
  const cached = readCache();
  const isStale = !cached || (Date.now() - cached.fetchedAt) > CACHE_TTL_MS;
  if (!isStale) return cached;
  const fresh = await fetchLatestRates();
  return fresh || cached || { rates: FALLBACK_RATES, fetchedAt: 0 };
}

export function convert(amount, fromCode, toCode, rates) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  const f = rates?.[fromCode];
  const t = rates?.[toCode];
  if (!f || !t) return 0;
  return n * (t / f);
}

export function formatAmount(n, code) {
  if (!Number.isFinite(n)) return '—';
  const sym = CURRENCY_META[code]?.symbol || code;
  const noFraction = ['JPY', 'KRW', 'HUF', 'ISK', 'CLP'];
  const fractionDigits = noFraction.includes(code) ? 0 : 2;
  const formatted = n.toLocaleString('he-IL', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${formatted} ${sym}`;
}
