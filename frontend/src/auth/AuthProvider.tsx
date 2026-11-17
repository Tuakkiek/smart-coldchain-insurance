import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { initializeAdminSession, refreshAdminSession } from '../api/auth';
import { AuthSnapshot, getAuthSnapshot, subscribeAuth } from './session';

const AuthContext = createContext<AuthSnapshot | null>(null);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const snapshot = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);

  useEffect(() => {
    void initializeAdminSession();
  }, []);

  useEffect(() => {
    if (!snapshot.session) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const refreshIfExpired = () => {
      if (timeout) clearTimeout(timeout);
      const current = getAuthSnapshot().session;
      if (!current) return;
      const remaining = current.expiresAt - Date.now();
      if (remaining <= 0) {
        void refreshAdminSession().catch(() => undefined);
        return;
      }
      timeout = setTimeout(refreshIfExpired, Math.min(remaining, 60_000));
    };

    refreshIfExpired();
    const onResume = () => refreshIfExpired();
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      if (timeout) clearTimeout(timeout);
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
