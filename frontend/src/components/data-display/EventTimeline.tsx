import React from 'react';
import { EventOut, EventType } from '../../types/api';
import { AlertTriangle, ShieldAlert, WifiOff, Clock } from 'lucide-react';
import { Badge } from '../ui/Badge';

interface EventTimelineProps {
  events: EventOut[];
}

export const EventTimeline: React.FC<EventTimelineProps> = ({ events }) => {
  if (events.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--space-6) var(--space-4)',
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: 'var(--text-sm)',
        }}
      >
        Lô hàng đang hoạt động bình thường, chưa có sự kiện vi phạm hoặc cảnh báo nào.
      </div>
    );
  }

  const renderEventDetails = (type: EventType, details: Record<string, any>) => {
    switch (type) {
      case 'TEMPERATURE_BREACH_STARTED':
        return (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
            Nhiệt độ đo được:{' '}
            <strong style={{ color: 'var(--color-danger)' }}>
              {details.temperature_c ?? details.temperature}°C
            </strong>{' '}
            (vượt ngưỡng cam kết {details.temp_min_c}°C – {details.temp_max_c}°C).
          </div>
        );
      case 'INSURANCE_TRIGGERED':
        return (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
            Đã đủ điều kiện kích hoạt bảo hiểm! Vi phạm liên tục{' '}
            <strong style={{ color: 'var(--color-danger)' }}>
              {details.duration_minutes} phút
            </strong>{' '}
            kể từ {details.breach_started_at ? new Date(details.breach_started_at).toLocaleTimeString('vi-VN') : 'khi bắt đầu'}.
          </div>
        );
      case 'SENSOR_DATA_GAP':
        return (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
            Mất tín hiệu cảm biến trong{' '}
            <strong>{details.gap_minutes} phút</strong> (lần cuối nhận mẫu:{' '}
            {details.last_received_at ? new Date(details.last_received_at).toLocaleTimeString('vi-VN') : 'không rõ'}).
          </div>
        );
      default:
        return (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {JSON.stringify(details)}
          </div>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {events.map((evt, idx) => {
        const isTriggered = evt.type === 'INSURANCE_TRIGGERED';
        const isBreach = evt.type === 'TEMPERATURE_BREACH_STARTED';

        const borderColor = isTriggered
          ? 'var(--color-danger)'
          : isBreach
          ? 'var(--color-warning)'
          : 'var(--color-border)';

        const icon = isTriggered ? (
          <ShieldAlert size={18} style={{ color: 'var(--color-danger)' }} />
        ) : isBreach ? (
          <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
        ) : (
          <WifiOff size={18} style={{ color: 'var(--color-neutral)' }} />
        );

        const badge = isTriggered ? (
          <Badge variant="danger">KÍCH HOẠT BẢO HIỂM</Badge>
        ) : isBreach ? (
          <Badge variant="warning">VI PHẠM NHIỆT ĐỘ</Badge>
        ) : (
          <Badge variant="neutral">MẤT DỮ LIỆU CẢM BIẾN</Badge>
        );

        return (
          <div
            key={evt.id || idx}
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              borderLeft: `4px solid ${borderColor}`,
              backgroundColor: 'var(--color-surface-secondary)',
              border: `1px solid var(--color-border-subtle)`,
              borderLeftWidth: '4px',
            }}
          >
            <div style={{ marginTop: '2px' }}>{icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="flex-row items-center justify-between"
                style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1)', flexWrap: 'wrap' }}
              >
                <div className="flex-row items-center gap-2">
                  {badge}
                  <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                    ID: {evt.id}
                  </span>
                </div>
                <div
                  className="flex-row items-center gap-1"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}
                >
                  <Clock size={12} />
                  <span>{new Date(evt.occurred_at).toLocaleString('vi-VN')}</span>
                </div>
              </div>

              <div style={{ marginTop: 'var(--space-2)' }}>
                {renderEventDetails(evt.type, evt.details)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

