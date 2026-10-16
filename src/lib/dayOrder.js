// The order of a day's plan, as every reader shows it: no Firebase here,
// so the widget snapshot (widgetData.js) and the morning summary stay pure
// and run in plain node (scripts/widget-fixtures.mjs). The writes, and why
// activities carry their own `order`, are in dayActivities.js.

export const hasOrder = (a) => typeof a?.order === 'number';
const keyOf = (a, i) => a?.id ?? `#${i}`;

// Every copy in the array, each with the place it counts at (`rank`).
export function rows(raw) {
  let prev = 0;
  return (Array.isArray(raw) ? raw : []).map((act, i) => {
    const rank = hasOrder(act) ? act.order : prev + 1;
    prev = rank;
    return { act, rank, i };
  });
}

// One row per activity (the newest copy), in the order shown.
export function shownRows(all) {
  const best = new Map();
  for (const r of all) {
    const k = keyOf(r.act, r.i);
    const cur = best.get(k);
    if (!cur || (r.act.updatedAt || 0) >= (cur.act.updatedAt || 0)) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank || a.i - b.i);
}

// The day's activities as they are shown. Every reader goes through this.
export const dayActivities = (raw) => shownRows(rows(raw)).map(r => r.act);
