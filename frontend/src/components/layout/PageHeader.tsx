import React from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumb?: string;
  action?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  breadcrumb,
  action,
}) => {
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      {breadcrumb && (
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-tertiary)',
            marginBottom: 'var(--space-1)',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {breadcrumb}
        </div>
      )}
      <div
        className="flex-row items-center justify-between"
        style={{ gap: 'var(--space-4)', flexWrap: 'wrap' }}
      >
        <div>
          <h1
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 600,
              lineHeight: 'var(--text-2xl-lh)',
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h1>
          {description && (
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
                marginTop: 'var(--space-1)',
              }}
            >
              {description}
            </p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
};

