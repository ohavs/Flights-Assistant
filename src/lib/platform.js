// Native (Android app) vs web. Everything platform-specific goes through here
// so screens don't need to know where they run. On the web every export is a
// no-op or returns the web answer.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export const isNative = Capacitor.isNativePlatform();

// ---- Android back button ----
// useBackHandler keeps the stack of open layers; here the hardware button
// closes the topmost one, and with nothing open it leaves the app.
export function onNativeBack(fn) {
  if (!isNative) return () => {};
  const sub = App.addListener('backButton', fn);
  return () => { sub.then((s) => s.remove()); };
}

export function exitApp() {
  if (isNative) App.exitApp();
}

// ---- Status bar icons follow the theme ----
export function setStatusBarTheme(dark) {
  if (!isNative) return;
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
}

export async function appVersion() {
  if (!isNative) return null;
  const info = await App.getInfo();
  return { name: info.version, code: Number(info.build) || 0 };
}

// ---- Haptics (no-op on the web) ----
// select: ticks · tap: nav, cards · press: primary actions
// success / warning: after saving / before deleting.
export function haptic(kind = 'tap') {
  if (!isNative) return;
  const run = {
    select: () => Haptics.selectionChanged(),
    tap: () => Haptics.impact({ style: ImpactStyle.Light }),
    press: () => Haptics.impact({ style: ImpactStyle.Medium }),
    success: () => Haptics.notification({ type: NotificationType.Success }),
    warning: () => Haptics.notification({ type: NotificationType.Warning }),
  }[kind];
  run?.().catch(() => {});
}
