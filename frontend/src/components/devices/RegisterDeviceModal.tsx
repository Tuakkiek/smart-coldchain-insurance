import React, { useState, useEffect } from 'react';
import { DeviceRegisterPayload, AdminDeviceViewOut } from '../../types/api';
import { registerDevice } from '../../api/devices';
import { apiClient, ApiError } from '../../api/client';
import { Button } from '../ui/Button';
import {
  Cpu,
  X,
  Lock,
  AlertCircle,
  RefreshCw,
  Info,
  ShieldCheck,
} from 'lucide-react';

interface RegisterDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: AdminDeviceViewOut) => void;
}

export const RegisterDeviceModal: React.FC<RegisterDeviceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [adminKey, setAdminKey] = useState(apiClient.getAdminKey() || '');
  const [saveAdminKey, setSaveAdminKey] = useState(true);

  const [deviceId, setDeviceId] = useState('ESP32-001');
  const [deviceName, setDeviceName] = useState('Cold Chain Sensor 01');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateRandomDeviceId = () => {
    const rand = Math.floor(1 + Math.random() * 999).toString().padStart(3, '0');
    return `ESP32-${rand}`;
  };

  useEffect(() => {
    if (isOpen) {
      setDeviceId('ESP32-001');
      setDeviceName('Cold Chain Sensor 01');
      setAdminKey(apiClient.getAdminKey() || '');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey.trim()) {
      setError('Vui lòng nhập X-Admin-Key (Khóa quản trị của máy chủ Backend)');
      return;
    }
    if (!deviceId.trim()) {
      setError('Mã thiết bị (Device ID) không được để trống');
      return;
    }
    if (!deviceName.trim()) {
      setError('Tên thiết bị (Device Name) không được để trống');
      return;
    }

    setSubmitting(true);
    setError(null);

    if (saveAdminKey) {
      apiClient.setAdminKey(adminKey.trim());
    }

    const payload: DeviceRegisterPayload = {
      device_id: deviceId.trim(),
      device_name: deviceName.trim(),
    };

    try {
      const result = await registerDevice(payload, adminKey.trim());
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.code === 'UNAUTHORIZED') {
          setError('Xác thực thất bại: X-Admin-Key không chính xác hoặc không có quyền quản trị.');
        } else if (err.status === 503 || err.code === 'ADMIN_UNAVAILABLE') {
          setError('Máy chủ Backend chưa bật ADMIN_API_KEY (ADMIN_UNAVAILABLE).');
        } else if (err.status === 409 || err.code === 'DEVICE_EXISTS') {
          setError(`Mã thiết bị '${deviceId.trim()}' đã tồn tại trên hệ thống.`);
        } else if (err.status === 422) {
          setError(err.message || 'Dữ liệu đăng ký không hợp lệ (Mã ID 1-100 ký tự).');
        } else {
          setError(err.message || 'Lỗi khi đăng ký thiết bị');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Lỗi không xác định khi đăng ký thiết bị');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-popover)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-surface-secondary)',
          }}
        >
          <div className="flex-row items-center gap-3">
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Cpu size={20} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: 'var(--text-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  margin: 0,
                }}
              >
                Đăng Ký Thiết Bị ESP32 (Admin)
              </h3>
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                }}
              >
                Quy trình tối giản: Đăng ký ID & Tên thiết bị • Cấp khóa P-256 qua USB ngoài browser
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              padding: 4,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: 'var(--space-5)' }}>
          {error && (
            <div
              style={{
                marginBottom: 'var(--space-4)',
                padding: 'var(--space-3) var(--space-4)',
                backgroundColor: 'var(--color-danger-soft)',
                border: '1px solid var(--color-danger)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-danger)',
                fontSize: 'var(--text-xs)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{error}</div>
            </div>
          )}

          {/* Admin API Key Section */}
          <div
            style={{
              marginBottom: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'var(--color-surface-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <label
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Lock size={12} style={{ color: 'var(--color-accent)' }} />
                X-Admin-Key (Khóa quản trị Backend) *
              </label>
              <label
                style={{
                  fontSize: '11px',
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={saveAdminKey}
                  onChange={(e) => setSaveAdminKey(e.target.checked)}
                />
                Lưu vào trình duyệt
              </label>
            </div>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Nhập ADMIN_API_KEY cấu hình ở Backend..."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--text-sm)',
                backgroundColor: 'var(--color-surface)',
                fontFamily: 'monospace',
              }}
            />
          </div>

          {/* Device ID Input */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 4,
              }}
            >
              Mã Thiết Bị (Device ID) *
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="VD: ESP32-001"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                }}
              />
              <button
                type="button"
                onClick={() => setDeviceId(generateRandomDeviceId())}
                title="Tạo mã ngẫu nhiên"
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-secondary)',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 'var(--text-xs)',
                }}
              >
                <RefreshCw size={13} />
                <span>Sinh mã</span>
              </button>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
              Định dạng chuỗi: chữ cái, số, gạch nối (VD: ESP32-001, ESP32-002).
            </span>
          </div>

          {/* Device Name Input */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 4,
              }}
            >
              Tên Thiết Bị (Device Name) *
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="VD: Cold Chain Sensor 01"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--text-sm)',
              }}
            />
            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
              Tên mô tả vị trí hoặc mục đích sử dụng (tối đa 100 ký tự).
            </span>
          </div>

          {/* Info Card: Key Provisioning Notice */}
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'var(--color-surface-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
              marginBottom: 'var(--space-4)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: 4,
              }}
            >
              <Info size={14} style={{ color: 'var(--color-accent)' }} />
              Cấp khóa mật mã ngoài trình duyệt (An toàn tuyệt đối)
            </div>
            <p style={{ margin: 0 }}>
              Sau khi đăng ký thiết bị, kỹ thuật viên chạy script Python của NTK trên máy tính tin cậy để tạo cặp khóa <strong>ECDSA P-256</strong> riêng cho thiết bị. Private key được nạp trực tiếp vào firmware ESP32 qua cổng USB và chỉ có public key SPKI PEM được gửi lên API Backend.
            </p>
            <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-tertiary)' }}>
              Trình duyệt không sinh/nhập/hiển thị private key. Trạng thái public key sẽ tự động hiển thị sau khi nạp xong.
            </p>
          </div>

          {/* Footer Actions */}
          <div
            style={{
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 'var(--space-3)',
            }}
          >
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Đang đăng ký...' : 'Đăng Ký Thiết Bị'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
