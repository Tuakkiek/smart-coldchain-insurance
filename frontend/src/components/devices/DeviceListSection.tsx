import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { DeviceOnlineBadge } from '../data-display/StatusBadge';
import { EmptyState } from '../feedback/EmptyState';
import { DeviceItemOut, SignatureStatus } from '../../types/api';
import {
  Cpu,
  Check,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  HelpCircle,
  Link2,
  Trash2,
  ChevronRight,
} from 'lucide-react';

export interface DeviceListSectionProps {
  devices: DeviceItemOut[];
  totalCount: number;
  selectedDeviceId: string | null;
  deletingDeviceId: string | null;
  isEffectiveColdStart: boolean;
  hasActiveFilters: boolean;
  onSelectDevice: (deviceId: string) => void;
  onAssignDevice: (deviceId: string) => void;
  onDeleteDevice: (device: DeviceItemOut) => void;
  onResetFilters: () => void;
  onRegisterDevice: () => void;
}

const CompactSignatureBadge: React.FC<{ status: SignatureStatus }> = ({ status }) => {
  switch (status) {
    case 'VALID':
      return (
        <Badge
          variant="success"
          icon={<ShieldCheck size={12} />}
          title="Chữ ký ECDSA P-256 hợp lệ từ ESP32 đã đăng ký. Lưu ý: Chữ ký hợp lệ không chứng minh cảm biến vật lý chưa bị can thiệp."
        >
          Hợp lệ (VALID)
        </Badge>
      );
    case 'INVALID':
      return (
        <Badge
          variant="danger"
          icon={<ShieldAlert size={12} />}
          title="Chữ ký sai lệch so với public key đã đăng ký. Bản ghi bị từ chối vào accepted telemetry."
        >
          Sai chữ ký (INVALID)
        </Badge>
      );
    case 'UNKNOWN_KEY':
      return (
        <Badge
          variant="warning"
          icon={<KeyRound size={12} />}
          title="Khóa công khai (key_id) của thiết bị chưa được ủy quyền trong hệ thống."
        >
          Khóa chưa đăng ký
        </Badge>
      );
    default:
      return (
        <Badge
          variant="neutral"
          icon={<HelpCircle size={12} />}
          title="Chưa có dữ liệu telemetry ký số để xác minh chữ ký."
        >
          Chưa xác định
        </Badge>
      );
  }
};

export const DeviceListSection: React.FC<DeviceListSectionProps> = ({
  devices,
  totalCount,
  selectedDeviceId,
  deletingDeviceId,
  isEffectiveColdStart,
  hasActiveFilters,
  onSelectDevice,
  onAssignDevice,
  onDeleteDevice,
  onResetFilters,
  onRegisterDevice,
}) => {
  return (
    <Card className="devices-list-card">
      <div className="devices-list-header">
        <div className="devices-list-title-group">
          <h2 className="devices-list-title">Danh sách thiết bị ESP32</h2>
          <Badge variant="neutral">
            {hasActiveFilters
              ? `${devices.length} / ${totalCount} thiết bị`
              : `${totalCount} thiết bị`}
          </Badge>
        </div>
        <span className="devices-list-hint">
          Nhấn vào một thiết bị để xem thông tin chi tiết bên dưới
        </span>
      </div>

      {totalCount === 0 ? (
        <div style={{ padding: 'var(--space-6)' }}>
          <EmptyState
            icon={<Cpu size={24} />}
            title="Chưa có thiết bị ESP32 nào"
            description="Hệ thống chưa ghi nhận thiết bị cảm biến nào. Hãy đăng ký thiết bị mới để bắt đầu giám sát."
            actionText="Đăng ký thiết bị (Admin)"
            onAction={onRegisterDevice}
          />
        </div>
      ) : devices.length === 0 ? (
        <div style={{ padding: 'var(--space-6)' }}>
          <EmptyState
            icon={<Cpu size={24} />}
            title="Không tìm thấy thiết bị phù hợp"
            description="Không có thiết bị ESP32 nào khớp với từ khóa hoặc bộ lọc hiện tại."
            actionText="Xóa bộ lọc"
            onAction={onResetFilters}
          />
        </div>
      ) : (
        <div className="devices-list-scroll" role="listbox" aria-label="Danh sách thiết bị ESP32">
          <div className="devices-list-grid-header" aria-hidden="true">
            <div>Thiết bị</div>
            <div>Trạng thái</div>
            <div>Public Key</div>
            <div>Lô hàng đang gán</div>
            <div>Xác minh chữ ký</div>
            <div style={{ textAlign: 'right' }}>Thao tác</div>
          </div>

          {devices.map((dev) => {
            const isSelected = selectedDeviceId === dev.device_id;
            const hasKey =
              dev.has_public_key ||
              Boolean(dev.key_id && dev.key_id !== 'NO_KEY');

            return (
              <div
                key={dev.id}
                role="option"
                tabIndex={0}
                aria-selected={isSelected}
                className={`devices-list-row${isSelected ? ' is-selected' : ''}`}
                onClick={() => onSelectDevice(dev.device_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectDevice(dev.device_id);
                  }
                }}
              >
                {/* 1. Device ID & Name */}
                <div className="device-cell device-cell--identity">
                  <span className="device-identity-icon" aria-hidden="true">
                    <Cpu size={16} />
                  </span>
                  <div className="device-identity-text">
                    <span className="device-id-label" title={dev.device_id}>
                      {dev.device_id}
                    </span>
                    <span
                      className="device-name-label"
                      title={dev.device_name || 'Cold Chain Sensor'}
                    >
                      {dev.device_name || 'Cold Chain Sensor'}
                    </span>
                  </div>
                </div>

                {/* 2. Online / Offline Status */}
                <div className="device-cell">
                  <span className="device-mobile-label">Trạng thái kết nối</span>
                  <DeviceOnlineBadge
                    status={dev.health.online_status}
                    lastHeartbeat={dev.health.last_heartbeat_at}
                    isBackendColdStart={isEffectiveColdStart}
                  />
                </div>

                {/* 3. Public Key Status */}
                <div className="device-cell">
                  <span className="device-mobile-label">Public Key</span>
                  {hasKey ? (
                    <Badge
                      variant="success"
                      icon={<Check size={12} />}
                      title="has_public_key=true: Đã cấp public key trên MySQL. Lưu ý: Không đồng nghĩa đã flash thành công vào ESP32 hoặc đã có dữ liệu hợp lệ."
                    >
                      Đã cấp khóa
                    </Badge>
                  ) : (
                    <Badge
                      variant="warning"
                      icon={<AlertTriangle size={12} />}
                      title="Chưa cấp Public Key SPKI PEM. Cần nạp khóa bằng quy trình cấp phát local."
                    >
                      Chưa cấp khóa
                    </Badge>
                  )}
                </div>

                {/* 4. Assigned Shipment */}
                <div className="device-cell">
                  <span className="device-mobile-label">Lô hàng đang gán</span>
                  {dev.assigned_shipment_id ? (
                    <Link
                      to={`/shipments/${dev.assigned_shipment_id}`}
                      className="device-shipment-link"
                      onClick={(e) => e.stopPropagation()}
                      title={`Xem chi tiết lô hàng ${dev.assigned_shipment_code || dev.assigned_shipment_id}`}
                    >
                      <Badge variant="info">
                        {dev.assigned_shipment_code || `${dev.assigned_shipment_id.slice(0, 8)}...`}
                      </Badge>
                    </Link>
                  ) : (
                    <span className="device-unassigned-text">Chưa gán</span>
                  )}
                </div>

                {/* 5. Signature Verification Status */}
                <div className="device-cell">
                  <span className="device-mobile-label">Xác minh chữ ký</span>
                  <CompactSignatureBadge status={dev.signature_status} />
                </div>

                {/* 6. Quick Actions */}
                <div
                  className="device-cell device-cell--actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="device-row-btn"
                    onClick={() => onAssignDevice(dev.device_id)}
                    title="Liên kết hoặc đổi chuyến hàng cho thiết bị này"
                  >
                    <Link2 size={12} aria-hidden="true" />
                    <span>{dev.assigned_shipment_id ? 'Đổi chuyến' : 'Gán chuyến'}</span>
                  </button>
                  <button
                    type="button"
                    className="device-row-btn device-row-btn--danger"
                    onClick={() => onDeleteDevice(dev)}
                    disabled={deletingDeviceId === dev.device_id}
                    title={
                      dev.assigned_shipment_id
                        ? 'Cần bỏ liên kết chuyến hàng trước khi xóa thiết bị'
                        : 'Xóa thiết bị đã đăng ký'
                    }
                  >
                    <Trash2 size={12} aria-hidden="true" />
                    <span>{deletingDeviceId === dev.device_id ? 'Đang xóa...' : 'Xóa'}</span>
                  </button>
                  <ChevronRight
                    size={16}
                    className="device-row-chevron"
                    aria-hidden="true"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
