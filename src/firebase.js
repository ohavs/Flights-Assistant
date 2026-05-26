import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  projectId: "listify-84018",
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

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
