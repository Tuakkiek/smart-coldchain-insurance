import React, { useState, useEffect } from 'react';
import { AdminDeviceViewOut, DeviceItemOut, ShipmentOut } from '../../types/api';
import { assignDevice, getDevices } from '../../api/devices';
import { getShipments } from '../../api/shipments';
import { ApiError } from '../../api/client';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useToast } from '../feedback/Toast';
import {
  Link2,
  Unlink,
  X,
  Cpu,
  Package,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface AssignDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: AdminDeviceViewOut, message: string) => void;
  initialDeviceId?: string | null;
}

export const AssignDeviceModal: React.FC<AssignDeviceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialDeviceId,
}) => {
  const { toast } = useToast();
  const [devices, setDevices] = useState<DeviceItemOut[]>([]);
  const [shipments, setShipments] = useState<ShipmentOut[]>([]);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedShipmentId, setSelectedShipmentId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConflict409, setIsConflict409] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsConflict409(false);
      setLoading(true);

      Promise.all([getDevices(), getShipments()])
        .then(([devicesRes, shipmentsRes]) => {
          setDevices(devicesRes.items);
          setShipments(shipmentsRes.items);

          if (initialDeviceId) {
            setSelectedDeviceId(initialDeviceId);
          } else if (devicesRes.items.length > 0) {
            setSelectedDeviceId(devicesRes.items[0].device_id);
          }

          if (shipmentsRes.items.length > 0) {
            setSelectedShipmentId(shipmentsRes.items[0].id);
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Lỗi tải danh mục thiết bị và chuyến hàng');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, initialDeviceId]);

  if (!isOpen) return null;

  const currentDevice = devices.find((d) => d.device_id === selectedDeviceId);
  const currentAssignedShipmentId = currentDevice?.assigned_shipment_id;
  const currentAssignedShipmentCode = currentDevice?.assigned_shipment_code;

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeviceId) {
      const msg = 'Vui lòng chọn thiết bị';
      setError(msg);
      toast.warning(msg, { title: 'Thông tin chưa đầy đủ' });
      return;
    }
    if (!selectedShipmentId) {
      const msg = 'Vui lòng chọn chuyến hàng';
      setError(msg);
      toast.warning(msg, { title: 'Thông tin chưa đầy đủ' });
      return;
    }

    setSubmitting(true);
    setError(null);
    setIsConflict409(false);

    try {
      const result = await assignDevice(
        selectedDeviceId,
        {
          shipment_id: selectedShipmentId,
          active: true,
        }
      );
      const chosenShipment = shipments.find((s) => s.id === selectedShipmentId);
      const shipLabel = chosenShipment?.code || selectedShipmentId.slice(0, 8);
      onSuccess(result, `Đã liên kết thành công thiết bị ${selectedDeviceId} với chuyến hàng ${shipLabel}!`);
      onClose();
    } catch (err: unknown) {
      let msg = '';
      if (err instanceof ApiError) {
        if (err.status === 409 || err.code === 'DEVICE_ALREADY_ASSIGNED') {
          setIsConflict409(true);
          msg = err.message ||
            `Thiết bị '${selectedDeviceId}' đã có liên kết kích hoạt với chuyến hàng khác (${currentAssignedShipmentCode || currentAssignedShipmentId}). Mỗi thiết bị chỉ được có 1 liên kết active. Vui lòng bấm 'Bỏ liên kết cũ' trước khi gán mới!`;
        } else if (err.status === 401 || err.code === 'UNAUTHORIZED') {
          msg = 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
        } else {
          msg = err.message || 'Lỗi khi gán thiết bị vào chuyến hàng';
        }
      } else {
        msg = err instanceof Error ? err.message : 'Lỗi không xác định khi liên kết thiết bị';
      }
      setError(msg);
      toast.error(msg, { title: 'Lỗi liên kết thiết bị' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnassignOld = async () => {
    if (!currentAssignedShipmentId) return;
    setSubmitting(true);
    setError(null);
    setIsConflict409(false);

    try {
      const result = await assignDevice(
        selectedDeviceId,
        {
          shipment_id: currentAssignedShipmentId,
          active: false,
        }
      );

      // Cập nhật local state
      setDevices((prev) =>
        prev.map((d) =>
          d.device_id === selectedDeviceId
            ? { ...d, assigned_shipment_id: null, assigned_shipment_code: null }
            : d
        )
      );

      setError(null);
      setIsConflict409(false);
      onSuccess(
        result,
        `Đã bỏ liên kết chuyến hàng cũ (${currentAssignedShipmentCode || currentAssignedShipmentId}) cho thiết bị ${selectedDeviceId}. Bây giờ bạn có thể gán chuyến mới!`
      );
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message || 'Lỗi khi hủy liên kết chuyến hàng cũ');
      } else {
        setError(err instanceof Error ? err.message : 'Lỗi không xác định khi hủy liên kết');
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
      onClick={submitting ? undefined : onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 580,
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
              <Link2 size={20} />
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
                Liên Kết Thiết Bị Với Chuyến Hàng
              </h3>
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                }}
              >
                Mỗi thiết bị chỉ có 1 assignment active • Nhiều thiết bị có thể cùng chuyến
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'none',
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
              color: 'var(--color-text-tertiary)',
              padding: 4,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleAssign} style={{ overflowY: 'auto', padding: 'var(--space-5)' }}>
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
              <div style={{ flex: 1 }}>{error}</div>
            </div>
          )}

          {/* Device Selection Dropdown */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 6,
              }}
            >
              Chọn Thiết Bị ESP32 (Device) *
            </label>
            <select
              value={selectedDeviceId}
              onChange={(e) => {
                setSelectedDeviceId(e.target.value);
                setError(null);
                setIsConflict409(false);
              }}
              disabled={loading || submitting}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--text-sm)',
                backgroundColor: 'var(--color-surface)',
              }}
            >
              {devices.map((d) => (
                <option key={d.device_id} value={d.device_id}>
                  {d.device_id} — {d.device_name || 'Cold Chain Sensor'} {d.assigned_shipment_code ? `[Đang gán: ${d.assigned_shipment_code}]` : '[Chưa gán]'}
                </option>
              ))}
            </select>
          </div>

          {/* Current Device Status Banner */}
          {currentDevice && (
            <div
              style={{
                marginBottom: 'var(--space-4)',
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: currentAssignedShipmentId
                  ? 'var(--color-warning-soft)'
                  : 'var(--color-surface-secondary)',
                border: `1px solid ${
                  currentAssignedShipmentId
                    ? 'var(--color-warning)'
                    : 'var(--color-border-subtle)'
                }`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)' }}>
                <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Trạng thái hiện tại của {currentDevice.device_id}:
                </div>
                <div style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {currentAssignedShipmentId ? (
                    <span>
                      Đang liên kết với chuyến hàng:{' '}
                      <strong>{currentAssignedShipmentCode || currentAssignedShipmentId}</strong>
                    </span>
                  ) : (
                    <span>Chưa liên kết với chuyến hàng nào (Sẵn sàng gán).</span>
                  )}
                </div>
              </div>

              {currentAssignedShipmentId && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleUnassignOld}
                  disabled={submitting}
                  icon={<Unlink size={13} />}
                >
                  Bỏ liên kết chuyến hàng
                </Button>
              )}
            </div>
          )}

          {/* Shipment Selection Dropdown */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 6,
              }}
            >
              Chọn Chuyến Hàng (Shipment Code & UUID v4) *
            </label>
            <select
              value={selectedShipmentId}
              onChange={(e) => setSelectedShipmentId(e.target.value)}
              disabled={loading || submitting}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--text-sm)',
                backgroundColor: 'var(--color-surface)',
              }}
            >
              {shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} ({s.cargo_type}) — UUID: {s.id.slice(0, 8)}...{s.id.slice(-4)}
                </option>
              ))}
            </select>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--color-text-tertiary)',
                marginTop: 4,
              }}
            >
              Backend quản lý chuyến bằng ID UUID v4 chữ thường. Dropdown hiển thị mã dễ đọc (VD: SHIP-001) nhưng gửi UUID chuẩn vào request.
            </div>
          </div>

          {/* Conflict 409 Resolution Box */}
          {isConflict409 && currentAssignedShipmentId && (
            <div
              style={{
                marginBottom: 'var(--space-4)',
                padding: 'var(--space-3) var(--space-4)',
                backgroundColor: 'var(--color-warning-soft)',
                border: '1px solid var(--color-warning)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
                <strong>Xử lý lỗi 409 DEVICE_ALREADY_ASSIGNED:</strong>
                <p style={{ margin: '2px 0 0 0', color: 'var(--color-text-secondary)' }}>
                  Thiết bị cần được hủy gán chuyến cũ trước khi gán chuyến mới.
                </p>
              </div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleUnassignOld}
                disabled={submitting}
              >
                Bỏ gán chuyến cũ ngay
              </Button>
            </div>
          )}

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
              Đóng
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={loading || submitting}
            >
              {submitting ? 'Đang xử lý...' : 'Liên Kết Chuyến Hàng'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
