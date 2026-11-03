import React from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from '../ui/Button';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Chưa có dữ liệu',
  description = 'Hiện tại hệ thống chưa ghi nhận thông tin nào trong danh mục này.',
  actionText,
  onAction,
  icon,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-10) var(--space-4)',
        textAlign: 'center',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 'var(--radius-pill)',
          backgroundColor: 'var(--color-neutral-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-secondary)',
          marginBottom: 'var(--space-3)',
        }}
      >
        {icon || <PackageOpen size={24} />}
      </div>
      <h4
        style={{
          fontSize: 'var(--text-lg)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {title}
      </h4>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          maxWidth: '420px',
          marginBottom: actionText ? 'var(--space-4)' : 0,
        }}
      >
        {description}
      </p>
      {actionText && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
};

