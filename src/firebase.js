import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  projectId: "listify-84018",
  appId: "1:883919555591:web:e411a4830de3915bb32ea2",
  storageBucket: "listify-84018.firebasestorage.app",
  apiKey: "AIzaSyC0jZD6FU_ESGL8n4yct2aGi9eEhfaCvwo",
  authDomain: "listify-84018.firebaseapp.com",
  messagingSenderId: "883919555591",
  measurementId: "G-18YKS46C8R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

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
export const googleProvider = new GoogleAuthProvider();
