import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/feedback/LoadingState';
import { ErrorState } from '../components/feedback/ErrorState';
import { useBackendConnectionState } from '../components/feedback/ConnectionStatus';
import { getDevices } from '../api/devices';
import { DeviceItemOut } from '../types/api';
import { ApiError } from '../api/client';
import { AssignDeviceModal } from '../components/devices/AssignDeviceModal';
import { AdminDeviceDetailModal } from '../components/devices/AdminDeviceDetailModal';
import { DeviceStatsGrid } from '../components/devices/DeviceStatsGrid';
import { DeviceFilterToolbar } from '../components/devices/DeviceFilterToolbar';
import { DeviceListSection } from '../components/devices/DeviceListSection';
import { DeviceDetailPanel } from '../components/devices/DeviceDetailPanel';
import { formatApiErrorMessage, isRequestCancelled, useToast } from '../components/feedback/Toast';
import { RefreshCw, Link2 } from 'lucide-react';
import '../styles/devices.css';

export const DevicesPage: React.FC = () => {
  const { toast } = useToast();
  const backendConnectionState = useBackendConnectionState();
  const [devices, setDevices] = useState<DeviceItemOut[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string>('');
  const [isColdStart, setIsColdStart] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Admin modals
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignModalDeviceId, setAssignModalDeviceId] = useState<string | null>(null);
  const [isAdminDetailModalOpen, setIsAdminDetailModalOpen] = useState(false);
  const [adminModalDeviceId, setAdminModalDeviceId] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [signatureFilter, setSignatureFilter] = useState<string>('all');

  const isMountedRef = useRef(true);
  const wasStaleRef = useRef(false);
  const hasInitializedSelectionRef = useRef(false);

  // Determine if backend is experiencing cold start
  const isEffectiveColdStart =
    isColdStart || backendConnectionState === 'COLD_START';

  const fetchDevicesList = useCallback(
    async (isBackground = false, notifyManual = false) => {
      if (!isBackground) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setIsColdStart(false);

      try {
        const res = await getDevices();
        if (isMountedRef.current) {
          setDevices(res.items);
          setLoadFailed(false);
          setLoadErrorMessage('');
          wasStaleRef.current = false;

          setSelectedDeviceId((prev) => {
            if (prev && res.items.some((d) => d.device_id === prev)) {
              return prev;
            }
            if (!hasInitializedSelectionRef.current && res.items.length > 0) {
              hasInitializedSelectionRef.current = true;
              return res.items[0].device_id;
            }
            return null;
          });

          if (notifyManual) {
            toast.success('Đã cập nhật danh sách thiết bị ESP32.', {
              title: 'Làm mới thành công',
            });
          }
        }
      } catch (err: unknown) {
        if (isRequestCancelled(err)) return;
        if (isMountedRef.current) {
          const coldStart = err instanceof ApiError && !!err.isBackendColdStart;
          setIsColdStart(coldStart);
          const msg = formatApiErrorMessage(
            err,
            'Không thể tải danh sách thiết bị ESP32. Vui lòng thử lại.'
          );

          if (!isBackground) {
            setLoadFailed(true);
            setLoadErrorMessage(msg);
            if (coldStart) {
              toast.warning(msg, {
                title: 'Backend đang khởi động',
                dedupKey: 'devices-cold-start',
                action: { label: 'Thử lại', onClick: () => fetchDevicesList(false) },
              });
            } else if (msg) {
              toast.error(msg, {
                title: 'Lỗi tải danh sách thiết bị',
                dedupKey: 'devices-fetch-error',
                action: { label: 'Thử lại', onClick: () => fetchDevicesList(false) },
              });
            }
          } else if (notifyManual) {
            if (msg) {
              toast.error(msg, { title: 'Lỗi làm mới thiết bị' });
            }
          } else if (!wasStaleRef.current) {
            wasStaleRef.current = true;
            toast.warning(
              'Đồng bộ dữ liệu thiết bị tự động tạm thời gián đoạn. Đang hiển thị dữ liệu gần nhất.',
              {
                title: 'Chưa cập nhật dữ liệu mới',
                dedupKey: 'devices-polling-error',
                action: { label: 'Thử lại', onClick: () => fetchDevicesList(true, true) },
              }
            );
          }
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [toast]
  );

  useEffect(() => {
    isMountedRef.current = true;
    fetchDevicesList();

    let timer: ReturnType<typeof setInterval> | null = null;
    if (autoRefresh) {
      timer = setInterval(() => {
        fetchDevicesList(true);
      }, 10000);
    }

    return () => {
      isMountedRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, [autoRefresh, fetchDevicesList]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setSignatureFilter('all');
  };

  const hasActiveFilters =
    searchTerm.trim() !== '' || statusFilter !== 'all' || signatureFilter !== 'all';

  // Filtered devices
  const normalizedQuery = searchTerm.trim().toLowerCase();
  const filteredDevices = devices.filter((d) => {
    const matchSearch =
      normalizedQuery === '' ||
      d.device_id.toLowerCase().includes(normalizedQuery) ||
      (d.device_name && d.device_name.toLowerCase().includes(normalizedQuery)) ||
      d.firmware_version.toLowerCase().includes(normalizedQuery) ||
      (d.assigned_shipment_name &&
        d.assigned_shipment_name.toLowerCase().includes(normalizedQuery)) ||
      (d.assigned_shipment_id &&
        d.assigned_shipment_id.toLowerCase().includes(normalizedQuery)) ||
      d.key_id.toLowerCase().includes(normalizedQuery);

    const matchStatus =
      statusFilter === 'all' || d.health.online_status === statusFilter;
    const matchSignature =
      signatureFilter === 'all' || d.signature_status === signatureFilter;

    return matchSearch && matchStatus && matchSignature;
  });

  const selectedDevice = devices.find((d) => d.device_id === selectedDeviceId) ?? null;

  // Calculate statistics
  const totalCount = devices.length;
  const assignedCount = devices.filter((d) => Boolean(d.assigned_shipment_id)).length;
  const onlineCount = devices.filter((d) => d.health.online_status === 'ONLINE').length;
  const offlineCount = devices.filter((d) => d.health.online_status === 'OFFLINE').length;
  const validSigCount = devices.filter((d) => d.signature_status === 'VALID').length;
  const invalidSigCount = devices.filter((d) => d.signature_status === 'INVALID').length;
  const unknownKeyCount = devices.filter((d) => d.signature_status === 'UNKNOWN_KEY').length;
  const gapCount = devices.filter(
    (d) =>
      d.completeness_status === 'DATA_INCOMPLETE' ||
      (d.health.missing_sequence_count ?? 0) > 0
  ).length;
  const totalMissingPackets = devices.reduce(
    (sum, d) => sum + (d.health.missing_sequence_count || 0),
    0
  );

  if (loading && devices.length === 0) {
    return (
      <LoadingState
        fullPage
        message="Đang nạp dữ liệu xác thực và tình trạng thiết bị ESP32..."
      />
    );
  }

  return (
    <div className="devices-page">
      {/* 1. Page Header & Actions */}
      <PageHeader
        title="Quản lý Thiết bị ESP32 & Toàn vẹn Phần cứng"
        description="Theo dõi trạng thái kết nối, khóa công khai ECDSA P-256, chữ ký số và tính liên tục dữ liệu thiết bị."
        action={
          <div className="devices-header-actions">
            <label className="devices-autorefresh-toggle">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span>Tự động làm mới (10s)</span>
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchDevicesList(true, true)}
              loading={refreshing}
              disabled={loading || refreshing}
              icon={<RefreshCw size={14} />}
            >
              Làm mới
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setAssignModalDeviceId(selectedDeviceId || null);
                setIsAssignModalOpen(true);
              }}
              icon={<Link2 size={14} />}
            >
              Liên kết chuyến hàng
            </Button>
          </div>
        }
      />

      <p className="text-sm text-secondary">Sử dụng 10 thiết bị cố định: ESP32-01 đến ESP32-10. Chọn thiết bị để liên kết với lô hàng.</p>

      {loadFailed && devices.length === 0 ? (
        <ErrorState
          title="Không thể tải danh sách thiết bị ESP32"
          message={
            loadErrorMessage ||
            'Đã xảy ra lỗi khi kết nối tới Backend. Vui lòng kiểm tra kết nối và thử lại.'
          }
          onRetry={() => fetchDevicesList(false)}
          retrying={loading || refreshing}
        />
      ) : (
        <>
          {/* 2. Overview Stat Cards */}
          <DeviceStatsGrid
            totalCount={totalCount}
            assignedCount={assignedCount}
            onlineCount={onlineCount}
            offlineCount={offlineCount}
            validSigCount={validSigCount}
            invalidSigCount={invalidSigCount}
            unknownKeyCount={unknownKeyCount}
            gapCount={gapCount}
            totalMissingPackets={totalMissingPackets}
            backendConnectionState={backendConnectionState}
            isEffectiveColdStart={isEffectiveColdStart}
          />

          {/* 3. Unified Search & Filter Toolbar */}
          <DeviceFilterToolbar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            signatureFilter={signatureFilter}
            onSignatureFilterChange={setSignatureFilter}
            onResetFilters={handleResetFilters}
            hasActiveFilters={hasActiveFilters}
          />

          {/* 4. Device List */}
          <DeviceListSection
            devices={filteredDevices}
            totalCount={totalCount}
            selectedDeviceId={selectedDeviceId}
            isEffectiveColdStart={isEffectiveColdStart}
            hasActiveFilters={hasActiveFilters}
            onSelectDevice={(deviceId) => {
              hasInitializedSelectionRef.current = true;
              setSelectedDeviceId(deviceId);
            }}
            onAssignDevice={(deviceId) => {
              setAssignModalDeviceId(deviceId);
              setIsAssignModalOpen(true);
            }}
            onResetFilters={handleResetFilters}
          />

          {/* 5. Selected Device Detail Panel */}
          <DeviceDetailPanel
            device={selectedDevice}
            isEffectiveColdStart={isEffectiveColdStart}
            onOpenAdminDetail={(deviceId) => {
              setAdminModalDeviceId(deviceId);
              setIsAdminDetailModalOpen(true);
            }}
            onAssignDevice={(deviceId) => {
              setAssignModalDeviceId(deviceId);
              setIsAssignModalOpen(true);
            }}
            onClearSelection={() => {
              hasInitializedSelectionRef.current = true;
              setSelectedDeviceId(null);
            }}
          />
        </>
      )}

      {/* Admin Modals */}
      <AssignDeviceModal
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false);
          setAssignModalDeviceId(null);
        }}
        initialDeviceId={assignModalDeviceId}
        onSuccess={(_res, msg) => {
          toast.success(msg, { title: 'Liên kết thiết bị' });
          fetchDevicesList(true);
        }}
      />

      <AdminDeviceDetailModal
        deviceId={adminModalDeviceId}
        isOpen={isAdminDetailModalOpen}
        onClose={() => {
          setIsAdminDetailModalOpen(false);
          setAdminModalDeviceId(null);
        }}
      />

    </div>
  );
};
