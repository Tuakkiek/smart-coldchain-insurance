import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  minHeight?: string | number;
  fullPage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Đang tải dữ liệu...',
  minHeight,
  fullPage = false,
  size = 'md',
  className,
}) => {
  const spinnerSize = size === 'sm' ? 20 : size === 'lg' ? 36 : 28;
  const calculatedMinHeight = minHeight ?? (fullPage ? '420px' : '240px');

  return (
    <div
      role="status"
      aria-live="polite"
      className={className ? `ui-loading-container ${className}` : 'ui-loading-container'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: calculatedMinHeight,
        gap: 'var(--space-3)',
        color: 'var(--color-text-secondary)',
        padding: 'var(--space-4)',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Loader2
          size={spinnerSize}
          className="animate-spin"
          style={{
            color: 'var(--color-accent)',
            filter: 'drop-shadow(0 0 6px rgba(0, 122, 255, 0.35))',
          }}
        />
      </div>
      <span
        className="animate-pulse"
        style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
          letterSpacing: '-0.01em',
        }}
      >
        {message}
      </span>
    </div>
  );
};
