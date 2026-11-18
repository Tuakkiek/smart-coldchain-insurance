import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, Shield } from 'lucide-react';
import { Sidebar } from './Sidebar';

export const AppShell: React.FC = () => {
  const [isNavigating, setIsNavigating] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsMobileSidebarOpen(false);
    setIsNavigating(true);
    const timer = setTimeout(() => {
      setIsNavigating(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <div className="app-container">
      {isNavigating && (
        <div className="top-loading-bar" aria-hidden="true">
          <div className="top-loading-bar-inner" />
        </div>
      )}
      <Sidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />
      <div className="main-wrapper">
        <header className="app-mobile-topbar">
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Mở thanh điều hướng"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="app-mobile-brand">
            <span className="app-mobile-brand-icon" aria-hidden="true">
              <Shield size={16} />
            </span>
            <span className="app-mobile-brand-title">Smart Cold Chain Insurance</span>
          </div>
        </header>

        <main className="content-container">
          <div
            key={location.pathname}
            className="page-transition"
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
