// onSnapshot for a trip's sub-collections, surviving one race: a listener
// opened on a trip the server has not stored yet is refused. That happens
// when a trip is opened right after it is created — its card shows at once
// from the local cache, before the write reaches the server — and a refused
// listener never comes back, so the tab would stay empty until a reload.
// Here a refusal is tried again, a few times, a little later each time.
// Same arguments as onSnapshot(ref, onNext, onError); returns unsubscribe.
import { onSnapshot } from 'firebase/firestore';

export function listen(ref, onNext, onError, { retries = 5, delay = 400 } = {}) {
  let unsub = () => {};
  let stopped = false;
  let tries = 0;
  let timer;
  const start = () => {
    unsub = onSnapshot(ref, onNext, (err) => {
      if (stopped) return;
      if (err?.code === 'permission-denied' && tries < retries) {
        tries += 1;
        timer = setTimeout(() => { if (!stopped) start(); }, delay * tries);
        return;
      }
      if (onError) onError(err);
      else console.warn('listener stopped:', err?.code || err);
    });
  };
  start();
  return () => { stopped = true; clearTimeout(timer); unsub(); };
}
