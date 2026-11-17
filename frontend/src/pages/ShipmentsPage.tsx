import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ShipmentStatusBadge, InsuranceStatusBadge } from '../components/data-display/StatusBadge';
import { LoadingState } from '../components/feedback/LoadingState';
import { ErrorState } from '../components/feedback/ErrorState';
import { EmptyState } from '../components/feedback/EmptyState';
import { deleteShipment, getShipments } from '../api/shipments';
import { ApiError } from '../api/client';
import { ShipmentOut, ShipmentStatus } from '../types/api';
import { Search, MapPin, Thermometer, Shield, Plus, CheckCircle, ArrowRight, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { CreateShipmentModal } from '../components/shipments/CreateShipmentModal';
import { useToast } from '../components/feedback/Toast';

export const ShipmentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [shipments, setShipments] = useState<ShipmentOut[]>([]);
  const [filtered, setFiltered] = useState<ShipmentOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [successShipment, setSuccessShipment] = useState<ShipmentOut | null>(null);
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState<string | null>(null);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);
  const [deletingShipmentId, setDeletingShipmentId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchShipments = async (isBackground = false) => {
    if (!isBackground && !hasLoadedOnce) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const data = await getShipments();
      setShipments(data.items);
      setFiltered(data.items);
      setHasLoadedOnce(true);
    } catch (err: unknown) {
      if (!isBackground && !hasLoadedOnce) {
        setError(err instanceof Error ? err.message : 'Không thể tải danh sách lô hàng');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleShipmentCreated = (newShipment: ShipmentOut) => {
    setShipments((prev) => [newShipment, ...prev]);
    setSuccessShipment(newShipment);
    toast.success(`Đã tạo thành công lô hàng mới: ${newShipment.code}`, {
      title: 'Tạo lô hàng thành công',
      action: {
        label: 'Xem chi tiết',
        onClick: () => navigate(`/shipments/${newShipment.id}`),
      },
    });
  };

  const handleDeleteShipment = async (shipment: ShipmentOut) => {
    setDeleteSuccessMsg(null);
    setDeleteErrorMsg(null);
    const confirmed = window.confirm(
      `Xóa lô hàng ${shipment.code}? Chỉ lô hàng chưa liên kết thiết bị và chưa có dữ liệu vận hành mới có thể xóa.`
    );
    if (!confirmed) return;

    setDeletingShipmentId(shipment.id);
    try {
      await deleteShipment(shipment.id);
      setShipments((current) => current.filter((item) => item.id !== shipment.id));
      if (successShipment?.id === shipment.id) setSuccessShipment(null);
      const successMsg = `Đã xóa lô hàng ${shipment.code} thành công.`;
      setDeleteSuccessMsg(successMsg);
      toast.success(successMsg, { title: 'Xóa lô hàng thành công' });
    } catch (err: unknown) {
      let msg = '';
      if (err instanceof ApiError && err.code === 'SHIPMENT_HAS_ASSIGNED_DEVICES') {
        msg = `Không thể xóa ${shipment.code}: vẫn còn thiết bị đang liên kết. Hãy bỏ liên kết trong trang Thiết bị trước.`;
      } else if (err instanceof ApiError && err.code === 'SHIPMENT_HAS_DATA') {
        msg = `Không thể xóa ${shipment.code} vì đã có dữ liệu vận hành hoặc lịch sử đối soát.`;
      } else {
        msg = err instanceof Error ? err.message : 'Không thể xóa lô hàng.';
      }
      setDeleteErrorMsg(msg);
      toast.error(msg, { title: 'Lỗi xóa lô hàng' });
    } finally {
      setDeletingShipmentId(null);
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

  if (loading && !hasLoadedOnce) {
    return <LoadingState fullPage message="Đang tải danh sách lô hàng..." />;
  }

  if (error && !hasLoadedOnce) {
    return (
      <ErrorState
        title="Lỗi tải danh sách lô hàng"
        message={error}
        onRetry={() => fetchShipments(false)}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Danh sách Lô hàng Lạnh"
        action={
          <div className="flex-row items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                fetchShipments(true);
                toast.info('Đang làm mới danh sách lô hàng...', { title: 'Làm mới', duration: 2500 });
              }}
              loading={refreshing}
              disabled={loading || refreshing}
              icon={<RefreshCw size={14} />}
            >
              Làm mới
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsCreateModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={16} />
              Tạo Lô Hàng Mới
            </Button>
          </div>
        }
      />

      {/* Success Notification Banner */}
      {successShipment && (
        <div
          style={{
            marginBottom: 'var(--space-5)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-success-soft)',
            border: '1px solid var(--color-success)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div className="flex-row items-center gap-2">
            <CheckCircle size={18} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-success)' }}>
                Đã tạo thành công lô hàng mới: {successShipment.code} ({successShipment.cargo_type})
              </span>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Lộ trình: {successShipment.origin.name} ➔ {successShipment.destination.name} | Nhiệt độ an toàn: {successShipment.temp_min_c}°C đến {successShipment.temp_max_c}°C
              </div>
            </div>
          </div>
          <div className="flex-row items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(`/shipments/${successShipment.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)' }}
            >
              Xem chi tiết <ArrowRight size={14} />
            </Button>
            <button
              onClick={() => setSuccessShipment(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
                padding: '2px 6px',
                fontSize: 'var(--text-sm)',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {deleteSuccessMsg && (
        <div
          style={{
            marginBottom: 'var(--space-5)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-success-soft)',
            border: '1px solid var(--color-success)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}
        >
          <div className="flex-row items-center gap-2">
            <CheckCircle size={18} style={{ color: 'var(--color-success)' }} />
            <span style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
              {deleteSuccessMsg}
            </span>
          </div>
          <button
            onClick={() => setDeleteSuccessMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {deleteErrorMsg && (
        <div
          style={{
            marginBottom: 'var(--space-5)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-danger-soft)',
            border: '1px solid var(--color-danger)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}
        >
          <div className="flex-row items-center gap-2">
            <AlertTriangle size={18} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
            <span style={{ color: 'var(--color-danger)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
              {deleteErrorMsg}
            </span>
          </div>
          <button
            onClick={() => setDeleteErrorMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

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

                  <div className="flex-row items-center gap-2">
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                      Tạo lúc: {new Date(shipment.created_at).toLocaleDateString('vi-VN')}
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={deletingShipmentId === shipment.id}
                      disabled={deletingShipmentId !== null}
                      icon={<Trash2 size={13} />}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteShipment(shipment);
                      }}
                    >
                      Xóa
                    </Button>
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
                    <div style={{ fontSize: '10px', color: '#b45309', marginTop: '1px', fontWeight: 500 }}>
                      (Local/Testnet Token — không phải tiền thật)
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                      Vi phạm liên tục {shipment.violation_duration_minutes} phút
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal Tạo Lô Hàng Mới */}
      <CreateShipmentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleShipmentCreated}
      />
    </div>
  );
};

