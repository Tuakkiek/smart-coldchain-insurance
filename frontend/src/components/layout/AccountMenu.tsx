import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Activity, Clock, LogOut, UserRound, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { logoutAdmin } from '../../api/auth';
import {
  BackendConnectionState,
  useBackendHealthMonitor,
} from '../feedback/ConnectionStatus';
import { useToast } from '../feedback/Toast';

export interface AccountMenuProps {
  avatarUrl?: string | null;
  placement?: 'down-right' | 'up-left';
}

const STATUS_META: Record<
  BackendConnectionState,
  {
    label: string;
    color: string;
    softBg: string;
    dotColor: string;
  }
> = {
  ONLINE: {
    label: 'Backend Online',
    color: 'var(--color-success)',
    softBg: 'var(--color-success-soft)',
    dotColor: 'var(--color-success)',
  },
  COLD_START: {
    label: 'Render Cold Start (~30s)',
    color: 'var(--color-warning)',
    softBg: 'var(--color-warning-soft)',
    dotColor: 'var(--color-warning)',
  },
  OFFLINE: {
    label: 'Backend Offline',
    color: 'var(--color-danger)',
    softBg: 'var(--color-danger-soft)',
    dotColor: 'var(--color-danger)',
  },
  CHECKING: {
    label: 'Đang kiểm tra kết nối...',
    color: 'var(--color-text-secondary)',
    softBg: 'var(--color-neutral-soft)',
    dotColor: 'var(--color-neutral)',
  },
};

export const AccountMenu: React.FC<AccountMenuProps> = ({
  avatarUrl,
  placement = 'down-right',
}) => {
  const { session } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const { connectionState, checking, checkStatus } = useBackendHealthMonitor();

  const [isOpen, setIsOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const username = session?.username?.trim() || '';
  const displayName = username || 'Tài khoản';
  const role = session?.role?.trim() || 'Quản trị viên';
  const initial = username ? username.charAt(0).toUpperCase() : '';
  const showImage = Boolean(avatarUrl) && !imgError;

  const routeKey = `${location.pathname}${location.search}${location.hash}`;
  const prevRouteKeyRef = useRef(routeKey);

  // Close dropdown automatically when route changes (not on initial mount)
  useEffect(() => {
    if (prevRouteKeyRef.current !== routeKey) {
      prevRouteKeyRef.current = routeKey;
      setIsOpen(false);
    }
  }, [routeKey]);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleLogout = () => {
    setIsOpen(false);
    void logoutAdmin().catch(() => undefined);
    toast.info('Bạn đã đăng xuất khỏi hệ thống quản trị.', { title: 'Đăng xuất' });
  };

  const statusMeta = STATUS_META[connectionState];

  const renderStatusIcon = () => {
    if (checking) {
      return <Activity size={14} className="animate-spin" aria-hidden="true" />;
    }
    switch (connectionState) {
      case 'ONLINE':
        return <Wifi size={14} aria-hidden="true" />;
      case 'COLD_START':
        return <Clock size={14} className="animate-spin" aria-hidden="true" />;
      case 'OFFLINE':
        return <WifiOff size={14} aria-hidden="true" />;
      default:
        return <Activity size={14} className="animate-spin" aria-hidden="true" />;
    }
  };

  const renderAvatarContent = (iconSize: number) => {
    if (showImage) {
      return (
        <img
          src={avatarUrl!}
          alt={username || 'Tài khoản'}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '50%',
            display: 'block',
          }}
        />
      );
    }
    if (initial) {
      return <span aria-hidden="true">{initial}</span>;
    }
    return <UserRound size={iconSize} aria-hidden="true" />;
  };

  return (
    <div
      ref={containerRef}
      className={`account-menu-root${placement === 'up-left' ? ' account-menu-root--up' : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`account-avatar-btn${isOpen ? ' is-open' : ''}`}
        aria-label="Mở menu tài khoản"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="account-avatar-circle" aria-hidden="true">
          {renderAvatarContent(16)}
        </span>
        <span className="account-trigger-info">
          <span className="account-trigger-name" title={displayName}>
            {displayName}
          </span>
          <span className="account-trigger-role" title={role}>
            {role}
          </span>
        </span>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Thông tin tài khoản"
          className="account-dropdown"
        >
          {/* 1. Account Info */}
          <div className="account-dropdown-header">
            <div className="account-dropdown-avatar" aria-hidden="true">
              {renderAvatarContent(20)}
            </div>
            <div className="account-dropdown-identity">
              <div className="account-dropdown-name" title={displayName}>
                {displayName}
              </div>
              <div className="account-dropdown-role">{role}</div>
            </div>
          </div>

          <div className="account-dropdown-divider" role="separator" />

          {/* 2. System / Backend Status */}
          <div className="account-dropdown-section">
            <div className="account-dropdown-section-label">Trạng thái hệ thống</div>
            <button
              type="button"
              role="menuitem"
              className="account-status-row"
              onClick={() => void checkStatus(true)}
              title="Nhấn để kiểm tra lại kết nối Backend"
            >
              <span
                className="account-status-icon"
                style={{
                  color: statusMeta.color,
                  backgroundColor: statusMeta.softBg,
                }}
              >
                {renderStatusIcon()}
              </span>
              <span className="account-status-text">{statusMeta.label}</span>
              <span
                className="account-status-dot"
                style={{ backgroundColor: statusMeta.dotColor }}
                aria-hidden="true"
              />
            </button>
          </div>

          <div className="account-dropdown-divider" role="separator" />

          {/* 3. Actions */}
          <div className="account-dropdown-section">
            <button
              type="button"
              role="menuitem"
              className="account-logout-btn"
              onClick={handleLogout}
            >
              <LogOut size={16} aria-hidden="true" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
