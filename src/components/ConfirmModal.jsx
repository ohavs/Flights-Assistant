import { X, AlertTriangle } from 'lucide-react';

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
            background: danger ? 'rgba(239, 68, 68, 0.12)' : 'rgba(79, 70, 229, 0.12)',
            color: danger ? 'rgb(220, 38, 38)' : 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <AlertTriangle size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: 'var(--primary)', marginBottom: 6 }}>
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
            style={{
              background: 'rgba(11,11,48,0.05)', border: 'none', borderRadius: '50%',
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: busy ? 'default' : 'pointer', color: 'var(--text-muted)', flexShrink: 0,
              opacity: busy ? 0.5 : 1
            }}
          >
            <X size={16} />
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
            className="btn-primary"
            style={{
              flex: 1,
              background: danger ? 'rgb(220, 38, 38)' : 'var(--primary)',
              boxShadow: danger ? '0 4px 14px rgba(220, 38, 38, 0.3)' : '0 4px 14px rgba(11,11,48,0.12)',
              opacity: busy ? 0.7 : 1
            }}
          >
            {busy ? 'פועל...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
