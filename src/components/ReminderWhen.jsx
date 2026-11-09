import { useMemo } from 'react';
import { Bell, BellOff, CalendarClock } from 'lucide-react';
import Sheet from '../ui/Sheet';
import { CustomDateTimePicker, formatHebrewDateTime } from './CustomDatePicker';
import { whenPresets, whenPast } from '../lib/reminderWhen';

/* ══════════════════════════════════════════════════════════
   When a reminder rings (8.92.0, the owner's ask: change each reminder's
   time easily). What is set now, four quick times, any date and time,
   or none. In the edit sheet it sets the draft; on its own (WhenSheet,
   from the bell on a reminder's row or the composer's chip) a tap is the
   choice and the sheet closes.
   ══════════════════════════════════════════════════════════ */

export function WhenChoices({ value, onPick, who }) {
  // Worked out when the choices open: "in an hour" from now.
  const presets = useMemo(() => whenPresets(new Date()), []);
  const past = value && whenPast(value);
  return (
    <div className="when-choices">
      <div className={`when-now${value ? ' on' : ''}${past ? ' past' : ''}`}>
        {value ? <Bell size={18} aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}
        <div className="when-now-text">
          <strong>{value ? formatHebrewDateTime(value) : 'בלי התראה'}</strong>
          {value && <span>{past ? 'השעה כבר עברה' : who}</span>}
        </div>
        {value && (
          <button type="button" className="when-clear" onClick={() => onPick('')}>בלי התראה</button>
        )}
      </div>
      <div className="when-presets" role="group" aria-label="זמנים מהירים">
        {presets.map(p => (
          <button key={p.key} type="button" aria-pressed={value === p.at} onClick={() => onPick(p.at)}>
            <span className="when-preset-label">{p.label}</span>
            <span className="when-preset-time">{p.at.slice(11)}</span>
          </button>
        ))}
      </div>
      <CustomDateTimePicker
        value={value}
        onChange={onPick}
        renderTrigger={(open) => (
          <button type="button" className="when-custom" onClick={open}>
            <CalendarClock size={16} aria-hidden="true" />
            <span>תאריך ושעה אחרים</span>
          </button>
        )}
      />
    </div>
  );
}

// The choices in a sheet of their own, over the reminders: a pick is saved
// (or set on the composer) and the sheet closes.
export function WhenSheet({ subject, value, who, onPick, onClose }) {
  return (
    <Sheet title="מתי להזכיר?" onClose={onClose}>
      {({ close }) => (
        <>
          {subject && <p className="when-subject">{subject}</p>}
          <WhenChoices value={value} who={who} onPick={(v) => { onPick(v); close(); }} />
        </>
      )}
    </Sheet>
  );
}
