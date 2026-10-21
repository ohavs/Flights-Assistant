import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import useBackHandler from '../hooks/useBackHandler';
import { Calendar as CalendarIcon, CalendarClock, Clock, ChevronRight, ChevronLeft, ChevronDown, Check } from 'lucide-react';
import { Segmented } from '../ui/Sheet';
import { haptic } from '../lib/platform';

const MONTHS_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

const DAYS_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

// Helper to format Date object as YYYY-MM-DD
function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper to parse YYYY-MM-DD
function parseDateISO(str) {
  if (!str) return new Date();
  const parts = str.split('-');
  if (parts.length !== 3) return new Date();
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

// Helper to display formatted date in Hebrew
export function formatHebrewDate(dateStr) {
  if (!dateStr) return 'בחר תאריך';
  const d = parseDateISO(dateStr);
  return `${d.getDate()} ב${MONTHS_HE[d.getMonth()]} ${d.getFullYear()}`;
}

// A range of days, as short as it reads: "13–15 בנובמבר 2026",
// "28 בנובמבר – 2 בדצמבר 2026". No end, or the same day: just the day.
function formatHebrewDateRange(start, end) {
  if (!start) return '';
  if (!end || end === start) return formatHebrewDate(start);
  const a = parseDateISO(start), b = parseDateISO(end);
  if (a.getFullYear() !== b.getFullYear()) return `${formatHebrewDate(start)} – ${formatHebrewDate(end)}`;
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ב${MONTHS_HE[a.getMonth()]} ${a.getFullYear()}`;
  return `${a.getDate()} ב${MONTHS_HE[a.getMonth()]} – ${b.getDate()} ב${MONTHS_HE[b.getMonth()]} ${b.getFullYear()}`;
}

// Helper to display formatted datetime in Hebrew
export function formatHebrewDateTime(dateTimeStr) {
  if (!dateTimeStr) return 'בחר תאריך ושעה';
  const [datePart, timePart] = dateTimeStr.split('T');
  if (!timePart) return formatHebrewDate(datePart);
  const [h, m] = timePart.split(':');
  return `${formatHebrewDate(datePart)} בשעה ${h}:${m}`;
}

/* ══════════════════════════════════════════════════════════
   SHARED PIECES
   ══════════════════════════════════════════════════════════ */

/* The field a picker opens from. A button that wears the field's look,
   with what it holds at its start (a calendar, a clock) so a chooser
   never reads as a box to type into. */
function PickerField({ Icon, filled, onOpen, children }) {
  return (
    <button type="button" onClick={onOpen} className="form-control picker-field">
      <span className="picker-field-icon" aria-hidden="true"><Icon size={16} strokeWidth={2.4} /></span>
      <span className={`picker-field-text${filled ? '' : ' is-empty'}`}>{children}</span>
    </button>
  );
}

/* The window every picker opens in. Portalled to <body>: these pickers
   sit inside a .glass-card, and a backdrop-filtered ancestor becomes the
   containing block for position:fixed children — left in place the
   overlay is positioned against the card and clipped by it. */
function PickerDialog({ title, onClose, readout, okLabel, onOk, children }) {
  return createPortal(
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-card" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span className="picker-title">{title}</span>
          <button type="button" aria-label="סגור" className="btn-close" onClick={onClose}>✕</button>
        </div>
        {children}
        {/* The readout is the anchor: it always says what is selected,
            and changes the instant anything is picked. */}
        <div className="picker-readout">{readout}</div>
        <div className="picker-actions">
          <button type="button" onClick={onOk} className="btn-primary">{okLabel}</button>
          <button type="button" onClick={onClose} className="btn-secondary">ביטול</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ══════════════════════════════════════════════════════════
   CALENDAR CORE COMPONENT
   ══════════════════════════════════════════════════════════ */
// `rangeEnd`: a range's last day; the days from the selected one to it
// are marked as one stretch.
function CalendarBody({ selectedDateStr, onSelect, rangeEnd }) {
  const initialDate = selectedDateStr ? parseDateISO(selectedDateStr) : new Date();
  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth()); // 0-11

  // Total days in current month
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
  // First day of current month (0: Sunday, 1: Monday, etc.)
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Generate days array
  const daysGrid = [];
  // Padding for the first week
  for (let i = 0; i < firstDayIndex; i++) {
    daysGrid.push({ isPadding: true, dayNum: 0 });
  }
  // Days of the month
  for (let i = 1; i <= totalDays; i++) {
    daysGrid.push({ isPadding: false, dayNum: i });
  }

  const todayStr = formatDateISO(new Date());

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={handlePrevMonth} aria-label="החודש הקודם">
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
        <span className="cal-month">{MONTHS_HE[currentMonth]} {currentYear}</span>
        <button type="button" className="cal-nav" onClick={handleNextMonth} aria-label="החודש הבא">
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
      </div>

      <div className="cal-week">
        {DAYS_HE.map((day, idx) => <span key={idx}>{day}</span>)}
      </div>

      <div className="cal-grid">
        {daysGrid.map((item, idx) => {
          if (item.isPadding) {
            return <div key={`pad-${idx}`} />;
          }

          const thisDateStr = formatDateISO(new Date(currentYear, currentMonth, item.dayNum));
          const isSelected = selectedDateStr === thisDateStr || rangeEnd === thisDateStr;
          const isToday = todayStr === thisDateStr;
          const inRange = !!rangeEnd && thisDateStr > selectedDateStr && thisDateStr < rangeEnd;

          return (
            <button
              key={`day-${item.dayNum}`}
              type="button"
              className={`cal-day${isToday ? ' is-today' : ''}${inRange ? ' in-range' : ''}`}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onSelect(thisDateStr)}
            >
              {item.dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TIME WHEELS
   ══════════════════════════════════════════════════════════ */
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const pad2 = (s) => String(s ?? '').padStart(2, '0');
const ROW = 44; // a wheel row's height, px — .wheel-row in index.css

/* One wheel. The value is whatever sits in the band in the middle; a
   scroll that comes to rest there picks it, and a tap scrolls a number
   there and picks it at once.

   It goes round: the list is drawn several times over, and when the
   wheel comes to rest outside the middle copy it is moved back into it —
   onto the same number, so nothing on screen changes. Scrolling up from
   00 reaches 59, and down from 59 reaches 00. The middle row's look is
   switched on the element itself rather than through state, so a scroll
   does not re-render a few hundred rows on every frame. */
function Wheel({ values, value, onChange, label }) {
  const ref = useRef(null);
  const n = values.length;
  const copies = Math.max(5, Math.ceil(200 / n)) | 1;   // odd, so there is a middle one
  const home = Math.floor(copies / 2) * n;               // the middle copy's first row
  const at = useRef(-1);          // the row in the band now
  const sent = useRef(value);     // the last value this wheel reported
  const settle = useRef(null);
  const report = useRef(onChange);
  useLayoutEffect(() => { report.current = onChange; });

  const rowAt = () => Math.round(ref.current.scrollTop / ROW);
  const mark = (row) => {
    if (row === at.current) return false;
    const rows = ref.current.children;   // [pad, ...rows, pad]
    rows[at.current + 1]?.classList.remove('on');
    rows[row + 1]?.classList.add('on');
    at.current = row;
    return true;
  };
  const jump = (row) => { ref.current.scrollTop = row * ROW; mark(row); };
  const send = (v) => { if (v !== sent.current) { sent.current = v; report.current(v); } };

  // Open on the value, in the middle copy.
  useLayoutEffect(() => {
    jump(home + Math.max(0, values.indexOf(value)));
    return () => clearTimeout(settle.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A value set from outside, not by this wheel, moves the wheel to it.
  useEffect(() => {
    if (value === sent.current) return;
    sent.current = value;
    jump(home + Math.max(0, values.indexOf(value)));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const rest = () => {
    if (!ref.current) return;
    const row = rowAt();
    const i = ((row % n) + n) % n;
    if (row < home || row >= home + n) jump(home + i);
    send(values[i]);
  };

  const onScroll = () => {
    if (mark(rowAt())) haptic('select');
    clearTimeout(settle.current);
    settle.current = setTimeout(rest, 120);
  };

  const onClick = (e) => {
    const b = e.target.closest('.wheel-row');
    if (!b) return;
    const row = Number(b.dataset.row);
    ref.current.scrollTo({ top: row * ROW, behavior: 'smooth' });
    send(values[row % n]);
  };

  const onKeyDown = (e) => {
    const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    ref.current.scrollBy({ top: step * ROW, behavior: 'smooth' });
  };

  const rows = [];
  for (let c = 0; c < copies; c++) {
    values.forEach((v, i) => {
      const row = c * n + i;
      rows.push(<button key={row} type="button" tabIndex={-1} className="wheel-row" data-row={row}>{v}</button>);
    });
  }

  return (
    <div className="wheel-col">
      <span className="wheel-label">{label}</span>
      <div className="wheel-frame">
        <div className="wheel-band" aria-hidden="true" />
        <div
          ref={ref}
          className="wheel"
          role="spinbutton"
          aria-label={label}
          aria-valuetext={value}
          tabIndex={0}
          onScroll={onScroll}
          onClick={onClick}
          onKeyDown={onKeyDown}
        >
          <div className="wheel-pad" />
          {rows}
          <div className="wheel-pad" />
        </div>
      </div>
    </div>
  );
}

// Hours left, minutes right — the order HH:MM is read in, in Hebrew too.
function TimeWheels({ hour, minute, onHour, onMinute }) {
  return (
    <div className="wheels">
      <Wheel label="שעה" values={HOURS} value={hour} onChange={onHour} />
      <span className="wheel-colon" aria-hidden="true">:</span>
      <Wheel label="דקה" values={MINUTES} value={minute} onChange={onMinute} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CUSTOM DATE PICKER
   ══════════════════════════════════════════════════════════ */
export function CustomDatePicker({ value, onChange, label, required, variant }) {
  const [isOpen, setIsOpen] = useState(false);
  // Back closes the picker, not the sheet underneath it.
  useBackHandler(isOpen, () => setIsOpen(false));
  const [tempDateStr, setTempDateStr] = useState(value || formatDateISO(new Date()));

  // Sync state with prop value
  useEffect(() => {
    if (value) {
      setTempDateStr(value);
    }
  }, [value]);

  const handleSave = () => {
    onChange(tempDateStr);
    setIsOpen(false);
  };

  const isCompact = variant === 'compact';

  return (
    <div className="date-picker field-wrap">
      {label && <label className="field-label">{label}</label>}

      {isCompact ? (
        // The compact trigger is the whole content of a tile: just the date.
        <button type="button" onClick={() => setIsOpen(true)} className="date-compact">
          {value
            // A full "27 באוגוסט 2026" wraps to two lines in a narrow tile.
            ? parseDateISO(value).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
            : 'בחר תאריך...'}
        </button>
      ) : (
        <PickerField Icon={CalendarIcon} filled={!!value} onOpen={() => setIsOpen(true)}>
          {value
            ? <>
                {/* Two pickers share a row on a phone. When the column is
                    too narrow for "29 בנובמבר 2026" the month is
                    abbreviated (container query in index.css). */}
                <span className="date-long">{formatHebrewDate(value)}</span>
                <span className="date-short">{parseDateISO(value).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </>
            : 'בחר תאריך...'}
        </PickerField>
      )}

      {isOpen && (
        <PickerDialog
          title={label || 'בחירת תאריך'}
          onClose={() => setIsOpen(false)}
          readout={formatHebrewDate(tempDateStr)}
          okLabel="בחירה"
          onOk={handleSave}
        >
          <CalendarBody selectedDateStr={tempDateStr} onSelect={setTempDateStr} />
        </PickerDialog>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CUSTOM TIME PICKER — outputs "HH:MM" (24-hour)
   ══════════════════════════════════════════════════════════ */
function parseTime(str) {
  const s = String(str || '').trim();
  // 12-hour with AM/PM (legacy data) → convert to 24h
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10) % 12;
    if (m12[3].toUpperCase() === 'PM') h += 12;
    return { hh: String(h).padStart(2, '0'), mm: m12[2] };
  }
  // 24-hour
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return { hh: String(parseInt(m24[1], 10)).padStart(2, '0'), mm: m24[2] };
  return { hh: '12', mm: '00' };
}

export function formatHebrewTime(timeStr) {
  if (!timeStr) return 'בחר שעה';
  const { hh, mm } = parseTime(timeStr);
  return `${hh}:${mm}`;
}

export function CustomTimePicker({ value, onChange, label, required }) {
  const [isOpen, setIsOpen] = useState(false);
  // Back closes the picker, not the sheet underneath it.
  useBackHandler(isOpen, () => setIsOpen(false));
  const parsed = parseTime(value);
  const [tempH, setTempH] = useState(parsed.hh);
  const [tempM, setTempM] = useState(parsed.mm);

  useEffect(() => {
    const p = parseTime(value);
    setTempH(p.hh);
    setTempM(p.mm);
  }, [value]);

  const displayValue = value ? formatHebrewTime(value) : '';

  const handleSave = () => {
    onChange(`${tempH}:${tempM}`);
    setIsOpen(false);
  };

  return (
    <div className="field-wrap">
      {label && <label className="field-label">{label}{required && ' *'}</label>}

      <PickerField Icon={Clock} filled={!!displayValue} onOpen={() => setIsOpen(true)}>
        <span className="picker-field-num">{displayValue || 'בחר שעה...'}</span>
      </PickerField>

      {isOpen && (
        <PickerDialog
          title={label || 'בחירת שעה'}
          onClose={() => setIsOpen(false)}
          readout={<span className="picker-readout-time">{tempH}:{tempM}</span>}
          okLabel="בחירה"
          onOk={handleSave}
        >
          <TimeWheels hour={tempH} minute={tempM} onHour={setTempH} onMinute={setTempM} />
        </PickerDialog>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   RANGES — a first and a last day, a start and an end time
   ══════════════════════════════════════════════════════════ */
// One calendar: a tap picks the first day, the next the last (or, before
// the first, a new first day). One tap and "בחירה" is a single day.
export function CustomDateRangePicker({ start, end, onChange, label }) {
  const [isOpen, setIsOpen] = useState(false);
  useBackHandler(isOpen, () => setIsOpen(false));
  const [from, setFrom] = useState(start || '');
  const [to, setTo] = useState(end || '');
  const open = () => {
    setFrom(start || formatDateISO(new Date()));
    setTo(end && end !== start ? end : '');
    setIsOpen(true);
  };
  const pick = (d) => {
    if (!from || to || d < from) { setFrom(d); setTo(''); }
    else if (d === from) setTo('');
    else setTo(d);
  };
  const handleSave = () => {
    onChange(from, to);
    setIsOpen(false);
  };

  return (
    <div className="field-wrap">
      {label && <label className="field-label">{label}</label>}
      <PickerField Icon={CalendarIcon} filled={!!start} onOpen={open}>
        {start ? formatHebrewDateRange(start, end) : 'בחר תאריכים...'}
      </PickerField>
      {isOpen && (
        <PickerDialog
          title={label || 'בחירת תאריכים'}
          onClose={() => setIsOpen(false)}
          readout={<>
            {formatHebrewDateRange(from, to)}
            {!to && <span className="picker-readout-hint">ועכשיו היום האחרון (או "בחירה" ליום אחד)</span>}
          </>}
          okLabel="בחירה"
          onOk={handleSave}
        >
          <CalendarBody selectedDateStr={from} rangeEnd={to} onSelect={pick} />
        </PickerDialog>
      )}
    </div>
  );
}

// Add an hour to "HH:MM", round the clock.
const plusHour = (hh, mm) => ({ hh: String((Number(hh) + 1) % 24).padStart(2, '0'), mm });

// Both ends in one window, side by side: start on the right, as it reads.
// With no end yet it opens an hour after the start, so a one-hour slot is
// a single tap on "בחירה".
export function CustomTimeRangePicker({ start, end, onChange, label }) {
  const [isOpen, setIsOpen] = useState(false);
  useBackHandler(isOpen, () => setIsOpen(false));
  const [a, setA] = useState(parseTime(start));
  const [b, setB] = useState(parseTime(end));
  const open = () => {
    const s = parseTime(start);
    setA(s);
    setB(end ? parseTime(end) : plusHour(s.hh, s.mm));
    setIsOpen(true);
  };
  const handleSave = () => {
    onChange(`${a.hh}:${a.mm}`, `${b.hh}:${b.mm}`);
    setIsOpen(false);
  };
  const text = start
    ? (end ? `${formatHebrewTime(start)} – ${formatHebrewTime(end)}` : `מ־${formatHebrewTime(start)}`)
    : '';

  return (
    <div className="field-wrap">
      {label && <label className="field-label">{label}</label>}
      <PickerField Icon={Clock} filled={!!start} onOpen={open}>
        <span className="picker-field-num">{text || 'בחר שעות...'}</span>
      </PickerField>
      {isOpen && (
        <PickerDialog
          title={label || 'בחירת שעות'}
          onClose={() => setIsOpen(false)}
          readout={<span className="picker-readout-time range">{a.hh}:{a.mm} – {b.hh}:{b.mm}</span>}
          okLabel="בחירה"
          onOk={handleSave}
        >
          <div className="time-range">
            <div className="time-range-side">
              <span className="time-range-label">התחלה</span>
              <TimeWheels hour={a.hh} minute={a.mm}
                onHour={(hh) => setA(v => ({ ...v, hh }))} onMinute={(mm) => setA(v => ({ ...v, mm }))} />
            </div>
            <div className="time-range-side">
              <span className="time-range-label">סיום</span>
              <TimeWheels hour={b.hh} minute={b.mm}
                onHour={(hh) => setB(v => ({ ...v, hh }))} onMinute={(mm) => setB(v => ({ ...v, mm }))} />
            </div>
          </div>
        </PickerDialog>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CUSTOM DATE TIME PICKER
   ══════════════════════════════════════════════════════════ */
// `renderTrigger(open)` replaces the field with your own control (a chip).
export function CustomDateTimePicker({ value, onChange, label, renderTrigger }) {
  const [isOpen, setIsOpen] = useState(false);
  // Back closes the picker, not the sheet underneath it.
  useBackHandler(isOpen, () => setIsOpen(false));
  const [activeTab, setActiveTab] = useState('date'); // 'date' | 'time'

  // Default values setup
  let defaultDate = formatDateISO(new Date());
  let defaultH = '12';
  let defaultM = '00';

  if (value) {
    const [dPart, tPart] = value.split('T');
    if (dPart) defaultDate = dPart;
    if (tPart) {
      const timeParts = tPart.split(':');
      if (timeParts[0]) defaultH = pad2(timeParts[0]);
      if (timeParts[1]) defaultM = pad2(timeParts[1]);
    }
  }

  const [tempDateStr, setTempDateStr] = useState(defaultDate);
  const [tempHour, setTempHour] = useState(defaultH);
  const [tempMinute, setTempMinute] = useState(defaultM);

  // Sync state with prop value
  useEffect(() => {
    if (value) {
      const [dPart, tPart] = value.split('T');
      if (dPart) setTempDateStr(dPart);
      if (tPart) {
        const timeParts = tPart.split(':');
        if (timeParts[0]) setTempHour(pad2(timeParts[0]));
        if (timeParts[1]) setTempMinute(pad2(timeParts[1]));
      }
    }
  }, [value]);

  const open = () => { setActiveTab('date'); setIsOpen(true); };

  const handleSave = () => {
    const formattedDateTime = `${tempDateStr}T${tempHour}:${tempMinute}`;
    onChange(formattedDateTime);
    setIsOpen(false);
  };

  return (
    // A trigger of your own sizes to its content. The field's inline-size
    // container has no width of its own, so it would squeeze the chip to a
    // circle with its words spilling out.
    <div className="field-wrap" style={renderTrigger ? { width: 'auto', containerType: 'normal' } : undefined}>
      {label && <label className="field-label">{label}</label>}

      {renderTrigger ? renderTrigger(open) : (
        <PickerField Icon={CalendarClock} filled={!!value} onOpen={open}>
          {value ? formatHebrewDateTime(value) : 'בחר תאריך ושעה...'}
        </PickerField>
      )}

      {isOpen && (
        <PickerDialog
          title={label || 'בחירת תאריך ושעה'}
          onClose={() => setIsOpen(false)}
          readout={`${formatHebrewDate(tempDateStr)} בשעה ${tempHour}:${tempMinute}`}
          okLabel="אישור"
          onOk={handleSave}
        >
          <Segmented
            label="תאריך או שעה"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { key: 'date', label: 'תאריך', Icon: CalendarIcon },
              { key: 'time', label: 'שעה', Icon: Clock },
            ]}
          />
          {/* One height for both, so switching does not move the buttons. */}
          <div className="picker-tab-body">
            {activeTab === 'date' ? (
              <CalendarBody selectedDateStr={tempDateStr} onSelect={setTempDateStr} />
            ) : (
              <TimeWheels hour={tempHour} minute={tempMinute} onHour={setTempHour} onMinute={setTempMinute} />
            )}
          </div>
        </PickerDialog>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CUSTOM DROPDOWN — fully styled select replacement
   ══════════════════════════════════════════════════════════ */
export function CustomDropdown({ value, onChange, options, label, placeholder = 'בחר...', required, addable = false, addLabel = 'הוסף חדש', onCommit }) {
  const [isOpen, setIsOpen] = useState(false);
  // Back closes the picker, not the sheet underneath it.
  useBackHandler(isOpen, () => setIsOpen(false));
  const [popupRect, setPopupRect] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const draftInputRef = useRef(null);

  const normalized = (options || []).map(o => (
    typeof o === 'string' ? { value: o, label: o } : o
  ));
  const current = normalized.find(o => o.value === value);

  // Compute popup position directly from the trigger's bounding rect.
  // We also set right:'auto' in the popup inline style to prevent the
  // CSS class's right:0 from fighting left in RTL mode (which caused the
  // dropdown to snap to the right edge of the viewport).
  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const openAbove = spaceBelow < 220 && r.top > 220;
      const w = Math.min(r.width, window.innerWidth - 32);
      const left = Math.max(16, Math.min(r.left, window.innerWidth - w - 16));
      setPopupRect({
        top: openAbove ? undefined : r.bottom + 6,
        bottom: openAbove ? (window.innerHeight - r.top + 6) : undefined,
        left,
        width: w,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onDocClick = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        popupRef.current && !popupRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    const onEsc = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [isOpen]);

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setAdding(false);
    setDraft('');
  };

  const handleStartAdd = () => {
    setAdding(true);
    setDraft('');
    requestAnimationFrame(() => draftInputRef.current?.focus());
  };

  const handleCommitAdd = () => {
    const val = draft.trim();
    if (!val) { setAdding(false); return; }
    handleSelect(val);
    onCommit?.(val);
  };

  // Reset adding mode when closing
  useEffect(() => {
    if (!isOpen) { setAdding(false); setDraft(''); }
  }, [isOpen]);

  return (
    <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
      {label && <label className="field-label">{label}{required && ' *'}</label>}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="form-control picker-field custom-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {current?.icon && <span className="picker-field-icon" aria-hidden="true">{current.icon}</span>}
        <span className={`picker-field-text${current ? '' : ' is-empty'}`}>
          {current ? current.label : placeholder}
        </span>
        <span className="picker-field-chev" aria-hidden="true"><ChevronDown size={16} strokeWidth={2.6} /></span>
      </button>

      {isOpen && popupRect && createPortal(
        <div
          ref={popupRef}
          role="listbox"
          className="custom-dropdown-popup"
          style={{
            position: 'fixed',
            top: popupRect.top,
            bottom: popupRect.bottom,
            left: popupRect.left,
            right: 'auto',
            width: popupRect.width
          }}
        >
          {normalized.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(opt.value)}
                className={`custom-dropdown-option${isActive ? ' active' : ''}${opt.inUse ? ' in-use' : ''}`}
              >
                {opt.icon && <span className="custom-dropdown-option-icon">{opt.icon}</span>}
                <span style={{ flex: 1, textAlign: 'right', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: opt.labelColor || 'inherit',
                    textDecoration: opt.visited ? 'line-through' : 'none',
                    opacity: opt.visited ? 0.6 : 1,
                  }}>{opt.label}</span>
                  {opt.meta && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', opacity: 0.85 }}>
                      {opt.meta}
                    </span>
                  )}
                </span>
                {isActive && <Check size={16} strokeWidth={3} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
              </button>
            );
          })}

          {addable && !adding && (
            <button
              type="button"
              onClick={handleStartAdd}
              className="custom-dropdown-option custom-dropdown-add"
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--accent)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span style={{ flex: 1, textAlign: 'right', color: 'var(--accent)', fontWeight: 800 }}>{addLabel}</span>
            </button>
          )}

          {addable && adding && (
            <div className="custom-dropdown-add-row" onClick={(e) => e.stopPropagation()}>
              <input
                ref={draftInputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleCommitAdd(); }
                  if (e.key === 'Escape') { e.preventDefault(); setAdding(false); setDraft(''); }
                }}
                placeholder="שם הקטגוריה החדשה"
                style={{
                  flex: 1, minHeight: 36, padding: '6px 10px',
                  border: '1.5px solid var(--accent)', borderRadius: 8,
                  fontFamily: 'var(--font-hebrew)', fontSize: 14, fontWeight: 700,
                  color: 'var(--primary)', outline: 'none', background: 'var(--surface)',
                  textAlign: 'right'
                }}
              />
              <button
                type="button"
                onClick={handleCommitAdd}
                className="btn-primary"
                style={{ minHeight: 36, padding: '6px 12px', fontSize: 13 }}
              >
                הוסף
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setDraft(''); }}
                style={{
                  minHeight: 36, padding: '6px 10px', fontSize: 12,
                  background: 'transparent', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontWeight: 700
                }}
              >
                בטל
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
