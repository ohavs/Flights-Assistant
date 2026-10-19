// Reads for a file made from a trip (backup, PDF / Word / Excel): from the
// server when online, so nothing is missing that this phone has not seen;
// offline, the phone's copy, and `mark.fromPhone` says so (the screen warns).
// Before, an offline file quietly lacked whatever the phone had not cached.
import { getDocs, getDocsFromServer } from 'firebase/firestore';

export async function readAll(ref, mark) {
  if (navigator.onLine) {
    try { return await getDocsFromServer(ref); } catch { /* weak connection: the phone's copy */ }
  }
  mark.fromPhone = true;
  return getDocs(ref);
}
