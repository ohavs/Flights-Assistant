import { useMemo, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import Sheet, { SheetSection } from '../ui/Sheet';
import { CustomDatePicker, CustomTimePicker } from './CustomDatePicker';
import { alertPresets, defaultAlert, formatAlert } from '../lib/placeAlerts';
import { parseLocal } from '../lib/reminderAlerts';

/* Setting the alert of a place with a date (the owner's ask): the ready
   choices for its date (an hour before, the morning, the evening before…)
   as cards, or any day and time from the app's own pickers. The line
   under them says when it will come. */
export default function PlaceAlarmSheet({ plan, alarm, whenText, onSave, onRemove, onClose }) {
  const presets = useMemo(() => alertPresets(plan.event), [plan.event]);
  const initial = alarm?.at || defaultAlert(plan.event) || '';
  const [date, setDate] = useState(initial.slice(0, 10));
  const [time, setTime] = useState(initial.slice(11, 16) || '08:00');
  const at = date && time ? `${date}T${time}` : null;
  const when = at ? parseLocal(at) : null;
  const past = !!when && when <= new Date();
  const pick = (p) => { setDate(p.at.slice(0, 10)); setTime(p.at.slice(11, 16)); };

  return (
    <Sheet title="התראה למקום" onClose={onClose}>
      {({ close }) => (
        <div className="alarm-sheet">
          <div className="alarm-place">
            <span className="alarm-place-icon"><Bell size={18} aria-hidden="true" /></span>
            <span className="alarm-place-text">
              <b>{plan.title}</b>
              {whenText && <span>{whenText}</span>}
            </span>
          </div>

          {presets.length > 0 && (
            <SheetSection label="מתי להזכיר">
              <div className="alarm-presets" role="radiogroup" aria-label="מתי להזכיר">
                {presets.map(p => (
                  <button key={p.key} type="button" role="radio" aria-checked={at === p.at}
                    className="alarm-preset" onClick={() => pick(p)}>
                    <span className="alarm-preset-label">{p.label}</span>
                    <span className="alarm-preset-at">{formatAlert(p.at)}</span>
                    {at === p.at && <Check size={15} strokeWidth={3} className="alarm-preset-check" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </SheetSection>
          )}

          <SheetSection label={presets.length ? 'או יום ושעה משלכם' : 'יום ושעה'}>
            <div className="alarm-custom">
              <CustomDatePicker value={date} onChange={setDate} label="יום" />
              <CustomTimePicker value={time} onChange={setTime} label="שעה" />
            </div>
          </SheetSection>

          <p className={`alarm-summary${past ? ' past' : ''}`} role={past ? 'alert' : undefined}>
            {past ? 'הזמן הזה כבר עבר. בחרו זמן אחר.' : at ? <>ההתראה תגיע ב<b>{formatAlert(at)}</b></> : null}
          </p>

          <div className="sheet-footer">
            <button type="button" className="btn-primary" disabled={!at || past}
              onClick={async () => { await onSave(at); close(); }}>
              {alarm ? 'עדכן התראה' : 'שמור התראה'}
            </button>
            {alarm ? (
              <button type="button" className="btn-secondary danger" onClick={async () => { await onRemove(); close(); }}>הסר</button>
            ) : (
              <button type="button" className="btn-secondary" onClick={close}>ביטול</button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
