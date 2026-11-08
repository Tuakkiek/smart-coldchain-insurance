import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  ShipmentStatusBadge,
  InsuranceStatusBadge,
  BlockchainBadge,
  SignatureStatusBadge,
  DeviceOnlineBadge,
} from '../components/data-display/StatusBadge';
import { LoadingState } from '../components/feedback/LoadingState';
import { ErrorState } from '../components/feedback/ErrorState';
import { SimulatedRouteMap } from '../components/data-display/SimulatedRouteMap';
import { TelemetryChart } from '../components/data-display/TelemetryChart';
import { EventTimeline } from '../components/data-display/EventTimeline';
import { getShipmentById, getShipmentTelemetry } from '../api/shipments';
import { getDeviceHealth, getShipmentDevices } from '../api/devices';
import { getShipmentEvents } from '../api/events';
import { getIntegrityBatches, verifyBatch } from '../api/integrity';
import {
  ShipmentOut,
  TelemetryOut,
  EventOut,
  DeviceHealthOut,
  ShipmentDeviceOut,
  IntegrityBatch,
  BatchVerifyResultOut,
} from '../types/api';
import { MerkleBatchTable } from '../components/integrity/MerkleBatchTable';
import { IntegrityViolationAlert } from '../components/integrity/IntegrityViolationAlert';
import { BatchVerificationModal } from '../components/integrity/BatchVerificationModal';
import { BatchDetailModal } from '../components/integrity/BatchDetailModal';
import { SendTelemetryModal } from '../components/shipments/SendTelemetryModal';
import {
  ArrowLeft,
  MapPin,
  Thermometer,
  Shield,
  Clock,
  RefreshCw,
  Copy,
  Check,
  Activity,
  Layers,
  Cpu,
  Coins,
  AlertCircle,
  Database,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Radio,
} from 'lucide-react';

export const ShipmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [shipment, setShipment] = useState<ShipmentOut | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryOut[]>([]);
  const [events, setEvents] = useState<EventOut[]>([]);
  const [deviceHealth, setDeviceHealth] = useState<DeviceHealthOut | null>(null);
  const [shipmentDevices, setShipmentDevices] = useState<ShipmentDeviceOut[]>([]);
  const [batches, setBatches] = useState<IntegrityBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Send Telemetry Modal
  const [isSendTelemetryOpen, setIsSendTelemetryOpen] = useState(false);
  const [telemetrySuccessMsg, setTelemetrySuccessMsg] = useState<string | null>(null);

  // Batch Verification & Detail Modals
  const [verifyingBatchId, setVerifyingBatchId] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<BatchVerifyResultOut | null>(null);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [isVerifyingLoading, setIsVerifyingLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<IntegrityBatch | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const isMountedRef = useRef(true);

  const fetchData = async (isBackground = false) => {
    if (!id) return;
    if (!isBackground) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const [shipmentData, telemetryData, eventsData, batchesData, devicesData] = await Promise.all([
        getShipmentById(id),
        getShipmentTelemetry(id).catch(() => ({ items: [] })),
        getShipmentEvents(id).catch(() => ({ items: [] })),
        getIntegrityBatches({ shipment_id: id }).catch(() => ({ items: [], total: 0 })),
        getShipmentDevices(id).catch(() => ({ items: [] })),
      ]);

      const primaryDevice = devicesData.items.length > 0 ? devicesData.items[0] : null;
      let devHealth: DeviceHealthOut | null = null;

      if (primaryDevice) {
        devHealth = {
          device_id: primaryDevice.device_id,
          last_sequence_number: primaryDevice.last_sequence_number,
          missing_sequence_count: 0,
          last_heartbeat_at: primaryDevice.last_seen_at,
          last_seen_at: primaryDevice.last_seen_at,
          online_status: primaryDevice.telemetry_status,
          firmware_version: null,
        };
      } else if (shipmentData.latest_telemetry?.device_id) {
        // Fallback khi thiết bị chưa có assignment chính thức nhưng đã gửi telemetry
        devHealth = await getDeviceHealth(shipmentData.latest_telemetry.device_id).catch(
          () => null
        );
      }

      if (isMountedRef.current) {
        setShipment(shipmentData);
        setTelemetry(telemetryData.items);
        setEvents(eventsData.items);
        setDeviceHealth(devHealth);
        setShipmentDevices(devicesData.items);
        setBatches(batchesData.items);
      }
    } catch (err: unknown) {
      if (isMountedRef.current && !isBackground) {
        setError(err instanceof Error ? err.message : 'Lỗi tải chi tiết lô hàng');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const handleVerifyBatch = async (batchId: string) => {
    const targetBatch = batches.find((b) => b.batch_id === batchId);
    setVerifyingBatchId(batchId);
    setIsVerifyingLoading(true);
    setIsVerifyModalOpen(true);
    setVerificationResult(null);

    try {
      const result = await verifyBatch(batchId);
      if (isMountedRef.current) {
        setVerificationResult(result);
        setBatches((prev) =>
          prev.map((b) =>
            b.batch_id === batchId
              ? {
                  ...b,
                  verification_status: result.verification_status,
                  last_verified_at: result.verified_at,
                  tamper_detected: !result.matched,
                  failure_reason: !result.matched ? result.message : null,
                }
              : b
          )
        );
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : 'Lỗi kết nối khi gửi yêu cầu xác minh tới Backend';
        setVerificationResult({
          batch_id: batchId,
          verification_status: 'DATA_INTEGRITY_FAILED',
          recalculated_root: '0x0000000000000000000000000000000000000000000000000000000000000000',
          expected_root: targetBatch?.merkle_root || '0x...',
          matched: false,
          verified_at: new Date().toISOString(),
          message: `Không thể hoàn tất xác minh: ${errorMsg}`,
        });
      }
    } finally {
      if (isMountedRef.current) {
        setVerifyingBatchId(null);
        setIsVerifyingLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();

    // Auto-polling every 6 seconds as required by Phase 5
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchData(true);
      }, 6000);
    }

    return () => {
      isMountedRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [id, autoRefresh]);

  const copyToClipboard = (text: string, key = 'default') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loading) {
    return <LoadingState message="Đang nạp chi tiết lô hàng và bản đồ tuyến đường..." />;
  }

  if (error || !shipment) {
    return (
      <ErrorState
        title="Không tìm thấy lô hàng"
        message={error || 'Lô hàng không tồn tại trong hệ thống'}
        onRetry={() => fetchData(false)}
      />
    );
  }

  const temp = shipment.latest_telemetry?.temperature_c;
  const isBreach =
    temp !== undefined &&
    (temp < shipment.temp_min_c || temp > shipment.temp_max_c);

  const isEvidencePending =
    shipment.insurance.payout_status?.toUpperCase() === 'EVIDENCE_PENDING';

  const anchorTx =
    shipment.blockchain?.anchor_transaction_hash ||
    batches.find((b) => b.anchor_tx_hash)?.anchor_tx_hash ||
    null;

  const insuranceTx =
    shipment.blockchain?.insurance_transaction_hash ||
    shipment.blockchain?.transaction_hash ||
    null;

  return (
    <div>
      {/* Top back button & controls */}
      <div
        className="flex-row items-center justify-between"
        style={{ marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}
      >
        <Button
          variant="tertiary"
          size="sm"
          onClick={() => navigate('/shipments')}
          icon={<ArrowLeft size={16} />}
        >
          Quay lại danh sách
        </Button>

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
              style={{ cursor: 'pointer' }}
            />
            <span>Tự động cập nhật (6s)</span>
          </label>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchData(true)}
            loading={refreshing}
            icon={<RefreshCw size={14} />}
          >
            Làm mới
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsSendTelemetryOpen(true)}
            icon={<Radio size={14} />}
          >
            Gửi Telemetry
          </Button>
        </div>
      </div>

      {/* Success alert when telemetry is posted */}
      {telemetrySuccessMsg && (
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
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)', fontWeight: 500 }}>
              {telemetrySuccessMsg}
            </span>
          </div>
          <button
            onClick={() => setTelemetrySuccessMsg(null)}
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

      <PageHeader
        title={`Lô hàng: ${shipment.code}`}
        description={`${shipment.cargo_type} • ID: ${shipment.id}`}
        action={
          <div className="flex-row items-center gap-2">
            <ShipmentStatusBadge status={shipment.status} />
            <InsuranceStatusBadge
              status={shipment.insurance.status}
              payoutStatus={shipment.insurance.payout_status}
            />
          </div>
        }
      />

      {/* Prominent Alert Banner when payout_status is EVIDENCE_PENDING */}
      {isEvidencePending && (
        <div
          style={{
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
            backgroundColor: 'rgba(217, 119, 6, 0.08)',
            border: '1px solid rgba(217, 119, 6, 0.3)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            gap: 'var(--space-3)',
            alignItems: 'flex-start',
          }}
        >
          <Clock size={20} color="#d97706" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 'var(--text-sm)',
                color: '#b45309',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>Trạng thái Bồi thường: Đang chờ bằng chứng neo (EVIDENCE_PENDING)</span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(217, 119, 6, 0.2)',
                  fontWeight: 600,
                }}
              >
                Chưa giải ngân
              </span>
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                marginTop: '4px',
                lineHeight: '1.5',
              }}
            >
              Hệ thống đã ghi nhận lô hàng vi phạm ngưỡng nhiệt độ liên tục vượt quá{' '}
              <strong>{shipment.violation_duration_minutes} phút</strong>. Tuy nhiên, theo chính sách
              hợp đồng thông minh (<code>PAYOUT_REQUIRES_ANCHORED_EVIDENCE</code>), lệnh bồi thường{' '}
              <strong>chưa được phát hành ngay</strong> mà đang chờ batch Merkle root hoàn tất giao dịch
              neo dữ liệu (<em>Data Anchoring</em>) lên mạng Blockchain để làm bằng chứng pháp lý bất biến.
            </div>
          </div>
        </div>
      )}

      {/* Grid of Key Properties */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-6)',
        }}
      >
        {/* Telemetry quick card */}
        <Card title="Cảm biến Nhiệt độ / Độ ẩm">
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div
              className="tabular-nums"
              style={{
                fontSize: 'var(--text-3xl)',
                fontWeight: 600,
                color: isBreach ? 'var(--color-danger)' : 'var(--color-text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Thermometer size={28} />
              {temp !== undefined ? `${temp.toFixed(1)}°C` : 'Chưa có mẫu'}
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                marginTop: 'var(--space-2)',
              }}
            >
              Ngưỡng cam kết: <strong>{shipment.temp_min_c}°C – {shipment.temp_max_c}°C</strong>
            </div>
            {shipment.latest_telemetry && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--color-text-tertiary)',
                  marginTop: 'var(--space-1)',
                }}
              >
                Độ ẩm: <strong>{shipment.latest_telemetry.humidity_pct.toFixed(1)}%</strong> • Thiết bị:{' '}
                {shipment.latest_telemetry.device_id}
              </div>
            )}
          </div>
        </Card>

        {/* Route info card */}
        <Card title="Tuyến vận chuyển">
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {shipment.origin.name}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', margin: '2px 0 6px 0' }}>
              ({shipment.origin.latitude.toFixed(4)}, {shipment.origin.longitude.toFixed(4)})
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', fontWeight: 600, marginBottom: '6px' }}>
              ↓ Tuyến đường mô phỏng (Tiến độ: {shipment.location ? `${shipment.location.progress_pct.toFixed(0)}%` : '0%'})
            </div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {shipment.destination.name}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
              ({shipment.destination.latitude.toFixed(4)}, {shipment.destination.longitude.toFixed(4)})
            </div>
          </div>
        </Card>

        {/* Insurance details */}
        <Card title="Hợp đồng bảo hiểm">
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Mức bồi thường cam kết
            </div>
            <div
              className="tabular-nums"
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginTop: '2px',
              }}
            >
              {shipment.insurance.insured_amount_vnd.toLocaleString('vi-VN')} VND
            </div>

            {/* Mandatory Token Label */}
            <div
              style={{
                marginTop: 'var(--space-2)',
                marginBottom: 'var(--space-2)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(217, 119, 6, 0.1)',
                border: '1px solid rgba(217, 119, 6, 0.3)',
                color: '#b45309',
                fontSize: '11px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Coins size={12} />
              <span>Local/Testnet Token — không phải tiền thật</span>
            </div>

            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                marginTop: 'var(--space-1)',
              }}
            >
              Điều kiện vi phạm: Vượt ngưỡng liên tục <strong>{shipment.violation_duration_minutes} phút</strong>
            </div>

            <div style={{ marginTop: 'var(--space-3)' }}>
              <InsuranceStatusBadge
                status={shipment.insurance.status}
                payoutStatus={shipment.insurance.payout_status}
              />
            </div>

            {isEvidencePending && (
              <div
                style={{
                  fontSize: '11px',
                  color: '#b45309',
                  marginTop: 'var(--space-2)',
                  fontStyle: 'italic',
                }}
              >
                * Đang tạm hoãn chi trả: Chờ neo Merkle root của batch telemetry làm bằng chứng hợp lệ.
              </div>
            )}
          </div>
        </Card>

        {/* Device Integrity quick card */}
        <Card title="Thiết bị & Chữ ký cảm biến">
          <div style={{ marginTop: 'var(--space-2)' }}>
            {shipmentDevices.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {shipmentDevices.map((dev) => (
                  <div
                    key={dev.device_id}
                    style={{
                      padding: 'var(--space-3)',
                      backgroundColor: 'var(--color-surface-secondary)',
                      borderRadius: 'var(--radius-md)',
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
                      <div
                        style={{
                          fontSize: 'var(--text-sm)',
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Cpu size={16} /> {dev.device_id}
                      </div>
                      <div className="flex-row items-center gap-1">
                        <DeviceOnlineBadge
                          status={dev.telemetry_status}
                          lastHeartbeat={dev.last_seen_at}
                        />
                        <Badge
                          variant={dev.registration_status === 'active' ? 'success' : 'danger'}
                        >
                          {dev.registration_status.toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    {shipment.latest_telemetry && shipment.latest_telemetry.device_id === dev.device_id && (
                      <div style={{ marginBottom: 'var(--space-2)' }}>
                        <SignatureStatusBadge
                          status={shipment.latest_telemetry.signature_status || 'VALID'}
                        />
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-secondary)',
                        paddingTop: 'var(--space-2)',
                        borderTop: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      <span>
                        Sequence: <strong>#{dev.last_sequence_number}</strong>
                      </span>
                      <span>
                        Cập nhật:{' '}
                        <strong>
                          {dev.last_seen_at ? new Date(dev.last_seen_at).toLocaleTimeString('vi-VN') : 'Chưa có'}
                        </strong>
                      </span>
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: 'var(--space-1)' }}>
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={() => navigate('/devices')}
                    style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--text-xs)' }}
                  >
                    Xem chi tiết xác thực thiết bị →
                  </Button>
                </div>
              </div>
            ) : shipment.latest_telemetry ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Cpu size={16} /> {shipment.latest_telemetry.device_id}
                  </div>
                  <DeviceOnlineBadge
                    status={deviceHealth?.online_status || 'ONLINE'}
                    lastHeartbeat={deviceHealth?.last_heartbeat_at}
                  />
                </div>

                <div style={{ marginBottom: 'var(--space-2)' }}>
                  <SignatureStatusBadge
                    status={shipment.latest_telemetry.signature_status || 'VALID'}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-secondary)',
                    marginTop: 'var(--space-2)',
                    paddingTop: 'var(--space-2)',
                    borderTop: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <span>
                    Sequence: #{deviceHealth?.last_sequence_number ?? shipment.latest_telemetry.sequence_number ?? 'N/A'}
                  </span>
                  <span>
                    Trạng thái: <strong>Đang gửi telemetry</strong>
                  </span>
                </div>

                <div style={{ marginTop: 'var(--space-3)' }}>
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={() => navigate('/devices')}
                    style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--text-xs)' }}
                  >
                    Xem chi tiết xác thực thiết bị →
                  </Button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', padding: 'var(--space-2) 0' }}>
                Chưa có thiết bị nào được gán hoặc gửi dữ liệu cho lô hàng này.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* PHASE 3: INTERACTIVE LEAFLET MAP PANEL */}
      <Card
        title="Bản đồ Lộ trình Tuyến xe (Mô phỏng)"
        description="Vị trí xe và tiến độ hành trình được tính toán nội suy từ dữ liệu mẫu cảm biến Backend."
        style={{ marginBottom: 'var(--space-6)' }}
      >
        <SimulatedRouteMap
          origin={shipment.origin}
          destination={shipment.destination}
          currentLocation={shipment.location}
          height="380px"
        />
      </Card>

      {/* PHASE 3: TELEMETRY CHART */}
      <Card
        title="Biểu đồ Biến thiên Nhiệt độ & Độ ẩm"
        description="Lịch sử các lần gửi mẫu từ cảm biến kèm hai đường giới hạn an toàn."
        style={{ marginBottom: 'var(--space-6)' }}
      >
        <TelemetryChart
          telemetry={telemetry}
          tempMinC={shipment.temp_min_c}
          tempMaxC={shipment.temp_max_c}
        />
      </Card>

      {/* Blockchain Status section: Separating Data Anchoring & Insurance Payout */}
      <Card
        title="Trạng thái Smart Contract & Blockchain"
        description="Kiến trúc tách biệt giữa hai luồng giao dịch: Neo dữ liệu (Data Anchoring) và Chi trả bồi thường (Insurance Payout)."
        style={{ marginBottom: 'var(--space-6)' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Top Network Info & Testnet Token Disclaimer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-2)',
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'var(--color-surface-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div className="flex-row items-center gap-3">
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                Mạng Blockchain: <strong>{shipment.blockchain?.network || 'Ethereum Localnet / Hardhat'}</strong>
              </span>
              <BlockchainBadge status={shipment.blockchain?.confirmation_status || 'NOT_SUBMITTED'} />
            </div>

            {/* Mandatory Token Disclaimer */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(217, 119, 6, 0.1)',
                border: '1px solid rgba(217, 119, 6, 0.3)',
                color: '#b45309',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              <Coins size={12} />
              <span>Local/Testnet Token — không phải tiền thật</span>
            </div>
          </div>

          {/* TWO SEPARATED TRANSACTION CARDS */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {/* 1. DATA ANCHORING TRANSACTION */}
            <div
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <div className="flex-row items-center justify-between">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Database size={16} color="var(--color-accent)" />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    1. Giao dịch Neo Dữ liệu (Data Anchoring)
                  </span>
                </div>
                {anchorTx ? (
                  <Badge variant="success" icon={<CheckCircle2 size={12} />}>
                    DATA_ANCHORED
                  </Badge>
                ) : (
                  <Badge variant="neutral" icon={<Clock size={12} />}>
                    Đang chờ / Chưa neo
                  </Badge>
                )}
              </div>

              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
                Mục đích: Neo Merkle root của các batch dữ liệu cảm biến (SHA-256 canonical) lên Smart Contract để chống chối bỏ và chống làm giả dữ liệu.
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>
                  anchor_transaction_hash:
                </div>
                {anchorTx ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'var(--color-surface-secondary)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <span
                      className="font-mono"
                      style={{
                        flex: 1,
                        fontSize: '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--color-text-primary)',
                      }}
                      title={anchorTx}
                    >
                      {anchorTx}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(anchorTx, 'anchor')}
                      icon={copiedKey === 'anchor' ? <Check size={12} /> : <Copy size={12} />}
                      style={{ height: '26px', fontSize: '11px' }}
                    >
                      {copiedKey === 'anchor' ? 'Đã chép' : 'Chép'}
                    </Button>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'var(--color-surface-secondary)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px dashed var(--color-border)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    Chưa phát sinh giao dịch neo dữ liệu on-chain cho lô hàng này.
                  </div>
                )}
              </div>
            </div>

            {/* 2. INSURANCE PAYOUT TRANSACTION */}
            <div
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <div className="flex-row items-center justify-between">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={16} color="var(--color-success)" />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    2. Giao dịch Chi trả Bồi thường (Insurance Payout)
                  </span>
                </div>
                {insuranceTx && shipment.insurance?.payout_status === 'paid' ? (
                  <Badge variant="success" icon={<CheckCircle2 size={12} />}>
                    CONFIRMED
                  </Badge>
                ) : insuranceTx ? (
                  <Badge variant="warning" icon={<Clock size={12} />}>
                    PENDING
                  </Badge>
                ) : isEvidencePending ? (
                  <Badge variant="warning" icon={<Clock size={12} />}>
                    EVIDENCE_PENDING
                  </Badge>
                ) : (
                  <Badge variant="neutral">Chưa kích hoạt</Badge>
                )}
              </div>

              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
                Mục đích: Tự động giải ngân demo token bồi thường từ quỹ Smart Contract khi vi phạm được xác nhận cùng bằng chứng Merkle root hợp lệ.
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>
                  insurance_transaction_hash:
                </div>
                {insuranceTx ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'var(--color-surface-secondary)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <span
                      className="font-mono"
                      style={{
                        flex: 1,
                        fontSize: '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--color-text-primary)',
                      }}
                      title={insuranceTx}
                    >
                      {insuranceTx}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(insuranceTx, 'insurance')}
                      icon={copiedKey === 'insurance' ? <Check size={12} /> : <Copy size={12} />}
                      style={{ height: '26px', fontSize: '11px' }}
                    >
                      {copiedKey === 'insurance' ? 'Đã chép' : 'Chép'}
                    </Button>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'var(--color-surface-secondary)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px dashed var(--color-border)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {isEvidencePending
                      ? 'Đang chờ bằng chứng neo Merkle root hợp lệ trước khi giải ngân.'
                      : `Chưa có lệnh chi trả bồi thường (chỉ kích hoạt khi vi phạm > ${shipment.violation_duration_minutes} phút).`}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mandatory Rule Reminder from ROADMAP */}
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-surface-secondary)',
              border: '1px solid var(--color-border-subtle)',
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <AlertCircle size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            <span>
              <strong>Nguyên tắc thẩm định giao dịch:</strong> <code>PENDING ≠ CONFIRMED</code>. Sự tồn tại của mã hash giao dịch
              chưa đủ chứng minh đã chi trả; trạng thái hoàn tất chỉ được xác nhận khi có receipt thành công và sự kiện <code>InsurancePaid</code> trên Blockchain.
              Frontend không ký giao dịch người dùng hay gọi trực tiếp Smart Contract.
            </span>
          </div>
        </div>
      </Card>

      {/* PROMINENT WARNING IF ANY BATCH HAS DATA_INTEGRITY_FAILED */}
      {batches.some((b) => b.verification_status === 'DATA_INTEGRITY_FAILED' || b.tamper_detected) && (
        <IntegrityViolationAlert
          failedBatches={batches.filter(
            (b) => b.verification_status === 'DATA_INTEGRITY_FAILED' || b.tamper_detected
          )}
          onVerifyBatch={handleVerifyBatch}
          verifyingBatchId={verifyingBatchId}
          onSelectBatch={(b) => {
            setSelectedBatch(b);
            setIsDetailModalOpen(true);
          }}
        />
      )}

      {/* MERKLE BATCHES LIST FOR THIS SHIPMENT */}
      <Card
        title="Danh sách Merkle Batches của Lô hàng"
        description="Các batch telemetry đã niêm phong, Merkle root dạng 0x + 64 hex characters và trạng thái đối chiếu chống giả mạo."
        style={{ marginBottom: 'var(--space-6)' }}
        action={
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => navigate('/integrity')}
            style={{ fontSize: 'var(--text-xs)' }}
          >
            Quản lý tất cả batches →
          </Button>
        }
      >
        {batches.length === 0 ? (
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
            Chưa có Merkle batch nào được seal cho lô hàng này.
          </div>
        ) : (
          <MerkleBatchTable
            batches={batches}
            onVerifyBatch={handleVerifyBatch}
            verifyingBatchId={verifyingBatchId}
            onSelectBatch={(b) => {
              setSelectedBatch(b);
              setIsDetailModalOpen(true);
            }}
            showFilters={batches.length > 2}
          />
        )}
      </Card>

      {/* Bottom 2 columns: Event Timeline & Telemetry Table */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-6)',
        }}
      >
        {/* Event Timeline */}
        <Card
          title="Dòng Thời gian Sự kiện (Events Timeline)"
          description="Các cảnh báo vi phạm và trạng thái kích hoạt bảo hiểm"
        >
          <EventTimeline events={events} />
        </Card>

        {/* Telemetry records table */}
        <Card
          title="Bảng Mẫu Cảm biến Gần nhất"
          description={`Tổng cộng: ${telemetry.length} bản ghi telemetry`}
        >
          {telemetry.length === 0 ? (
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
              Chưa có dữ liệu cảm biến nào từ thiết bị.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      textAlign: 'left',
                      color: 'var(--color-text-secondary)',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    <th style={{ padding: '8px 4px' }}>Thời gian nhận</th>
                    <th style={{ padding: '8px 4px' }}>Nhiệt độ</th>
                    <th style={{ padding: '8px 4px' }}>Độ ẩm</th>
                    <th style={{ padding: '8px 4px' }}>Tiến độ</th>
                  </tr>
                </thead>
                <tbody>
                  {telemetry.slice(-10).reverse().map((tel) => {
                    const isSampleBreach =
                      tel.temperature_c < shipment.temp_min_c ||
                      tel.temperature_c > shipment.temp_max_c;

                    return (
                      <tr
                        key={tel.id}
                        style={{
                          borderBottom: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        <td style={{ padding: '8px 4px', fontSize: 'var(--text-xs)' }}>
                          {new Date(tel.received_at).toLocaleTimeString('vi-VN')}
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            padding: '8px 4px',
                            fontWeight: 600,
                            color: isSampleBreach ? 'var(--color-danger)' : 'var(--color-text-primary)',
                          }}
                        >
                          {tel.temperature_c.toFixed(1)}°C
                        </td>
                        <td className="tabular-nums" style={{ padding: '8px 4px' }}>
                          {tel.humidity_pct.toFixed(1)}%
                        </td>
                        <td className="tabular-nums" style={{ padding: '8px 4px', fontSize: 'var(--text-xs)' }}>
                          {tel.location.progress_pct.toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Verification & Detail Modals */}
      <BatchVerificationModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        result={verificationResult}
        batch={batches.find((b) => b.batch_id === verifyingBatchId) || selectedBatch}
        loading={isVerifyingLoading}
      />

      <BatchDetailModal
        batch={selectedBatch}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onVerify={handleVerifyBatch}
        isVerifying={verifyingBatchId === selectedBatch?.batch_id}
      />

      {/* Modal Gửi Dữ Liệu Đo Cảm Biến */}
      <SendTelemetryModal
        isOpen={isSendTelemetryOpen}
        onClose={() => setIsSendTelemetryOpen(false)}
        shipmentId={shipment.id}
        shipmentCode={shipment.code}
        tempMin={shipment.temp_min_c}
        tempMax={shipment.temp_max_c}
        assignedDevices={
          shipmentDevices.length > 0
            ? shipmentDevices.map((d) => d.device_id)
            : shipment.latest_telemetry
            ? [shipment.latest_telemetry.device_id]
            : ['ESP32-01']
        }
        onSuccess={(sample) => {
          setTelemetrySuccessMsg(
            `Đã gửi thành công dữ liệu đo cảm biến: ${sample.temperature_c}°C, độ ẩm ${sample.humidity_pct}% từ thiết bị ${sample.device_id}.`
          );
          fetchData(true);
        }}
      />
    </div>
  );
};
