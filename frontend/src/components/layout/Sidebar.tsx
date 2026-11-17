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
  LogOut,
} from 'lucide-react';
import { ConnectionStatus } from '../feedback/ConnectionStatus';
import { Button } from '../ui/Button';
import { useAuth } from '../../auth/AuthProvider';
import { endSession } from '../../auth/session';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  onRefresh?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onRefresh }) => {
  const enableDemo = import.meta.env.VITE_ENABLE_DEMO !== 'false';
  const { session } = useAuth();

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
              Smart Cold Chain Insurance
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

        {/* Backend status and admin session */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderTop: '1px solid var(--color-border-subtle)',
            backgroundColor: 'var(--color-surface-secondary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 'var(--space-3)',
          }}
        >
          <ConnectionStatus onModeChange={onRefresh} />
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-2)',
            }}
          >
            <span
              title={session?.username}
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {session?.username}
            </span>
            <Button
              size="sm"
              variant="secondary"
              icon={<LogOut size={15} aria-hidden="true" />}
              onClick={() => endSession()}
            >
              Đăng xuất
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
};

