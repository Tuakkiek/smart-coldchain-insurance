import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { MetricCard } from '../components/data-display/MetricCard';
import { ShipmentStatusBadge, InsuranceStatusBadge } from '../components/data-display/StatusBadge';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/feedback/LoadingState';
import { ErrorState } from '../components/feedback/ErrorState';
import { EmptyState } from '../components/feedback/EmptyState';
import { getShipments } from '../api/shipments';
import { getAllEvents } from '../api/events';
import { getDevices } from '../api/devices';
import { ShipmentOut, EventOut, DeviceItemOut } from '../types/api';
import {
  Package,
  Truck,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  Info,
  Thermometer,
  Cpu,
  Wifi,
  WifiOff,
  ShieldCheck,
} from 'lucide-react';

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState<ShipmentOut[]>([]);
  const [recentEvents, setRecentEvents] = useState<EventOut[]>([]);
  const [devices, setDevices] = useState<DeviceItemOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [shipmentsRes, eventsRes, devicesRes] = await Promise.all([
        getShipments(),
        getAllEvents().catch(() => ({ items: [] })),
        getDevices().catch(() => ({ items: [], total: 0 })),
      ]);
      setShipments(shipmentsRes.items);
      setRecentEvents(eventsRes.items.slice(0, 5));
      setDevices(devicesRes.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return <LoadingState message="Đang nạp dữ liệu bảng điều khiển..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Không thể tải tổng quan"
        message={error}
        onRetry={fetchData}
      />
    );
  }

  const totalShipments = shipments.length;
  const inTransitCount = shipments.filter((s) => s.status === 'in_transit').length;
  const breachCount = shipments.filter((s) => {
    if (!s.latest_telemetry) return false;
    return (
      s.latest_telemetry.temperature_c < s.temp_min_c ||
      s.latest_telemetry.temperature_c > s.temp_max_c
    );
  }).length;
  const triggeredCount = shipments.filter((s) => s.status === 'insurance_triggered').length;

  return (
    <div>
      <PageHeader
        title="Bảng điều khiển Giám sát"
        description="Theo dõi tình trạng chuỗi cung ứng lạnh, telemetry cảm biến và trạng thái bảo hiểm tự động."
        action={
          <Button variant="secondary" size="sm" onClick={fetchData}>
            Làm mới dữ liệu
          </Button>
        }
      />

      {/* Mandatory note from ROADMAP: simulated location notification */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)',
          backgroundColor: 'var(--color-info-soft)',
          color: 'var(--color-info)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-xs)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <Info size={16} />
        <span>
          <strong>Lưu ý kiến trúc:</strong> Tọa độ và tuyến đường là <em>vị trí mô phỏng từ Backend</em>.
          Hệ thống không thu thập GPS trực tiếp từ thiết bị.
        </span>
      </div>

      {/* 4 Metric cards */}
      <div className="metrics-grid">
        <MetricCard
          title="Tổng số lô hàng"
          value={totalShipments}
          subtitle="Tất cả lô hàng đã tạo"
          icon={<Package size={20} />}
        />
        <MetricCard
          title="Đang vận chuyển"
          value={inTransitCount}
          subtitle="Đang nhận telemetry"
          icon={<Truck size={20} />}
          accentColor="var(--color-accent)"
        />
        <MetricCard
          title="Nhiệt độ ngoài ngưỡng"
          value={breachCount}
          subtitle="Cần theo dõi sát"
          icon={<AlertTriangle size={20} />}
          accentColor={breachCount > 0 ? 'var(--color-warning)' : undefined}
        />
        <MetricCard
          title="Kích hoạt bảo hiểm"
          value={triggeredCount}
          subtitle="Vi phạm liên tục > 15 phút"
          icon={<ShieldAlert size={20} />}
          accentColor={triggeredCount > 0 ? 'var(--color-danger)' : undefined}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 'var(--space-6)',
        }}
      >
        {/* Recent Shipments */}
        <Card
          title="Lô hàng đang theo dõi"
          description="Các lô hàng có cập nhật mới nhất"
          action={
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => navigate('/shipments')}
              icon={<ArrowRight size={14} />}
            >
              Xem tất cả
            </Button>
          }
        >
          {shipments.length === 0 ? (
            <EmptyState description="Chưa có lô hàng nào được tạo trong hệ thống." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {shipments.slice(0, 5).map((shipment) => {
                const temp = shipment.latest_telemetry?.temperature_c;
                const isTempBreached =
                  temp !== undefined &&
                  (temp < shipment.temp_min_c || temp > shipment.temp_max_c);

                return (
                  <div
                    key={shipment.id}
                    onClick={() => navigate(`/shipments/${shipment.id}`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border-subtle)',
                      backgroundColor: 'var(--color-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
                      e.currentTarget.style.backgroundColor = 'var(--color-surface)';
                    }}
                  >
                    <div>
                      <div className="flex-row items-center gap-2">
                        <span className="font-mono" style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                          {shipment.code}
                        </span>
                        <ShipmentStatusBadge status={shipment.status} />
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-secondary)',
                          marginTop: '2px',
                        }}
                      >
                        {shipment.cargo_type} • {shipment.origin.name} → {shipment.destination.name}
                      </div>
                    </div>

                    <div className="flex-row items-center gap-4">
                      <div style={{ textAlign: 'right' }}>
                        <div
                          className="tabular-nums"
                          style={{
                            fontSize: 'var(--text-sm)',
                            fontWeight: 600,
                            color: isTempBreached
                              ? 'var(--color-danger)'
                              : 'var(--color-text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '4px',
                          }}
                        >
                          <Thermometer size={14} />
                          {temp !== undefined ? `${temp.toFixed(1)}°C` : 'Chưa có mẫu'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                          Chuẩn: {shipment.temp_min_c} - {shipment.temp_max_c}°C
                        </div>
                      </div>
                      <InsuranceStatusBadge
                        status={shipment.insurance.status}
                        payoutStatus={shipment.insurance.payout_status}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <Card
            title="Cảnh báo gần nhất"
            description="Sự kiện vi phạm & bảo hiểm tự động"
            action={
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => navigate('/events')}
                icon={<ArrowRight size={14} />}
              >
                Xem chi tiết
              </Button>
            }
          >
            {recentEvents.length === 0 ? (
              <div
                style={{
                  padding: 'var(--space-6) var(--space-4)',
                  textAlign: 'center',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                Không có sự kiện vi phạm nào được ghi nhận.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {recentEvents.map((evt) => (
                  <div
                    key={evt.id}
                    style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      borderLeft: `3px solid ${
                        evt.type === 'INSURANCE_TRIGGERED'
                          ? 'var(--color-danger)'
                          : 'var(--color-warning)'
                      }`,
                      backgroundColor: 'var(--color-surface-secondary)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        color:
                          evt.type === 'INSURANCE_TRIGGERED'
                            ? 'var(--color-danger)'
                            : 'var(--color-warning)',
                      }}
                    >
                      {evt.type === 'INSURANCE_TRIGGERED'
                        ? 'KÍCH HOẠT BẢO HIỂM'
                        : evt.type === 'TEMPERATURE_BREACH_STARTED'
                        ? 'PHÁT HIỆN VI PHẠM NHIỆT ĐỘ'
                        : 'MẤT TÍN HIỆU CẢM BIẾN'}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-text-tertiary)',
                        marginTop: '2px',
                      }}
                    >
                      {new Date(evt.occurred_at).toLocaleString('vi-VN')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Device Integrity Quick Status Card */}
          <Card
            title="Tính toàn vẹn Thiết bị ESP32"
            description="Xác thực chữ ký & chuỗi dữ liệu"
            action={
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => navigate('/devices')}
                icon={<ArrowRight size={14} />}
              >
                Quản lý
              </Button>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wifi size={14} style={{ color: 'var(--color-success)' }} /> Thiết bị trực tuyến:
                </span>
                <strong style={{ color: 'var(--color-success)' }}>
                  {devices.filter((d) => d.health.online_status === 'ONLINE').length} / {devices.length}
                </strong>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={14} style={{ color: 'var(--color-success)' }} /> Chữ ký hợp lệ (VALID):
                </span>
                <strong>
                  {devices.filter((d) => d.signature_status === 'VALID').length} / {devices.length}
                </strong>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} /> Cảnh báo mất sequence:
                </span>
                <strong
                  style={{
                    color:
                      devices.filter(
                        (d) =>
                          d.completeness_status === 'DATA_INCOMPLETE' ||
                          d.health.missing_sequence_count > 0
                      ).length > 0
                        ? 'var(--color-warning)'
                        : 'var(--color-text-secondary)',
                  }}
                >
                  {
                    devices.filter(
                      (d) =>
                        d.completeness_status === 'DATA_INCOMPLETE' ||
                        d.health.missing_sequence_count > 0
                    ).length
                  }{' '}
                  thiết bị
                </strong>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

