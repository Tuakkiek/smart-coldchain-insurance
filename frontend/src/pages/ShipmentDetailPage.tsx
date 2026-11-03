import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
  ShipmentStatusBadge,
  InsuranceStatusBadge,
  BlockchainBadge,
} from '../components/data-display/StatusBadge';
import { LoadingState } from '../components/feedback/LoadingState';
import { ErrorState } from '../components/feedback/ErrorState';
import { getShipmentById, getShipmentTelemetry } from '../api/shipments';
import { getShipmentEvents } from '../api/events';
import { ShipmentOut, TelemetryOut, EventOut } from '../types/api';
import {
  ArrowLeft,
  MapPin,
  Thermometer,
  Shield,
  Clock,
  Layers,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

export const ShipmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [shipment, setShipment] = useState<ShipmentOut | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryOut[]>([]);
  const [events, setEvents] = useState<EventOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [shipmentData, telemetryData, eventsData] = await Promise.all([
        getShipmentById(id),
        getShipmentTelemetry(id).catch(() => ({ items: [] })),
        getShipmentEvents(id).catch(() => ({ items: [] })),
      ]);
      setShipment(shipmentData);
      setTelemetry(telemetryData.items);
      setEvents(eventsData.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi tải chi tiết lô hàng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <LoadingState message="Đang nạp chi tiết lô hàng..." />;
  }

  if (error || !shipment) {
    return (
      <ErrorState
        title="Không tìm thấy lô hàng"
        message={error || 'Lô hàng không tồn tại trong hệ thống'}
        onRetry={fetchData}
      />
    );
  }

  const temp = shipment.latest_telemetry?.temperature_c;
  const isBreach =
    temp !== undefined &&
    (temp < shipment.temp_min_c || temp > shipment.temp_max_c);

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Button
          variant="tertiary"
          size="sm"
          onClick={() => navigate('/shipments')}
          icon={<ArrowLeft size={16} />}
        >
          Quay lại danh sách
        </Button>
      </div>

      <PageHeader
        title={`Lô hàng: ${shipment.code}`}
        description={`${shipment.cargo_type} • ID: ${shipment.id}`}
        action={
          <div className="flex-row items-center gap-2">
            <ShipmentStatusBadge status={shipment.status} />
            <InsuranceStatusBadge
              status={shipment.insurance.status}
              payoutStatus={shipment.insurance.payout_status}
            />
          </div>
        }
      />

      {/* Mandatory simulated location banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-secondary)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <MapPin size={16} style={{ color: 'var(--color-accent)' }} />
        <span>
          <strong>Vị trí mô phỏng từ Backend:</strong> Toàn bộ tọa độ được tính toán nội suy từ{' '}
          <strong>{shipment.origin.name}</strong> đến <strong>{shipment.destination.name}</strong> dựa trên số mẫu đo.
        </span>
      </div>

      {/* Grid of Key Properties */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-6)',
        }}
      >
        {/* Telemetry card */}
        <Card title="Cảm biến Nhiệt độ / Độ ẩm">
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div
              className="tabular-nums"
              style={{
                fontSize: 'var(--text-3xl)',
                fontWeight: 600,
                color: isBreach ? 'var(--color-danger)' : 'var(--color-text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Thermometer size={28} />
              {temp !== undefined ? `${temp.toFixed(1)}°C` : 'Chưa có mẫu'}
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                marginTop: 'var(--space-2)',
              }}
            >
              Ngưỡng cam kết: {shipment.temp_min_c}°C đến {shipment.temp_max_c}°C
            </div>
            {shipment.latest_telemetry && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--color-text-tertiary)',
                  marginTop: 'var(--space-1)',
                }}
              >
                Độ ẩm: {shipment.latest_telemetry.humidity_pct.toFixed(1)}% • Thiết bị:{' '}
                {shipment.latest_telemetry.device_id}
              </div>
            )}
          </div>
        </Card>

        {/* Route card */}
        <Card title="Hành trình vận chuyển (Mô phỏng)">
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
              {shipment.origin.name}
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-tertiary)',
                margin: '2px 0 6px 0',
              }}
            >
              ({shipment.origin.latitude.toFixed(4)}, {shipment.origin.longitude.toFixed(4)})
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-accent)',
                fontWeight: 600,
                marginBottom: '6px',
              }}
            >
              ↓ Tuyến đường mô phỏng (Tiến độ: {shipment.location ? `${shipment.location.progress_pct.toFixed(0)}%` : '0%'})
            </div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
              {shipment.destination.name}
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-tertiary)',
                marginTop: '2px',
              }}
            >
              ({shipment.destination.latitude.toFixed(4)}, {shipment.destination.longitude.toFixed(4)})
            </div>
          </div>
        </Card>

        {/* Insurance details */}
        <Card title="Hợp đồng bảo hiểm">
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Mức bồi thường cam kết
            </div>
            <div
              className="tabular-nums"
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginTop: '2px',
              }}
            >
              {shipment.insurance.insured_amount_vnd.toLocaleString('vi-VN')} VND
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                marginTop: 'var(--space-2)',
              }}
            >
              Điều kiện vi phạm: Vượt ngưỡng liên tục {shipment.violation_duration_minutes} phút
            </div>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <InsuranceStatusBadge
                status={shipment.insurance.status}
                payoutStatus={shipment.insurance.payout_status}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Blockchain Status section */}
      <Card
        title="Trạng thái Smart Contract & Blockchain"
        description="Bằng chứng bồi thường được ghi nhận bất biến trên mạng Blockchain"
        style={{ marginBottom: 'var(--space-6)' }}
      >
        {shipment.blockchain ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div className="flex-row items-center gap-3">
              <BlockchainBadge status={shipment.blockchain.confirmation_status} />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                Mạng: <strong>{shipment.blockchain.network}</strong>
              </span>
            </div>

            {shipment.blockchain.transaction_hash && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                    Mã giao dịch (Transaction Hash)
                  </div>
                  <div
                    className="font-mono"
                    style={{
                      fontSize: 'var(--text-xs)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--color-text-primary)',
                      marginTop: '2px',
                    }}
                  >
                    {shipment.blockchain.transaction_hash}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(shipment.blockchain?.transaction_hash || '')}
                  icon={copied ? <Check size={14} /> : <Copy size={14} />}
                >
                  {copied ? 'Đã chép' : 'Sao chép'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--color-surface-secondary)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-sm)',
            }}
          >
            Chưa có giao dịch Blockchain nào được tạo. Giao dịch bồi thường sẽ được tự động kích hoạt
            bởi Backend qua Smart Contract khi thời lượng vi phạm vượt quá {shipment.violation_duration_minutes} phút.
          </div>
        )}
      </Card>

      {/* Telemetry samples & Event Timeline */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-6)',
        }}
      >
        {/* Telemetry records */}
        <Card
          title="Lịch sử Mẫu Cảm biến"
          description={`Tổng cộng: ${telemetry.length} bản ghi telemetry`}
        >
          {telemetry.length === 0 ? (
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
              Chưa có dữ liệu cảm biến nào từ thiết bị.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      textAlign: 'left',
                      color: 'var(--color-text-secondary)',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    <th style={{ padding: '8px 4px' }}>Thời gian nhận</th>
                    <th style={{ padding: '8px 4px' }}>Nhiệt độ</th>
                    <th style={{ padding: '8px 4px' }}>Độ ẩm</th>
                    <th style={{ padding: '8px 4px' }}>Tiến độ</th>
                  </tr>
                </thead>
                <tbody>
                  {telemetry.slice(-10).map((tel) => {
                    const isSampleBreach =
                      tel.temperature_c < shipment.temp_min_c ||
                      tel.temperature_c > shipment.temp_max_c;

                    return (
                      <tr
                        key={tel.id}
                        style={{
                          borderBottom: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        <td style={{ padding: '8px 4px', fontSize: 'var(--text-xs)' }}>
                          {new Date(tel.received_at).toLocaleTimeString('vi-VN')}
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            padding: '8px 4px',
                            fontWeight: 600,
                            color: isSampleBreach ? 'var(--color-danger)' : 'var(--color-text-primary)',
                          }}
                        >
                          {tel.temperature_c.toFixed(1)}°C
                        </td>
                        <td className="tabular-nums" style={{ padding: '8px 4px' }}>
                          {tel.humidity_pct.toFixed(1)}%
                        </td>
                        <td className="tabular-nums" style={{ padding: '8px 4px', fontSize: 'var(--text-xs)' }}>
                          {tel.location.progress_pct.toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Event Timeline */}
        <Card
          title="Dòng Sự kiện Nghiệp vụ"
          description="Lịch sử vi phạm và kích hoạt bồi thường"
        >
          {events.length === 0 ? (
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
              Không có sự kiện vi phạm hoặc gián đoạn nào. Lô hàng hoạt động bình thường.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {events.map((evt) => (
                <div
                  key={evt.id}
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-subtle)',
                    backgroundColor: 'var(--color-surface)',
                  }}
                >
                  <div className="flex-row items-center justify-between">
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        color:
                          evt.type === 'INSURANCE_TRIGGERED'
                            ? 'var(--color-danger)'
                            : 'var(--color-warning)',
                      }}
                    >
                      {evt.type}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                      {new Date(evt.occurred_at).toLocaleTimeString('vi-VN')}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-secondary)',
                      marginTop: '4px',
                    }}
                  >
                    Chi tiết: {JSON.stringify(evt.details)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

