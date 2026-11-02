// The currency of a trip's destination, for the expense widget's currency
// key (widgetData.js): Budapest → HUF. The destination is where the
// outbound flight lands. Its country comes from the airport: the flight
// lookup saves it (`country`, flightApi.js), and for trips saved before
// that, or typed in by hand, a table of the airports Israelis fly to most
// fills in. Pure, no Firebase: it runs in the widget fixtures too.
import { CURRENCY_META } from '../services/currency.js';

const AIRPORTS = {
  HU: 'BUD DEB',
  CZ: 'PRG BRQ',
  AT: 'VIE SZG INN GRZ LNZ KLU',
  DE: 'FRA MUC BER HAM DUS CGN STR HAJ NUE LEJ DRS BRE FMM FKB HHN NRN DTM',
  FR: 'CDG ORY NCE MRS LYS TLS BOD NTE BVA MPL BIQ AJA BIA',
  IT: 'FCO CIA MXP LIN BGY VCE TSF NAP BLQ PSA FLR CTA PMO BRI OLB CAG TRN VRN GOA BDS SUF',
  ES: 'MAD BCN AGP PMI ALC VLC SVQ IBZ BIO TFS TFN LPA ACE FUE GRO REU MAH SCQ VGO GRX',
  PT: 'LIS OPO FAO FNC PDL',
  GR: 'ATH SKG HER RHO CFU JTR JMK CHQ KGS ZTH EFL KLX PVK SMI',
  CY: 'LCA PFO',
  NL: 'AMS EIN RTM',
  BE: 'BRU CRL ANR',
  LU: 'LUX',
  IE: 'DUB ORK SNN',
  FI: 'HEL RVN',
  EE: 'TLL', LV: 'RIX', LT: 'VNO KUN',
  SK: 'BTS KSC', SI: 'LJU', HR: 'ZAG SPU DBV PUY ZAD', MT: 'MLA',
  ME: 'TGD TIV', XK: 'PRN', BG: 'SOF VAR BOJ PDV',
  GB: 'LHR LGW STN LTN LCY SEN MAN BHX EDI GLA BRS NCL LPL BFS ABZ EMA LBA',
  CH: 'ZRH GVA BRN LUG',
  PL: 'WAW WMI KRK GDN WRO POZ KTW RZE LUZ',
  RO: 'OTP CLJ TSR IAS SBZ',
  SE: 'ARN BMA GOT MMX NYO', NO: 'OSL BGO TRD SVG TOS', DK: 'CPH BLL AAL', IS: 'KEF RKV',
  TR: 'IST SAW AYT ADB ESB DLM BJV ADA TZX',
  RU: 'SVO DME VKO LED',
  RS: 'BEG', GE: 'TBS BUS KUT', AL: 'TIA', MK: 'SKP OHD', BA: 'SJJ', MD: 'KIV', UA: 'KBP', AM: 'EVN', AZ: 'GYD',
  IL: 'TLV ETM VDA HFA',
  AE: 'DXB DWC AUH SHJ', SA: 'RUH JED', EG: 'CAI SSH HRG TCP', JO: 'AMM AQJ', MA: 'RAK CMN', BH: 'BAH',
  ZA: 'JNB CPT',
  TH: 'BKK DMK HKT CNX USM KBV', JP: 'NRT HND KIX ITM CTS FUK OKA NGO', KR: 'ICN GMP PUS CJU',
  CN: 'PEK PKX PVG SHA CAN SZX CTU XIY HGH CKG KMG', HK: 'HKG', SG: 'SIN',
  IN: 'DEL BOM GOI GOX BLR MAA CCU HYD COK', VN: 'SGN HAN DAD',
  AU: 'SYD MEL BNE PER ADL OOL CNS', NZ: 'AKL WLG CHC ZQN',
  US: 'JFK EWR LGA LAX SFO MIA ORD BOS IAD DCA ATL LAS SEA MCO DFW IAH PHL DEN PHX SAN HNL FLL TPA MSP DTW CLT BWI SLC AUS PDX OGG BNA MSY SJC OAK RDU',
  CA: 'YYZ YUL YVR YYC YOW YHZ', MX: 'MEX CUN GDL SJD PVR', BR: 'GRU GIG BSB',
};
const AIRPORT_COUNTRY = Object.fromEntries(
  Object.entries(AIRPORTS).flatMap(([country, codes]) => codes.split(' ').map(code => [code, country])),
);

const EURO = 'AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV ME MT NL PT SI SK XK';
const CURRENCY = {
  ...Object.fromEntries(EURO.split(' ').map(c => [c, 'EUR'])),
  HU: 'HUF', CZ: 'CZK', GB: 'GBP', CH: 'CHF', PL: 'PLN', RO: 'RON', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  IS: 'ISK', TR: 'TRY', RU: 'RUB', IL: 'ILS', AE: 'AED', SA: 'SAR', EG: 'EGP', ZA: 'ZAR', TH: 'THB',
  JP: 'JPY', KR: 'KRW', CN: 'CNY', HK: 'HKD', SG: 'SGD', IN: 'INR', AU: 'AUD', NZ: 'NZD', US: 'USD',
  CA: 'CAD', MX: 'MXN', BR: 'BRL',
};
// Where euros are the other money people carry; elsewhere, dollars.
const EUROPE = new Set([...EURO.split(' '),
  'HU', 'CZ', 'GB', 'CH', 'PL', 'RO', 'SE', 'NO', 'DK', 'IS', 'RS', 'AL', 'MK', 'BA', 'MD', 'UA']);

// The trip's destination as typed ("בודפשט, הונגריה", "Rome"): countries
// and the cities Israelis fly to most, in Hebrew and English. For a trip
// with no flight entered yet.
const PLACES = {
  HU: 'הונגריה בודפשט hungary budapest',
  CZ: 'צ׳כיה צ\'כיה צכיה פראג czech czechia prague praha',
  AT: 'אוסטריה וינה זלצבורג austria vienna wien salzburg',
  DE: 'גרמניה ברלין מינכן פרנקפורט המבורג germany berlin munich frankfurt hamburg',
  FR: 'צרפת פריז ניס france paris nice',
  IT: 'איטליה רומא מילאנו ונציה פירנצה נאפולי italy rome roma milan milano venice florence naples',
  ES: 'ספרד מדריד ברצלונה spain madrid barcelona',
  PT: 'פורטוגל ליסבון פורטו portugal lisbon porto',
  GR: 'יוון אתונה כרתים רודוס greece athens crete rhodes',
  CY: 'קפריסין לרנקה פאפוס cyprus larnaca paphos',
  NL: 'הולנד אמסטרדם netherlands holland amsterdam',
  BE: 'בלגיה בריסל belgium brussels',
  GB: 'בריטניה אנגליה לונדון סקוטלנד אדינבורו uk england london scotland edinburgh britain',
  IE: 'אירלנד דבלין ireland dublin',
  CH: 'שווייץ שוויץ ציריך ז׳נבה switzerland zurich geneva',
  PL: 'פולין ורשה קרקוב poland warsaw krakow',
  RO: 'רומניה בוקרשט romania bucharest',
  BG: 'בולגריה סופיה bulgaria sofia',
  HR: 'קרואטיה זאגרב croatia zagreb',
  SI: 'סלובניה slovenia', SK: 'סלובקיה slovakia',
  ME: 'מונטנגרו montenegro',
  RS: 'סרביה בלגרד serbia belgrade',
  GE: 'גאורגיה גרוזיה טביליסי בטומי georgia tbilisi batumi',
  TR: 'טורקיה איסטנבול אנטליה turkey istanbul antalya',
  SE: 'שוודיה סטוקהולם sweden stockholm', NO: 'נורווגיה אוסלו norway oslo',
  DK: 'דנמרק קופנהגן denmark copenhagen', FI: 'פינלנד הלסינקי finland helsinki',
  IS: 'איסלנד iceland',
  AE: 'איחוד האמירויות דובאי אבו דאבי uae dubai abu dhabi',
  EG: 'מצרים סיני שארם קהיר egypt sinai cairo',
  JO: 'ירדן עקבה עמאן jordan aqaba amman', MA: 'מרוקו morocco',
  TH: 'תאילנד בנגקוק פוקט קוסמוי thailand bangkok phuket',
  JP: 'יפן טוקיו קיוטו japan tokyo kyoto',
  IN: 'הודו גואה india goa', VN: 'וייטנאם vietnam',
  US: 'ארצות הברית ארה״ב ארה"ב אמריקה ניו יורק לוס אנג׳לס מיאמי usa america new york los angeles miami',
  CA: 'קנדה canada', MX: 'מקסיקו mexico',
  AU: 'אוסטרליה australia', ZA: 'דרום אפריקה south africa',
  IL: 'ישראל israel אילת eilat',
};
// Each word, and in Hebrew also without a one-letter prefix ("בפראג").
const words = (s) => String(s || '').toLowerCase().replace(/[,.()\-–]/g, ' ').split(/\s+/).filter(Boolean)
  .flatMap(w => (/^[בלמוה][\u05d0-\u05ea׳'"]{2,}/.test(w) ? [w, w.slice(1)] : [w]));
function countryFromText(...texts) {
  const said = ` ${texts.map(t => words(t).join(' ')).join(' ')} `;
  for (const [country, names] of Object.entries(PLACES)) {
    // Whole words, and a two-word name ("ניו יורק") as a phrase.
    const list = names.split(' ');
    if (list.some(n => said.includes(` ${n} `))) return country;
    for (let i = 0; i < list.length - 1; i++) if (said.includes(` ${list[i]} ${list[i + 1]} `)) return country;
  }
  return '';
}

// The destination's country (ISO 3166 alpha-2), or '': from the outbound
// flight's airport, else from the destination the trip was given.
export function destinationCountry(trip) {
  const apt = trip?.outboundFlightDetails?.arrAirport || trip?.returnFlightDetails?.depAirport || {};
  const stored = String(apt.country || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(stored)) return stored;
  return AIRPORT_COUNTRY[String(apt.code || '').toUpperCase()]
    || countryFromText(trip?.destination, trip?.name);
}

// The destination's currency, when the app knows it (CURRENCY_META), or null.
export function destinationCurrency(trip) {
  const code = CURRENCY[destinationCountry(trip)];
  return code && CURRENCY_META[code] ? code : null;
}

// The currencies a new expense offers on this trip: shekels, then euros in
// Europe or dollars elsewhere, then the destination's own (Budapest: ILS,
// EUR, HUF), or the tab's defaults when the destination is not known; and
// after them any the trip saved (`expenseCurrencies`, added in the form).
export function tripCurrencies(trip, defaults) {
  const country = destinationCountry(trip);
  const local = destinationCurrency(trip);
  const base = country ? ['ILS', EUROPE.has(country) ? 'EUR' : 'USD', ...(local ? [local] : [])] : [...defaults];
  const saved = Array.isArray(trip?.expenseCurrencies) ? trip.expenseCurrencies.filter(c => CURRENCY_META[c]) : [];
  return [...new Set([...base, ...saved])];
}
