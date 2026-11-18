import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, LucideIcon, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';

export type ConfirmModalVariant = 'danger' | 'warning' | 'primary';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmModalVariant;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

const VARIANT_STYLES: Record<
  ConfirmModalVariant,
  {
    icon: LucideIcon;
    iconBg: string;
    iconColor: string;
    confirmButtonVariant: 'danger' | 'primary';
  }
> = {
  danger: {
    icon: Trash2,
    iconBg: 'var(--color-danger-soft)',
    iconColor: 'var(--color-danger)',
    confirmButtonVariant: 'danger',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'var(--color-warning-soft)',
    iconColor: 'var(--color-warning)',
    confirmButtonVariant: 'danger',
  },
  primary: {
    icon: HelpCircle,
    iconBg: 'var(--color-accent-soft)',
    iconColor: 'var(--color-accent)',
    confirmButtonVariant: 'primary',
  },
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  const styleConfig = VARIANT_STYLES[variant];
  const IconComponent = styleConfig.icon;

  const modalContent = (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        animation: 'fadeIn 0.15s ease-out',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
      onClick={loading ? undefined : onCancel}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-popover)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'min(90vh, 540px)',
          margin: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            backgroundColor: 'var(--color-surface-secondary)',
            flexShrink: 0,
          }}
        >
          <div className="flex-row items-center gap-3" style={{ minWidth: 0 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                backgroundColor: styleConfig.iconBg,
                color: styleConfig.iconColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <IconComponent size={18} />
            </div>
            <h3
              id={titleId}
              style={{
                fontSize: 'var(--text-md)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                margin: 0,
                lineHeight: 1.35,
              }}
            >
              {title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            aria-label="Đóng hộp thoại xác nhận"
            style={{
              background: 'none',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              color: 'var(--color-text-tertiary)',
              padding: 4,
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          id={descriptionId}
          style={{
            padding: 'var(--space-5)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-primary)',
              lineHeight: 1.6,
            }}
          >
            {message}
          </div>
          {description && (
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-surface-secondary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              {description}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-5)',
            borderTop: '1px solid var(--color-border-subtle)',
            backgroundColor: 'var(--color-surface-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 'var(--space-3)',
            flexShrink: 0,
          }}
        >
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={styleConfig.confirmButtonVariant}
            size="md"
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
