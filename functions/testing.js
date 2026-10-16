// For tests/pushHandlers.test.mjs only (not deployed, see firebase.json):
// firebase-admin on the Firestore emulator, resolved from this package.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export function emulatorDb(projectId) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('run under the Firestore emulator (npm run test:data)');
  return getFirestore(initializeApp({ projectId }, 'push-test'));
}
