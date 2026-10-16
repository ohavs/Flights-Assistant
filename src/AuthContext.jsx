import { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleProvider } from './firebase';
import { signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { isNative } from './lib/platform';

// Android app: popups don't work in a WebView, so Google sign-in runs natively
// and hands its ID token to the Firebase JS SDK. Loaded only in the app.
// Resolves to the module, never to the plugin: a Capacitor plugin is a
// proxy that answers every property, `then` included, so a promise (or an
// async function) that resolves to it waits forever. In 8.23.0 that held
// the sign-in on "מתחבר..." and Google's account sheet never opened.
const nativeAuth = () => import('@capacitor-firebase/authentication');

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = not signed in
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Offline fallback — if onAuthStateChanged hasn't fired within 3s
    // (e.g. Firebase Auth blocked offline), unblock the UI so the
    // signed-in cached experience can still render.
    const timeout = setTimeout(() => {
      setLoading((wasLoading) => {
        if (wasLoading) {
          // Try to read the current user synchronously from auth (may be cached)
          if (auth.currentUser) {
            setUser(auth.currentUser);
          } else {
            setUser(null);
          }
        }
        return false;
      });
    }, 3000);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      clearTimeout(timeout);
      setUser(firebaseUser || null);
      setLoading(false);
    });
    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      if (isNative) {
        const { FirebaseAuthentication } = await nativeAuth();
        const res = await FirebaseAuthentication.signInWithGoogle();
        await signInWithCredential(auth, GoogleAuthProvider.credential(res.credential?.idToken));
        return;
      }
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      // Also forget the Android account choice so the picker shows next time.
      if (isNative) await (await nativeAuth()).FirebaseAuthentication.signOut().catch(() => {});
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const value = { user, loading, signInWithGoogle, signOut };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
