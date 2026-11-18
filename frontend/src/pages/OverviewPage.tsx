import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Package, RefreshCw, ShieldAlert, Thermometer, Truck } from 'lucide-react';
import { getDevices } from '../api/devices';
import { getAllEvents } from '../api/events';
import { getShipments } from '../api/shipments';
import { MetricCard } from '../components/data-display/MetricCard';
import { InsuranceStatusBadge, ShipmentStatusBadge } from '../components/data-display/StatusBadge';
import { EmptyState } from '../components/feedback/EmptyState';
import { LoadingState } from '../components/feedback/LoadingState';
import { formatApiErrorMessage, isRequestCancelled, useToast } from '../components/feedback/Toast';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DeviceItemOut, EventOut, ShipmentOut } from '../types/api';

const eventTitle: Record<string, string> = {
  INSURANCE_TRIGGERED: 'Bảo hiểm đã được kích hoạt',
  TEMPERATURE_BREACH_STARTED: 'Nhiệt độ vượt ngưỡng',
  SENSOR_DATA_GAP: 'Mất tín hiệu cảm biến',
};

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [shipments, setShipments] = useState<ShipmentOut[]>([]);
  const [events, setEvents] = useState<EventOut[]>([]);
  const [devices, setDevices] = useState<DeviceItemOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchData = async (background = false, notify = false) => {
    background || hasLoadedOnce ? setRefreshing(true) : setLoading(true);
    setLoadFailed(false);
    try {
      const [shipmentData, eventData, deviceData] = await Promise.all([
        getShipments(),
        getAllEvents().catch(() => ({ items: [] })),
        getDevices().catch(() => ({ items: [], total: 0 })),
      ]);
      setShipments(shipmentData.items);
      setEvents(eventData.items);
      setDevices(deviceData.items);
      setHasLoadedOnce(true);
      if (notify) toast.success('Dữ liệu tổng quan đã được cập nhật.');
    } catch (error: unknown) {
      if (isRequestCancelled(error)) return;
      if (!hasLoadedOnce) setLoadFailed(true);
      if (!background || notify) toast.error(formatApiErrorMessage(error, 'Không thể tải dữ liệu tổng quan.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void fetchData(); }, []);

  const deviceStatus = useMemo(
    () => new Map(devices.map((device) => [device.device_id, device.health?.online_status])),
    [devices],
  );
  const triggeredShipments = useMemo(
    () => new Set(events.filter((event) => event.type === 'INSURANCE_TRIGGERED').map((event) => event.shipment_id)).size,
    [events],
  );

  if (loading && !hasLoadedOnce) return <LoadingState fullPage message="Đang tải tổng quan..." />;
  if (loadFailed && !hasLoadedOnce) {
    return <><PageHeader title="Tổng quan" /><EmptyState title="Chưa thể tải dữ liệu" description="Kiểm tra kết nối Backend rồi thử lại." actionText="Thử lại" onAction={() => fetchData()} /></>;
  }

  const inTransit = shipments.filter((shipment) => shipment.status === 'in_transit').length;
  const breached = shipments.filter((shipment) => {
    const value = shipment.latest_telemetry?.temperature_c;
    return value !== undefined && (value < shipment.temp_min_c || value > shipment.temp_max_c);
  }).length;

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        description="Tình trạng vận hành cần chú ý ngay lúc này."
        action={<Button size="sm" onClick={() => fetchData(true, true)} loading={refreshing} icon={<RefreshCw size={14} />}>Làm mới</Button>}
      />

      <div className="metrics-grid">
        <MetricCard title="Tổng lô hàng" value={shipments.length} icon={<Package size={20} />} />
        <MetricCard title="Đang vận chuyển" value={inTransit} icon={<Truck size={20} />} accentColor="var(--color-accent)" />
        <MetricCard title="Ngoài ngưỡng" value={breached} icon={<AlertTriangle size={20} />} accentColor={breached ? 'var(--color-warning)' : undefined} />
        <MetricCard title="Đã kích hoạt bảo hiểm" value={triggeredShipments} icon={<ShieldAlert size={20} />} accentColor={triggeredShipments ? 'var(--color-danger)' : undefined} />
      </div>

      <div className="dashboard-grid">
        <Card title="Lô hàng gần đây" action={<Button variant="tertiary" size="sm" onClick={() => navigate('/shipments')} icon={<ArrowRight size={14} />}>Xem tất cả</Button>}>
          {shipments.length === 0 ? <EmptyState description="Chưa có lô hàng." /> : (
            <div className="stack-list">
              {shipments.slice(0, 5).map((shipment) => {
                const telemetry = shipment.latest_telemetry;
                const temperature = telemetry?.temperature_c;
                const isBreach = temperature !== undefined && (temperature < shipment.temp_min_c || temperature > shipment.temp_max_c);
                const onlineStatus = telemetry?.device_id ? deviceStatus.get(telemetry.device_id) : undefined;
                const isStale = onlineStatus === 'OFFLINE';
                return (
                  <div key={shipment.id} className="compact-row compact-row-clickable" role="link" tabIndex={0} onClick={() => navigate(`/shipments/${shipment.id}`)} onKeyDown={(event) => event.key === 'Enter' && navigate(`/shipments/${shipment.id}`)}>
                    <div className="compact-main">
                      <div className="flex-row items-center gap-2"><span className="compact-title">{shipment.name}</span><ShipmentStatusBadge status={shipment.status} /></div>
                      <div className="compact-meta">{shipment.origin.name} → {shipment.destination.name}</div>
                    </div>
                    <div className="compact-value" style={{ color: isBreach ? 'var(--color-danger)' : undefined }}>
                      <div className="flex-row items-center gap-1"><Thermometer size={14} />{temperature !== undefined ? `${temperature.toFixed(1)}°C` : 'Chưa có dữ liệu'}</div>
                      {isStale && <div style={{ color: 'var(--color-warning)', fontSize: 11, fontWeight: 500 }}>Dữ liệu cũ · thiết bị offline</div>}
                    </div>
                    <InsuranceStatusBadge status={shipment.insurance.status} payoutStatus={shipment.insurance.payout_status} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Cảnh báo gần đây" action={<Button variant="tertiary" size="sm" onClick={() => navigate('/events')} icon={<ArrowRight size={14} />}>Xem tất cả</Button>}>
          {events.length === 0 ? <EmptyState description="Không có cảnh báo mới." /> : (
            <div className="stack-list">
              {events.slice(0, 3).map((event) => {
                const shipment = shipments.find((item) => item.id === event.shipment_id || item.shipment_id === event.shipment_id);
                return (
                  <div key={event.id} className="compact-row">
                    <div className="compact-icon" style={{ color: event.type === 'INSURANCE_TRIGGERED' ? 'var(--color-danger)' : 'var(--color-warning)' }}><AlertTriangle size={17} /></div>
                    <div className="compact-main">
                      <div className="compact-title">{eventTitle[event.type] ?? 'Sự kiện hệ thống'}</div>
                      <div className="compact-meta">{shipment?.name ?? 'Lô hàng'} · {new Date(event.occurred_at).toLocaleString('vi-VN')}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
