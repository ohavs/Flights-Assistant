import { AlertTriangle, HelpCircle } from 'lucide-react';
import useBackHandler from '../hooks/useBackHandler';

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'אישור',
  cancelText = 'ביטול',
  onConfirm,
  onClose,
  danger = false,
  busy = false,
}) {
  useBackHandler(!!isOpen && !busy, () => onClose?.());
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (busy) return;
    onConfirm?.();
  };

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose} style={{ alignItems: 'center' }}>
      <div
        className="modal-content"
        style={{ height: 'auto', maxHeight: '80%', maxWidth: 420, borderRadius: 'var(--radius-xl)', margin: 16, padding: '24px 20px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: danger ? 'var(--c-red-10)' : 'var(--brand-soft)',
            color: danger ? 'var(--c-red)' : 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            {danger ? <AlertTriangle size={22} /> : <HelpCircle size={22} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
              {title}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, fontWeight: 600 }}>
              {message}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="סגור"
            className="btn-close"
            style={{ flexShrink: 0, opacity: busy ? 0.5 : 1 }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-secondary"
            style={{ flex: 1, opacity: busy ? 0.5 : 1 }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={`btn-primary${danger ? ' danger' : ''}`}
            style={{ flex: 1, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'פועל...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
