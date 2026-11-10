import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickAuthStart } from '../src/lib/quickStart.js';

const AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=x';
const TOKEN = 'https://securetoken.googleapis.com/v1/token?key=x';
const EMU = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=x';
const OTHER = 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel';

// A network where every request hangs, and one that answers.
const never = () => new Promise(() => {});
const answers = (url) => Promise.resolve({ ok: true, url });
async function withFetch(fake, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await fn(); } finally { globalThis.fetch = real; }
}

test('while starting, Auth gives up on a hanging request: a network error', async () => {
  await withFetch(never, async () => {
    const done = quickAuthStart(50);
    const t0 = Date.now();
    await assert.rejects(fetch(AUTH), TypeError);
    assert.ok(Date.now() - t0 < 500);
    // The time is for the whole start, not for each request.
    await assert.rejects(fetch(TOKEN), TypeError);
    await assert.rejects(fetch(EMU), TypeError);
    done();
  });
});

test('an answer in time is the answer', async () => {
  await withFetch(answers, async () => {
    const done = quickAuthStart(1000);
    assert.equal((await fetch(AUTH)).url, AUTH);
    done();
  });
});

test('other requests, and Auth once it knows who is signed in, are untouched', async () => {
  await withFetch(never, async () => {
    const done = quickAuthStart(10);
    let settled = false;
    fetch(OTHER).then(() => { settled = true; }, () => { settled = true; });
    done();
    fetch(AUTH).then(() => { settled = true; }, () => { settled = true; });
    await new Promise(r => setTimeout(r, 60));
    assert.equal(settled, false);
    assert.equal(globalThis.fetch, never);
  });
});
