import React from 'react';
import clsx from 'clsx';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
  neutral: {
    bg: 'var(--color-neutral-soft)',
    color: 'var(--color-neutral)',
    border: 'transparent',
  },
  accent: {
    bg: 'var(--color-accent-soft)',
    color: 'var(--color-accent)',
    border: 'transparent',
  },
  success: {
    bg: 'var(--color-success-soft)',
    color: 'var(--color-success)',
    border: 'transparent',
  },
  warning: {
    bg: 'var(--color-warning-soft)',
    color: 'var(--color-warning)',
    border: 'transparent',
  },
  danger: {
    bg: 'var(--color-danger-soft)',
    color: 'var(--color-danger)',
    border: 'transparent',
  },
  info: {
    bg: 'var(--color-info-soft)',
    color: 'var(--color-info)',
    border: 'transparent',
  },
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  icon,
  children,
  className,
  style,
  ...props
}) => {
  const current = variantStyles[variant];

  return (
    <span
      className={clsx('ui-badge', className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        borderRadius: 'var(--radius-pill)',
        backgroundColor: current.bg,
        color: current.color,
        border: `1px solid ${current.border}`,
        lineHeight: 'var(--text-xs-lh)',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
};

