import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, LucideIcon } from 'lucide-react';
import { ToastItem as ToastItemType, ToastType } from './types';

interface ToastItemProps {
  toast: ToastItemType;
  onDismiss: (id: string) => void;
}

const TYPE_CONFIG: Record<
  ToastType,
  {
    icon: LucideIcon;
    colorVar: string;
    bgSoftVar: string;
    borderVar: string;
    defaultTitle: string;
    ariaLive: 'assertive' | 'polite';
    role: 'alert' | 'status';
  }
> = {
  success: {
    icon: CheckCircle2,
    colorVar: 'var(--color-success)',
    bgSoftVar: 'var(--color-success-soft)',
    borderVar: 'rgba(36, 138, 61, 0.25)',
    defaultTitle: 'Thành công',
    ariaLive: 'polite',
    role: 'status',
  },
  error: {
    icon: AlertCircle,
    colorVar: 'var(--color-danger)',
    bgSoftVar: 'var(--color-danger-soft)',
    borderVar: 'rgba(215, 0, 21, 0.25)',
    defaultTitle: 'Đã xảy ra lỗi',
    ariaLive: 'assertive',
    role: 'alert',
  },
  warning: {
    icon: AlertTriangle,
    colorVar: 'var(--color-warning)',
    bgSoftVar: 'var(--color-warning-soft)',
    borderVar: 'rgba(183, 110, 0, 0.25)',
    defaultTitle: 'Cảnh báo',
    ariaLive: 'polite',
    role: 'status',
  },
  info: {
    icon: Info,
    colorVar: 'var(--color-info)',
    bgSoftVar: 'var(--color-info-soft)',
    borderVar: 'rgba(59, 111, 182, 0.25)',
    defaultTitle: 'Thông tin',
    ariaLive: 'polite',
    role: 'status',
  },
};

export const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const [isHovered, setIsHovered] = useState(false);
  const remainingTimeRef = useRef(toast.duration);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = TYPE_CONFIG[toast.type];
  const IconComponent = config.icon;
  const displayTitle = toast.title !== undefined ? toast.title : config.defaultTitle;

  useEffect(() => {
    if (toast.duration <= 0) return;

    if (!isHovered) {
      startTimeRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        onDismiss(toast.id);
      }, remainingTimeRef.current);
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        const elapsed = Date.now() - startTimeRef.current;
        remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
      }
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isHovered, toast.duration, toast.id, onDismiss]);

  return (
    <div
      role={config.role}
      aria-live={config.ariaLive}
      className="coldchain-toast-item"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        backgroundColor: 'var(--color-surface)',
        border: `1px solid ${config.borderVar}`,
        borderLeft: `4px solid ${config.colorVar}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-popover)',
        width: '100%',
        boxSizing: 'border-box',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'relative',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: '2px',
          color: config.colorVar,
        }}
      >
        <IconComponent size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {displayTitle && (
          <div
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              lineHeight: 'var(--text-sm-lh)',
              marginBottom: '2px',
            }}
          >
            {displayTitle}
          </div>
        )}
        <div
          style={{
            fontSize: 'var(--text-sm)',
            color: displayTitle ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
            lineHeight: 'var(--text-sm-lh)',
            wordBreak: 'break-word',
          }}
        >
          {toast.message}
        </div>

        {toast.action && (
          <div style={{ marginTop: 'var(--space-2)' }}>
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: config.colorVar,
                backgroundColor: config.bgSoftVar,
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
            >
              {toast.action.label}
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={() => onDismiss(toast.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          color: 'var(--color-text-tertiary)',
          cursor: 'pointer',
          padding: '4px',
          marginLeft: 'var(--space-1)',
          marginTop: '1px',
          borderRadius: 'var(--radius-sm)',
          flexShrink: 0,
          transition: 'color 0.15s ease, background-color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--color-text-primary)';
          e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--color-text-tertiary)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
};
