import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleProvider } from './firebase';
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';

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
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
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
