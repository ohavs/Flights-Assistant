import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, connectAuthEmulator, signInWithCredential } from 'firebase/auth';

// Local testing only: `VITE_USE_FIREBASE_EMULATORS=true npm run dev` talks to the
// Firebase emulators instead of the real project. Production builds never set it.
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

// Initialize Firestore
export const db = getFirestore(app);
if (useEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080);

// Enable offline persistence (IndexedDB)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence failed: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence not available in this browser');
  }
});

// Initialize Auth
export const auth = getAuth(app);
if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  // Automated browser tests sign in with a fake Google account (no popup)
  window.__e2eSignIn = (email) => signInWithCredential(auth,
    GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
}
export const googleProvider = new GoogleAuthProvider();
