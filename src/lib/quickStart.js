/* Opening the app on a weak connection (8.94.1, the owner's ask: "no
   reception must never mean no access").

   Signed in, Firebase Auth first checks the account with Google (and
   refreshes its token after an hour) before it says who is signed in, and
   Firestore waits for that before it reads even what is saved on the phone.
   With no network at all those requests fail at once and the app opens; on
   a weak one (one bar, Wi-Fi with no internet behind it) they hang until
   Auth gives up, 30 seconds each.

   So while the app starts, Auth's own requests get `ms` in all. Past that
   they fail as a network error, which Auth takes as "offline": the account
   saved on the phone stays signed in and the app opens with what is saved.
   The check runs again on its own once the connection answers. Nothing but
   Auth's two hosts is touched, and only until it knows who is signed in. */
const AUTH_HOSTS = /(^|[/.])(identitytoolkit|securetoken)\.googleapis\.com\//;

export function quickAuthStart(ms) {
  const real = globalThis.fetch;
  if (typeof real !== 'function') return () => {};
  const until = Date.now() + ms;
  let on = true;
  const slow = () => new TypeError('Failed to fetch: slow connection while starting');
  const quick = function fetch(input, init) {
    if (!on) return real(input, init);
    const url = typeof input === 'string' ? input : String(input?.url || input || '');
    if (!AUTH_HOSTS.test(url)) return real(input, init);
    const left = until - Date.now();
    if (left <= 0) return Promise.reject(slow());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(slow()), left);
      real(input, init).then(
        (r) => { clearTimeout(timer); resolve(r); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  };
  globalThis.fetch = quick;
  return () => {
    on = false;
    if (globalThis.fetch === quick) globalThis.fetch = real;
  };
}
