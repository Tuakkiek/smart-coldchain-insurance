import React from 'react';
import { Cpu, Wifi } from 'lucide-react';
import { BackendConnectionState } from '../feedback/ConnectionStatus';

export interface DeviceStatsGridProps {
  totalCount: number;
  assignedCount: number;
  onlineCount: number;
  offlineCount: number;
  validSigCount: number;
  invalidSigCount: number;
  unknownKeyCount: number;
  gapCount: number;
  totalMissingPackets: number;
  backendConnectionState: BackendConnectionState;
  isEffectiveColdStart: boolean;
}

export const DeviceStatsGrid: React.FC<DeviceStatsGridProps> = ({
  totalCount,
  assignedCount,
  onlineCount,
  offlineCount,
  isEffectiveColdStart,
}) => (
  <section aria-label="Thống kê thiết bị" className="devices-stats-grid">
    <div className="device-stat-card">
      <div className="device-stat-card-top">
        <span className="device-stat-card-title">Tổng thiết bị</span>
        <span className="device-stat-card-icon" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}><Cpu size={17} /></span>
      </div>
      <div className="device-stat-card-value tabular-nums">{totalCount}</div>
      <div className="device-stat-card-desc">{assignedCount} đang được gán lô hàng</div>
    </div>
    <div className="device-stat-card">
      <div className="device-stat-card-top">
        <span className="device-stat-card-title">Đang trực tuyến</span>
        <span className="device-stat-card-icon" style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}><Wifi size={17} /></span>
      </div>
      <div className="device-stat-card-value tabular-nums" style={{ color: isEffectiveColdStart ? 'var(--color-warning)' : 'var(--color-success)' }}>{isEffectiveColdStart ? '—' : onlineCount}</div>
      <div className="device-stat-card-desc">{isEffectiveColdStart ? 'Backend đang khởi động' : `${offlineCount} đang offline`}</div>
    </div>
  </section>
);
