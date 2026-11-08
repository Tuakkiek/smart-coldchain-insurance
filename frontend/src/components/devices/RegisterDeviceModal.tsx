import React, { useState, useEffect } from 'react';
import { DeviceRegisterPayload, AdminDeviceViewOut, ShipmentOut } from '../../types/api';
import { registerDevice } from '../../api/devices';
import { getShipments } from '../../api/shipments';
import { apiClient, ApiError } from '../../api/client';
import { Button } from '../ui/Button';
import {
  Cpu,
  KeyRound,
  X,
  Shield,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Lock,
} from 'lucide-react';

interface RegisterDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: AdminDeviceViewOut) => void;
}

const SAMPLE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE5t7UC5yvLKt2IJrVkRdPrt79is9A
3EXEhvhpxBYZBGUy13uCA5bJMjbAHlge0SQ30n1qb6ubPtNlWTZcdkDXaw==
-----END PUBLIC KEY-----`;

export const RegisterDeviceModal: React.FC<RegisterDeviceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [adminKey, setAdminKey] = useState(apiClient.getAdminKey() || '');
  const [saveAdminKey, setSaveAdminKey] = useState(true);

  const [deviceId, setDeviceId] = useState('');
  const [keyId, setKeyId] = useState('wokwi-key-v1');
  const [publicKeyPem, setPublicKeyPem] = useState('');
  const [shipmentId, setShipmentId] = useState('');

  const [shipments, setShipments] = useState<ShipmentOut[]>([]);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateRandomDeviceId = () => {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `ESP32-${rand}`;
  };

  useEffect(() => {
    if (isOpen) {
      setDeviceId(generateRandomDeviceId());
      setAdminKey(apiClient.getAdminKey() || '');
      setError(null);

      // Load danh sách shipment để chọn gán
      setLoadingShipments(true);
      getShipments()
        .then((res) => {
          setShipments(res.items);
          if (res.items.length > 0 && !shipmentId) {
            setShipmentId(res.items[0].id);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingShipments(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUseSampleKey = () => {
    setPublicKeyPem(SAMPLE_PUBLIC_KEY_PEM);
    setKeyId('wokwi-key-v1');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey.trim()) {
      setError('Vui lòng nhập X-Admin-Key (Khóa bí mật Admin của máy chủ Backend)');
      return;
    }
    if (!deviceId.trim()) {
      setError('Mã thiết bị (Device ID) không được để trống');
      return;
    }
    if (!keyId.trim()) {
      setError('Mã khóa (Key ID) không được để trống');
      return;
    }
    if (!publicKeyPem.trim()) {
      setError('Khóa công khai (Public Key PEM) không được để trống');
      return;
    }
    if (!shipmentId.trim()) {
      setError('Vui lòng chọn hoặc nhập Shipment ID để gán thiết bị');
      return;
    }

    setSubmitting(true);
    setError(null);

    if (saveAdminKey) {
      apiClient.setAdminKey(adminKey.trim());
    }

    const payload: DeviceRegisterPayload = {
      device_id: deviceId.trim(),
      key_id: keyId.trim(),
      public_key_pem: publicKeyPem.trim(),
      shipment_id: shipmentId.trim(),
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
        } else if (err.status === 409) {
          setError(`Mã thiết bị '${deviceId}' hoặc Key ID '${keyId}' đã tồn tại.`);
        } else if (err.status === 422) {
          setError(err.message || 'Dữ liệu không hợp lệ (Public Key PEM phải có độ dài <= 512 bytes).');
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
          maxWidth: 640,
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
                Xác thực bằng X-Admin-Key • Đăng ký khóa công khai SPKI ECDSA P-256
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

          {/* Device ID and Key ID */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div>
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
                  placeholder="VD: ESP32-02"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--text-sm)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setDeviceId(generateRandomDeviceId())}
                  title="Tạo mã ngẫu nhiên"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface-secondary)',
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  marginBottom: 4,
                }}
              >
                Mã Khóa (Key ID) *
              </label>
              <input
                type="text"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                placeholder="VD: wokwi-key-v1"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  fontSize: 'var(--text-sm)',
                }}
              />
            </div>
          </div>

          {/* Assigned Shipment */}
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
              Lô hàng phân công (Shipment Assignment) *
            </label>
            <select
              value={shipmentId}
              onChange={(e) => setShipmentId(e.target.value)}
              disabled={loadingShipments}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--text-sm)',
                backgroundColor: 'var(--color-surface)',
              }}
            >
              <option value="">-- Chọn lô hàng gán thiết bị --</option>
              {shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} ({s.cargo_type}) — {s.id.slice(0, 8)}...
                </option>
              ))}
            </select>
          </div>

          {/* Public Key PEM */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <label
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <KeyRound size={12} /> Khóa công khai SPKI PEM (Public Key) *
              </label>
              <button
                type="button"
                onClick={handleUseSampleKey}
                style={{
                  fontSize: '11px',
                  color: 'var(--color-accent)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontWeight: 500,
                }}
              >
                <Sparkles size={12} /> Dùng Public Key mẫu Wokwi ESP32
              </button>
            </div>
            <textarea
              rows={5}
              value={publicKeyPem}
              onChange={(e) => setPublicKeyPem(e.target.value)}
              placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontFamily: 'monospace',
                fontSize: '11px',
                lineHeight: '16px',
                backgroundColor: 'var(--color-surface-secondary)',
              }}
            />
            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
              Lưu ý: Chỉ nhập Public Key (khóa công khai). Tuyệt đối không bao giờ nhập Private Key!
            </span>
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
              {submitting ? 'Đang xác thực & đăng ký...' : 'Đăng Ký Thiết Bị'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

