import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Cpu, Link2 } from 'lucide-react';
import { DeviceOnlineBadge } from '../data-display/StatusBadge';
import { EmptyState } from '../feedback/EmptyState';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { DeviceItemOut } from '../../types/api';

export interface DeviceListSectionProps {
  devices: DeviceItemOut[];
  totalCount: number;
  selectedDeviceId: string | null;
  isEffectiveColdStart: boolean;
  hasActiveFilters: boolean;
  onSelectDevice: (deviceId: string) => void;
  onAssignDevice: (deviceId: string) => void;
  onResetFilters: () => void;
}

const formatLastSeen = (value: string | null) => value
  ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
  : 'Chưa có dữ liệu';

export const DeviceListSection: React.FC<DeviceListSectionProps> = ({
  devices,
  totalCount,
  selectedDeviceId,
  isEffectiveColdStart,
  hasActiveFilters,
  onSelectDevice,
  onAssignDevice,
  onResetFilters,
}) => (
  <Card className="devices-simple-card" style={{ padding: 0 }}>
    <div className="devices-simple-header">
      <h2>Danh sách thiết bị</h2>
      <Badge variant="neutral">{hasActiveFilters ? `${devices.length} / ${totalCount}` : totalCount}</Badge>
    </div>
    {totalCount === 0 ? <EmptyState icon={<Cpu size={24} />} title="Chưa có thiết bị" description="Thiết bị đăng ký sẽ xuất hiện tại đây." /> : devices.length === 0 ? <EmptyState title="Không tìm thấy thiết bị" actionText="Đặt lại bộ lọc" onAction={onResetFilters} /> : (
      <div role="listbox" aria-label="Danh sách thiết bị">
        {devices.map((device) => {
          const selected = selectedDeviceId === device.device_id;
          return (
            <div key={device.id} className={`devices-simple-row${selected ? ' is-selected' : ''}`} role="option" aria-selected={selected} tabIndex={0} onClick={() => onSelectDevice(device.device_id)} onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && onSelectDevice(device.device_id)}>
              <div className="device-simple-identity"><span className="compact-icon"><Cpu size={16} /></span><div><div className="compact-title font-mono">{device.device_id}</div><div className="compact-meta">{device.device_name || 'Cold Chain Sensor'}</div></div></div>
              <div><span className="device-mobile-label">Trạng thái</span><DeviceOnlineBadge status={device.health.online_status} lastHeartbeat={device.health.last_heartbeat_at} isBackendColdStart={isEffectiveColdStart} /></div>
              <div className="device-assignment-cell"><span className="device-mobile-label">Lô hàng</span>{device.assigned_shipment_id ? <Link to={`/shipments/${device.assigned_shipment_id}`} onClick={(event) => event.stopPropagation()}>{device.assigned_shipment_name || 'Lô hàng đang gán'}</Link> : <span className="device-unassigned-text">Chưa gán</span>}</div>
              <div><span className="device-mobile-label">Cập nhật cuối</span><span className="device-last-seen">{formatLastSeen(device.health.last_seen_at)}</span></div>
              <div className="device-simple-actions"><Button size="sm" onClick={(event) => { event.stopPropagation(); onAssignDevice(device.device_id); }} icon={<Link2 size={13} />}>Gán</Button><ChevronRight size={16} color="var(--color-text-tertiary)" /></div>
            </div>
          );
        })}
      </div>
    )}
  </Card>
);
