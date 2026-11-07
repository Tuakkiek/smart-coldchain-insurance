import React from 'react';
import { Badge, BadgeVariant } from '../ui/Badge';
import {
  ShipmentStatus,
  InsuranceStatus,
  PayoutStatus,
  BlockchainConfirmationStatus,
  SignatureStatus,
  DeviceOnlineStatus,
  CompletenessStatus,
} from '../../types/api';
import {
  Clock,
  Truck,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  KeyRound,
  HelpCircle,
  FileQuestion,
} from 'lucide-react';

interface ShipmentStatusBadgeProps {
  status: ShipmentStatus;
}

export const ShipmentStatusBadge: React.FC<ShipmentStatusBadgeProps> = ({ status }) => {
  let label = 'Chưa xác định';
  let variant: BadgeVariant = 'neutral';
  let icon = <Clock size={12} />;

  switch (status) {
    case 'created':
      label = 'Mới tạo';
      variant = 'neutral';
      icon = <Clock size={12} />;
      break;
    case 'in_transit':
      label = 'Đang vận chuyển';
      variant = 'info';
      icon = <Truck size={12} />;
      break;
    case 'sensor_data_gap':
      label = 'Mất tín hiệu cảm biến';
      variant = 'warning';
      icon = <AlertTriangle size={12} />;
      break;
    case 'insurance_triggered':
      label = 'Kích hoạt bảo hiểm';
      variant = 'danger';
      icon = <ShieldAlert size={12} />;
      break;
  }

  return (
    <Badge variant={variant} icon={icon}>
      {label}
    </Badge>
  );
};

interface InsuranceStatusBadgeProps {
  status: InsuranceStatus;
  payoutStatus: PayoutStatus;
}

export const InsuranceStatusBadge: React.FC<InsuranceStatusBadgeProps> = ({
  status,
  payoutStatus,
}) => {
  if (status === 'active') {
    return (
      <Badge variant="success" icon={<ShieldCheck size={12} />}>
        Bảo hiểm hiệu lực
      </Badge>
    );
  }

  switch (payoutStatus) {
    case 'paid':
      return (
        <Badge variant="success" icon={<CheckCircle2 size={12} />}>
          Đã chi trả bồi thường
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="warning" icon={<Clock size={12} />}>
          Chờ chi trả on-chain
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="danger" icon={<XCircle size={12} />}>
          Chi trả thất bại
        </Badge>
      );
    default:
      return (
        <Badge variant="danger" icon={<ShieldAlert size={12} />}>
          Đã vi phạm bảo hiểm
        </Badge>
      );
  }
};

interface BlockchainBadgeProps {
  status: BlockchainConfirmationStatus;
}

export const BlockchainBadge: React.FC<BlockchainBadgeProps> = ({ status }) => {
  switch (status) {
    case 'success':
      return (
        <Badge variant="success" icon={<CheckCircle2 size={12} />}>
          Blockchain Confirmed
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="warning" icon={<Clock size={12} />}>
          Blockchain Pending
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="danger" icon={<XCircle size={12} />}>
          Giao dịch thất bại
        </Badge>
      );
    default:
      return <Badge variant="neutral">Chưa có giao dịch</Badge>;
  }
};

interface SignatureStatusBadgeProps {
  status: SignatureStatus;
}

export const SignatureStatusBadge: React.FC<SignatureStatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'VALID':
      return (
        <Badge
          variant="success"
          icon={<ShieldCheck size={12} />}
          title="Chữ ký ECDSA P-256 hợp lệ từ ESP32 đã đăng ký. Lưu ý: Chữ ký hợp lệ không chứng minh cảm biến vật lý chưa bị can thiệp."
        >
          Chữ ký Hợp lệ (VALID)
        </Badge>
      );
    case 'INVALID':
      return (
        <Badge
          variant="danger"
          icon={<ShieldAlert size={12} />}
          title="Chữ ký sai lệch so với public key đã đăng ký. Bản ghi bị từ chối vào accepted telemetry."
        >
          Chữ ký Sai (INVALID)
        </Badge>
      );
    case 'UNKNOWN_KEY':
      return (
        <Badge
          variant="warning"
          icon={<KeyRound size={12} />}
          title="Khóa công khai (key_id) của thiết bị chưa được ủy quyền trong hệ thống."
        >
          Khóa Chưa Đăng Ký (UNKNOWN_KEY)
        </Badge>
      );
    default:
      return (
        <Badge variant="neutral" icon={<HelpCircle size={12} />}>
          Chưa xác định
        </Badge>
      );
  }
};

interface DeviceOnlineBadgeProps {
  status: DeviceOnlineStatus;
  lastHeartbeat?: string | null;
  isBackendColdStart?: boolean;
}

export const DeviceOnlineBadge: React.FC<DeviceOnlineBadgeProps> = ({
  status,
  lastHeartbeat,
  isBackendColdStart,
}) => {
  if (isBackendColdStart) {
    return (
      <Badge
        variant="warning"
        icon={<Clock size={12} className="animate-spin" />}
        title="Không thể xác định trạng thái kết nối của ESP32 do máy chủ Backend đang khởi động lại (Render Cold Start)."
      >
        Chờ Backend (Cold Start)
      </Badge>
    );
  }

  switch (status) {
    case 'ONLINE':
      return (
        <Badge
          variant="success"
          icon={<Wifi size={12} />}
          title={lastHeartbeat ? `Heartbeat gần nhất: ${new Date(lastHeartbeat).toLocaleTimeString('vi-VN')}` : 'Thiết bị đang hoạt động'}
        >
          ONLINE
        </Badge>
      );
    case 'OFFLINE':
      return (
        <Badge
          variant="danger"
          icon={<WifiOff size={12} />}
          title="Thiết bị quá hạn gửi heartbeat/telemetry (>120s). Lưu ý: Lỗi thiết bị offline độc lập với trạng thái Backend server."
        >
          OFFLINE
        </Badge>
      );
    case 'DEGRADED':
      return (
        <Badge
          variant="warning"
          icon={<AlertTriangle size={12} />}
          title="Thiết bị phản hồi chập chờn hoặc chưa kích hoạt chính thức."
        >
          DEGRADED
        </Badge>
      );
    default:
      return (
        <Badge variant="neutral" icon={<HelpCircle size={12} />}>
          UNKNOWN
        </Badge>
      );
  }
};

interface CompletenessBadgeProps {
  status: CompletenessStatus;
  missingCount?: number;
}

export const CompletenessBadge: React.FC<CompletenessBadgeProps> = ({ status, missingCount = 0 }) => {
  switch (status) {
    case 'COMPLETE':
      return (
        <Badge variant="success" icon={<CheckCircle2 size={12} />}>
          Chuỗi liên tục (0 mất)
        </Badge>
      );
    case 'DATA_INCOMPLETE':
      return (
        <Badge
          variant="warning"
          icon={<AlertTriangle size={12} />}
          title={`Phát hiện thiếu ${missingCount} số thứ tự (sequence). Không được tính liên tục qua gap vi phạm 15 phút.`}
        >
          Mất chuỗi ({missingCount} sequence gap)
        </Badge>
      );
    case 'OFFLINE':
      return (
        <Badge variant="danger" icon={<WifiOff size={12} />}>
          Mất liên lạc
        </Badge>
      );
    default:
      return (
        <Badge variant="neutral" icon={<FileQuestion size={12} />}>
          Chưa rõ
        </Badge>
      );
  }
};


