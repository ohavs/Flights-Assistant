import { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleProvider } from './firebase';
import { signInWithPopup, browserPopupRedirectResolver, signInWithCredential, GoogleAuthProvider, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
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

// Whether this phone was signed in last time: then a slow start is a slow
// connection, not a signed-out user.
const LAST_UID = 'auth.lastUid';
const wasSignedIn = () => { try { return !!localStorage.getItem(LAST_UID); } catch { return false; } };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = not signed in
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    // Signed in, Auth checks the account with Google before it answers. Fully
    // offline that fails at once and the user is kept; on a weak connection
    // (Wi-Fi without internet, roaming) it can take a while. Someone who was
    // signed in waits on "connecting" rather than seeing the sign-in screen;
    // someone who was not sees it after a moment.
    const timeout = setTimeout(() => {
      if (wasSignedIn()) { setSlow(true); return; }
      setLoading((wasLoading) => {
        if (wasLoading) setUser(auth.currentUser || null);
        return false;
      });
    }, 3000);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      clearTimeout(timeout);
      try {
        if (firebaseUser) localStorage.setItem(LAST_UID, firebaseUser.uid);
        else localStorage.removeItem(LAST_UID);
      } catch { /* private mode */ }
      setUser(firebaseUser || null);
      setSlow(false);
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
      await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      // This phone stops getting the account's pushes (N5), while still
      // signed in to say so.
      if (isNative) await import('./lib/native/push').then(p => p.forgetDevice()).catch(() => {});
      // Also forget the Android account choice so the picker shows next time.
      if (isNative) await (await nativeAuth()).FirebaseAuthentication.signOut().catch(() => {});
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const value = { user, loading, slow, signInWithGoogle, signOut };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
