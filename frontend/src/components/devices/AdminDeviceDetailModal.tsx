import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AdminDeviceViewOut } from '../../types/api';
import { getAdminDeviceDetails } from '../../api/devices';
import { ApiError } from '../../api/client';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  ShieldCheck,
  X,
  RefreshCw,
  Cpu,
  KeyRound,
  Layers,
  AlertCircle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface AdminDeviceDetailModalProps {
  deviceId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AdminDeviceDetailModal: React.FC<AdminDeviceDetailModalProps> = ({
  deviceId,
  isOpen,
  onClose,
}) => {
  const requestId = useRef(0);
  const [deviceDetail, setDeviceDetail] = useState<AdminDeviceViewOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!deviceId) return;
    const id = ++requestId.current;

    setLoading(true);
    setError(null);
    try {
      const data = await getAdminDeviceDetails(deviceId);
      if (id === requestId.current) setDeviceDetail(data);
    } catch (err: unknown) {
      if (id !== requestId.current) return;
      if (err instanceof ApiError) {
        if (err.status === 401 || err.code === 'UNAUTHORIZED') {
          setError('Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.');
        } else {
          setError(err.message || 'Lỗi khi tải chi tiết quản trị thiết bị.');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Lỗi không xác định.');
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    if (isOpen && deviceId) {
      setDeviceDetail(null);
      setError(null);
      fetchDetails();
    }
    return () => { requestId.current += 1; };
  }, [isOpen, deviceId, fetchDetails]);

  if (!isOpen || !deviceId) return null;

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
          maxWidth: 650,
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
              <ShieldCheck size={20} />
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
                Chi Tiết Quản Trị Thiết Bị: {deviceId}
              </h3>
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                }}
              >
                Dữ liệu bảo mật từ endpoint Admin: GET /api/v1/devices/{deviceId}
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

        {/* Modal Body */}
        <div style={{ overflowY: 'auto', padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
            <Button size="sm" variant="secondary" onClick={() => fetchDetails()} disabled={loading}
              icon={<RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />}>
              {loading ? 'Đang tải...' : 'Làm mới dữ liệu'}
            </Button>
          </div>

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

          {deviceDetail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* General Status Card */}
              <div
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--color-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  <div className="flex-row items-center gap-2">
                    <Cpu size={16} style={{ color: 'var(--color-accent)' }} />
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      {deviceDetail.device_id}
                    </span>
                    {deviceDetail.device_name && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        ({deviceDetail.device_name})
                      </span>
                    )}
                  </div>
                  <Badge variant={deviceDetail.status === 'active' ? 'success' : 'danger'}>
                    TRẠNG THÁI: {deviceDetail.status.toUpperCase()}
                  </Badge>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 'var(--space-3)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--color-text-tertiary)' }}>Trạng thái Public Key</div>
                    <div style={{ marginTop: 2 }}>
                      <Badge variant={deviceDetail.has_public_key ? 'success' : 'warning'}>
                        {deviceDetail.has_public_key ? 'ĐÃ CẤP PUBLIC KEY' : 'CHƯA CẤP PUBLIC KEY'}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--color-text-tertiary)' }}>Chuyến hiện gán</div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginTop: 2 }}>
                      {deviceDetail.current_shipment_id ? (
                        <Link
                          to={`/shipments/${deviceDetail.current_shipment_id}`}
                          style={{ color: 'var(--color-accent)' }}
                        >
                          {deviceDetail.current_shipment_code || `${deviceDetail.current_shipment_id.slice(0, 8)}...`}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>Chưa gán</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--color-text-tertiary)' }}>Sequence đã nhận</div>
                    <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginTop: 2 }}>
                      #{deviceDetail.last_sequence_number}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--color-text-tertiary)' }}>Mẫu nhận gần nhất (UTC)</div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, marginTop: 2 }}>
                      {deviceDetail.last_seen_at
                        ? new Date(deviceDetail.last_seen_at).toLocaleString('vi-VN')
                        : 'Chưa có mẫu nào'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Registered Keys List */}
              <div>
                <h4
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    marginBottom: 'var(--space-2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <KeyRound size={14} style={{ color: 'var(--color-accent)' }} />
                  Khóa công khai đã đăng ký ({deviceDetail.keys.length})
                </h4>
                {deviceDetail.keys.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    Chưa có khóa nào được đăng ký cho thiết bị này.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {deviceDetail.keys.map((k) => (
                      <div
                        key={k.key_id}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{k.key_id}</span>
                        <Badge variant={k.status === 'active' ? 'success' : 'neutral'}>
                          {k.status.toUpperCase()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assignments List */}
              <div>
                <h4
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    marginBottom: 'var(--space-2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Layers size={14} style={{ color: 'var(--color-accent)' }} />
                  Phân công Lô hàng ({deviceDetail.assignments.length})
                </h4>
                {deviceDetail.assignments.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    Thiết bị này chưa được phân công cho lô hàng nào.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {deviceDetail.assignments.map((a) => (
                      <div
                        key={a.shipment_id}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        <div className="flex-row items-center gap-2">
                          <Link
                            to={`/shipments/${a.shipment_id}`}
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 500,
                              color: 'var(--color-accent)',
                            }}
                          >
                            {a.shipment_id}
                          </Link>
                        </div>
                        <Badge variant={a.active ? 'success' : 'neutral'}>
                          {a.active ? 'ĐANG KÍCH HOẠT' : 'ĐÃ DỪNG'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-5)',
            borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="secondary" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
};

