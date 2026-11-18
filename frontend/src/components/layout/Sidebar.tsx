import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Truck,
  BellRing,
  Shield,
  Cpu,
  Blocks,
  X,
} from 'lucide-react';
import { AccountMenu } from './AccountMenu';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const navItems = [
    { label: 'Tổng quan', path: '/', icon: <LayoutDashboard size={18} /> },
    { label: 'Lô hàng', path: '/shipments', icon: <Truck size={18} /> },
    { label: 'Thiết bị', path: '/devices', icon: <Cpu size={18} /> },
    { label: 'Blockchain', path: '/integrity', icon: <Blocks size={18} /> },
    { label: 'Sự kiện', path: '/events', icon: <BellRing size={18} /> },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="app-sidebar-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`app-sidebar${isOpen ? ' is-open' : ''}`}>
        {/* Brand header */}
        <div className="sidebar-brand">
          <div className="flex-row items-center gap-3" style={{ minWidth: 0 }}>
            <div className="sidebar-brand-icon">
              <Shield size={18} />
            </div>
            <div className="sidebar-brand-name">Cold Chain</div>
          </div>

          {onClose && (
            <button
              type="button"
              className="mobile-sidebar-close"
              onClick={onClose}
              aria-label="Đóng thanh điều hướng"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Navigation items */}
        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onClose}
              className={({ isActive }) => `sidebar-nav-link${isActive ? ' is-active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Reserved sidebar footer container aligned with the fixed bottom-left Avatar */}
        <div className="sidebar-account-footer" aria-hidden="true" />
      </aside>

      {/* Bottom-left Avatar anchor rendered outside the transformed sidebar so it stays visible across all viewports */}
      <div className="account-floating-anchor">
        <AccountMenu placement="up-left" />
      </div>
    </>
  );
};

