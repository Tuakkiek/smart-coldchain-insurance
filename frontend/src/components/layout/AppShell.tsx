import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const AppShell: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const location = useLocation();

  const handleRefresh = () => {
    setIsNavigating(true);
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    setIsNavigating(true);
    const timer = setTimeout(() => {
      setIsNavigating(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [location.pathname, refreshKey]);

  return (
    <div className="app-container">
      {isNavigating && (
        <div className="top-loading-bar" aria-hidden="true">
          <div className="top-loading-bar-inner" />
        </div>
      )}
      <Sidebar
        onRefresh={handleRefresh}
        isRefreshing={isNavigating}
      />
      <div className="main-wrapper">
        <main className="content-container">
          <div
            key={`${location.pathname}-${refreshKey}`}
            className="page-transition"
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
