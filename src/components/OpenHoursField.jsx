import { useState } from 'react';
import { Clock, X, Plus, Copy, Sparkles } from 'lucide-react';
import { CustomTimeRangePicker } from './CustomDatePicker';
import { DAY_NAMES, MAX_RANGES, ALL_DAY, fromGoogle } from '../lib/openHours';

/* The place form's opening hours (8.96.0, the owner's ask): every day of
   the week open or closed, with its hours, and a break (a second range).
   Apart from the place's own dates ("מתי?"). Optional: until it is set
   there is only "הוספה ידנית" and "מלא מגוגל".
   `value`: the hours as saved (src/lib/openHours.js) or null.
   `onFetch()`: → what fetchOpeningHours gave, or null when it can't be
   asked (no key). Throws { network } offline.                         */

const FIRST = [{ from: '09:00', to: '17:00' }];
const EVERY_DAY = () => Object.fromEntries(Array.from({ length: 7 }, (_, d) => [String(d), FIRST.map(r => ({ ...r }))]));
const pad = (n) => String(n).padStart(2, '0');
const plus = (hhmm, h) => { const [a, b] = hhmm.split(':').map(Number); return `${pad((a + h) % 24)}:${pad(b)}`; };
const rangeText = (r) => (r.from === r.to ? ALL_DAY : `${r.from}–${r.to}`);

export default function OpenHoursField({ value, onChange, onFetch = null }) {
  const [status, setStatus] = useState(null);   // { tone: 'busy'|'ok'|'bad', text }
  const days = value ? Array.from({ length: 7 }, (_, d) => (Array.isArray(value[d]) ? value[d] : [])) : null;

  const put = (d, list) => onChange({ ...Object.fromEntries(days.map((l, i) => [String(i), l])), [String(d)]: list });
  // A closed day opened: the hours of the open day before it, or 9 to 5.
  const reopen = (d) => {
    for (let i = 1; i < 7; i++) {
      const l = days[(d - i + 7) % 7];
      if (l.length) return put(d, l.map(r => ({ ...r })));
    }
    put(d, FIRST.map(r => ({ ...r })));
  };
  const copyAll = (d) => onChange(Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i), days[d].map(r => ({ ...r }))])));
  // A break: a second range an hour after the last one ends.
  const addRange = (d) => {
    const last = days[d][days[d].length - 1];
    const from = plus(last.to, 1);
    put(d, [...days[d], { from, to: plus(from, 4) }]);
  };

  const fill = async () => {
    setStatus({ tone: 'busy', text: 'מחפש בגוגל…' });
    try {
      const got = await onFetch();
      if (!got || got.notFound) {
        setStatus({ tone: 'bad', text: 'המקום לא נמצא בגוגל. אפשר להוסיף כתובת או קישור למפה, או למלא ידנית.' });
        return;
      }
      const hours = fromGoogle(got.periods);
      if (!hours) {
        setStatus({ tone: 'bad', text: `אין בגוגל שעות פעילות ל${got.name ? `־${got.name}` : 'מקום הזה'}. אפשר למלא ידנית.` });
        return;
      }
      onChange(hours);
      setStatus({ tone: 'ok', text: `מולא מגוגל${got.name ? ` (${got.name})` : ''}. אפשר לערוך.` });
    } catch {
      setStatus({ tone: 'bad', text: 'אין חיבור לגוגל כרגע. אפשר לנסות שוב, או למלא ידנית.' });
    }
  };

  const fromGoogleBtn = onFetch && (
    <button type="button" className="hours-google" onClick={fill} disabled={status?.tone === 'busy'}>
      <Sparkles size={14} aria-hidden="true" />
      <span>{status?.tone === 'busy' ? 'מחפש…' : 'מלא מגוגל'}</span>
    </button>
  );

  return (
    <div className="place-when place-hours" data-set={days ? 'true' : undefined}>
      <div className="place-when-head">
        <Clock size={14} aria-hidden="true" />
        <span>שעות פעילות (לא חובה)</span>
        {days && (
          <button type="button" className="btn-x" aria-label="בלי שעות פעילות" title="בלי שעות פעילות"
            onClick={() => { onChange(null); setStatus(null); }}>
            <X size={15} />
          </button>
        )}
      </div>
      {!days ? (<>
        <span className="place-when-hint">הימים והשעות שהמקום פתוח בכל שבוע. ביום או בשעה שהוא סגור, הוא יהיה אפור בתכנון היום.</span>
        <div className="hours-start">
          <button type="button" className="hours-manual" onClick={() => { onChange(EVERY_DAY()); setStatus(null); }}>
            <Plus size={14} aria-hidden="true" />
            <span>הוספה ידנית</span>
          </button>
          {fromGoogleBtn}
        </div>
      </>) : (
        <div className="hours-days">
          {days.map((list, d) => {
            const open = list.length > 0;
            return (
              <div key={d} className={`hours-day${open ? '' : ' closed'}`} data-day={d}>
                <button type="button" role="switch" aria-checked={open} aria-label={`פתוח ביום ${DAY_NAMES[d]}`}
                  className="hours-day-switch" onClick={() => (open ? put(d, []) : reopen(d))}>
                  <span className="hours-day-name">{DAY_NAMES[d]}</span>
                  <span className={`switch${open ? ' on' : ''}`} aria-hidden="true"><i /></span>
                </button>
                <div className="hours-ranges">
                  {!open && <span className="hours-closed">סגור</span>}
                  {list.map((r, i) => (
                    <span key={i} className="hours-range">
                      <CustomTimeRangePicker
                        label={`${DAY_NAMES[d]}: שעות פעילות`}
                        start={r.from}
                        end={r.to}
                        onChange={(from, to) => put(d, list.map((x, j) => (j === i ? { from, to } : x)))}
                        renderTrigger={(openPicker) => (
                          <button type="button" className="hours-chip" onClick={openPicker} aria-label={`${DAY_NAMES[d]} ${rangeText(r)}, שינוי`}>
                            {rangeText(r)}
                          </button>
                        )}
                      />
                      {list.length > 1 && (
                        <button type="button" className="hours-chip-x" aria-label={`הסרת ${rangeText(r)}`} title="הסרה"
                          onClick={() => put(d, list.filter((_, j) => j !== i))}>
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                  {open && list.length < MAX_RANGES && (
                    <button type="button" className="hours-icon" aria-label={`הפסקה ביום ${DAY_NAMES[d]}`} title="הפסקה (טווח נוסף)" onClick={() => addRange(d)}>
                      <Plus size={14} />
                    </button>
                  )}
                </div>
                {open && (
                  <button type="button" className="hours-icon" aria-label={`השעות של ${DAY_NAMES[d]} לכל הימים`} title="לכל הימים" onClick={() => copyAll(d)}>
                    <Copy size={14} />
                  </button>
                )}
              </div>
            );
          })}
          {fromGoogleBtn && <div className="hours-start">{fromGoogleBtn}</div>}
        </div>
      )}
      {status && status.tone !== 'busy' && (
        <span className={`hours-status ${status.tone}`} role="status">{status.text}</span>
      )}
    </div>
  );
}
