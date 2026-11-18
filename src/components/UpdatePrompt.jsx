import { Download } from 'lucide-react';
import useBackHandler from '../hooks/useBackHandler';

/* A new version of the app was found (the owner's ask: a message that pops
   up, not only the banner). Once a version, and a day later again while it
   is not installed (src/lib/release.js, updatePromptDue). "עדכן עכשיו"
   opens the settings' update section and starts the download there; the
   banner stays for later. */
export default function UpdatePrompt({ latest, onUpdate, onLater }) {
  useBackHandler(true, onLater);
  const notes = (latest.notes || []).slice(0, 4);
  return (
    <div className="modal-overlay update-prompt-overlay" onClick={onLater} style={{ alignItems: 'center' }}>
      <div
        className="modal-content update-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-prompt-title"
        style={{ height: 'auto', maxHeight: '80%', maxWidth: 420, borderRadius: 'var(--radius-xl)', margin: 16, padding: '24px 20px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div className="update-prompt-icon"><Download size={22} aria-hidden="true" /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="update-prompt-title" style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>
              יש גרסה חדשה לאפליקציה
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>
              גרסה {latest.versionName}{latest.sizeMb ? ` · ${latest.sizeMb}MB` : ''}
            </p>
          </div>
        </div>
        {notes.length > 0 && (
          <ul className="update-prompt-notes">
            {notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="button" className="btn-primary" onClick={onUpdate}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Download size={16} aria-hidden="true" /> עדכן עכשיו
          </button>
          <button type="button" className="btn-secondary" onClick={onLater} style={{ flex: 1 }}>אחר כך</button>
        </div>
      </div>
    </div>
  );
}
