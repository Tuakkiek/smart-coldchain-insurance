import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, MoreHorizontal, Plus, RefreshCw, Search, Thermometer, Trash2 } from 'lucide-react';
import { ApiError } from '../api/client';
import { getShipmentDevices } from '../api/devices';
import { deleteShipment, getShipments } from '../api/shipments';
import { AssignDeviceModal } from '../components/devices/AssignDeviceModal';
import { EmptyState } from '../components/feedback/EmptyState';
import { ConfirmModal } from '../components/feedback/ConfirmModal';
import { LoadingState } from '../components/feedback/LoadingState';
import { formatApiErrorMessage, isRequestCancelled, useToast } from '../components/feedback/Toast';
import { PageHeader } from '../components/layout/PageHeader';
import { CreateShipmentModal } from '../components/shipments/CreateShipmentModal';
import { InsuranceStatusBadge, ShipmentStatusBadge } from '../components/data-display/StatusBadge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ShipmentDeviceOut, ShipmentOut, ShipmentStatus } from '../types/api';

export const ShipmentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [shipments, setShipments] = useState<ShipmentOut[]>([]);
  const [devicesByShipment, setDevicesByShipment] = useState<Record<string, ShipmentDeviceOut[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignmentShipmentId, setAssignmentShipmentId] = useState<string | null>(null);
  const [shipmentToDelete, setShipmentToDelete] = useState<ShipmentOut | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchShipments = async (background = false, notify = false) => {
    background || hasLoadedOnce ? setRefreshing(true) : setLoading(true);
    setLoadFailed(false);
    try {
      const response = await getShipments();
      setShipments(response.items);
      const assignments = await Promise.allSettled(response.items.map((item) => getShipmentDevices(item.id)));
      setDevicesByShipment(Object.fromEntries(response.items.map((item, index) => [
        item.id,
        assignments[index].status === 'fulfilled' ? assignments[index].value.items : [],
      ])));
      setHasLoadedOnce(true);
      if (notify) toast.success('Danh sách lô hàng đã được cập nhật.');
    } catch (error: unknown) {
      if (isRequestCancelled(error)) return;
      if (!hasLoadedOnce) setLoadFailed(true);
      if (!background || notify) toast.error(formatApiErrorMessage(error, 'Không thể tải danh sách lô hàng.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void fetchShipments(); }, []);

  const filtered = shipments.filter((shipment) => {
    const term = searchTerm.trim().toLowerCase();
    const matchesTerm = !term || [shipment.name, shipment.cargo_type, shipment.origin.name, shipment.destination.name].some((value) => value.toLowerCase().includes(term));
    const matchesStatus = statusFilter === 'all' || shipment.status === (statusFilter as ShipmentStatus);
    return matchesTerm && matchesStatus;
  });

  const confirmDelete = async () => {
    if (!shipmentToDelete || deletingId) return;
    const target = shipmentToDelete;
    setDeletingId(target.id);
    try {
      await deleteShipment(target.id);
      setShipments((current) => current.filter((item) => item.id !== target.id));
      setShipmentToDelete(null);
      toast.success(`Đã xóa ${target.name}.`);
    } catch (error: unknown) {
      setShipmentToDelete(null);
      if (isRequestCancelled(error)) return;
      const message = error instanceof ApiError && error.code === 'SHIPMENT_HAS_ASSIGNED_DEVICES'
        ? 'Lô hàng vẫn còn thiết bị được gán. Hãy tháo thiết bị trước.'
        : error instanceof ApiError && error.code === 'SHIPMENT_HAS_DATA'
          ? 'Không thể xóa lô hàng đã có dữ liệu vận hành hoặc lịch sử đối soát.'
          : formatApiErrorMessage(error, 'Không thể xóa lô hàng.');
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && !hasLoadedOnce) return <LoadingState fullPage message="Đang tải lô hàng..." />;
  if (loadFailed && !hasLoadedOnce) return <><PageHeader title="Lô hàng" /><EmptyState title="Chưa thể tải danh sách" actionText="Thử lại" onAction={() => fetchShipments()} /></>;

  return (
    <div>
      <PageHeader
        title="Lô hàng"
        description="Theo dõi nhanh trạng thái, thiết bị và bảo hiểm."
        action={<div className="flex-row gap-2"><Button size="sm" onClick={() => fetchShipments(true, true)} loading={refreshing} icon={<RefreshCw size={14} />}>Làm mới</Button><Button variant="primary" size="sm" onClick={() => setCreateOpen(true)} icon={<Plus size={15} />}>Tạo lô hàng</Button></div>}
      />

      <div className="filter-bar">
        <label className="search-field">
          <Search size={16} color="var(--color-text-tertiary)" />
          <input aria-label="Tìm lô hàng" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Tìm theo tên, hàng hóa hoặc địa điểm" />
        </label>
        <select className="minimal-select" aria-label="Lọc trạng thái" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="created">Mới tạo</option>
          <option value="in_transit">Đang vận chuyển</option>
          <option value="sensor_data_gap">Mất tín hiệu</option>
          <option value="insurance_triggered">Đã kích hoạt bảo hiểm</option>
        </select>
      </div>

      {filtered.length === 0 ? <EmptyState title="Không tìm thấy lô hàng" description="Thử đổi từ khóa hoặc bộ lọc." actionText="Đặt lại" onAction={() => { setSearchTerm(''); setStatusFilter('all'); }} /> : (
        <Card className="shipment-list" style={{ padding: 0 }}>
          {filtered.map((shipment) => {
            const temperature = shipment.latest_telemetry?.temperature_c;
            const isBreach = temperature !== undefined && (temperature < shipment.temp_min_c || temperature > shipment.temp_max_c);
            const assignedDevices = devicesByShipment[shipment.id] ?? [];
            return (
              <div key={shipment.id} className="shipment-row" role="link" tabIndex={0} onClick={() => navigate(`/shipments/${shipment.id}`)} onKeyDown={(event) => event.key === 'Enter' && navigate(`/shipments/${shipment.id}`)}>
                <div className="shipment-cell">
                  <div className="compact-title">{shipment.name}</div>
                  <div className="compact-meta">{shipment.cargo_type}</div>
                  <div style={{ marginTop: 5 }}><ShipmentStatusBadge status={shipment.status} /></div>
                </div>
                <div className="shipment-cell shipment-device-cell">
                  <div className="compact-label">Thiết bị</div>
                  <div className="compact-meta" style={{ color: 'var(--color-text-primary)' }}>{assignedDevices.length ? assignedDevices.map((device) => device.device_id).join(', ') : 'Chưa gán'}</div>
                </div>
                <div className="shipment-cell">
                  <div className="compact-label">Nhiệt độ</div>
                  <div className="compact-value" style={{ color: isBreach ? 'var(--color-danger)' : undefined, textAlign: 'left' }}><Thermometer size={13} style={{ verticalAlign: -2 }} /> {temperature !== undefined ? `${temperature.toFixed(1)}°C` : 'Chưa có'}</div>
                </div>
                <div className="shipment-cell shipment-insurance-cell"><InsuranceStatusBadge status={shipment.insurance.status} payoutStatus={shipment.insurance.payout_status} /></div>
                <details className="row-menu" onClick={(event) => event.stopPropagation()}>
                  <summary aria-label={`Thao tác với ${shipment.name}`}><MoreHorizontal size={18} /></summary>
                  <div className="row-menu-popover">
                    <button className="row-menu-item" onClick={() => setAssignmentShipmentId(shipment.id)}><Link2 size={15} />Gán / tháo thiết bị</button>
                    <button className="row-menu-item danger" disabled={Boolean(deletingId)} onClick={() => setShipmentToDelete(shipment)}><Trash2 size={15} />Xóa lô hàng</button>
                  </div>
                </details>
              </div>
            );
          })}
        </Card>
      )}

      <CreateShipmentModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onSuccess={(shipment) => { setShipments((current) => [shipment, ...current]); setAssignmentShipmentId(shipment.id); }} />
      <AssignDeviceModal isOpen={assignmentShipmentId !== null} initialShipmentId={assignmentShipmentId} onClose={() => setAssignmentShipmentId(null)} onSuccess={(_device, message) => { toast.success(message); void fetchShipments(true); }} />
      <ConfirmModal isOpen={Boolean(shipmentToDelete)} title="Xóa lô hàng?" message={shipmentToDelete ? <>Bạn sắp xóa <strong>{shipmentToDelete.name}</strong>.</> : null} description="Chỉ lô hàng chưa có thiết bị hoặc dữ liệu vận hành mới có thể xóa. Thao tác này không thể hoàn tác." confirmLabel="Xóa" cancelLabel="Hủy" variant="danger" loading={Boolean(deletingId)} onConfirm={confirmDelete} onCancel={() => !deletingId && setShipmentToDelete(null)} />
    </div>
  );
};
