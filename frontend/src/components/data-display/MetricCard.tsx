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
  return (
    <Card style={{ padding: 'var(--space-5)' }}>
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
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <div
        className="tabular-nums"
        style={{
          fontSize: 'var(--text-3xl)',
          fontWeight: 600,
          lineHeight: 'var(--text-3xl-lh)',
          color: accentColor || 'var(--color-text-primary)',
          letterSpacing: '-0.02em',
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

