import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { LoadingState } from '../components/feedback/LoadingState';
import { ErrorState } from '../components/feedback/ErrorState';
import { EmptyState } from '../components/feedback/EmptyState';
import { getAllEvents } from '../api/events';
import { EventOut, EventType } from '../types/api';
import { BellRing, AlertTriangle, ShieldAlert, WifiOff, ArrowRight } from 'lucide-react';

export const EventsPage: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventOut[]>([]);
  const [filtered, setFiltered] = useState<EventOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllEvents();
      setEvents(data.items);
      setFiltered(data.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi không thể tải danh sách sự kiện');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (filterType === 'all') {
      setFiltered(events);
    } else {
      setFiltered(events.filter((e) => e.type === (filterType as EventType)));
    }
  }, [filterType, events]);

  if (loading) {
    return <LoadingState message="Đang tải dòng sự kiện..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Lỗi tải sự kiện"
        message={error}
        onRetry={fetchEvents}
      />
    );
  }

  const renderEventIcon = (type: EventType) => {
    switch (type) {
      case 'INSURANCE_TRIGGERED':
        return <ShieldAlert size={16} style={{ color: 'var(--color-danger)' }} />;
      case 'TEMPERATURE_BREACH_STARTED':
        return <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />;
      case 'SENSOR_DATA_GAP':
        return <WifiOff size={16} style={{ color: 'var(--color-neutral)' }} />;
    }
  };

  const renderBadge = (type: EventType) => {
    switch (type) {
      case 'INSURANCE_TRIGGERED':
        return <Badge variant="danger">Kích hoạt bảo hiểm</Badge>;
      case 'TEMPERATURE_BREACH_STARTED':
        return <Badge variant="warning">Vi phạm nhiệt độ</Badge>;
      case 'SENSOR_DATA_GAP':
        return <Badge variant="neutral">Mất tín hiệu cảm biến</Badge>;
    }
  };

  return (
    <div>
      <PageHeader
        title="Dòng Sự kiện & Vi phạm"
        description="Ghi nhận tập trung các cảnh báo ngưỡng nhiệt độ và quyết định kích hoạt hợp đồng thông minh."
        action={
          <Button variant="secondary" size="sm" onClick={fetchEvents}>
            Làm mới
          </Button>
        }
      />

      {/* Filter tab */}
      <Card style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4)' }}>
        <div className="flex-row items-center justify-between" style={{ gap: 'var(--space-4)' }}>
          <div className="flex-row items-center gap-2">
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Loại sự kiện:
            </span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-primary)',
              }}
            >
              <option value="all">Tất cả sự kiện ({events.length})</option>
              <option value="TEMPERATURE_BREACH_STARTED">Vi phạm nhiệt độ bắt đầu</option>
              <option value="INSURANCE_TRIGGERED">Kích hoạt bồi thường bảo hiểm</option>
              <option value="SENSOR_DATA_GAP">Mất dữ liệu cảm biến</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Events timeline list */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Không có sự kiện vi phạm"
          description="Chuỗi cung ứng đang hoạt động trong điều kiện an toàn, không có sự kiện bất thường."
          icon={<BellRing size={24} />}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {filtered.map((evt) => (
            <Card key={evt.id} style={{ padding: 'var(--space-4)' }}>
              <div
                className="flex-row items-center justify-between"
                style={{ marginBottom: 'var(--space-2)' }}
              >
                <div className="flex-row items-center gap-2">
                  {renderEventIcon(evt.type)}
                  {renderBadge(evt.type)}
                  <span className="font-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    ID Lô: {evt.shipment_id}
                  </span>
                </div>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                  {new Date(evt.occurred_at).toLocaleString('vi-VN')}
                </span>
              </div>

              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-primary)',
                  marginTop: 'var(--space-2)',
                }}
              >
                {evt.type === 'TEMPERATURE_BREACH_STARTED' && (
                  <div>
                    Nhiệt độ đo được:{' '}
                    <strong style={{ color: 'var(--color-danger)' }}>
                      {(evt.details as any).temperature_c ?? (evt.details as any).temperature}°C
                    </strong>{' '}
                    (vượt ngưỡng cam kết {(evt.details as any).temp_min_c}°C – {(evt.details as any).temp_max_c}°C).
                  </div>
                )}
                {evt.type === 'INSURANCE_TRIGGERED' && (
                  <div>
                    Đã đủ điều kiện kích hoạt bảo hiểm! Vi phạm liên tục{' '}
                    <strong style={{ color: 'var(--color-danger)' }}>
                      {(evt.details as any).duration_minutes} phút
                    </strong>.
                  </div>
                )}
                {evt.type === 'SENSOR_DATA_GAP' && (
                  <div>
                    Mất tín hiệu cảm biến trong {(evt.details as any).gap_minutes} phút.
                  </div>
                )}
                {evt.type !== 'TEMPERATURE_BREACH_STARTED' &&
                  evt.type !== 'INSURANCE_TRIGGERED' &&
                  evt.type !== 'SENSOR_DATA_GAP' && (
                    <span className="font-mono">{JSON.stringify(evt.details)}</span>
                  )}
              </div>

              <div
                className="flex-row items-center justify-between"
                style={{ marginTop: 'var(--space-3)' }}
              >
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                  Event UUID: {evt.id}
                </div>
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={() => navigate(`/shipments/${evt.shipment_id}`)}
                  icon={<ArrowRight size={14} />}
                >
                  Xem lô hàng
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

