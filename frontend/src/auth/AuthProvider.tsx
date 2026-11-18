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
    let disposed = false;

    const refreshIfExpired = () => {
      if (disposed) return;
      if (timeout) clearTimeout(timeout);
      const current = getAuthSnapshot().session;
      if (!current) return;
      const remaining = current.expiresAt - Date.now();
      const refreshAheadMs = 60_000;
      if (remaining <= refreshAheadMs) {
        void refreshAdminSession().catch(() => {
          if (!disposed && getAuthSnapshot().session) {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(refreshIfExpired, 15_000);
          }
        });
        return;
      }
      timeout = setTimeout(refreshIfExpired, Math.min(remaining - refreshAheadMs, 60_000));
    };

    refreshIfExpired();
    const onResume = () => refreshIfExpired();
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      disposed = true;
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
