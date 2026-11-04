// A field low on the screen stays in sight when the keyboard opens (the
// owner's ask): once the keyboard is up, the field's own scroller (a
// sheet, the page) moves it above the keyboard, and above a sheet's save
// bar (.sheet-footer) that would cover it. Installed once in main.jsx.
//
// The scroller is scrolled by hand, not with scrollIntoView, which also
// scrolls the overflow: hidden frame around it.
const EDITABLE = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])'
  + ':not([type=range]):not([type=file]):not([type=color]):not([readonly]), textarea:not([readonly]), [contenteditable="true"]';
const GAP = 16;

const editable = (el) => !!el?.matches?.(EDITABLE);

function scrollerOf(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

// How far the scroller should move so `el` is in sight: above the
// keyboard (the visual viewport), inside the scroller, above a pinned
// save bar under it. 0 when it already is.
function offsetFor(el, box) {
  const vv = window.visualViewport;
  let top = vv ? vv.offsetTop : 0;
  let bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  top = Math.max(top, b.top);
  bottom = Math.min(bottom, b.bottom);
  for (const foot of box.querySelectorAll('.sheet-footer')) {
    if (foot.contains(el) || getComputedStyle(foot).position !== 'sticky') continue;
    const f = foot.getBoundingClientRect();
    if (f.top > r.top) bottom = Math.min(bottom, f.top);
  }
  // Too tall for the room (a long textarea): its top.
  if (r.bottom > bottom - GAP) return Math.min(r.bottom - bottom + GAP, r.top - top - GAP);
  if (r.top < top + GAP) return r.top - top - GAP;
  return 0;
}

// Pinned inside its scroller (a sheet's sticky header): scrolling does
// not move it.
function pinned(el, box) {
  for (let p = el; p && p !== box; p = p.parentElement) {
    const pos = getComputedStyle(p).position;
    if (pos === 'sticky' || pos === 'fixed') return true;
  }
  return false;
}

export function revealField(el) {
  if (!el?.isConnected || !editable(el)) return;
  const box = scrollerOf(el);
  if (!box || pinned(el, box)) return;
  const dy = offsetFor(el, box);
  if (Math.abs(dy) >= 1) box.scrollBy({ top: dy, behavior: 'smooth' });
}

export function installKeepFocusVisible() {
  if (typeof window === 'undefined') return;
  let timer = 0;
  const later = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(() => revealField(document.activeElement), ms);
  };
  // A tap on a field: the keyboard may already be up (from the field
  // before), or about to open; the resize below covers the opening.
  document.addEventListener('focusin', (e) => { if (editable(e.target)) later(150); });
  const onResize = () => { if (editable(document.activeElement)) later(80); };
  window.visualViewport?.addEventListener('resize', onResize);
  window.addEventListener('resize', onResize);
}
