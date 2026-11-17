import React from 'react';
import { Card } from '../ui/Card';

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  accentColor?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  accentColor,
}) => {
  // Auto-detect long text values (status strings like DATA_INTEGRITY_FAILED)
  const isLongText = typeof value === 'string' && value.length > 10;

  return (
    <Card style={{ padding: 'var(--space-5)', overflow: 'hidden' }}>
      <div className="flex-row items-center justify-between" style={{ marginBottom: 'var(--space-2)' }}>
        <span
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            fontWeight: 500,
          }}
        >
          {title}
        </span>
        {icon && (
          <div
            style={{
              color: accentColor || 'var(--color-text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <div
        className="tabular-nums"
        style={{
          fontSize: isLongText ? 'var(--text-lg)' : 'var(--text-3xl)',
          fontWeight: 600,
          lineHeight: isLongText ? 'var(--text-lg-lh)' : 'var(--text-3xl-lh)',
          color: accentColor || 'var(--color-text-primary)',
          letterSpacing: '-0.02em',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          hyphens: 'auto',
        }}
      >
        {value}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-tertiary)',
            marginTop: 'var(--space-1)',
          }}
        >
          {subtitle}
        </div>
      )}
    </Card>
  );
};

