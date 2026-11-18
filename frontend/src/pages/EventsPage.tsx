import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BellRing, CheckCircle2, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { getAllEvents } from '../api/events';
import { getShipments } from '../api/shipments';
import { EmptyState } from '../components/feedback/EmptyState';
import { LoadingState } from '../components/feedback/LoadingState';
import { formatApiErrorMessage, isRequestCancelled, useToast } from '../components/feedback/Toast';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EventOut, EventType, ShipmentOut } from '../types/api';

const config: Record<EventType, { title: string; variant: 'danger' | 'warning' | 'neutral'; icon: React.ReactNode }> = {
  INSURANCE_TRIGGERED: { title: 'Bảo hiểm được kích hoạt', variant: 'danger', icon: <ShieldAlert size={17} /> },
  TEMPERATURE_BREACH_STARTED: { title: 'Nhiệt độ vượt ngưỡng', variant: 'warning', icon: <AlertTriangle size={17} /> },
  SENSOR_DATA_GAP: { title: 'Mất tín hiệu cảm biến', variant: 'neutral', icon: <WifiOff size={17} /> },
  SHIPMENT_DELIVERED: { title: 'Đã giao hàng', variant: 'neutral', icon: <CheckCircle2 size={17} /> },
};

const eventMessage = (event: EventOut) => {
  const details = event.details as Record<string, unknown>;
  if (event.type === 'TEMPERATURE_BREACH_STARTED') return `Ghi nhận ${details.temperature_c ?? '—'}°C, ngoài khoảng ${details.temp_min_c ?? '—'}–${details.temp_max_c ?? '—'}°C.`;
  if (event.type === 'INSURANCE_TRIGGERED') return `Điều kiện bảo hiểm được xác nhận sau ${details.duration_minutes ?? '—'} phút vi phạm liên tục.`;
  if (event.type === 'SHIPMENT_DELIVERED') return `Admin xác nhận chuyến hàng đã đến điểm đích (tiến độ ${details.progress_pct ?? 100}%).`;
  return `Không nhận được dữ liệu trong ${details.gap_minutes ?? '—'} phút.`;
};

export const EventsPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [events, setEvents] = useState<EventOut[]>([]);
  const [shipments, setShipments] = useState<ShipmentOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filterType, setFilterType] = useState('all');

  const fetchEvents = async (background = false, notify = false) => {
    background || loaded ? setRefreshing(true) : setLoading(true);
    setLoadFailed(false);
    try {
      const [eventData, shipmentData] = await Promise.all([getAllEvents(), getShipments().catch(() => ({ items: [], total: 0 }))]);
      setEvents(eventData.items);
      setShipments(shipmentData.items);
      setLoaded(true);
      if (notify) toast.success('Dòng sự kiện đã được cập nhật.');
    } catch (error: unknown) {
      if (isRequestCancelled(error)) return;
      if (!loaded) setLoadFailed(true);
      if (!background || notify) toast.error(formatApiErrorMessage(error, 'Không thể tải sự kiện.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void fetchEvents(); }, []);
  const filtered = filterType === 'all' ? events : events.filter((event) => event.type === filterType);
  const shipmentFor = (id: string) => shipments.find((shipment) => shipment.id === id || shipment.shipment_id === id);

  if (loading && !loaded) return <LoadingState fullPage message="Đang tải sự kiện..." />;
  if (loadFailed && !loaded) return <><PageHeader title="Sự kiện" /><EmptyState title="Chưa thể tải sự kiện" actionText="Thử lại" onAction={() => fetchEvents()} icon={<BellRing size={24} />} /></>;

  return (
    <div>
      <PageHeader title="Sự kiện" description="Dòng thời gian các cảnh báo và thay đổi quan trọng." action={<Button size="sm" onClick={() => fetchEvents(true, true)} loading={refreshing} icon={<RefreshCw size={14} />}>Làm mới</Button>} />
      <div className="filter-bar"><select className="minimal-select" value={filterType} onChange={(event) => setFilterType(event.target.value)} aria-label="Lọc loại sự kiện"><option value="all">Tất cả sự kiện ({events.length})</option><option value="TEMPERATURE_BREACH_STARTED">Nhiệt độ vượt ngưỡng</option><option value="INSURANCE_TRIGGERED">Kích hoạt bảo hiểm</option><option value="SENSOR_DATA_GAP">Mất tín hiệu</option><option value="SHIPMENT_DELIVERED">Đã giao hàng</option></select></div>
      {filtered.length === 0 ? <EmptyState title="Không có sự kiện" description="Không có cảnh báo phù hợp với bộ lọc hiện tại." icon={<BellRing size={24} />} /> : (
        <Card style={{ padding: '4px 20px' }}>
          <div className="stack-list">
            {filtered.map((event) => {
              const itemConfig = config[event.type];
              const shipment = shipmentFor(event.shipment_id);
              return <div key={event.id} className="compact-row event-row">
                <div className="compact-icon" style={{ color: itemConfig.variant === 'danger' ? 'var(--color-danger)' : itemConfig.variant === 'warning' ? 'var(--color-warning)' : undefined }}>{itemConfig.icon}</div>
                <div className="compact-main">
                  <div className="flex-row items-center gap-2"><span className="compact-title">{itemConfig.title}</span><Badge variant={itemConfig.variant}>{shipment?.name ?? 'Lô hàng'}</Badge></div>
                  <div className="compact-meta" style={{ whiteSpace: 'normal' }}>{eventMessage(event)}</div>
                  <details className="event-metadata"><summary>Chi tiết kỹ thuật</summary><code>Event: {event.id}</code><code>Shipment: {event.shipment_id}</code></details>
                </div>
                <div className="event-time">{new Date(event.occurred_at).toLocaleString('vi-VN')}</div>
                <Button variant="tertiary" size="sm" onClick={() => navigate(`/shipments/${shipment?.id ?? event.shipment_id}`)} icon={<ArrowRight size={14} />}>Xem lô hàng</Button>
              </div>;
            })}
          </div>
        </Card>
      )}
    </div>
  );
};
