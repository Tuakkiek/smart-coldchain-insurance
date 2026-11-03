import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Không thể tải dữ liệu',
  message = 'Đã có lỗi xảy ra khi kết nối tới máy chủ. Vui lòng kiểm tra lại đường truyền hoặc dịch vụ Backend.',
  onRetry,
  retrying = false,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8) var(--space-4)',
        textAlign: 'center',
        backgroundColor: 'var(--color-danger-soft)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid rgba(215, 0, 21, 0.2)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 'var(--radius-pill)',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-danger)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <AlertCircle size={24} />
      </div>
      <h4
        style={{
          fontSize: 'var(--text-lg)',
          fontWeight: 600,
          color: 'var(--color-danger)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {title}
      </h4>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          maxWidth: '460px',
          marginBottom: onRetry ? 'var(--space-4)' : 0,
        }}
      >
        {message}
      </p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          loading={retrying}
          icon={<RefreshCw size={14} />}
        >
          Thử lại
        </Button>
      )}
    </div>
  );
};

