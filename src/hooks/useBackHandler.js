import { useEffect, useRef } from 'react';

/* ── useBackHandler ──────────────────────────────────────────────────────
   Makes the phone's back gesture mean "one step back in the app" instead
   of "close the app".

   Installed to the home screen, this is a single page that never
   navigates, so its history holds exactly one entry. Android's back
   gesture and iOS's left-edge swipe both run browser history back, and
   from the only entry there is nowhere to go but out — which is why a
   swipe used to drop the traveller out of the app mid-trip.

   The fix is one spare history entry, kept armed at all times, plus a
   stack of the layers currently open on screen. A back press pops the
   spare entry; we close the topmost layer and immediately arm a new one,
   so the history never grows however deep the sheets are stacked. When
   nothing is left to close the gesture means what it says, and we step
   back off our own entry and let the app close.

   Order is last-opened-first-closed. Effects run after their children
   mount, and a sheet opens in a later commit than the screen holding it,
   so pushing on mount and splicing on unmount gives that for free.

   Usage — call it wherever a layer's open state lives:

     useBackHandler(showForm, () => formSheet.close());

   `active` false unregisters, so a closed sheet costs nothing.          */

const layers = [];        // LIFO — the last one opened closes first
let armed = false;        // is our spare entry currently on the stack?
let leaving = false;      // stepping off our entry on the way out

function arm() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  // No URL argument: the address bar must not change, and the app reads
  // its own query string for the share target.
  window.history.pushState({ faBackGuard: true }, '');
}

function onPopState() {
  if (leaving) return;
  armed = false;   // the entry that just got popped was ours

  const top = layers[layers.length - 1];
  if (top) {
    top.close();
    arm();
    return;
  }

  // Nothing open and nowhere further in: the gesture means leave.
  leaving = true;
  window.history.back();
}

/* Call once, from the app root. Returns its own cleanup. */
export function installBackGuard() {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('popstate', onPopState);
  arm();
  return () => window.removeEventListener('popstate', onPopState);
}

export default function useBackHandler(active, onBack) {
  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);

  useEffect(() => {
    if (!active) return undefined;
    const layer = { close: () => onBackRef.current?.() };
    layers.push(layer);
    arm();
    return () => {
      const i = layers.lastIndexOf(layer);
      if (i !== -1) layers.splice(i, 1);
    };
  }, [active]);
}
