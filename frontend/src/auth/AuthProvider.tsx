import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { AuthSnapshot, getActiveSession, getAuthSnapshot, subscribeAuth } from './session';

const AuthContext = createContext<AuthSnapshot | null>(null);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const snapshot = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);

  useEffect(() => {
    if (!snapshot.session) return;
    let timeout: ReturnType<typeof setTimeout>;
    const checkExpiry = () => {
      const session = getActiveSession();
      if (session) timeout = setTimeout(checkExpiry, Math.min(session.expiresAt - Date.now(), 60_000));
    };
    checkExpiry();
    const onResume = () => { getActiveSession(); };
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [snapshot.session]);

  return <AuthContext.Provider value={snapshot}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthSnapshot {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
