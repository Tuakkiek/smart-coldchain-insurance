import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CopyButton } from '../components/ui/CopyButton';
import { ShipmentStatusBadge, InsuranceStatusBadge } from '../components/data-display/StatusBadge';
import { LoadingState } from '../components/feedback/LoadingState';
import { EmptyState } from '../components/feedback/EmptyState';
import { ConfirmModal } from '../components/feedback/ConfirmModal';
import { deleteShipment, getShipments } from '../api/shipments';
import { ApiError } from '../api/client';
import { ShipmentOut, ShipmentStatus } from '../types/api';
import { Search, MapPin, Thermometer, Shield, Plus, Trash2, RefreshCw, Link2 } from 'lucide-react';
import { CreateShipmentModal } from '../components/shipments/CreateShipmentModal';
import { AssignDeviceModal } from '../components/devices/AssignDeviceModal';
import { formatApiErrorMessage, isRequestCancelled, useToast } from '../components/feedback/Toast';
import { formatInsuranceCoverage, shortenAddress } from '../utils/ethereum';

export const ShipmentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [shipments, setShipments] = useState<ShipmentOut[]>([]);
  const [filtered, setFiltered] = useState<ShipmentOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [assignmentShipmentId, setAssignmentShipmentId] = useState<string | null>(null);
  const [shipmentToDelete, setShipmentToDelete] = useState<ShipmentOut | null>(null);
  const [deletingShipmentId, setDeletingShipmentId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchShipments = async (isBackground = false, notifyManual = false) => {
    if (!isBackground && !hasLoadedOnce) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setLoadFailed(false);
    try {
      const data = await getShipments();
      setShipments(data.items);
      setFiltered(data.items);
      setHasLoadedOnce(true);
      if (notifyManual) {
        toast.success('Đã làm mới danh sách lô hàng.', { title: 'Làm mới thành công' });
      }
    } catch (err: unknown) {
      if (isRequestCancelled(err)) return;
      const msg = formatApiErrorMessage(err, 'Không thể tải danh sách lô hàng. Vui lòng thử lại.');
      if (!hasLoadedOnce) {
        setLoadFailed(true);
      }
      if (msg && (!isBackground || notifyManual)) {
        toast.error(msg, {
          title: 'Lỗi tải danh sách lô hàng',
          dedupKey: 'shipments-fetch-error',
          action: {
            label: 'Thử lại',
            onClick: () => fetchShipments(false),
          },
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleShipmentCreated = (newShipment: ShipmentOut) => {
    setShipments((prev) => [newShipment, ...prev]);
    toast.success(`Đã tạo ${newShipment.name}. Shipment ID: ${newShipment.shipment_id}`, {
      title: 'Tạo lô hàng thành công',
      action: {
        label: 'Gán thiết bị',
        onClick: () => setAssignmentShipmentId(newShipment.id),
      },
    });
  };

  const handleRequestDeleteShipment = (shipment: ShipmentOut) => {
    setShipmentToDelete(shipment);
  };

  const handleConfirmDeleteShipment = async () => {
    if (!shipmentToDelete || deletingShipmentId) return;
    const shipment = shipmentToDelete;

    setDeletingShipmentId(shipment.id);
    try {
      await deleteShipment(shipment.id);
      setShipments((current) => current.filter((item) => item.id !== shipment.id));
      setShipmentToDelete(null);
      toast.success(`Đã xóa lô hàng ${shipment.name} thành công.`, {
        title: 'Xóa lô hàng thành công',
      });
    } catch (err: unknown) {
      setShipmentToDelete(null);
      if (isRequestCancelled(err)) return;
      let msg = '';
      if (err instanceof ApiError && err.code === 'SHIPMENT_HAS_ASSIGNED_DEVICES') {
        msg = `Không thể xóa ${shipment.name}: vẫn còn thiết bị đang liên kết. Hãy bỏ liên kết trong trang Thiết bị trước.`;
      } else if (err instanceof ApiError && err.code === 'SHIPMENT_HAS_DATA') {
        msg = `Không thể xóa ${shipment.name} vì đã có dữ liệu vận hành hoặc lịch sử đối soát.`;
      } else {
        msg = formatApiErrorMessage(err, 'Không thể xóa lô hàng. Vui lòng thử lại.');
      }
      if (msg) {
        toast.error(msg, {
          title: 'Lỗi xóa lô hàng',
          ...(err instanceof ApiError && err.code === 'SHIPMENT_HAS_ASSIGNED_DEVICES'
            ? { action: { label: 'Tháo thiết bị', onClick: () => setAssignmentShipmentId(shipment.id) } }
            : {}),
        });
      }
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
          s.name.toLowerCase().includes(term) ||
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

  if (loadFailed && !hasLoadedOnce) {
    return (
      <div>
        <PageHeader title="Danh sách Lô hàng Lạnh" />
        <EmptyState
          title="Chưa thể tải danh sách lô hàng"
          description="Vui lòng kiểm tra kết nối máy chủ Backend và thử tải lại."
          actionText="Thử lại"
          onAction={() => fetchShipments(false)}
        />
      </div>
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
              onClick={() => fetchShipments(true, true)}
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
              placeholder="Tìm theo tên lô hàng, loại hàng, địa điểm..."
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
            const shipmentId = shipment.shipment_id || shipment.id;
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                    <div className="flex-row items-center gap-3" style={{ flexWrap: 'wrap' }}>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 'var(--text-lg)',
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {shipment.name}
                      </span>
                      <ShipmentStatusBadge status={shipment.status} />
                      <InsuranceStatusBadge
                        status={shipment.insurance.status}
                        payoutStatus={shipment.insurance.payout_status}
                      />
                    </div>
                    <div
                      className="id-copy-inline"
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>ID:</span>
                      <span
                        className="font-mono"
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={shipmentId}
                      >
                        {shipmentId}
                      </span>
                      <CopyButton value={shipmentId} iconSize={12} />
                    </div>
                  </div>

                  <div className="flex-row items-center gap-2">
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                      Tạo lúc: {new Date(shipment.created_at).toLocaleDateString('vi-VN')}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Link2 size={13} />}
                      onClick={(event) => {
                        event.stopPropagation();
                        setAssignmentShipmentId(shipment.id);
                      }}
                    >
                      Gán / tháo thiết bị
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={deletingShipmentId === shipment.id}
                      disabled={deletingShipmentId !== null}
                      icon={<Trash2 size={13} />}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRequestDeleteShipment(shipment);
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
                      <Shield size={12} /> Giá trị bảo hiểm (Coverage)
                    </div>
                    {(() => {
                      const cov = formatInsuranceCoverage(shipment.insurance);
                      const buyerWallet = shipment.buyer_wallet_address || shipment.insurance.buyer_wallet_address;
                      return (
                        <>
                          <div className="tabular-nums font-mono" style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginTop: '2px' }}>
                            {cov.primaryText}
                          </div>
                          <div style={{ fontSize: '10px', color: cov.isEth ? 'var(--color-accent)' : '#b45309', marginTop: '1px', fontWeight: 500 }}>
                            {cov.unitLabel}
                          </div>
                          {buyerWallet && (
                            <div className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }} title={buyerWallet}>
                              Buyer: {shortenAddress(buyerWallet)}
                            </div>
                          )}
                          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                            Vi phạm liên tục {shipment.violation_duration_minutes} phút
                          </div>
                        </>
                      );
                    })()}
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
      <AssignDeviceModal
        isOpen={assignmentShipmentId !== null}
        initialShipmentId={assignmentShipmentId}
        onClose={() => setAssignmentShipmentId(null)}
        onSuccess={(_device, message) => toast.success(message, { title: 'Thiết bị lô hàng' })}
      />

      {/* Modal Xác Nhận Xóa Lô Hàng */}
      <ConfirmModal
        isOpen={Boolean(shipmentToDelete)}
        title="Xác nhận xóa lô hàng"
        message={
          shipmentToDelete ? (
            <>
              Bạn có chắc chắn muốn xóa lô hàng{' '}
              <strong className="font-mono">{shipmentToDelete.name}</strong> không?
            </>
          ) : null
        }
        description="Chỉ lô hàng chưa liên kết thiết bị và chưa có dữ liệu vận hành hoặc lịch sử đối soát mới có thể xóa. Thao tác này không thể hoàn tác."
        confirmLabel={deletingShipmentId ? 'Đang xóa...' : 'Xác nhận'}
        cancelLabel="Hủy"
        variant="danger"
        loading={Boolean(deletingShipmentId)}
        onConfirm={handleConfirmDeleteShipment}
        onCancel={() => {
          if (!deletingShipmentId) setShipmentToDelete(null);
        }}
      />
    </div>
  );
};

