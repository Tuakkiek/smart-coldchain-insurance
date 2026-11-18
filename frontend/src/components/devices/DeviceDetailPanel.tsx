import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { CopyButton } from '../ui/CopyButton';
import {
  SignatureStatusBadge,
  DeviceOnlineBadge,
  CompletenessBadge,
} from '../data-display/StatusBadge';
import { DeviceItemOut } from '../../types/api';
import {
  Cpu,
  ShieldCheck,
  Activity,
  Check,
  AlertTriangle,
  HelpCircle,
  Link2,
  X,
  MousePointerClick,
} from 'lucide-react';

export interface DeviceDetailPanelProps {
  device: DeviceItemOut | null;
  isEffectiveColdStart: boolean;
  onOpenAdminDetail: (deviceId: string) => void;
  onAssignDevice: (deviceId: string) => void;
  onClearSelection: () => void;
}

function formatTime(ts: string | null | undefined): string {
  if (!ts) return 'Chưa ghi nhận';
  try {
    const d = new Date(ts);
    return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN')}`;
  } catch {
    return ts;
  }
}

export const DeviceDetailPanel: React.FC<DeviceDetailPanelProps> = ({
  device,
  isEffectiveColdStart,
  onOpenAdminDetail,
  onAssignDevice,
  onClearSelection,
}) => {
  if (!device) {
    return (
      <section aria-label="Chi tiết thiết bị ESP32" className="device-detail-empty">
        <div className="device-detail-empty-icon" aria-hidden="true">
          <MousePointerClick size={20} />
        </div>
        <h3 className="device-detail-empty-title">Chọn một thiết bị để xem thông tin chi tiết</h3>
        <p className="device-detail-empty-desc">
          Nhấn vào bất kỳ thiết bị ESP32 nào trong danh sách phía trên để kiểm tra thông tin định danh,
          bảo mật chữ ký số ECDSA P-256 và trạng thái vận hành thực tế.
        </p>
      </section>
    );
  }

  const hasKey =
    device.has_public_key || Boolean(device.key_id && device.key_id !== 'NO_KEY');
  const missingSeqCount =
    device.missing_sequence_count ?? device.health?.missing_sequence_count ?? null;
  const lastSeenAt = device.last_seen_at ?? device.health?.last_seen_at ?? null;
  const lastHeartbeatAt = device.health?.last_heartbeat_at ?? null;
  const hasMissingGap =
    device.completeness_status === 'DATA_INCOMPLETE' ||
    (missingSeqCount !== null && missingSeqCount > 0);

  return (
    <section aria-label={`Thông tin chi tiết thiết bị ${device.device_id}`}>
      <Card className="device-detail-card">
        {/* Detail Header */}
        <div className="device-detail-header">
          <div className="device-detail-title-wrap">
            <span className="device-detail-avatar" aria-hidden="true">
              <Cpu size={20} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="device-detail-eyebrow">Chi tiết thiết bị đang chọn</div>
              <div className="device-detail-heading-row">
                <span className="id-copy-inline">
                  <span className="device-detail-id">{device.device_id}</span>
                  <CopyButton value={device.device_id} iconSize={14} />
                </span>
                <span className="device-detail-name">
                  — {device.device_name || 'Cold Chain Sensor'}
                </span>
              </div>
            </div>
          </div>

          <div className="device-detail-actions">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenAdminDetail(device.device_id)}
              icon={<ShieldCheck size={14} />}
            >
              Chi tiết quản trị
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onAssignDevice(device.device_id)}
              icon={<Link2 size={14} />}
            >
              {device.assigned_shipment_id ? 'Đổi chuyến hàng' : 'Gán chuyến hàng'}
            </Button>
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={onClearSelection}
              icon={<X size={14} />}
              aria-label="Bỏ chọn thiết bị"
              title="Bỏ chọn thiết bị"
            >
              Đóng
            </Button>
          </div>
        </div>

        {/* Detail Body: 3 Grouped Sections */}
        <div className="device-detail-body">
          <div className="device-detail-groups">
            {/* A. Thông tin định danh */}
            <div className="device-detail-group">
              <div className="device-detail-group-header">
                <span className="device-detail-group-icon" aria-hidden="true">
                  <Cpu size={14} />
                </span>
                <h3 className="device-detail-group-title">A. Thông tin định danh</h3>
              </div>

              <div className="device-detail-rows">
                <div className="device-detail-item">
                  <span className="device-detail-label">Device ID</span>
                  <span className="id-copy-inline">
                    <span className="device-detail-value device-detail-value--mono">
                      {device.device_id}
                    </span>
                    <CopyButton value={device.device_id} iconSize={13} />
                  </span>
                </div>

                <div className="device-detail-item">
                  <span className="device-detail-label">Tên thiết bị</span>
                  <span className="device-detail-value">
                    {device.device_name || 'Cold Chain Sensor'}
                  </span>
                </div>

                <div className="device-detail-item">
                  <span className="device-detail-label">Mã Key ID</span>
                  <span
                    className="device-detail-value device-detail-value--mono"
                    style={{
                      color:
                        !device.key_id || device.key_id === 'NO_KEY'
                          ? 'var(--color-text-tertiary)'
                          : 'var(--color-text-primary)',
                    }}
                  >
                    {device.key_id || 'NO_KEY'}
                  </span>
                </div>

                <div className="device-detail-item">
                  <span className="device-detail-label">Phiên bản Firmware</span>
                  <span className="device-detail-value device-detail-value--mono">
                    {device.firmware_version || 'Chưa rõ'}
                  </span>
                </div>
              </div>
            </div>

            {/* B. Thông tin bảo mật */}
            <div className="device-detail-group">
              <div className="device-detail-group-header">
                <span
                  className="device-detail-group-icon device-detail-group-icon--security"
                  aria-hidden="true"
                >
                  <ShieldCheck size={14} />
                </span>
                <h3 className="device-detail-group-title">B. Thông tin bảo mật</h3>
              </div>

              <div className="device-detail-rows">
                <div className="device-detail-item">
                  <span className="device-detail-label">Thuật toán mật mã</span>
                  <span className="device-detail-value device-detail-value--mono">
                    ECDSA P-256 (secp256r1)
                  </span>
                </div>

                <div className="device-detail-item">
                  <span className="device-detail-label">Trạng thái Public Key</span>
                  <div>
                    {hasKey ? (
                      <Badge
                        variant="success"
                        icon={<Check size={12} />}
                        title="has_public_key=true: Đã cấp public key trên MySQL."
                      >
                        Đã cấp Public Key
                      </Badge>
                    ) : (
                      <Badge
                        variant="warning"
                        icon={<AlertTriangle size={12} />}
                        title="Chưa cấp Public Key SPKI PEM trên hệ thống."
                      >
                        Chưa cấp Public Key
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="device-detail-item">
                  <span className="device-detail-label">Xác minh chữ ký số</span>
                  <div>
                    <SignatureStatusBadge status={device.signature_status} />
                  </div>
                </div>

                <div className="device-detail-item">
                  <span className="device-detail-label">Trạng thái toàn vẹn dữ liệu</span>
                  <div>
                    <CompletenessBadge
                      status={device.completeness_status}
                      missingCount={missingSeqCount ?? undefined}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* C. Thông tin vận hành */}
            <div className="device-detail-group">
              <div className="device-detail-group-header">
                <span
                  className="device-detail-group-icon device-detail-group-icon--ops"
                  aria-hidden="true"
                >
                  <Activity size={14} />
                </span>
                <h3 className="device-detail-group-title">C. Thông tin vận hành</h3>
              </div>

              <div className="device-detail-rows">
                <div className="device-detail-item">
                  <span className="device-detail-label">Trạng thái kết nối</span>
                  <div>
                    <DeviceOnlineBadge
                      status={device.health.online_status}
                      lastHeartbeat={lastHeartbeatAt}
                      isBackendColdStart={isEffectiveColdStart}
                    />
                  </div>
                </div>

                <div className="device-detail-item">
                  <span className="device-detail-label">Lô hàng đang gán</span>
                  <div className="device-detail-value">
                    {device.assigned_shipment_id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <Link to={`/shipments/${device.assigned_shipment_id}`}>
                          <Badge variant="info">
                            {device.assigned_shipment_name || device.assigned_shipment_id}
                          </Badge>
                        </Link>
                        <span
                          className="id-copy-inline font-mono"
                          style={{
                            fontSize: '11px',
                            fontWeight: 400,
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          <span
                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={device.assigned_shipment_id}
                          >
                            {device.assigned_shipment_id}
                          </span>
                          <CopyButton value={device.assigned_shipment_id} iconSize={12} />
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
                        Chưa gán lô hàng
                      </span>
                    )}
                  </div>
                </div>

                <div className="device-detail-item">
                  <span className="device-detail-label">Thời điểm nhận dữ liệu gần nhất</span>
                  <span className="device-detail-value tabular-nums">
                    {formatTime(lastSeenAt)}
                  </span>
                  {lastHeartbeatAt && lastHeartbeatAt !== lastSeenAt && (
                    <span className="device-detail-subvalue tabular-nums">
                      Heartbeat: {formatTime(lastHeartbeatAt)}
                    </span>
                  )}
                </div>

                <div className="device-detail-item">
                  <span className="device-detail-label">Sequence bị mất / Mới nhất</span>
                  <div className="device-detail-value tabular-nums">
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        color: hasMissingGap
                          ? 'var(--color-warning)'
                          : device.completeness_status === 'COMPLETE'
                          ? 'var(--color-success)'
                          : 'var(--color-text-secondary)',
                      }}
                    >
                      {missingSeqCount !== null
                        ? `${missingSeqCount} gói bị mất`
                        : 'Chưa xác định'}
                    </span>
                    <span className="device-detail-subvalue" style={{ marginLeft: '8px' }}>
                      (Seq mới nhất: #{device.health.last_sequence_number ?? 'N/A'})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sequence Audit Status */}
          {!lastSeenAt ? (
            <div className="device-audit-box">
              <HelpCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
              <div>
                <div className="device-audit-box-title">Chưa có dữ liệu telemetry</div>
                Thiết bị chưa gửi mẫu tin nào. Trạng thái chữ ký số và tính đầy đủ chuỗi sequence hiện
                đang ở trạng thái <strong>Chưa xác định (UNKNOWN)</strong>.
              </div>
            </div>
          ) : hasMissingGap ? (
            <div className="device-audit-box device-audit-box--warning">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
              <div>
                <div className="device-audit-box-title">
                  Phát hiện mất sequence (DATA_INCOMPLETE)
                </div>
                Tồn tại gián đoạn trong chuỗi sequence telemetry đã nhận (
                {missingSeqCount !== null ? `${missingSeqCount} gói bị thiếu` : 'phát hiện gap'}).
                <div className="device-audit-impact">
                  <strong>Ảnh hưởng bồi thường:</strong> Hệ thống không suy diễn nhiệt độ qua khoảng
                  trống dữ liệu. Lô hàng cần chuỗi bằng chứng hợp lệ liên tục đủ 15 phút để đủ điều
                  kiện chi trả bảo hiểm tự động.
                </div>
              </div>
            </div>
          ) : device.completeness_status === 'COMPLETE' ? (
            <div className="device-audit-box device-audit-box--success">
              <Check size={16} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
              <div>
                <div className="device-audit-box-title">
                  Chuỗi sequence toàn vẹn (Đã đối soát)
                </div>
                Không phát hiện dải mất gói nào giữa các mẫu telemetry ký số đã nhận từ thiết bị này.
              </div>
            </div>
          ) : (
            <div className="device-audit-box">
              <HelpCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
              <div>
                <div className="device-audit-box-title">Chưa rõ tính đầy đủ (UNKNOWN)</div>
                Cần nhận thêm telemetry ký số từ thiết bị để Backend đối soát chuỗi sequence và đánh
                giá tính liên tục.
              </div>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
};
