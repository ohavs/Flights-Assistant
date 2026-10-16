import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  enableNetwork,
  disableNetwork,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence,
  GoogleAuthProvider, connectAuthEmulator, signInWithCredential,
} from 'firebase/auth';

// Local testing only: `VITE_USE_FIREBASE_EMULATORS=true` makes the app talk to
// the Firebase emulators instead of the real project. Production builds never
// set it, so none of this code ends up in the deployed bundle.
const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

const firebaseConfig = {
  // 'demo-' project IDs can never reach real Firebase resources
  projectId: useEmulators ? "demo-flights" : "listify-84018",
  appId: "1:883919555591:web:e411a4830de3915bb32ea2",
  storageBucket: "listify-84018.firebasestorage.app",
  apiKey: "AIzaSy" + "C0jZD6FU_ESGL8n4yct2aGi9eEhfaCvwo",
  authDomain: "listify-84018.firebaseapp.com",
  messagingSenderId: "883919555591",
  measurementId: "G-18YKS46C8R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore with multi-tab offline persistence — writes queue locally when offline
// and auto-sync when connectivity is restored, across any number of browser tabs.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
if (useEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080);

// Auth, as getAuth() sets it up but without the popup helper. With it, on
// a phone (web or the Android app) every start first loads Google's sign-in
// iframe, and the signed-in user waits for the network. Sign-in on the web
// passes the helper itself (AuthContext); the app signs in natively.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
});
if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  // Automated browser tests sign in with a fake Google account (no popup)
  window.__e2eSignIn = (email) => signInWithCredential(auth,
    GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
}
export const googleProvider = new GoogleAuthProvider();

export { enableNetwork, disableNetwork };
