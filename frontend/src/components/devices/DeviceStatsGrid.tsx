import React from 'react';
import {
  Cpu,
  Wifi,
  ShieldCheck,
  AlertTriangle,
  Server,
} from 'lucide-react';
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

interface StatItem {
  key: string;
  title: string;
  value: string | number;
  isTextValue?: boolean;
  description: string;
  icon: React.ReactNode;
  valueColor?: string;
  iconBg: string;
  iconColor: string;
}

export const DeviceStatsGrid: React.FC<DeviceStatsGridProps> = ({
  totalCount,
  assignedCount,
  onlineCount,
  offlineCount,
  validSigCount,
  invalidSigCount,
  unknownKeyCount,
  gapCount,
  totalMissingPackets,
  backendConnectionState,
  isEffectiveColdStart,
}) => {
  const getBackendDisplay = () => {
    if (isEffectiveColdStart) {
      return {
        label: 'Cold Start',
        desc: 'Backend đang khởi động (~30s)',
        color: 'var(--color-warning)',
        iconBg: 'var(--color-warning-soft)',
        iconColor: 'var(--color-warning)',
      };
    }
    switch (backendConnectionState) {
      case 'ONLINE':
        return {
          label: 'Online',
          desc: 'Kết nối API ổn định',
          color: 'var(--color-success)',
          iconBg: 'var(--color-success-soft)',
          iconColor: 'var(--color-success)',
        };
      case 'CHECKING':
        return {
          label: 'Đang kiểm tra',
          desc: 'Đang kiểm tra kết nối máy chủ',
          color: 'var(--color-text-secondary)',
          iconBg: 'var(--color-neutral-soft)',
          iconColor: 'var(--color-neutral)',
        };
      case 'OFFLINE':
      default:
        return {
          label: 'Offline',
          desc: 'Mất kết nối máy chủ API',
          color: 'var(--color-danger)',
          iconBg: 'var(--color-danger-soft)',
          iconColor: 'var(--color-danger)',
        };
    }
  };

  const backend = getBackendDisplay();

  const stats: StatItem[] = [
    {
      key: 'total',
      title: 'Tổng số thiết bị',
      value: totalCount,
      description:
        assignedCount > 0
          ? `${assignedCount} thiết bị đang gán lô hàng`
          : 'Đã đăng ký hệ thống',
      icon: <Cpu size={17} aria-hidden="true" />,
      valueColor: 'var(--color-text-primary)',
      iconBg: 'var(--color-accent-soft)',
      iconColor: 'var(--color-accent)',
    },
    {
      key: 'online',
      title: 'Thiết bị Online',
      value: isEffectiveColdStart ? 'Chờ Backend' : onlineCount,
      isTextValue: isEffectiveColdStart,
      description: isEffectiveColdStart
        ? 'Đang chờ máy chủ phản hồi'
        : `${offlineCount} thiết bị đang offline`,
      icon: <Wifi size={17} aria-hidden="true" />,
      valueColor: isEffectiveColdStart
        ? 'var(--color-warning)'
        : onlineCount > 0
        ? 'var(--color-success)'
        : 'var(--color-text-primary)',
      iconBg: isEffectiveColdStart
        ? 'var(--color-warning-soft)'
        : 'var(--color-success-soft)',
      iconColor: isEffectiveColdStart
        ? 'var(--color-warning)'
        : 'var(--color-success)',
    },
    {
      key: 'signature',
      title: 'Chữ ký hợp lệ',
      value: validSigCount,
      description: `${invalidSigCount} sai chữ ký · ${unknownKeyCount} khóa lạ`,
      icon: <ShieldCheck size={17} aria-hidden="true" />,
      valueColor: validSigCount > 0 ? 'var(--color-success)' : 'var(--color-text-primary)',
      iconBg: 'var(--color-success-soft)',
      iconColor: 'var(--color-success)',
    },
    {
      key: 'gap',
      title: 'Thiết bị mất gói',
      value: gapCount,
      description:
        gapCount > 0
          ? `Tổng ${totalMissingPackets} sequence bị mất`
          : 'Không phát hiện mất gói',
      icon: <AlertTriangle size={17} aria-hidden="true" />,
      valueColor: gapCount > 0 ? 'var(--color-warning)' : 'var(--color-text-primary)',
      iconBg: gapCount > 0 ? 'var(--color-warning-soft)' : 'var(--color-neutral-soft)',
      iconColor: gapCount > 0 ? 'var(--color-warning)' : 'var(--color-neutral)',
    },
    {
      key: 'backend',
      title: 'Trạng thái Backend',
      value: backend.label,
      isTextValue: true,
      description: backend.desc,
      icon: <Server size={17} aria-hidden="true" />,
      valueColor: backend.color,
      iconBg: backend.iconBg,
      iconColor: backend.iconColor,
    },
  ];

  return (
    <section
      aria-label="Thống kê tổng quan thiết bị ESP32"
      className="devices-stats-grid"
    >
      {stats.map((item) => (
        <div key={item.key} className="device-stat-card">
          <div className="device-stat-card-top">
            <span className="device-stat-card-title">{item.title}</span>
            <span
              className="device-stat-card-icon"
              style={{ backgroundColor: item.iconBg, color: item.iconColor }}
            >
              {item.icon}
            </span>
          </div>
          <div>
            <div
              className={`device-stat-card-value tabular-nums${
                item.isTextValue ? ' device-stat-card-value--text' : ''
              }`}
              style={{ color: item.valueColor }}
              title={String(item.value)}
            >
              {item.value}
            </div>
            <div className="device-stat-card-desc" title={item.description}>
              {item.description}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
};
