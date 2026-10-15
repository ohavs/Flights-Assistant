import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

/* A trip is deleted in two steps: the owner's personal delete code, and
   then 24 hours in which anyone can see it coming and the owner can
   cancel it. Only then does the owner's app delete it.

   The code is set once (settings, or the delete dialog the first time)
   and stored as a hash in users/{uid}/private/deleteCode, which only its
   user can read (firestore.rules). The trip carries `deleteAt` (epoch ms),
   which only its owner may set or clear.                                 */

export const DELETE_DELAY_MS = 24 * 60 * 60 * 1000;

export const validCode = (code) => /^\d{4,8}$/.test(code || '');

const codeRef = (uid) => doc(db, 'users', uid, 'private', 'deleteCode');

// SHA-256 of uid:code, hex. Salted by the uid so two people's equal codes
// differ; a 4-8 digit code is no secret from someone holding the hash, but
// only its user can read the hash.
export async function hashCode(uid, code) {
  const bytes = new TextEncoder().encode(`${uid}:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function checkCode(uid, code, hash) {
  return !!hash && validCode(code) && (await hashCode(uid, code)) === hash;
}

// Fire-and-forget: the local cache has it at once and syncs later, so
// the code works offline right after it is set.
export async function saveCode(uid, code) {
  const hash = await hashCode(uid, code);
  setDoc(codeRef(uid), { hash, updatedAt: Date.now() }, { merge: true })
    .catch(err => console.error('Saving the delete code failed:', err));
  return hash;
}

// The user's code hash: undefined while loading, null when none is set.
export function useDeleteCode(uid) {
  const [st, setSt] = useState({ uid: null, hash: undefined });
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(codeRef(uid),
      snap => setSt({ uid, hash: snap.exists() ? (snap.data().hash || null) : null }),
      err => { console.error('Delete code listener error:', err); setSt({ uid, hash: null }); });
  }, [uid]);
  return st.uid === uid ? st.hash : undefined;
}

export const pendingDelete = (trip) => typeof trip?.deleteAt === 'number';

// "16.10 בשעה 08:41"
export function deleteAtText(ms) {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} בשעה ${hh}:${mi}`;
}
