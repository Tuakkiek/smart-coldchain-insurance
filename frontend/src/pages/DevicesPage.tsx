import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { MetricCard } from '../components/data-display/MetricCard';
import {
  SignatureStatusBadge,
  DeviceOnlineBadge,
  CompletenessBadge,
} from '../components/data-display/StatusBadge';
import {
  BackendStatusAlert,
  IntegrityPrincipleNotice,
} from '../components/feedback/BackendStatusAlert';
import { LoadingState } from '../components/feedback/LoadingState';
import { EmptyState } from '../components/feedback/EmptyState';
import { useBackendConnectionState } from '../components/feedback/ConnectionStatus';
import { getDevices } from '../api/devices';
import {
  DeviceItemOut,
} from '../types/api';
import { ApiError } from '../api/client';
import { RegisterDeviceModal } from '../components/devices/RegisterDeviceModal';
import { AssignDeviceModal } from '../components/devices/AssignDeviceModal';
import { AdminDeviceDetailModal } from '../components/devices/AdminDeviceDetailModal';
import {
  Cpu,
  KeyRound,
  ShieldCheck,
  AlertTriangle,
  Wifi,
  WifiOff,
  Copy,
  Check,
  RefreshCw,
  Search,
  ChevronRight,
  ShieldAlert,
  Server,
  HelpCircle,
  ExternalLink,
  Plus,
  CheckCircle2,
  Link2,
  Unlink,
} from 'lucide-react';

export const DevicesPage: React.FC = () => {
  const backendConnectionState = useBackendConnectionState();
  const [devices, setDevices] = useState<DeviceItemOut[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isColdStart, setIsColdStart] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [staleError, setStaleError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Admin modals
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignModalDeviceId, setAssignModalDeviceId] = useState<string | null>(null);
  const [isAdminDetailModalOpen, setIsAdminDetailModalOpen] = useState(false);
  const [adminModalDeviceId, setAdminModalDeviceId] = useState<string | null>(null);
  const [adminSuccessMsg, setAdminSuccessMsg] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [signatureFilter, setSignatureFilter] = useState<string>('all');

  const isMountedRef = useRef(true);

  // Determine if backend is experiencing cold start
  const isEffectiveColdStart =
    isColdStart || backendConnectionState === 'COLD_START';

  const fetchDevicesList = async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true);
      setError(null);
    } else {
      setRefreshing(true);
    }
    setIsColdStart(false);

    try {
      const res = await getDevices();
      if (isMountedRef.current) {
        setDevices(res.items);
        setIsStale(false);
        setStaleError(null);
        if (!selectedDeviceId && res.items.length > 0) {
          setSelectedDeviceId(res.items[0].device_id);
        }
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        if (!isBackground) {
          if (err instanceof ApiError) {
            setIsColdStart(!!err.isBackendColdStart);
            setError(err.message);
          } else {
            setError(
              err instanceof Error
                ? err.message
                : 'Lỗi không xác định khi tải danh sách thiết bị'
            );
          }
        } else {
          setIsStale(true);
          setStaleError(
            err instanceof Error ? err.message : 'Lỗi kết nối khi polling dữ liệu thiết bị'
          );
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchDevicesList();

    let timer: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      timer = setInterval(() => {
        fetchDevicesList(true);
      }, 10000);
    }

    return () => {
      isMountedRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, [autoRefresh]);

  const copyPublicKey = (pem?: string) => {
    if (!pem) return;
    navigator.clipboard.writeText(pem);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const copyKeyId = (keyId: string) => {
    navigator.clipboard.writeText(keyId);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const selectedDevice = devices.find((d) => d.device_id === selectedDeviceId);

  // Format timestamp helper
  const formatTime = (ts: string | null) => {
    if (!ts) return 'Chưa ghi nhận';
    try {
      const d = new Date(ts);
      return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN')}`;
    } catch {
      return ts;
    }
  };

  // Filtered devices
  const filteredDevices = devices.filter((d) => {
    const matchSearch =
      d.device_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.firmware_version.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.assigned_shipment_code &&
        d.assigned_shipment_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
      d.key_id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchStatus =
      statusFilter === 'all' || d.health.online_status === statusFilter;
    const matchSignature =
      signatureFilter === 'all' || d.signature_status === signatureFilter;

    return matchSearch && matchStatus && matchSignature;
  });

  // Calculate statistics
  const totalCount = devices.length;
  const onlineCount = devices.filter((d) => d.health.online_status === 'ONLINE').length;
  const offlineCount = devices.filter((d) => d.health.online_status === 'OFFLINE').length;
  const validSigCount = devices.filter((d) => d.signature_status === 'VALID').length;
  const invalidSigCount = devices.filter((d) => d.signature_status === 'INVALID').length;
  const unknownKeyCount = devices.filter((d) => d.signature_status === 'UNKNOWN_KEY').length;
  const gapCount = devices.filter(
    (d) => d.completeness_status === 'DATA_INCOMPLETE' || (d.health.missing_sequence_count ?? 0) > 0
  ).length;
  const totalMissingPackets = devices.reduce(
    (sum, d) => sum + (d.health.missing_sequence_count || 0),
    0
  );

  if (loading && devices.length === 0) {
    return <LoadingState message="Đang nạp dữ liệu xác thực và tình trạng thiết bị ESP32..." />;
  }

  return (
    <div>
      <PageHeader
        title="Quản lý Thiết bị ESP32 & Toàn vẹn Phần cứng"
        description="Kiểm soát danh tính phần cứng, chữ ký số ECDSA P-256, sequence number, heartbeat và dải mất gói tin (gap ranges)."
        action={
          <div className="flex-row items-center gap-3">
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Tự động làm mới (10s)
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchDevicesList(false)}
              disabled={loading || refreshing}
              icon={
                <RefreshCw
                  size={14}
                  className={loading || refreshing ? 'animate-spin' : undefined}
                />
              }
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
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsRegisterModalOpen(true)}
              icon={<Plus size={14} />}
            >
              Đăng ký thiết bị (Admin)
            </Button>
          </div>
        }
      />

      {/* Admin action success banner */}
      {adminSuccessMsg && (
        <div
          style={{
            marginBottom: 'var(--space-4)',
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
            <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)', fontWeight: 600 }}>
              {adminSuccessMsg}
            </span>
          </div>
          <button
            onClick={() => setAdminSuccessMsg(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              fontSize: 'var(--text-sm)',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Backend Cold Start vs Device Offline Alert */}
      <BackendStatusAlert
        isColdStart={isEffectiveColdStart}
        errorMessage={error}
        onRetry={() => fetchDevicesList(false)}
        retrying={loading}
      />

      {/* Stale Polling Warning Banner */}
      {isStale && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-4)',
            backgroundColor: '#FFFBEB',
            border: '1px solid #FCD34D',
            borderRadius: 'var(--radius-md)',
            color: '#92400E',
            fontSize: 'var(--text-xs)',
            marginBottom: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            ⚠️ <strong>Dữ liệu chưa cập nhật:</strong> Quá trình polling nền gặp sự cố ({staleError}). Đang hiển thị danh sách thiết bị từ lần tải gần nhất.
          </span>
          <Button size="sm" variant="secondary" onClick={() => fetchDevicesList(false)}>
            Thử lại ngay
          </Button>
        </div>
      )}

      {/* Mandatory principle notice from Roadmap §3.3 */}
      <IntegrityPrincipleNotice />

      {/* Banner Quy trình Admin tối giản dùng chung */}
      <div
        style={{
          marginBottom: 'var(--space-5)',
          padding: 'var(--space-4) var(--space-5)',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: 'var(--space-2)',
          }}
        >
          <ShieldCheck size={18} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
            Quy trình Admin tối giản dùng chung:
          </span>
        </div>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.7,
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>1. Admin đăng ký thiết bị</span> (chỉ cần device_id & device_name) →{' '}
          <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>2. Admin đăng ký chuyến hàng</span> (nhập mã SHIP-001 vào code, Backend sinh ID UUID v4) →{' '}
          <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>3. Liên kết thiết bị với chuyến hàng</span> (1 assignment active/device, đổi chuyến bằng bỏ gán cũ rồi gán mới) →{' '}
          <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>4. Cấp khóa cho ESP32 ngoài browser</span> (Script Python NTK tạo cặp P-256 trên máy tin cậy → nạp USB → nạp SPKI public key qua API Admin) →{' '}
          <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>5. ESP32 ký ECDSA P-256 & gửi telemetry</span> →{' '}
          <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>6. Backend xác minh Public Key & sequence</span> →{' '}
          <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>7. Lưu MySQL</span> →{' '}
          <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>8. Bằng chứng Merkle & Neo Blockchain</span> →{' '}
          <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>9. Oracle xử lý bảo hiểm tự động</span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <MetricCard
          title="Tổng số thiết bị"
          value={totalCount}
          icon={<Cpu size={20} />}
          subtitle="Đã đăng ký hệ thống"
        />
        <MetricCard
          title="Thiết bị Online"
          value={isEffectiveColdStart ? 'Chờ Backend' : onlineCount}
          icon={<Wifi size={20} />}
          subtitle={isEffectiveColdStart ? 'Đang spin-up Render' : `${offlineCount} thiết bị offline`}
          accentColor={isEffectiveColdStart ? 'var(--color-warning)' : 'var(--color-success)'}
        />
        <MetricCard
          title="Chữ ký Hợp lệ (VALID)"
          value={validSigCount}
          icon={<ShieldCheck size={20} />}
          subtitle={`${invalidSigCount} lỗi / ${unknownKeyCount} khóa lạ`}
          accentColor="var(--color-success)"
        />
        <MetricCard
          title="Thiết bị mất gói (Gap)"
          value={gapCount}
          icon={<AlertTriangle size={20} />}
          subtitle={`Tổng ${totalMissingPackets} sequence bị mất`}
          accentColor={gapCount > 0 ? 'var(--color-warning)' : undefined}
        />
        <MetricCard
          title="Trạng thái Backend"
          value={
            backendConnectionState === 'MOCK'
              ? 'Mock Mode'
              : backendConnectionState === 'COLD_START' || isColdStart
              ? 'Cold Start (~30s)'
              : backendConnectionState === 'ONLINE'
              ? 'Online'
              : 'Offline'
          }
          icon={<Server size={20} />}
          subtitle="Độc lập với trạng thái ESP32"
          accentColor={
            backendConnectionState === 'ONLINE'
              ? 'var(--color-success)'
              : backendConnectionState === 'COLD_START' || isColdStart
              ? 'var(--color-warning)'
              : undefined
          }
        />
      </div>

      {/* Filter and Search Bar */}
      <Card style={{ marginBottom: 'var(--space-5)', padding: 'var(--space-4)' }}>
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
              borderRadius: 'var(--radius-md)',
              padding: '0 var(--space-3)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Search size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            <input
              type="text"
              placeholder="Tìm theo Device ID, Firmware, Public Key ID, Lô hàng..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: 'var(--space-2) 0',
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          <div className="flex-row items-center gap-3" style={{ flexWrap: 'wrap' }}>
            <div className="flex-row items-center gap-2">
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                Trạng thái ESP32:
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="ONLINE">ONLINE (Trực tuyến)</option>
                <option value="OFFLINE">OFFLINE (Ngoại tuyến)</option>
                <option value="DEGRADED">DEGRADED (Chập chờn)</option>
              </select>
            </div>

            <div className="flex-row items-center gap-2">
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                Chữ ký:
              </span>
              <select
                value={signatureFilter}
                onChange={(e) => setSignatureFilter(e.target.value)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              >
                <option value="all">Tất cả chữ ký</option>
                <option value="VALID">Chữ ký Hợp lệ (VALID)</option>
                <option value="INVALID">Chữ ký Sai (INVALID)</option>
                <option value="UNKNOWN_KEY">Khóa Chưa Đăng Ký (UNKNOWN_KEY)</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Layout: Master Table (Left) + Detail Panel (Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selectedDevice ? '1.35fr 1fr' : '1fr',
          gap: 'var(--space-6)',
          alignItems: 'start',
        }}
      >
        {/* Devices Table */}
        <Card style={{ overflow: 'hidden', padding: 0 }}>
          <div
            style={{
              padding: 'var(--space-4) var(--space-5)',
              borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>
              Danh sách Thiết bị ESP32 ({filteredDevices.length})
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Chọn thiết bị để xem bảng theo dõi Sequence & Dải mất gói
            </div>
          </div>

          {filteredDevices.length === 0 ? (
            <div style={{ padding: 'var(--space-6)' }}>
              <EmptyState
                title="Không tìm thấy thiết bị"
                description="Không có thiết bị ESP32 nào phù hợp với bộ lọc hiện tại."
              />
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 'var(--text-sm)',
                  textAlign: 'left',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--color-border-subtle)',
                      backgroundColor: 'var(--color-surface-secondary)',
                      color: 'var(--color-text-secondary)',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Thiết Bị (ID / Tên)</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Trạng thái Public Key</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Chuyến hiện gán</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Chữ ký số</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Trạng thái ESP32</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Sequence</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Độ đầy đủ</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((dev) => {
                    const isSelected = selectedDeviceId === dev.device_id;
                    const hasKey =
                      dev.has_public_key ||
                      Boolean(dev.public_key_pem) ||
                      Boolean(dev.key_id && dev.key_id.length > 0);

                    return (
                      <tr
                        key={dev.id}
                        onClick={() => setSelectedDeviceId(dev.device_id)}
                        style={{
                          borderBottom: '1px solid var(--color-border-subtle)',
                          cursor: 'pointer',
                          backgroundColor: isSelected
                            ? 'var(--color-surface-secondary)'
                            : 'transparent',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        {/* Device ID and Device Name */}
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: 'var(--color-text-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <Cpu size={14} style={{ color: 'var(--color-accent)' }} />
                            <span>{dev.device_id}</span>
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--color-text-secondary)',
                              marginLeft: '20px',
                              marginTop: '1px',
                            }}
                          >
                            {dev.device_name || 'Cold Chain Sensor'}
                          </div>
                        </td>

                        {/* Public Key Status */}
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          {hasKey ? (
                            <div title="has_public_key=true: Đã cấp public key trên MySQL. Lưu ý: Không đồng nghĩa đã flash thành công vào ESP32 hoặc đã có dữ liệu hợp lệ.">
                              <Badge
                                variant="success"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                }}
                              >
                                <Check size={11} /> Đã có Public Key
                              </Badge>
                            </div>
                          ) : (
                            <div title="Chưa cấp Public Key SPKI PEM. Cần nạp USB bằng script Python của NTK trên máy tin cậy.">
                              <Badge
                                variant="warning"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                }}
                              >
                                <AlertTriangle size={11} /> Chưa cấp Public Key
                              </Badge>
                            </div>
                          )}
                        </td>

                        {/* Assigned Shipment */}
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          {dev.assigned_shipment_code ? (
                            <Link
                              to={`/shipments/${dev.assigned_shipment_id}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: 'var(--text-xs)',
                                fontWeight: 500,
                              }}
                            >
                              <Badge variant="info">{dev.assigned_shipment_code}</Badge>
                            </Link>
                          ) : (
                            <span
                              style={{
                                color: 'var(--color-text-tertiary)',
                                fontSize: 'var(--text-xs)',
                                fontStyle: 'italic',
                              }}
                            >
                              Chưa gán
                            </span>
                          )}
                        </td>

                        {/* Signature Status */}
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          <SignatureStatusBadge status={dev.signature_status} />
                        </td>

                        {/* Device Online Status */}
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          <DeviceOnlineBadge
                            status={dev.health.online_status}
                            lastHeartbeat={dev.health.last_heartbeat_at}
                            isBackendColdStart={isEffectiveColdStart}
                          />
                        </td>

                        {/* Current Sequence Number */}
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          <div
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              color: 'var(--color-text-primary)',
                            }}
                          >
                            #{dev.health.last_sequence_number ?? 'N/A'}
                          </div>
                        </td>

                        {/* Completeness / Missing Sequence Count */}
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          <CompletenessBadge
                            status={dev.completeness_status}
                            missingCount={dev.health.missing_sequence_count ?? undefined}
                          />
                        </td>

                        {/* Action buttons */}
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          <div
                            className="flex-row items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setAssignModalDeviceId(dev.device_id);
                                setIsAssignModalOpen(true);
                              }}
                              style={{
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '3px 8px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                color: 'var(--color-accent)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                whiteSpace: 'nowrap',
                              }}
                              title="Liên kết hoặc đổi chuyến hàng cho thiết bị này"
                            >
                              <Link2 size={12} />
                              <span>{dev.assigned_shipment_id ? 'Đổi chuyến' : 'Gán chuyến'}</span>
                            </button>
                            <ChevronRight
                              size={16}
                              style={{
                                color: isSelected
                                  ? 'var(--color-accent)'
                                  : 'var(--color-text-tertiary)',
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Selected Device Details Panel */}
        {selectedDevice && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {/* Identity & Cryptography Card */}
            <Card>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    Định danh Phần cứng & Chữ ký
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xl)',
                      fontWeight: 700,
                      color: 'var(--color-text-primary)',
                      marginTop: '2px',
                    }}
                  >
                    {selectedDevice.device_id}
                  </div>
                </div>
                <SignatureStatusBadge status={selectedDevice.signature_status} />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--space-3)',
                  marginBottom: 'var(--space-4)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <div>
                  <div style={{ color: 'var(--color-text-tertiary)' }}>Mã Khóa (Key ID)</div>
                  <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                    {selectedDevice.key_id}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-tertiary)' }}>Phiên bản Firmware</div>
                  <div style={{ fontWeight: 600 }}>{selectedDevice.firmware_version}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-tertiary)' }}>Thuật toán mật mã</div>
                  <div style={{ fontWeight: 600 }}>ECDSA P-256 (secp256r1)</div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-tertiary)' }}>Lô hàng đang gán</div>
                  <div style={{ fontWeight: 600 }}>
                    {selectedDevice.assigned_shipment_code ? (
                      <Link to={`/shipments/${selectedDevice.assigned_shipment_id}`}>
                        {selectedDevice.assigned_shipment_code}
                      </Link>
                    ) : (
                      'Chưa gán'
                    )}
                  </div>
                </div>
              </div>

              {/* Public Key Display (Explicit disclaimer: NO PRIVATE KEY) */}
              <div
                style={{
                  backgroundColor: 'var(--color-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <KeyRound size={12} /> Khóa công khai SPKI (Public Key)
                  </span>
                  {selectedDevice.public_key_pem && (
                    <button
                      onClick={() => copyPublicKey(selectedDevice.public_key_pem)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--color-accent)',
                        fontSize: 'var(--text-xs)',
                        cursor: 'pointer',
                      }}
                    >
                      {copiedKey ? <Check size={12} /> : <Copy size={12} />}
                      {copiedKey ? 'Đã sao chép' : 'Sao chép'}
                    </button>
                  )}
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: 'var(--color-text-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: '80px',
                    overflowY: 'auto',
                  }}
                >
                  {selectedDevice.public_key_pem || 'Không có chứng chỉ SPKI công khai'}
                </pre>
                <div
                  style={{
                    fontSize: '11px',
                    color: '#65a30d',
                    marginTop: 'var(--space-2)',
                    fontWeight: 500,
                  }}
                >
                  🔒 An toàn: Khóa riêng tư (Private Key) được lưu độc quyền trong Secure Storage của
                  ESP32 và không bao giờ xuất hiện trên API hoặc giao diện.
                </div>
              </div>

              {/* Button to open Admin View */}
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAdminModalDeviceId(selectedDevice.device_id);
                    setIsAdminDetailModalOpen(true);
                  }}
                  icon={<ShieldCheck size={14} />}
                  style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--text-xs)' }}
                >
                  Xem chi tiết quản trị thiết bị →
                </Button>
              </div>
            </Card>

            {/* BẢNG THEO DÕI SEQUENCE NUMBER, HEARTBEAT, MISSING SEQUENCE VÀ DẢI MẤT GÓI */}
            <Card>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>
                    Bảng theo dõi Sequence & Dải mất gói (Gap Ranges)
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    Thiết bị: {selectedDevice.device_id}
                  </div>
                </div>
                <CompletenessBadge
                  status={selectedDevice.completeness_status}
                  missingCount={selectedDevice.health.missing_sequence_count ?? undefined}
                />
              </div>

              {/* 4-Item Sequence & Heartbeat Summary Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 'var(--space-3)',
                  marginBottom: 'var(--space-5)',
                }}
              >
                <div
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-surface-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                    Sequence Number mới nhất
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xl)',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      marginTop: '2px',
                    }}
                  >
                    #{selectedDevice.health.last_sequence_number ?? '0'}
                  </div>
                </div>

                <div
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-surface-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                    Missing Sequence Count
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xl)',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      marginTop: '2px',
                      color:
                        (selectedDevice.missing_sequence_count ?? selectedDevice.health?.missing_sequence_count) !== null &&
                        (selectedDevice.missing_sequence_count ?? selectedDevice.health?.missing_sequence_count) !== undefined &&
                        (selectedDevice.missing_sequence_count ?? selectedDevice.health?.missing_sequence_count)! > 0
                          ? 'var(--color-warning)'
                          : selectedDevice.completeness_status === 'COMPLETE'
                          ? 'var(--color-success)'
                          : 'var(--color-text-secondary)',
                    }}
                  >
                    {(selectedDevice.missing_sequence_count ?? selectedDevice.health?.missing_sequence_count) !== null &&
                    (selectedDevice.missing_sequence_count ?? selectedDevice.health?.missing_sequence_count) !== undefined
                      ? `${selectedDevice.missing_sequence_count ?? selectedDevice.health?.missing_sequence_count} gói`
                      : 'Chưa xác định'}
                  </div>
                </div>

                <div
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-surface-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                    Nhịp tim (Heartbeat) cuối
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, marginTop: '4px' }}>
                    {formatTime(selectedDevice.health?.last_heartbeat_at)}
                  </div>
                </div>

                <div
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-surface-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                    Gói tin cuối (Last Seen)
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, marginTop: '4px' }}>
                    {formatTime(selectedDevice.last_seen_at ?? selectedDevice.health?.last_seen_at)}
                  </div>
                </div>
              </div>

              {/* THEO DÕI TÍNH TOÀN VẸN CHUỖI SEQUENCE (SEQUENCE GAP AUDIT) */}
              <div>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    marginBottom: 'var(--space-2)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Tình trạng chuỗi sequence & tính đầy đủ dữ liệu (Backend Sequence Audit):
                </div>

                {!selectedDevice.last_seen_at && !selectedDevice.health?.last_seen_at ? (
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      backgroundColor: 'var(--color-surface-secondary)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <HelpCircle size={18} style={{ color: 'var(--color-text-tertiary)' }} />
                    <div>
                      <strong>Chưa có dữ liệu telemetry:</strong> Thiết bị chưa gửi mẫu tin nào. Trạng thái chữ ký và tính đầy đủ sequence hiện là <em>Chưa xác định (UNKNOWN)</em>.
                    </div>
                  </div>
                ) : selectedDevice.completeness_status === 'DATA_INCOMPLETE' ||
                  ((selectedDevice.missing_sequence_count ?? selectedDevice.health?.missing_sequence_count) &&
                    (selectedDevice.missing_sequence_count ?? selectedDevice.health?.missing_sequence_count)! > 0) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <div
                      style={{
                        padding: 'var(--space-4)',
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-xs)',
                        color: '#b45309',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 'var(--space-3)',
                      }}
                    >
                      <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong>Phát hiện mất sequence (DATA_INCOMPLETE):</strong> Tồn tại gián đoạn trong chuỗi sequence telemetry đã nhận ({selectedDevice.missing_sequence_count ?? selectedDevice.health?.missing_sequence_count ?? 'có'} gói bị thiếu).
                      </div>
                    </div>

                    {/* Impact on 15-Minute Continuous Breach Rule */}
                    <div
                      style={{
                        padding: 'var(--space-3)',
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fee2e2',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '11px',
                        color: '#991b1b',
                        lineHeight: 1.5,
                      }}
                    >
                      <strong>Đánh giá ảnh hưởng bồi thường:</strong> Dải sequence bị thiếu ngắt quãng chuỗi đo liên tục (`DATA_INCOMPLETE`). Theo quy định Backend và Hợp đồng Bảo hiểm, hệ thống <em>không suy diễn nhiệt độ qua khoảng trống dữ liệu</em>. Lô hàng sẽ không đủ điều kiện chi trả bảo hiểm tự động cho đến khi có bằng chứng hợp lệ liên tục đủ 15 phút.
                    </div>
                  </div>
                ) : selectedDevice.completeness_status === 'COMPLETE' ? (
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #dcfce7',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      color: '#15803d',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <Check size={18} />
                    <div>
                      <strong>Chuỗi sequence toàn vẹn (Đã đối soát):</strong> Không phát hiện dải mất gói nào giữa các mẫu telemetry của thiết bị này.
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      backgroundColor: 'var(--color-surface-secondary)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <HelpCircle size={18} style={{ color: 'var(--color-text-tertiary)' }} />
                    <div>
                      <strong>Chưa rõ tính đầy đủ (UNKNOWN):</strong> Cần nhận thêm telemetry ký số để đối soát dải sequence và đánh giá tính liên tục.
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Distinction Guide: Device Offline vs Backend Cold Start */}
      <Card style={{ marginTop: 'var(--space-6)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <HelpCircle size={18} style={{ color: 'var(--color-accent)' }} />
          <div style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>
            Bảng đối chiếu phân biệt: Thiết bị ESP32 Offline vs Backend Cold Start (Render)
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--text-xs)',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--color-surface-secondary)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <th style={{ padding: 'var(--space-3)' }}>Tình huống</th>
                <th style={{ padding: 'var(--space-3)' }}>Nguồn gốc & Bản chất</th>
                <th style={{ padding: 'var(--space-3)' }}>Ý nghĩa trên Giao diện</th>
                <th style={{ padding: 'var(--space-3)' }}>Cách xử lý</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <td style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'var(--color-warning)' }}>
                  Render Cold Start
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  Máy chủ FastAPI trên Render (Free Tier) tạm dừng sau 15 phút không có request. Đang spin-up (~30-50s).
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  Hiển thị banner <strong>Render Cold Start</strong>. Trạng thái thiết bị giữ nguyên hoặc hiển thị <em>Chờ Backend</em>, KHÔNG đánh dấu thiết bị ngoại vi offline.
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  Đợi 30 giây máy chủ thức giấc hoặc bấm nút chuyển sang Mock Data Mode.
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <td style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'var(--color-danger)' }}>
                  ESP32 Device Offline
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  Máy chủ Backend vẫn hoạt động tốt, nhưng thiết bị ESP32 ngoại vi mất nguồn hoặc mất sóng WiFi không gửi heartbeat &gt; 120 giây.
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  Badge thiết bị chuyển sang <strong>OFFLINE</strong>. Backend ghi nhận sự kiện mất tín hiệu (`SENSOR_DATA_GAP`).
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  Kiểm tra nguồn điện phần cứng, ăng-ten hoặc cấu hình WiFi của mạch ESP32.
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <td style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'var(--color-info)' }}>
                  Sequence Gap (Mất gói)
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  Thiết bị ESP32 vẫn online nhưng một số gói tin bị rơi trên đường truyền mạng hoặc hàng đợi NVS bị tràn.
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  Badge <strong>Mất chuỗi (Sequence gap)</strong> và hiển thị dải sequence bị thiếu trong bảng theo dõi dải mất gói.
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  Đối soát trong bảng dải mất gói. Chuỗi vi phạm 15 phút bị ngắt quãng.
                </td>
              </tr>
              <tr>
                <td style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'var(--color-danger)' }}>
                  Chữ ký Sai (INVALID)
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  Payload bị sửa đổi hoặc thiết bị sử dụng Private Key không khớp với SPKI Public Key đã đăng ký với Backend.
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  Badge <strong>INVALID</strong>. Bản ghi bị từ chối vào accepted telemetry, lưu vào audit log riêng.
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  Kiểm tra key_id đã nạp vào ESP32 hoặc kiểm tra khả năng dữ liệu bị can thiệp trên đường truyền.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Admin Modals */}
      <RegisterDeviceModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSuccess={(res) => {
          setAdminSuccessMsg(
            `Đã đăng ký thành công thiết bị ${res.device_id} (${res.device_name || 'Cold Chain Sensor'}).`
          );
          fetchDevicesList(false);
        }}
      />

      <AssignDeviceModal
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false);
          setAssignModalDeviceId(null);
        }}
        initialDeviceId={assignModalDeviceId}
        onSuccess={(_res, msg) => {
          setAdminSuccessMsg(msg);
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
