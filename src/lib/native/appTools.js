// AppToolsPlugin.java: the small native helpers (share a file, permission
// status, open Android's page for a permission). Registered once, here.
import { registerPlugin } from '@capacitor/core';

export const AppTools = registerPlugin('AppTools');

// Text shared to the app from another one: handler({ title, text }).
// Returns an unsubscribe. A share that started the app is kept until here.
export function onShared(handler) {
  let sub;
  let gone = false;
  Promise.resolve(AppTools.addListener('shared', (e) => handler(e || {})))
    .then(s => { if (gone) s?.remove?.(); else sub = s; })
    .catch(() => {});
  return () => { gone = true; sub?.remove?.(); };
}
