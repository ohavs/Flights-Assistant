import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, Clock, ChevronRight, ChevronLeft, ChevronDown, X, Check } from 'lucide-react';

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

// Helper to display formatted datetime in Hebrew
export function formatHebrewDateTime(dateTimeStr) {
  if (!dateTimeStr) return 'בחר תאריך ושעה';
  const [datePart, timePart] = dateTimeStr.split('T');
  if (!timePart) return formatHebrewDate(datePart);
  const [h, m] = timePart.split(':');
  return `${formatHebrewDate(datePart)} בשעה ${h}:${m}`;
}

/* ══════════════════════════════════════════════════════════
   CALENDAR CORE COMPONENT
   ══════════════════════════════════════════════════════════ */
function CalendarBody({ selectedDateStr, onSelect }) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', userSelect: 'none' }}>
      {/* Month Year Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl' }}>
        <button
          type="button"
          onClick={handlePrevMonth}
          style={{
            background: 'rgba(11,11,48,0.04)', border: 'none',
            width: '32px', height: '32px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--primary)'
          }}
        >
          <ChevronRight size={18} />
        </button>

        <span style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>
          {MONTHS_HE[currentMonth]} {currentYear}
        </span>

        <button
          type="button"
          onClick={handleNextMonth}
          style={{
            background: 'rgba(11,11,48,0.04)', border: 'none',
            width: '32px', height: '32px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--primary)'
          }}
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Weekdays header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', gap: '4px' }}>
        {DAYS_HE.map((day, idx) => (
          <span key={idx} style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)' }}>
            {day}
          </span>
        ))}
      </div>

      {/* Days grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
        {daysGrid.map((item, idx) => {
          if (item.isPadding) {
            return <div key={`pad-${idx}`} />;
          }

          const thisDateStr = formatDateISO(new Date(currentYear, currentMonth, item.dayNum));
          const isSelected = selectedDateStr === thisDateStr;
          const isToday = todayStr === thisDateStr;

          return (
            <button
              key={`day-${item.dayNum}`}
              type="button"
              onClick={() => onSelect(thisDateStr)}
              style={{
                aspectRatio: '1/1',
                borderRadius: '8px',
                border: isToday ? '1.5px solid var(--accent)' : 'none',
                background: isSelected 
                  ? 'var(--primary)' 
                  : isToday 
                    ? 'rgba(79,70,229,0.05)' 
                    : 'rgba(11,11,48,0.02)',
                color: isSelected 
                  ? '#fff' 
                  : isToday 
                    ? 'var(--accent)' 
                    : 'var(--primary)',
                fontWeight: isSelected || isToday ? '800' : '600',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.1s ease'
              }}
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
   TIME PICKER BODY
   ══════════════════════════════════════════════════════════ */
function TimeBody({ hour, minute, onChangeTime }) {
  const hoursList = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutesList = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  const hourRef = useRef(null);
  const minRef = useRef(null);

  // Auto-scroll selected elements into center view inside columns
  useEffect(() => {
    if (hourRef.current) {
      const activeEl = hourRef.current.querySelector('.active-hour');
      if (activeEl) {
        hourRef.current.scrollTop = activeEl.offsetTop - hourRef.current.clientHeight / 2 + activeEl.clientHeight / 2;
      }
    }
    if (minRef.current) {
      const activeEl = minRef.current.querySelector('.active-min');
      if (activeEl) {
        minRef.current.scrollTop = activeEl.offsetTop - minRef.current.clientHeight / 2 + activeEl.clientHeight / 2;
      }
    }
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', height: '240px', maxHeight: '240px', direction: 'rtl' }}>
      {/* Hours Column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0, overflow: 'hidden' }}>
        <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '4px' }}>שעה</span>
        <div
          ref={hourRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            border: '1px solid rgba(11,11,48,0.08)',
            borderRadius: '12px',
            background: 'rgba(11,11,48,0.02)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}
        >
          {hoursList.map(h => {
            const isActive = h === hour;
            return (
              <button
                key={h}
                type="button"
                className={isActive ? 'active-hour' : ''}
                onClick={() => onChangeTime(h, minute)}
                style={{
                  padding: '8px 0',
                  border: 'none',
                  borderRadius: '8px',
                  background: isActive ? 'var(--primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--primary)',
                  fontWeight: isActive ? '800' : '600',
                  fontSize: '15px',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                {h}
              </button>
            );
          })}
        </div>
      </div>

      {/* Minutes Column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0, overflow: 'hidden' }}>
        <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '4px' }}>דקה</span>
        <div
          ref={minRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            border: '1px solid rgba(11,11,48,0.08)',
            borderRadius: '12px',
            background: 'rgba(11,11,48,0.02)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}
        >
          {minutesList.map(m => {
            const isActive = m === minute;
            return (
              <button
                key={m}
                type="button"
                className={isActive ? 'active-min' : ''}
                onClick={() => onChangeTime(hour, m)}
                style={{
                  padding: '8px 0',
                  border: 'none',
                  borderRadius: '8px',
                  background: isActive ? 'var(--primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--primary)',
                  fontWeight: isActive ? '800' : '600',
                  fontSize: '15px',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CUSTOM DATE PICKER
   ══════════════════════════════════════════════════════════ */
export function CustomDatePicker({ value, onChange, label, required, variant }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempDateStr, setTempDateStr] = useState(value || formatDateISO(new Date()));

  // Sync state with prop value
  useEffect(() => {
    if (value) {
      setTempDateStr(value);
    }
  }, [value]);

  const handleSelectDate = (dateStr) => {
    setTempDateStr(dateStr);
  };

  const handleSave = () => {
    onChange(tempDateStr);
    setIsOpen(false);
  };

  const isCompact = variant === 'compact';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      {label && <label style={{ fontSize: '13px', fontWeight: '800', color: 'var(--primary)' }}>{label}</label>}
      
      {/* Trigger Button Input-styled */}
      <div 
        onClick={() => setIsOpen(true)}
        className={isCompact ? '' : 'form-control'}
        style={isCompact ? {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          background: 'transparent',
          border: 'none',
          padding: '2px 0',
          width: '100%',
          boxShadow: 'none'
        } : {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          background: '#fff'
        }}
      >
        <span style={{ 
          fontSize: isCompact ? '13px' : '15px', 
          fontWeight: '800', 
          color: 'var(--primary-color)' 
        }}>
          {value ? formatHebrewDate(value) : 'בחר תאריך...'}
        </span>
        {!isCompact && <CalendarIcon size={18} style={{ color: 'var(--text-muted)' }} />}
      </div>

      {/* Modal overlay */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11,11,48,0.4)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          {/* Glass Card content */}
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '360px',
              background: '#fff',
              borderRadius: '24px',
              boxShadow: '0 20px 50px rgba(11, 11, 48, 0.25)',
              border: '1px solid rgba(11, 11, 48, 0.08)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              animation: 'fadeIn 0.2s ease-out'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '10px' }}>
              <span style={{ fontWeight: '900', fontSize: '16px', color: 'var(--primary)' }}>
                {label || 'בחירת תאריך'}
              </span>
              <button 
                type="button" 
                onClick={() => setIsOpen(false)}
                style={{ background: 'rgba(11,11,48,0.04)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Calendar grid */}
            <CalendarBody selectedDateStr={tempDateStr} onSelect={handleSelectDate} />

            {/* Selected Value Preview */}
            <div style={{ background: 'rgba(79,70,229,0.05)', borderRadius: '12px', padding: '10px 14px', fontSize: '13.5px', fontWeight: '800', color: 'var(--accent)', textAlign: 'center' }}>
              {formatHebrewDate(tempDateStr)}
            </div>

            {/* Confirm Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button" 
                onClick={handleSave} 
                className="btn-primary" 
                style={{ flex: 1, minHeight: '40px', fontSize: '14px', padding: '6px' }}
              >
                בחירה
              </button>
              <button 
                type="button" 
                onClick={() => setIsOpen(false)} 
                className="btn-secondary" 
                style={{ flex: 1, minHeight: '40px', fontSize: '14px', padding: '6px' }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CUSTOM TIME PICKER — outputs "HH:MM AM/PM" (12-hour)
   ══════════════════════════════════════════════════════════ */
function parse12hString(str) {
  const m = String(str || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return { h12: '12', mm: '00', period: 'PM' };
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  let period = (m[3] || '').toUpperCase();
  if (!period) {
    period = h >= 12 ? 'PM' : 'AM';
    h = ((h + 11) % 12) + 1;
  }
  return { h12: String(h).padStart(2, '0'), mm: String(min).padStart(2, '0'), period };
}

export function formatHebrewTime(timeStr) {
  if (!timeStr) return 'בחר שעה';
  return timeStr;
}

export function CustomTimePicker({ value, onChange, label, required }) {
  const [isOpen, setIsOpen] = useState(false);
  const parsed = parse12hString(value);
  const [tempH, setTempH] = useState(parsed.h12);
  const [tempM, setTempM] = useState(parsed.mm);
  const [tempPeriod, setTempPeriod] = useState(parsed.period);

  useEffect(() => {
    const p = parse12hString(value);
    setTempH(p.h12);
    setTempM(p.mm);
    setTempPeriod(p.period);
  }, [value]);

  const hRef = useRef(null);
  const mRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      const scrollActive = (ref, cls) => {
        if (!ref.current) return;
        const el = ref.current.querySelector('.' + cls);
        if (el) ref.current.scrollTop = el.offsetTop - ref.current.clientHeight / 2 + el.clientHeight / 2;
      };
      scrollActive(hRef, 'active-h');
      scrollActive(mRef, 'active-m');
    });
  }, [isOpen, tempH, tempM]);

  const hours12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  const handleSave = () => {
    onChange(`${tempH}:${tempM} ${tempPeriod}`);
    setIsOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      {label && <label style={{ fontSize: '13px', fontWeight: '800', color: 'var(--primary)' }}>{label}{required && ' *'}</label>}

      <div
        onClick={() => setIsOpen(true)}
        className="form-control"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: '#fff' }}
      >
        <span style={{ fontSize: '15px', fontWeight: '700', color: value ? 'var(--primary)' : 'var(--text-muted)' }}>
          {value || 'בחר שעה...'}
        </span>
        <Clock size={18} style={{ color: 'var(--text-muted)' }} />
      </div>

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,11,48,0.4)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '360px', background: '#fff', borderRadius: '24px', boxShadow: '0 20px 50px rgba(11, 11, 48, 0.25)', border: '1px solid rgba(11, 11, 48, 0.08)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeIn 0.2s ease-out' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '10px' }}>
              <span style={{ fontWeight: '900', fontSize: '16px', color: 'var(--primary)' }}>{label || 'בחירת שעה'}</span>
              <button type="button" onClick={() => setIsOpen(false)} style={{ background: 'rgba(11,11,48,0.04)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={15} />
              </button>
            </div>

            {/* AM/PM toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: 'rgba(11,11,48,0.04)', padding: 4, borderRadius: 12 }}>
              {['AM', 'PM'].map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTempPeriod(p)}
                  style={{
                    border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                    background: tempPeriod === p ? '#fff' : 'transparent',
                    color: tempPeriod === p ? 'var(--primary)' : 'var(--text-muted)',
                    boxShadow: tempPeriod === p ? '0 2px 6px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {p === 'AM' ? 'לפני הצהריים (AM)' : 'אחר הצהריים (PM)'}
                </button>
              ))}
            </div>

            {/* Hour + Minute columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, height: 220, direction: 'rtl' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center' }}>שעה</span>
                <div ref={hRef} style={{ flex: 1, overflowY: 'auto', border: '1px solid rgba(11,11,48,0.08)', borderRadius: 12, background: 'rgba(11,11,48,0.02)', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {hours12.map(h => {
                    const isActive = h === tempH;
                    return (
                      <button
                        key={h} type="button"
                        className={isActive ? 'active-h' : ''}
                        onClick={() => setTempH(h)}
                        style={{ padding: '8px 0', border: 'none', borderRadius: 8, background: isActive ? 'var(--primary)' : 'transparent', color: isActive ? '#fff' : 'var(--primary)', fontWeight: isActive ? 800 : 600, fontSize: 15, cursor: 'pointer', textAlign: 'center' }}
                      >{h}</button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center' }}>דקה</span>
                <div ref={mRef} style={{ flex: 1, overflowY: 'auto', border: '1px solid rgba(11,11,48,0.08)', borderRadius: 12, background: 'rgba(11,11,48,0.02)', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {minutes.map(m => {
                    const isActive = m === tempM;
                    return (
                      <button
                        key={m} type="button"
                        className={isActive ? 'active-m' : ''}
                        onClick={() => setTempM(m)}
                        style={{ padding: '8px 0', border: 'none', borderRadius: 8, background: isActive ? 'var(--primary)' : 'transparent', color: isActive ? '#fff' : 'var(--primary)', fontWeight: isActive ? 800 : 600, fontSize: 15, cursor: 'pointer', textAlign: 'center' }}
                      >{m}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(79,70,229,0.05)', borderRadius: 12, padding: '10px 14px', fontSize: '13.5px', fontWeight: 800, color: 'var(--accent)', textAlign: 'center' }}>
              {tempH}:{tempM} {tempPeriod}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleSave} className="btn-primary" style={{ flex: 1, minHeight: 40, fontSize: 14, padding: 6 }}>בחירה</button>
              <button type="button" onClick={() => setIsOpen(false)} className="btn-secondary" style={{ flex: 1, minHeight: 40, fontSize: 14, padding: 6 }}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CUSTOM DATE TIME PICKER
   ══════════════════════════════════════════════════════════ */
export function CustomDateTimePicker({ value, onChange, label }) {
  const [isOpen, setIsOpen] = useState(false);
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
      if (timeParts[0]) defaultH = timeParts[0];
      if (timeParts[1]) defaultM = timeParts[1];
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
        if (timeParts[0]) setTempHour(timeParts[0]);
        if (timeParts[1]) setTempMinute(timeParts[1]);
      }
    }
  }, [value]);

  const handleSelectDate = (dateStr) => {
    setTempDateStr(dateStr);
  };

  const handleSelectTime = (h, m) => {
    setTempHour(h);
    setTempMinute(m);
  };

  const handleSave = () => {
    const formattedDateTime = `${tempDateStr}T${tempHour}:${tempMinute}`;
    onChange(formattedDateTime);
    setIsOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      {label && <label style={{ fontSize: '13px', fontWeight: '800', color: 'var(--primary)' }}>{label}</label>}
      
      {/* Trigger Button Input-styled */}
      <div 
        onClick={() => {
          setActiveTab('date');
          setIsOpen(true);
        }}
        className="form-control"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          background: '#fff'
        }}
      >
        <span style={{ fontSize: '15px', fontWeight: '600', color: value ? 'var(--primary)' : 'var(--text-muted)' }}>
          {value ? formatHebrewDateTime(value) : 'בחר תאריך ושעה...'}
        </span>
        <Clock size={18} style={{ color: 'var(--text-muted)' }} />
      </div>

      {/* Modal overlay */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11,11,48,0.4)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          {/* Glass Card content */}
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '360px',
              background: '#fff',
              borderRadius: '24px',
              boxShadow: '0 20px 50px rgba(11, 11, 48, 0.25)',
              border: '1px solid rgba(11, 11, 48, 0.08)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              animation: 'fadeIn 0.2s ease-out'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '10px' }}>
              <span style={{ fontWeight: '900', fontSize: '16px', color: 'var(--primary)' }}>
                {label || 'בחירת תאריך ושעה'}
              </span>
              <button 
                type="button" 
                onClick={() => setIsOpen(false)}
                style={{ background: 'rgba(11,11,48,0.04)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Tabs for Date / Time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'rgba(11,11,48,0.04)', padding: '4px', borderRadius: '12px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('date')}
                style={{
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 0',
                  fontSize: '13px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  background: activeTab === 'date' ? '#fff' : 'transparent',
                  color: activeTab === 'date' ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: activeTab === 'date' ? '0 2px 6px rgba(0,0,0,0.05)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                תאריך
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('time')}
                style={{
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 0',
                  fontSize: '13px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  background: activeTab === 'time' ? '#fff' : 'transparent',
                  color: activeTab === 'time' ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: activeTab === 'time' ? '0 2px 6px rgba(0,0,0,0.05)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                שעה
              </button>
            </div>

            {/* Tab content */}
            <div style={{ height: 280, display: 'flex', flexDirection: 'column' }}>
              {activeTab === 'date' ? (
                <CalendarBody selectedDateStr={tempDateStr} onSelect={handleSelectDate} />
              ) : (
                <TimeBody hour={tempHour} minute={tempMinute} onChangeTime={handleSelectTime} />
              )}
            </div>

            {/* Selected Value Preview */}
            <div style={{ background: 'rgba(79,70,229,0.05)', borderRadius: '12px', padding: '10px 14px', fontSize: '13.5px', fontWeight: '800', color: 'var(--accent)', textAlign: 'center' }}>
              {formatHebrewDate(tempDateStr)} בשעה {tempHour}:{tempMinute}
            </div>

            {/* Confirm Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button" 
                onClick={handleSave} 
                className="btn-primary" 
                style={{ flex: 1, minHeight: '40px', fontSize: '14px', padding: '6px' }}
              >
                אישור
              </button>
              <button 
                type="button" 
                onClick={() => setIsOpen(false)} 
                className="btn-secondary" 
                style={{ flex: 1, minHeight: '40px', fontSize: '14px', padding: '6px' }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CUSTOM DROPDOWN — fully styled select replacement
   ══════════════════════════════════════════════════════════ */
export function CustomDropdown({ value, onChange, options, label, placeholder = 'בחר...', required }) {
  const [isOpen, setIsOpen] = useState(false);
  const [popupRect, setPopupRect] = useState(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  const normalized = (options || []).map(o => (
    typeof o === 'string' ? { value: o, label: o } : o
  ));
  const current = normalized.find(o => o.value === value);

  // Compute popup position relative to viewport (so it escapes overflow:auto parents)
  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const openAbove = spaceBelow < 220 && r.top > 220;
      setPopupRect({
        top: openAbove ? null : r.bottom + 6,
        bottom: openAbove ? (window.innerHeight - r.top + 6) : null,
        left: r.left,
        width: r.width
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
  };

  return (
    <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
      {label && <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>{label}{required && ' *'}</label>}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="custom-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span style={{
          flex: 1,
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: current ? 'var(--primary)' : 'var(--text-muted)',
          fontWeight: current ? 700 : 600
        }}>
          {current ? current.label : placeholder}
        </span>
        <ChevronDown
          size={18}
          style={{
            color: 'var(--accent)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0
          }}
        />
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
                className={`custom-dropdown-option ${isActive ? 'active' : ''}`}
              >
                {opt.icon && <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--accent)' }}>{opt.icon}</span>}
                <span style={{ flex: 1, textAlign: 'right' }}>{opt.label}</span>
                {isActive && <Check size={16} style={{ color: 'var(--accent)' }} />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
