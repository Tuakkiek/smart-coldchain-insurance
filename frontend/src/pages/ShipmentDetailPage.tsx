import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ChevronDown, ExternalLink, Link2, RefreshCw } from 'lucide-react';
import { getShipmentDevices } from '../api/devices';
import { getShipmentEvents } from '../api/events';
import { getIntegrityBatches, verifyBatch } from '../api/integrity';
import { completeShipment, getShipmentById, getShipmentTelemetry, retryShipmentPolicy, retryShipmentRefund } from '../api/shipments';
import { AssignDeviceModal } from '../components/devices/AssignDeviceModal';
import { EventTimeline } from '../components/data-display/EventTimeline';
import { DeviceOnlineBadge, InsuranceStatusBadge, ShipmentStatusBadge, SignatureStatusBadge } from '../components/data-display/StatusBadge';
import { TelemetryChart } from '../components/data-display/TelemetryChart';
import { EmptyState } from '../components/feedback/EmptyState';
import { LoadingState } from '../components/feedback/LoadingState';
import { ConfirmModal } from '../components/feedback/ConfirmModal';
import { formatApiErrorMessage, isRequestCancelled, useToast } from '../components/feedback/Toast';
import { BatchDetailModal } from '../components/integrity/BatchDetailModal';
import { BatchVerificationModal } from '../components/integrity/BatchVerificationModal';
import { IntegrityViolationAlert } from '../components/integrity/IntegrityViolationAlert';
import { MerkleBatchTable } from '../components/integrity/MerkleBatchTable';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, BadgeVariant } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { CopyButton } from '../components/ui/CopyButton';
import { BatchVerifyResultOut, EventOut, IntegrityBatch, ShipmentDeviceOut, ShipmentOut, TelemetryOut } from '../types/api';
import { formatInsuranceCoverage, formatWeiToEth, shortenAddress } from '../utils/ethereum';

const DELIVERY_RESULT_LABEL: Record<'SAFE' | 'VIOLATED' | 'INCOMPLETE', { label: string; variant: BadgeVariant }> = {
  SAFE: { label: 'An toàn', variant: 'success' },
  VIOLATED: { label: 'Vi phạm', variant: 'danger' },
  INCOMPLETE: { label: 'Chưa đủ dữ liệu', variant: 'warning' },
};

const REFUND_STATUS_LABEL: Record<NonNullable<ShipmentOut['refund_status']>, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Đang xử lý', variant: 'warning' },
  CONFIRMED: { label: 'Đã hoàn', variant: 'success' },
  WAITING_EXPIRY: { label: 'Chờ hết hạn', variant: 'warning' },
  FAILED: { label: 'Thất bại', variant: 'danger' },
  NOT_APPLICABLE: { label: 'Không áp dụng', variant: 'neutral' },
};

const DELIVERY_REASON_LABEL: Record<string, string> = {
  SAFE_DELIVERY_VERIFIED: 'Đủ bằng chứng liên tục, đã neo Merkle và không vi phạm nhiệt độ.',
  TEMPERATURE_POLICY_TRIGGERED: 'Chuyến hàng đã kích hoạt vi phạm bảo hiểm nhiệt độ.',
  NO_TELEMETRY: 'Chưa có dữ liệu cảm biến nào được ghi nhận.',
  ACTIVE_BREACH_UNRESOLVED: 'Tại thời điểm giao hàng vẫn còn mẫu vượt ngưỡng chưa kết luận.',
  UNSIGNED_TELEMETRY_PRESENT: 'Có dữ liệu cảm biến chưa ký ECDSA hợp lệ.',
  SEQUENCE_GAP: 'Phát hiện thiếu số thứ tự (sequence gap) trong chuỗi dữ liệu.',
  SENSOR_DATA_GAP: 'Phát hiện khoảng mất tín hiệu cảm biến trước khi giao hàng.',
  INTEGRITY_BATCH_PENDING: 'Còn dữ liệu chưa được đóng gói vào Merkle batch.',
  INTEGRITY_VERIFICATION_PENDING: 'Merkle batch chưa được đối chiếu toàn vẹn.',
  INTEGRITY_VERIFICATION_FAILED: 'Phát hiện sai lệch toàn vẹn dữ liệu Merkle.',
  INTEGRITY_ANCHOR_PENDING: 'Merkle root đang chờ neo/xác nhận trên Blockchain.',
  INTEGRITY_ANCHOR_FAILED: 'Giao dịch neo Merkle root lên Blockchain thất bại.',
  ON_CHAIN_POLICY_NOT_CONFIRMED: 'Policy bảo hiểm chưa được xác nhận trên Sepolia.',
  LEGACY_CONTRACT_WAITING_EXPIRY: 'Policy nằm trên contract cũ nên chỉ hoàn sau thời điểm hết hạn.',
  POLICY_ALREADY_PAID_ON_CHAIN: 'Policy trên Blockchain đã chi trả bồi thường cho người thụ hưởng.',
  REFUND_TRANSACTION_FAILED: 'Giao dịch hoàn tiền on-chain bị lỗi. Có thể thử lại an toàn.',
  REFUND_RPC_UNAVAILABLE: 'Tạm thời mất kết nối RPC Blockchain. Hệ thống sẽ đồng bộ lại.',
};

const needsBackgroundSync = (item: ShipmentOut) =>
  item.status === 'delivered' && (
    item.refund_status === 'PENDING'
    || item.delivery_result_reason === 'INTEGRITY_ANCHOR_PENDING'
    || (item.delivery_result === 'VIOLATED' && ['pending', 'evidence_pending'].includes(item.insurance.payout_status))
  );

export const ShipmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const mounted = useRef(true);
  const [shipment, setShipment] = useState<ShipmentOut | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryOut[]>([]);
  const [events, setEvents] = useState<EventOut[]>([]);
  const [devices, setDevices] = useState<ShipmentDeviceOut[]>([]);
  const [batches, setBatches] = useState<IntegrityBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [retryingPolicy, setRetryingPolicy] = useState(false);
  const [retryingRefund, setRetryingRefund] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [verifyingBatchId, setVerifyingBatchId] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<BatchVerifyResultOut | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<IntegrityBatch | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchData = async (background = false, notify = false) => {
    if (!id) return;
    background || shipment ? setRefreshing(true) : setLoading(true);
    setLoadFailed(false);
    try {
      const [shipmentData, telemetryData, eventData, batchData, deviceData] = await Promise.all([
        getShipmentById(id),
        getShipmentTelemetry(id).catch(() => ({ items: [] })),
        getShipmentEvents(id).catch(() => ({ items: [] })),
        getIntegrityBatches({ shipment_id: id }).catch(() => ({ items: [], total: 0 })),
        getShipmentDevices(id).catch(() => ({ items: [] })),
      ]);
      if (!mounted.current) return;
      setShipment(shipmentData);
      setTelemetry(telemetryData.items);
      setEvents(eventData.items);
      setBatches(batchData.items);
      setDevices(deviceData.items);
      if (shipmentData.status === 'delivered' && !needsBackgroundSync(shipmentData)) {
        setAutoRefresh(false);
      }
      if (notify) toast.success('Chi tiết lô hàng đã được cập nhật.');
    } catch (error: unknown) {
      if (isRequestCancelled(error)) return;
      if (!background) setLoadFailed(true);
      if (!background || notify) toast.error(formatApiErrorMessage(error, 'Không thể tải chi tiết lô hàng.'));
    } finally {
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
  };

  useEffect(() => {
    mounted.current = true;
    void fetchData();
    const timer = autoRefresh ? setInterval(() => { void fetchData(true); }, 6000) : null;
    return () => { mounted.current = false; if (timer) clearInterval(timer); };
  }, [id, autoRefresh]);

  const verifyIntegrity = async (batchId: string) => {
    setVerifyingBatchId(batchId);
    setVerificationResult(null);
    setVerifyOpen(true);
    try {
      const result = await verifyBatch(batchId);
      setVerificationResult(result);
      const failed = result.verification_status === 'DATA_INTEGRITY_FAILED';
      setBatches((current) => current.map((batch) => batch.batch_id === batchId ? { ...batch, verification_status: result.verification_status, verified_at: result.verified_at, last_verified_at: result.verified_at, tamper_detected: failed, failure_reason: failed ? result.message : null } : batch));
      failed ? toast.warning('Phát hiện sai lệch Merkle root.') : toast.success('Merkle root đối chiếu trùng khớp.');
    } catch (error: unknown) {
      setVerifyOpen(false);
      if (!isRequestCancelled(error)) toast.error(formatApiErrorMessage(error, 'Không thể kiểm tra Merkle batch. Trạng thái hiện tại được giữ nguyên.'));
    } finally {
      setVerifyingBatchId(null);
    }
  };

  const retryPolicy = async () => {
    if (!id) return;
    setRetryingPolicy(true);
    try {
      const updated = await retryShipmentPolicy(id);
      setShipment(updated);
      updated.insurance.policy_status === 'CONFIRMED' ? toast.success('Policy đã được xác nhận trên Sepolia.') : toast.info('Đã gửi lại yêu cầu tạo Policy.');
    } catch (error: unknown) {
      if (!isRequestCancelled(error)) toast.error(formatApiErrorMessage(error, 'Không thể thử lại Policy.'));
    } finally { setRetryingPolicy(false); }
  };

  const retryRefund = async () => {
    if (!id || retryingRefund) return;
    setRetryingRefund(true);
    try {
      const updated = await retryShipmentRefund(id);
      setShipment(updated);
      if (needsBackgroundSync(updated)) setAutoRefresh(true);
      if (updated.refund_status === 'CONFIRMED') {
        toast.success('Đã hoàn tiền ký quỹ SepoliaETH thành công.');
      } else if (updated.refund_status === 'FAILED') {
        toast.error('Giao dịch hoàn tiền vẫn thất bại. Kiểm tra cấu hình ví hoặc số dư contract.');
      } else {
        toast.info('Đã gửi lại giao dịch hoàn tiền và đang chờ Blockchain xác nhận.');
      }
    } catch (error: unknown) {
      if (!isRequestCancelled(error)) toast.error(formatApiErrorMessage(error, 'Không thể thử lại hoàn tiền ký quỹ.'));
    } finally { setRetryingRefund(false); }
  };

  const confirmCompletion = async () => {
    if (!id || completing) return;
    setCompleting(true);
    try {
      const updated = await completeShipment(id);
      setShipment(updated);
      setCompleteOpen(false);
      setAutoRefresh(needsBackgroundSync(updated));
      if (updated.refund_status === 'CONFIRMED') {
        toast.success('Đã giao hàng và hoàn ký quỹ bảo hiểm.');
      } else if (updated.delivery_result === 'VIOLATED') {
        toast.info('Đã xác nhận giao hàng. Chuyến hàng có vi phạm nên không hoàn ký quỹ.');
      } else if (updated.refund_status === 'WAITING_EXPIRY') {
        toast.info('Đã xác nhận giao hàng. Policy trên contract cũ đang chờ hết hạn để hoàn tiền.');
      } else {
        toast.success('Đã xác nhận giao hàng. Hệ thống đã đóng telemetry và cập nhật đánh giá.');
      }
      void fetchData(true);
    } catch (error: unknown) {
      if (!isRequestCancelled(error)) toast.error(formatApiErrorMessage(error, 'Không thể xác nhận giao hàng.'));
    } finally { setCompleting(false); }
  };

  if (loading && !shipment) return <LoadingState fullPage message="Đang tải chi tiết lô hàng..." />;
  if (loadFailed || !shipment) return <><Button variant="tertiary" size="sm" onClick={() => navigate('/shipments')} icon={<ArrowLeft size={16} />}>Quay lại</Button><EmptyState title="Chưa thể tải lô hàng" description="Lô hàng không tồn tại hoặc Backend đang tạm gián đoạn." actionText="Thử lại" onAction={() => fetchData()} /></>;

  const isDelivered = shipment.status === 'delivered';
  const latest = shipment.latest_telemetry;
  const temperature = latest?.temperature_c;
  const isBreach = temperature !== undefined && (temperature < shipment.temp_min_c || temperature > shipment.temp_max_c);
  const primaryDevice = devices.find((device) => device.device_id === latest?.device_id) ?? devices[0];
  const isStale = !isDelivered && primaryDevice?.telemetry_status === 'OFFLINE';
  const coverage = formatInsuranceCoverage(shipment.insurance);
  const payout = shipment.insurance.payout_status?.toUpperCase();
  const isPaid = payout === 'PAID' || payout === 'CONFIRMED';
  const policyStatus = shipment.insurance.policy_status || shipment.blockchain?.policy_status;
  const policyTx = shipment.insurance.policy_transaction_hash || shipment.blockchain?.policy_transaction_hash;
  const anchorTx = shipment.blockchain?.anchor_transaction_hash || batches.find((batch) => batch.anchor_tx_hash)?.anchor_tx_hash;
  const insuranceTx = shipment.blockchain?.insurance_transaction_hash || shipment.blockchain?.transaction_hash;
  const buyerWallet = shipment.buyer_wallet_address || shipment.insurance.buyer_wallet_address;
  const policyContract = shipment.insurance.policy_contract_address || shipment.blockchain?.contract_address;
  const isSepolia = shipment.insurance.chain_id === 11155111 || shipment.blockchain?.chain_id === 11155111 || shipment.blockchain?.network?.toLowerCase().includes('sepolia');
  const failedBatches = batches.filter((batch) => batch.verification_status === 'DATA_INTEGRITY_FAILED' || batch.tamper_detected);
  const anchoredCount = batches.filter((batch) => batch.anchor_status === 'DATA_ANCHORED').length;
  const checkedCount = batches.filter((batch) => batch.verification_status === 'MATCHED').length;

  const progressPct = isDelivered ? 100 : Math.round(shipment.location?.progress_pct ?? 0);
  const deliveryResultMeta = shipment.delivery_result ? DELIVERY_RESULT_LABEL[shipment.delivery_result] : null;
  const refundStatusMeta = shipment.refund_status ? REFUND_STATUS_LABEL[shipment.refund_status] : null;
  const deliveryReasonText = shipment.delivery_result_reason
    ? (DELIVERY_REASON_LABEL[shipment.delivery_result_reason] ?? shipment.delivery_result_reason)
    : '—';
  const refundedEth = shipment.refunded_amount || formatWeiToEth(shipment.refunded_amount_wei);

  const transactionLink = (hash?: string | null) => hash && isSepolia ? `https://sepolia.etherscan.io/tx/${hash}` : null;

  return (
    <div>
      <div className="flex-row items-center justify-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <Button variant="tertiary" size="sm" onClick={() => navigate('/shipments')} icon={<ArrowLeft size={16} />}>Lô hàng</Button>
        <div className="flex-row items-center gap-3">
          <label style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Tự động (6s)</label>
          <Button size="sm" onClick={() => fetchData(true, true)} loading={refreshing} icon={<RefreshCw size={14} />}>Làm mới</Button>
          {!isDelivered && <Button variant="primary" size="sm" onClick={() => setAssignOpen(true)} icon={<Link2 size={14} />}>Gán thiết bị</Button>}
          {!isDelivered ? (
            <Button variant="primary" size="sm" onClick={() => setCompleteOpen(true)} disabled={completing} loading={completing} icon={<CheckCircle2 size={14} />}>
              Xác nhận đã giao hàng
            </Button>
          ) : (
            <ShipmentStatusBadge status="delivered" />
          )}
        </div>
      </div>

      <PageHeader
        title={shipment.name}
        description={`${shipment.cargo_type} · ${shipment.origin.name} → ${shipment.destination.name} · Tiến độ: ${progressPct}%`}
        action={<div className="flex-row gap-2"><ShipmentStatusBadge status={shipment.status} /><InsuranceStatusBadge status={shipment.insurance.status} payoutStatus={shipment.insurance.payout_status} /></div>}
      />

      {isDelivered && (
        <Card
          title="Chuyến hàng: Đã giao hàng"
          description="Dữ liệu cảm biến: Đã ngừng ghi nhận · Lịch sử và bằng chứng vẫn được giữ nguyên."
          style={{ marginBottom: 20 }}
        >
          <div className="detail-list">
            <div className="detail-item">
              <div className="compact-label">Hành trình</div>
              <div className="compact-meta" style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                {shipment.origin.name} → {shipment.destination.name}
              </div>
              <div className="compact-meta">Mô phỏng giao hàng (Admin xác nhận)</div>
            </div>
            <div className="detail-item">
              <div className="compact-label">Tiến độ</div>
              <div className="vital-value">100%</div>
              <div className="compact-meta">
                {shipment.location ? `${shipment.location.latitude.toFixed(4)}, ${shipment.location.longitude.toFixed(4)}` : 'Tại điểm đích'}
              </div>
            </div>
            <div className="detail-item">
              <div className="compact-label">Thời gian giao hàng</div>
              <div className="compact-meta" style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                {shipment.delivered_at ? new Date(shipment.delivered_at).toLocaleString('vi-VN') : '—'}
              </div>
              <div className="compact-meta">Dữ liệu cảm biến: Đã ngừng ghi nhận</div>
            </div>
            <div className="detail-item">
              <div className="compact-label">Nhiệt độ cuối cùng</div>
              <div className="vital-value" style={{ color: isBreach ? 'var(--color-danger)' : undefined }}>
                {temperature !== undefined ? `${temperature.toFixed(1)}°C` : '—'}
              </div>
              <div className="compact-meta">
                {latest ? `Độ ẩm ${latest.humidity_pct.toFixed(1)}% · Đo lúc ${new Date(latest.received_at).toLocaleString('vi-VN')}` : 'Chưa có mẫu'}
              </div>
            </div>
            <div className="detail-item">
              <div className="compact-label">Kết quả bảo hiểm</div>
              <div style={{ marginTop: 5 }}>
                {deliveryResultMeta ? (
                  <Badge variant={deliveryResultMeta.variant}>{deliveryResultMeta.label}</Badge>
                ) : (
                  <Badge variant="neutral">Đang đánh giá</Badge>
                )}
              </div>
              <div className="compact-meta" style={{ whiteSpace: 'normal', marginTop: 4 }}>{deliveryReasonText}</div>
            </div>
            <div className="detail-item">
              <div className="compact-label">Trạng thái hoàn tiền</div>
              <div style={{ marginTop: 5 }}>
                {refundStatusMeta ? (
                  <Badge variant={refundStatusMeta.variant}>{refundStatusMeta.label}</Badge>
                ) : (
                  <Badge variant="neutral">—</Badge>
                )}
              </div>
              {shipment.refund_status === 'FAILED' && (
                <Button size="sm" onClick={retryRefund} loading={retryingRefund} style={{ marginTop: 8 }}>
                  Thử lại hoàn tiền
                </Button>
              )}
            </div>
          </div>

          {shipment.refund_status === 'CONFIRMED' && (
            <div
              className="detail-list"
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid var(--color-border-subtle)',
              }}
            >
              <div className="detail-item">
                <div className="compact-label">Số tiền đã hoàn</div>
                <div className="vital-value" style={{ color: 'var(--color-success)' }}>
                  {refundedEth ? `${refundedEth} SepoliaETH` : '—'}
                </div>
              </div>
              <div className="detail-item">
                <div className="compact-label">Ví insurer nhận hoàn tiền</div>
                <div className="id-copy-inline" style={{ marginTop: 4 }}>
                  <code title={shipment.refund_recipient_address || undefined}>
                    {shipment.refund_recipient_address ? shortenAddress(shipment.refund_recipient_address) : '—'}
                  </code>
                  {shipment.refund_recipient_address && <CopyButton value={shipment.refund_recipient_address} iconSize={12} />}
                </div>
              </div>
              <div className="detail-item">
                <div className="compact-label">Transaction hash</div>
                <div className="id-copy-inline" style={{ marginTop: 4 }}>
                  <code title={shipment.refund_transaction_hash || undefined}>
                    {shipment.refund_transaction_hash ? shortenAddress(shipment.refund_transaction_hash, 10, 8) : '—'}
                  </code>
                  {shipment.refund_transaction_hash && <CopyButton value={shipment.refund_transaction_hash} iconSize={12} />}
                </div>
                {transactionLink(shipment.refund_transaction_hash) && (
                  <a className="external-link" href={transactionLink(shipment.refund_transaction_hash)!} target="_blank" rel="noreferrer" style={{ marginTop: 6 }}>
                    Xem trên Sepolia Etherscan <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          )}

          {shipment.refund_status !== 'CONFIRMED' && transactionLink(shipment.refund_transaction_hash) && (
            <div style={{ marginTop: 12 }}>
              <a className="external-link" href={transactionLink(shipment.refund_transaction_hash)!} target="_blank" rel="noreferrer">
                Xem giao dịch hoàn tiền trên Sepolia Etherscan <ExternalLink size={12} />
              </a>
            </div>
          )}
        </Card>
      )}

      {failedBatches.length > 0 && <IntegrityViolationAlert failedBatches={failedBatches} onVerifyBatch={verifyIntegrity} verifyingBatchId={verifyingBatchId} onSelectBatch={(batch) => { setSelectedBatch(batch); setDetailOpen(true); }} />}

      <Card
        title="Giám sát hiện tại"
        description={isDelivered ? 'Dữ liệu cảm biến đã ngừng ghi nhận sau khi giao hàng; lịch sử được giữ nguyên.' : 'Nhiệt độ, độ ẩm và trạng thái thiết bị mới nhất.'}
        style={{ marginBottom: 20 }}
      >
        <div className="vital-grid">
          <div className="vital">
            <div className="compact-label">Nhiệt độ</div>
            <div className="vital-value" style={{ color: isBreach ? 'var(--color-danger)' : undefined }}>{temperature !== undefined ? `${temperature.toFixed(1)}°C` : '—'}</div>
            {isDelivered && latest && <div className="compact-meta">Đã ngừng ghi nhận · đo lúc {new Date(latest.received_at).toLocaleString('vi-VN')}</div>}
            {isStale && <div className="compact-meta" style={{ color: 'var(--color-warning)' }}>Dữ liệu cũ · thiết bị offline</div>}
          </div>
          <div className="vital">
            <div className="compact-label">Độ ẩm</div>
            <div className="vital-value">{latest ? `${latest.humidity_pct.toFixed(1)}%` : '—'}</div>
          </div>
          <div className="vital">
            <div className="compact-label">Ngưỡng an toàn</div>
            <div className="vital-value">{shipment.temp_min_c}–{shipment.temp_max_c}°C</div>
          </div>
          <div className="vital">
            <div className="compact-label">Thiết bị</div>
            <div style={{ marginTop: 7 }}>
              {isDelivered ? (
                <Badge variant="neutral">Đã ngừng ghi nhận</Badge>
              ) : primaryDevice ? (
                <DeviceOnlineBadge status={primaryDevice.telemetry_status} lastHeartbeat={primaryDevice.last_seen_at} />
              ) : (
                <Badge variant="neutral">Chưa gán</Badge>
              )}
            </div>
            {latest?.signature_status && <div style={{ marginTop: 5 }}><SignatureStatusBadge status={latest.signature_status} /></div>}
          </div>
        </div>
        <TelemetryChart telemetry={telemetry} tempMinC={shipment.temp_min_c} tempMaxC={shipment.temp_max_c} />
      </Card>

      <div className="section-grid">
        <Card title="Bảo hiểm" description={`Điều kiện: ngoài ngưỡng liên tục ${shipment.violation_duration_minutes} phút.`}>
          <div className="detail-list">
            <div className="detail-item"><div className="compact-label">Giá trị bảo hiểm</div><div className="vital-value">{coverage.primaryText}</div><div className="compact-meta">{coverage.unitLabel}</div></div>
            <div className="detail-item"><div className="compact-label">Trạng thái bồi thường</div><div style={{ marginTop: 6 }}><InsuranceStatusBadge status={shipment.insurance.status} payoutStatus={shipment.insurance.payout_status} /></div><div className="compact-meta">{isPaid ? 'Đã xác nhận thanh toán' : 'Chưa có xác nhận đã thanh toán'}</div></div>
            <div className="detail-item"><div className="compact-label">Policy on-chain</div><div style={{ marginTop: 5 }}><Badge variant={policyStatus === 'CONFIRMED' ? 'success' : policyStatus === 'FAILED' ? 'danger' : 'neutral'}>{policyStatus || 'Chưa có'}</Badge></div></div>
            <div className="detail-item"><div className="compact-label">Mạng</div><div className="compact-meta">{isSepolia ? 'Sepolia' : shipment.blockchain?.network || 'Chưa xác định'}</div></div>
          </div>
          {!isDelivered && policyStatus !== 'CONFIRMED' && <Button size="sm" onClick={retryPolicy} loading={retryingPolicy} style={{ marginTop: 16 }}>Thử lại Policy</Button>}
          {transactionLink(policyTx) && <a className="external-link" href={transactionLink(policyTx)!} target="_blank" rel="noreferrer">Xem giao dịch Policy <ExternalLink size={12} /></a>}
          {transactionLink(insuranceTx) && <a className="external-link" href={transactionLink(insuranceTx)!} target="_blank" rel="noreferrer">Xem giao dịch bồi thường <ExternalLink size={12} /></a>}
        </Card>

        <Card title="Blockchain & toàn vẹn" description="Phân biệt batch đã tính, đã neo và đã đối chiếu.">
          <div className="vital-grid integrity-vitals">
            <div className="vital"><div className="compact-label">Đã tính Merkle</div><div className="vital-value">{batches.length}</div></div>
            <div className="vital"><div className="compact-label">Đã neo on-chain</div><div className="vital-value">{anchoredCount}</div></div>
            <div className="vital"><div className="compact-label">Đối chiếu khớp</div><div className="vital-value">{checkedCount}</div></div>
            <div className="vital"><div className="compact-label">Sai lệch</div><div className="vital-value" style={{ color: failedBatches.length ? 'var(--color-danger)' : undefined }}>{failedBatches.length}</div></div>
          </div>
          {batches.length > 0 ? <MerkleBatchTable batches={batches.slice(0, 5)} onVerifyBatch={verifyIntegrity} verifyingBatchId={verifyingBatchId} onSelectBatch={(batch) => { setSelectedBatch(batch); setDetailOpen(true); }} showFilters={false} /> : <EmptyState title="Chưa có Merkle batch" description="Batch sẽ xuất hiện sau khi đủ dữ liệu để niêm phong." />}
        </Card>
      </div>

      <details className="technical-details">
        <summary><span>Dữ liệu bổ sung & kỹ thuật</span><ChevronDown size={16} /></summary>
        <div className="technical-details-content">
          <div className="detail-list" style={{ marginBottom: 24 }}>
            <div className="detail-item"><div className="compact-label">Shipment ID</div><div className="id-copy-inline"><code>{shipment.shipment_id || shipment.id}</code><CopyButton value={shipment.shipment_id || shipment.id} /></div></div>
            <div className="detail-item"><div className="compact-label">Thiết bị được gán</div><code>{devices.map((device) => device.device_id).join(', ') || 'Chưa gán'}</code></div>
            <div className="detail-item"><div className="compact-label">Buyer wallet</div><code title={buyerWallet || undefined}>{buyerWallet ? shortenAddress(buyerWallet) : 'Chưa có'}</code></div>
            <div className="detail-item"><div className="compact-label">Policy contract</div><code title={policyContract || undefined}>{policyContract || 'Chưa có'}</code></div>
            <div className="detail-item"><div className="compact-label">Policy transaction</div><code title={policyTx || undefined}>{policyTx || 'Chưa gửi'}</code></div>
            <div className="detail-item"><div className="compact-label">Anchor transaction</div><code title={anchorTx || undefined}>{anchorTx || 'Chưa neo'}</code></div>
            <div className="detail-item"><div className="compact-label">Insurance transaction</div><code title={insuranceTx || undefined}>{insuranceTx || 'Chưa có'}</code></div>
            <div className="detail-item"><div className="compact-label">Tuyến đường</div><code>{shipment.origin.name} → {shipment.destination.name}</code></div>
          </div>

          <div className="section-grid">
            <Card title="Dòng sự kiện"><EventTimeline events={events} /></Card>
            <Card title="Mẫu telemetry gần đây">
              {telemetry.length === 0 ? <EmptyState description="Chưa có mẫu telemetry." /> : <div style={{ overflowX: 'auto' }}><table className="compact-table"><thead><tr><th>Thời gian</th><th>Thiết bị</th><th>Nhiệt độ</th><th>Độ ẩm</th></tr></thead><tbody>{telemetry.slice(0, 10).map((sample) => <tr key={sample.id}><td>{new Date(sample.received_at).toLocaleString('vi-VN')}</td><td className="font-mono">{sample.device_id}</td><td>{sample.temperature_c.toFixed(1)}°C</td><td>{sample.humidity_pct.toFixed(1)}%</td></tr>)}</tbody></table></div>}
            </Card>
          </div>
        </div>
      </details>

      <BatchVerificationModal isOpen={verifyOpen} onClose={() => setVerifyOpen(false)} result={verificationResult} batch={batches.find((batch) => batch.batch_id === verifyingBatchId) || selectedBatch} loading={Boolean(verifyingBatchId)} />
      <BatchDetailModal batch={selectedBatch} isOpen={detailOpen} onClose={() => setDetailOpen(false)} onVerify={verifyIntegrity} isVerifying={verifyingBatchId === selectedBatch?.batch_id} />
      <AssignDeviceModal isOpen={assignOpen} initialShipmentId={shipment.id} onClose={() => setAssignOpen(false)} onSuccess={(_device, message) => { toast.success(message); void fetchData(true); }} />
      <ConfirmModal
        isOpen={completeOpen}
        title="Xác nhận hoàn tất chuyến hàng?"
        message="Chuyến hàng sẽ được mô phỏng là đã đến điểm đích. Hệ thống sẽ dừng ghi nhận dữ liệu cảm biến cho chuyến này và kiểm tra điều kiện hoàn tiền bảo hiểm."
        confirmLabel="Xác nhận đã giao hàng"
        cancelLabel="Hủy"
        variant="primary"
        loading={completing}
        onConfirm={confirmCompletion}
        onCancel={() => !completing && setCompleteOpen(false)}
      />
    </div>
  );
};
