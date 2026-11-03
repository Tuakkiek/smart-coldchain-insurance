import React from 'react';
import { Badge, BadgeVariant } from '../ui/Badge';
import {
  ShipmentStatus,
  InsuranceStatus,
  PayoutStatus,
  BlockchainConfirmationStatus,
} from '../../types/api';
import {
  Clock,
  Truck,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
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

