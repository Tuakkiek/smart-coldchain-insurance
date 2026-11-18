import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AdminDeviceViewOut } from '../../types/api';
import { getAdminDeviceDetails } from '../../api/devices';
import { ApiError } from '../../api/client';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { LoadingState } from '../feedback/LoadingState';
import { EmptyState } from '../feedback/EmptyState';
import { formatApiErrorMessage, isRequestCancelled, useToast } from '../feedback/Toast';
import {
  ShieldCheck,
  X,
  RefreshCw,
  Cpu,
  KeyRound,
  Layers,
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
  const { toast } = useToast();
  const requestId = useRef(0);
  const [deviceDetail, setDeviceDetail] = useState<AdminDeviceViewOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchDetails = useCallback(async (isManualRefresh = false) => {
    if (!deviceId) return;
    const id = ++requestId.current;

    setLoading(true);
    setLoadFailed(false);
    try {
      const data = await getAdminDeviceDetails(deviceId);
      if (id === requestId.current) {
        setDeviceDetail(data);
        if (isManualRefresh) {
          toast.success(`Đã làm mới chi tiết thiết bị ${deviceId}.`, { title: 'Làm mới thành công' });
        }
      }
    } catch (err: unknown) {
      if (id !== requestId.current || isRequestCancelled(err)) return;
      setLoadFailed(true);
      let msg = '';
      if (err instanceof ApiError && (err.status === 401 || err.code === 'UNAUTHORIZED')) {
        msg = 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
      } else {
        msg = formatApiErrorMessage(err, 'Lỗi khi tải chi tiết quản trị thiết bị.');
      }
      if (msg) {
        toast.error(msg, { title: 'Lỗi tải chi tiết thiết bị' });
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [deviceId, toast]);

  useEffect(() => {
    if (isOpen && deviceId) {
      setDeviceDetail(null);
      setLoadFailed(false);
      fetchDetails(false);
    }
    return () => { requestId.current += 1; };
  }, [isOpen, deviceId, fetchDetails]);

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
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !deviceId) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-device-detail-modal-title"
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
          maxHeight: 'min(90vh, 740px)',
          margin: 'auto',
          position: 'relative',
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
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fetchDetails(true)}
              loading={loading}
              disabled={loading}
              icon={<RefreshCw size={14} />}
            >
              Làm mới dữ liệu
            </Button>
          </div>

          {loading && !deviceDetail && (
            <LoadingState message="Đang nạp chi tiết thiết bị..." minHeight="200px" />
          )}

          {loadFailed && !loading && !deviceDetail && (
            <EmptyState
              title="Chưa thể nạp chi tiết thiết bị"
              description="Vui lòng kiểm tra kết nối máy chủ Backend và thử tải lại."
              actionText="Thử lại"
              onAction={() => fetchDetails(true)}
            />
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

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};

