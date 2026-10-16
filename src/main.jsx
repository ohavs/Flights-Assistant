import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './AuthContext.jsx'
import { ConfirmProvider } from './ConfirmContext.jsx'
// Rubik ships with the app (works offline and inside the APK).
import '@fontsource-variable/rubik'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { db, enableNetwork, disableNetwork } from './firebase.js'
import { isNative } from './lib/platform.js'

// ── Service Worker: a new version takes over ──
// Web only. In the Android app the files ship inside the APK, and a worker
// would keep serving the old bundle after an update installs.
//
// The page reloads onto the new version, but never under someone's hands:
// not on the first visit (the worker only starts serving what is already
// running), and on an update only once the app is out of sight with no
// form open. Reloading on the spot threw away whatever was being typed.
let swRegistration = null;
if (!isNative && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
  const hadWorker = !!navigator.serviceWorker.controller;
  let updated = false;
  const reloadIfIdle = () => {
    if (updated && document.visibilityState === 'hidden' && !document.querySelector('.modal-overlay')) {
      window.location.reload();
    }
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadWorker) return;
    updated = true;
    reloadIfIdle();
  });
  document.addEventListener('visibilitychange', reloadIfIdle);
  navigator.serviceWorker.ready.then(reg => { swRegistration = reg; });
}

// ── Firestore network reconnect & SW update check ──
// When the tab comes back to foreground (from sleep/background), re-enable
// the Firestore WebSocket connection (which may have been dropped) and
// check for a new app version in the background.
let networkEnabled = true;

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!networkEnabled) {
      enableNetwork(db).catch(() => {});
      networkEnabled = true;
    }
    // Check for new SW version silently in the background
    if (swRegistration) swRegistration.update().catch(() => {});
  }
});

// Re-enable on browser online event (device regains connectivity)
window.addEventListener('online', () => {
  enableNetwork(db).catch(() => {});
  networkEnabled = true;
  if (swRegistration) swRegistration.update().catch(() => {});
});

// Disable network when browser goes offline to stop retries and save battery
window.addEventListener('offline', () => {
  disableNetwork(db).catch(() => {});
  networkEnabled = false;
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary label="האפליקציה">
      <AuthProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
