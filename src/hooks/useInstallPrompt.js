import { useEffect, useState } from 'react';

// Exposes the PWA install prompt to the UI.
//
//   const { canInstall, install, installed, isIOS } = useInstallPrompt();
//
// - canInstall: true when the browser fired `beforeinstallprompt`.
// - install():  triggers the native install dialog; resolves to the user's
//               choice ('accepted' | 'dismissed' | 'unsupported').
// - installed:  true once the user accepts or the app is already running
//               as a PWA (display-mode: standalone).
// - isIOS:      true on iOS Safari which never fires beforeinstallprompt,
//               so the UI can show manual instructions instead.

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    // Detect already-installed (PWA running standalone)
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (standalone) setInstalled(true);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return 'unsupported';
    deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setDeferred(null);
    return choice.outcome;
  };

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  return {
    canInstall: !!deferred,
    install,
    installed,
    isIOS,
  };
}
