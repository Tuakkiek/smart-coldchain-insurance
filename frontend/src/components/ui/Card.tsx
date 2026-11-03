import React from 'react';
import clsx from 'clsx';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  title,
  description,
  action,
  interactive = false,
  children,
  className,
  style,
  ...props
}) => {
  return (
    <div
      className={clsx('ui-card', interactive && 'ui-card-interactive', className)}
      style={style}
      {...props}
    >
      {(title || action || description) && (
        <div className="ui-card-header">
          <div>
            {title && <h3 className="ui-card-title">{title}</h3>}
            {description && <p className="ui-card-desc">{description}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

