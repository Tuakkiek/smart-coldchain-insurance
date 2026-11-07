import React from 'react';
import { AlertTriangle, Clock, Info, WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';

interface BackendStatusAlertProps {
  isColdStart?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
}

export const BackendStatusAlert: React.FC<BackendStatusAlertProps> = ({
  isColdStart,
  errorMessage,
  onRetry,
  retrying = false,
}) => {
  if (isColdStart) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
          padding: 'var(--space-4)',
          backgroundColor: '#fffbeb',
          border: '1px solid #fef3c7',
          borderLeft: '4px solid #f59e0b',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <Clock size={20} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              color: '#92400e',
              marginBottom: '4px',
            }}
          >
            Đang đánh thức máy chủ Backend (Render Cold Start)
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: '#b45309', lineHeight: 1.5 }}>
            Dịch vụ FastAPI trên Render (Free Tier) có thể mất 20–40 giây để khởi động lại sau
            khi nhàn rỗi.
            <strong style={{ display: 'block', marginTop: '4px' }}>
              ⚠️ Lưu ý kỹ thuật: Lỗi timeout kết nối máy chủ KHÔNG đồng nghĩa thiết bị ESP32 bị
              offline hay mất tín hiệu!
            </strong>
          </div>
          {onRetry && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={onRetry}
                disabled={retrying}
                icon={
                  <RefreshCw
                    size={14}
                    className={retrying ? 'animate-spin' : undefined}
                  />
                }
              >
                {retrying ? 'Đang thử lại...' : 'Thử kết nối lại ngay'}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
          padding: 'var(--space-4)',
          backgroundColor: '#fef2f2',
          border: '1px solid #fee2e2',
          borderLeft: '4px solid #ef4444',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <WifiOff size={20} style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              color: '#991b1b',
              marginBottom: '4px',
            }}
          >
            Mất kết nối với máy chủ Backend REST API
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: '#b91c1c', lineHeight: 1.5 }}>
            {errorMessage}
            <div style={{ marginTop: '4px', fontStyle: 'italic' }}>
              Hệ thống bảo lưu trạng thái ghi nhận gần nhất. Không tự động quy kết thiết bị ngoại
              vi bị hỏng hóc hoặc ngoại tuyến khi máy chủ Backend tạm thời không khả dụng.
            </div>
          </div>
          {onRetry && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={onRetry}
                disabled={retrying}
                icon={
                  <RefreshCw
                    size={14}
                    className={retrying ? 'animate-spin' : undefined}
                  />
                }
              >
                {retrying ? 'Đang thử lại...' : 'Thử kết nối lại'}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export const IntegrityPrincipleNotice: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        backgroundColor: 'var(--color-surface-secondary)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-xs)',
        color: 'var(--color-text-secondary)',
        marginBottom: 'var(--space-5)',
      }}
    >
      <Info size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
      <div>
        <strong>Nguyên tắc Chữ ký Thiết bị (ECDSA P-256):</strong> Chữ ký hợp lệ chứng minh gói
        tin được ký bởi Private Key của thiết bị ESP32 đã cấp phép và không bị giả mạo trên
        đường truyền; <em>không chứng minh môi trường vật lý xung quanh cảm biến chưa bị can thiệp.</em>
      </div>
    </div>
  );
};
