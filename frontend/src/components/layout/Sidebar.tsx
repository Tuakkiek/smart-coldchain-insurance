import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Truck,
  BellRing,
  FlaskConical,
  Shield,
  Layers,
  Cpu,
  Database,
} from 'lucide-react';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const enableDemo = import.meta.env.VITE_ENABLE_DEMO !== 'false';

  const navItems = [
    { label: 'Tổng quan', path: '/', icon: <LayoutDashboard size={18} /> },
    { label: 'Lô hàng', path: '/shipments', icon: <Truck size={18} /> },
    { label: 'Thiết bị ESP32', path: '/devices', icon: <Cpu size={18} /> },
    { label: 'Toàn vẹn Dữ liệu (Merkle)', path: '/integrity', icon: <Database size={18} /> },
    { label: 'Sự kiện & Vi phạm', path: '/events', icon: <BellRing size={18} /> },
  ];

  if (enableDemo) {
    navItems.push({
      label: 'Kịch bản Demo',
      path: '/demo',
      icon: <FlaskConical size={18} />,
    });
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            zIndex: 40,
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      <aside
        style={{
          width: 'var(--sidebar-width)',
          backgroundColor: 'var(--color-surface)',
          borderRight: '1px solid var(--color-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'sticky',
          top: 0,
          zIndex: 45,
          flexShrink: 0,
          transition: 'transform 0.2s ease',
        }}
      >
        {/* Brand header */}
        <div
          style={{
            height: 'var(--topbar-height)',
            padding: '0 var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Shield size={18} />
          </div>
          <div>
            <div
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              ColdChain Guard
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--color-text-tertiary)',
              }}
            >
              Smart Insurance MVP
            </div>
          </div>
        </div>

        {/* Navigation items */}
        <nav
          style={{
            flex: 1,
            padding: 'var(--space-4) var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--color-text-tertiary)',
              padding: 'var(--space-2) var(--space-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Điều khiển
          </div>

          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                backgroundColor: isActive ? 'var(--color-accent-soft)' : 'transparent',
                transition: 'all 0.15s ease',
              })}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* System architecture note */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderTop: '1px solid var(--color-border-subtle)',
            backgroundColor: 'var(--color-surface-secondary)',
          }}
        >
          <div className="flex-row items-center gap-2" style={{ marginBottom: '4px' }}>
            <Layers size={13} style={{ color: 'var(--color-text-tertiary)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Kiến trúc 3 lớp
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', lineHeight: '15px' }}>
            ESP32 → Backend REST → Smart Contract
          </p>
        </div>
      </aside>
    </>
  );
};

