import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export const RequireAuth: React.FC = () => {
  const { session, revision, initializing } = useAuth();
  const location = useLocation();
  if (initializing) {
    return <main role="status" aria-live="polite">Đang khôi phục phiên đăng nhập…</main>;
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  }
  // Mount fresh data/modals/polling for each session.
  return <Outlet key={revision} />;
};
