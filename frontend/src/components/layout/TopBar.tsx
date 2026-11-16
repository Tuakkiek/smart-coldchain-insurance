import React from 'react';
import { LogOut, Menu } from 'lucide-react';
import { ConnectionStatus } from '../feedback/ConnectionStatus';
import { Button } from '../ui/Button';
import { useAuth } from '../../auth/AuthProvider';
import { endSession } from '../../auth/session';

interface TopBarProps {
  onMenuToggle?: () => void;
  onRefresh?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onMenuToggle, onRefresh }) => {
  const { session } = useAuth();
  return (
    <header
      style={{
        height: 'var(--topbar-height)',
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-8)',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      <div className="flex-row items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="mobile-only"
          style={{
            display: 'none',
            color: 'var(--color-text-secondary)',
            padding: 'var(--space-2)',
            borderRadius: 'var(--radius-md)',
          }}
          aria-label="Mở menu"
        >
          <Menu size={20} />
        </button>
        <span
          className="topbar-description"
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: 'var(--color-text-secondary)',
          }}
        >
          Giám sát chuỗi cung ứng lạnh & Bảo hiểm tự động
        </span>
      </div>

      <div className="flex-row items-center gap-4">
        <ConnectionStatus onModeChange={onRefresh} />
        <div className="admin-session-control">
          <span className="admin-session-name" title={session?.username}>{session?.username}</span>
          <Button size="sm" variant="secondary" icon={<LogOut size={15} aria-hidden="true" />}
            onClick={() => endSession()}>
            Đăng xuất
          </Button>
        </div>
      </div>
    </header>
  );
};

