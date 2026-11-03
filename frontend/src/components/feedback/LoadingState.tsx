import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  minHeight?: string | number;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Đang tải dữ liệu...',
  minHeight = '240px',
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight,
        gap: 'var(--space-3)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{message}</span>
    </div>
  );
};

