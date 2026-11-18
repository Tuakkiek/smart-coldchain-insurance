import React from 'react';

export interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
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
    <div className="page-header">
      {breadcrumb && (
        <div className="page-header-breadcrumb">
          {breadcrumb}
        </div>
      )}
      <div className="page-header-row">
        <div>
          <h1 className="page-header-title">
            {title}
          </h1>
          {description && (
            <p className="page-header-description">
              {description}
            </p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
};

