import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ShipmentStatusBadge, InsuranceStatusBadge } from '../components/data-display/StatusBadge';
import { LoadingState } from '../components/feedback/LoadingState';
import { ErrorState } from '../components/feedback/ErrorState';
import { EmptyState } from '../components/feedback/EmptyState';
import { getShipments } from '../api/shipments';
import { ShipmentOut, ShipmentStatus } from '../types/api';
import { Search, MapPin, Thermometer, Shield } from 'lucide-react';

export const ShipmentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState<ShipmentOut[]>([]);
  const [filtered, setFiltered] = useState<ShipmentOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchShipments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getShipments();
      setShipments(data.items);
      setFiltered(data.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách lô hàng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
  }, []);

  useEffect(() => {
    let result = shipments;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          s.code.toLowerCase().includes(term) ||
          s.cargo_type.toLowerCase().includes(term) ||
          s.origin.name.toLowerCase().includes(term) ||
          s.destination.name.toLowerCase().includes(term)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((s) => s.status === (statusFilter as ShipmentStatus));
    }

    setFiltered(result);
  }, [searchTerm, statusFilter, shipments]);

  if (loading) {
    return <LoadingState message="Đang tải danh sách lô hàng..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Lỗi tải danh sách lô hàng"
        message={error}
        onRetry={fetchShipments}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Danh sách Lô hàng Lạnh"
        description="Quản lý và giám sát thời gian thực các lô hàng đang lưu thông trong chuỗi cung ứng."
        action={
          <Button variant="secondary" size="sm" onClick={fetchShipments}>
            Làm mới
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <Card style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4)' }}>
        <div
          className="flex-row items-center justify-between"
          style={{ gap: 'var(--space-4)', flexWrap: 'wrap' }}
        >
          <div
            className="flex-row items-center gap-2"
            style={{
              flex: 1,
              minWidth: '240px',
              backgroundColor: 'var(--color-surface-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 12px',
            }}
          >
            <Search size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            <input
              type="text"
              placeholder="Tìm theo mã lô hàng, loại hàng, địa điểm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                width: '100%',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          <div className="flex-row items-center gap-2">
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Trạng thái:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-primary)',
              }}
            >
              <option value="all">Tất cả ({shipments.length})</option>
              <option value="in_transit">Đang vận chuyển</option>
              <option value="insurance_triggered">Kích hoạt bảo hiểm</option>
              <option value="sensor_data_gap">Mất tín hiệu</option>
              <option value="created">Mới tạo</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Shipment Items List */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Không tìm thấy lô hàng nào"
          description="Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc trạng thái để xem kết quả."
          actionText="Đặt lại bộ lọc"
          onAction={() => {
            setSearchTerm('');
            setStatusFilter('all');
          }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {filtered.map((shipment) => {
            const temp = shipment.latest_telemetry?.temperature_c;
            const isBreach =
              temp !== undefined &&
              (temp < shipment.temp_min_c || temp > shipment.temp_max_c);

            return (
              <Card
                key={shipment.id}
                interactive
                onClick={() => navigate(`/shipments/${shipment.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div
                  className="flex-row items-center justify-between"
                  style={{ gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}
                >
                  <div className="flex-row items-center gap-3">
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 'var(--text-lg)',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {shipment.code}
                    </span>
                    <ShipmentStatusBadge status={shipment.status} />
                    <InsuranceStatusBadge
                      status={shipment.insurance.status}
                      payoutStatus={shipment.insurance.payout_status}
                    />
                  </div>

                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    Tạo lúc: {new Date(shipment.created_at).toLocaleDateString('vi-VN')}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 'var(--space-4)',
                    paddingTop: 'var(--space-3)',
                    borderTop: '1px solid var(--color-border-subtle)',
                  }}
                >
                  {/* Cargo info */}
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                      Loại hàng hóa
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, marginTop: '2px' }}>
                      {shipment.cargo_type}
                    </div>
                  </div>

                  {/* Route */}
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <MapPin size={12} /> Tuyến đường (Mô phỏng)
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', marginTop: '2px' }}>
                      {shipment.origin.name} → {shipment.destination.name}
                    </div>
                    {shipment.location && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                        Tiến độ: {shipment.location.progress_pct.toFixed(0)}%
                      </div>
                    )}
                  </div>

                  {/* Temperature */}
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <Thermometer size={12} /> Nhiệt độ hiện tại
                    </div>
                    <div
                      className="tabular-nums"
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 600,
                        color: isBreach ? 'var(--color-danger)' : 'var(--color-text-primary)',
                        marginTop: '2px',
                      }}
                    >
                      {temp !== undefined ? `${temp.toFixed(1)}°C` : 'Chưa có telemetry'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                      Giới hạn: {shipment.temp_min_c}°C đến {shipment.temp_max_c}°C
                    </div>
                  </div>

                  {/* Insurance Amount */}
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <Shield size={12} /> Mức bồi thường cam kết
                    </div>
                    <div className="tabular-nums" style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginTop: '2px' }}>
                      {shipment.insurance.insured_amount_vnd.toLocaleString('vi-VN')} VND
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                      Vi phạm liên tục {shipment.violation_duration_minutes} phút
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

