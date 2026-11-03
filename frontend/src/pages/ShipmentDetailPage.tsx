import React, { useEffect, useState, useRef } from 'react';
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
import { SimulatedRouteMap } from '../components/data-display/SimulatedRouteMap';
import { TelemetryChart } from '../components/data-display/TelemetryChart';
import { EventTimeline } from '../components/data-display/EventTimeline';
import { getShipmentById, getShipmentTelemetry } from '../api/shipments';
import { getShipmentEvents } from '../api/events';
import { ShipmentOut, TelemetryOut, EventOut } from '../types/api';
import {
  ArrowLeft,
  MapPin,
  Thermometer,
  Shield,
  Clock,
  RefreshCw,
  Copy,
  Check,
  Activity,
  Layers,
} from 'lucide-react';

export const ShipmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [shipment, setShipment] = useState<ShipmentOut | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryOut[]>([]);
  const [events, setEvents] = useState<EventOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const isMountedRef = useRef(true);

  const fetchData = async (isBackground = false) => {
    if (!id) return;
    if (!isBackground) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const [shipmentData, telemetryData, eventsData] = await Promise.all([
        getShipmentById(id),
        getShipmentTelemetry(id).catch(() => ({ items: [] })),
        getShipmentEvents(id).catch(() => ({ items: [] })),
      ]);
      if (isMountedRef.current) {
        setShipment(shipmentData);
        setTelemetry(telemetryData.items);
        setEvents(eventsData.items);
      }
    } catch (err: unknown) {
      if (isMountedRef.current && !isBackground) {
        setError(err instanceof Error ? err.message : 'Lỗi tải chi tiết lô hàng');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();

    // Auto-polling every 6 seconds as required by Phase 5
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchData(true);
      }, 6000);
    }

    return () => {
      isMountedRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [id, autoRefresh]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <LoadingState message="Đang nạp chi tiết lô hàng và bản đồ tuyến đường..." />;
  }

  if (error || !shipment) {
    return (
      <ErrorState
        title="Không tìm thấy lô hàng"
        message={error || 'Lô hàng không tồn tại trong hệ thống'}
        onRetry={() => fetchData(false)}
      />
    );
  }

  const temp = shipment.latest_telemetry?.temperature_c;
  const isBreach =
    temp !== undefined &&
    (temp < shipment.temp_min_c || temp > shipment.temp_max_c);

  return (
    <div>
      {/* Top back button & controls */}
      <div
        className="flex-row items-center justify-between"
        style={{ marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}
      >
        <Button
          variant="tertiary"
          size="sm"
          onClick={() => navigate('/shipments')}
          icon={<ArrowLeft size={16} />}
        >
          Quay lại danh sách
        </Button>

        <div className="flex-row items-center gap-3">
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Tự động cập nhật (6s)</span>
          </label>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchData(true)}
            loading={refreshing}
            icon={<RefreshCw size={14} />}
          >
            Làm mới
          </Button>
        </div>
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

      {/* Grid of Key Properties */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-6)',
        }}
      >
        {/* Telemetry quick card */}
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
              Ngưỡng cam kết: <strong>{shipment.temp_min_c}°C – {shipment.temp_max_c}°C</strong>
            </div>
            {shipment.latest_telemetry && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--color-text-tertiary)',
                  marginTop: 'var(--space-1)',
                }}
              >
                Độ ẩm: <strong>{shipment.latest_telemetry.humidity_pct.toFixed(1)}%</strong> • Thiết bị:{' '}
                {shipment.latest_telemetry.device_id}
              </div>
            )}
          </div>
        </Card>

        {/* Route info card */}
        <Card title="Tuyến vận chuyển">
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {shipment.origin.name}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', margin: '2px 0 6px 0' }}>
              ({shipment.origin.latitude.toFixed(4)}, {shipment.origin.longitude.toFixed(4)})
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', fontWeight: 600, marginBottom: '6px' }}>
              ↓ Tuyến đường mô phỏng (Tiến độ: {shipment.location ? `${shipment.location.progress_pct.toFixed(0)}%` : '0%'})
            </div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {shipment.destination.name}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
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
              Điều kiện vi phạm: Vượt ngưỡng liên tục <strong>{shipment.violation_duration_minutes} phút</strong>
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

      {/* PHASE 3: INTERACTIVE LEAFLET MAP PANEL */}
      <Card
        title="Bản đồ Lộ trình Tuyến xe (Mô phỏng)"
        description="Vị trí xe và tiến độ hành trình được tính toán nội suy từ dữ liệu mẫu cảm biến Backend."
        style={{ marginBottom: 'var(--space-6)' }}
      >
        <SimulatedRouteMap
          origin={shipment.origin}
          destination={shipment.destination}
          currentLocation={shipment.location}
          height="380px"
        />
      </Card>

      {/* PHASE 3: TELEMETRY CHART */}
      <Card
        title="Biểu đồ Biến thiên Nhiệt độ & Độ ẩm"
        description="Lịch sử các lần gửi mẫu từ cảm biến kèm hai đường giới hạn an toàn."
        style={{ marginBottom: 'var(--space-6)' }}
      >
        <TelemetryChart
          telemetry={telemetry}
          tempMinC={shipment.temp_min_c}
          tempMaxC={shipment.temp_max_c}
        />
      </Card>

      {/* Blockchain Status section */}
      <Card
        title="Trạng thái Smart Contract & Blockchain"
        description="Bằng chứng bồi thường tự động được ghi nhận bất biến trên mạng Blockchain."
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

      {/* Bottom 2 columns: Event Timeline & Telemetry Table */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-6)',
        }}
      >
        {/* Event Timeline */}
        <Card
          title="Dòng Thời gian Sự kiện (Events Timeline)"
          description="Các cảnh báo vi phạm và trạng thái kích hoạt bảo hiểm"
        >
          <EventTimeline events={events} />
        </Card>

        {/* Telemetry records table */}
        <Card
          title="Bảng Mẫu Cảm biến Gần nhất"
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
                  {telemetry.slice(-10).reverse().map((tel) => {
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
      </div>
    </div>
  );
};
