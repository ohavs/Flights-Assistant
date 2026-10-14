import { AlertTriangle, CheckCircle2, XCircle, Info, WifiOff } from 'lucide-react';

/* ── Notice ──────────────────────────────────────────────────────────────
   A short status inside a card or a form: what happened, in words, with
   one icon for its tone. No emoji: the icon carries the tone, and every
   notice in the app reads the same way.

     <Notice tone="warn">חיפוש חי אינו זמין</Notice>

   tones: info, success, warn, error, offline                          */
const ICONS = { info: Info, success: CheckCircle2, warn: AlertTriangle, error: XCircle, offline: WifiOff };

export default function Notice({ tone = 'info', children, style }) {
  const Icon = ICONS[tone] || Info;
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'} style={style}>
      <Icon size={16} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
