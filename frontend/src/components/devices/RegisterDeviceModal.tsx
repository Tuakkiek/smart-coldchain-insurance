import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DeviceRegisterPayload, AdminDeviceViewOut } from '../../types/api';
import { registerDevice } from '../../api/devices';
import { ApiError } from '../../api/client';
import { Button } from '../ui/Button';
import { formatApiErrorMessage, isRequestCancelled, useToast } from '../feedback/Toast';
import {
  Cpu,
  X,
  RefreshCw,
  Info,
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
  const { toast } = useToast();
  const [deviceId, setDeviceId] = useState('ESP32-001');
  const [deviceName, setDeviceName] = useState('Cold Chain Sensor 01');

  const [submitting, setSubmitting] = useState(false);
  const [invalidField, setInvalidField] = useState<'deviceId' | 'deviceName' | null>(null);

  const generateRandomDeviceId = () => {
    const rand = Math.floor(1 + Math.random() * 999).toString().padStart(3, '0');
    return `ESP32-${rand}`;
  };

  useEffect(() => {
    if (isOpen) {
      setDeviceId('ESP32-001');
      setDeviceName('Cold Chain Sensor 01');
      setInvalidField(null);
    }
  }, [isOpen]);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Close modal on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId.trim()) {
      setInvalidField('deviceId');
      toast.warning('Mã thiết bị (Device ID) không được để trống.', { title: 'Thông tin chưa đầy đủ' });
      return;
    }
    if (!deviceName.trim()) {
      setInvalidField('deviceName');
      toast.warning('Tên thiết bị (Device Name) không được để trống.', { title: 'Thông tin chưa đầy đủ' });
      return;
    }

    setSubmitting(true);
    setInvalidField(null);

    const payload: DeviceRegisterPayload = {
      device_id: deviceId.trim(),
      device_name: deviceName.trim(),
    };

    try {
      const result = await registerDevice(payload);
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      if (isRequestCancelled(err)) return;
      let msg = '';
      if (err instanceof ApiError) {
        if (err.status === 401 || err.code === 'UNAUTHORIZED') {
          msg = 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
        } else if (err.status === 409 || err.code === 'DEVICE_EXISTS') {
          msg = `Mã thiết bị '${deviceId.trim()}' đã tồn tại trên hệ thống.`;
        } else if (err.status === 422) {
          msg = formatApiErrorMessage(err, 'Dữ liệu đăng ký không hợp lệ (Mã ID 1-100 ký tự).');
        } else {
          msg = formatApiErrorMessage(err, 'Lỗi khi đăng ký thiết bị. Vui lòng thử lại.');
        }
      } else {
        msg = formatApiErrorMessage(err, 'Lỗi không xác định khi đăng ký thiết bị.');
      }
      if (msg) {
        toast.error(msg, { title: 'Đăng ký thiết bị thất bại' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="register-device-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        animation: 'fadeIn 0.15s ease-out',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
      onClick={submitting ? undefined : onClose}
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
          maxHeight: 'min(90vh, 660px)',
          margin: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed & Stable */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-surface-secondary)',
            flexShrink: 0,
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
                flexShrink: 0,
              }}
            >
              <Cpu size={20} />
            </div>
            <div>
              <h3
                id="register-device-modal-title"
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
                Đăng ký ID & Tên thiết bị • Backend local tự động cấp khóa P-256
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Đóng"
            style={{
              background: 'none',
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
              color: 'var(--color-text-tertiary)',
              padding: 4,
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Container */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Scrollable Form Body */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: 'var(--space-5)',
            }}
          >
            {/* Device ID Input */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label
                htmlFor="register-device-id-input"
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
                  id="register-device-id-input"
                  type="text"
                  value={deviceId}
                  onChange={(e) => {
                    setDeviceId(e.target.value);
                    if (invalidField === 'deviceId') setInvalidField(null);
                  }}
                  placeholder="VD: ESP32-001"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${invalidField === 'deviceId' ? 'var(--color-danger)' : 'var(--color-border)'}`,
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
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <RefreshCw size={13} />
                  <span>Sinh mã</span>
                </button>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: 4, display: 'block' }}>
                Định dạng chuỗi: chữ cái, số, gạch nối (VD: ESP32-001, ESP32-002).
              </span>
            </div>

            {/* Device Name Input */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label
                htmlFor="register-device-name-input"
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
                id="register-device-name-input"
                type="text"
                value={deviceName}
                onChange={(e) => {
                  setDeviceName(e.target.value);
                  if (invalidField === 'deviceName') setInvalidField(null);
                }}
                placeholder="VD: Cold Chain Sensor 01"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${invalidField === 'deviceName' ? 'var(--color-danger)' : 'var(--color-border)'}`,
                  fontSize: 'var(--text-sm)',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: 4, display: 'block' }}>
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
                <Info size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <span>Cấp khóa tự động trên Backend local</span>
              </div>
              <p style={{ margin: 0 }}>
                Khi đăng ký, Backend tạo một cặp khóa <strong>ECDSA P-256</strong> riêng cho thiết bị. Public key được lưu vào MySQL; private key chỉ được ghi vào file <code>config.h</code> đã cấu hình để bạn nạp firmware qua USB.
              </p>
              <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-tertiary)' }}>
                Trình duyệt không nhận hoặc hiển thị private key/public key. Thông báo thành công chỉ xuất hiện sau khi Backend cập nhật <code>config.h</code> xong.
              </p>
            </div>
          </div>

          {/* Footer Actions - Fixed & Stable */}
          <div
            style={{
              padding: 'var(--space-3) var(--space-5)',
              borderTop: '1px solid var(--color-border-subtle)',
              backgroundColor: 'var(--color-surface-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 'var(--space-3)',
              flexShrink: 0,
            }}
          >
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={submitting}
            >
              {submitting ? 'Đang đăng ký...' : 'Đăng Ký Thiết Bị'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
