import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, CheckCircle2, ChevronDown, Cpu, ExternalLink, Layers, Link2, RefreshCw, Shield, Thermometer } from 'lucide-react';
import { getShipmentDevices } from '../api/devices';
import { getShipmentEvents } from '../api/events';
import { getIntegrityBatches, verifyBatch } from '../api/integrity';
import { completeShipment, getShipmentById, getShipmentTelemetry, retryShipmentPolicy } from '../api/shipments';
import { AssignDeviceModal } from '../components/devices/AssignDeviceModal';
import { EventTimeline } from '../components/data-display/EventTimeline';
import { AnchorStatusBadge, DeviceOnlineBadge, InsuranceStatusBadge, ShipmentStatusBadge, SignatureStatusBadge, VerificationStatusBadge } from '../components/data-display/StatusBadge';
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
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { CopyButton } from '../components/ui/CopyButton';
import { BatchVerifyResultOut, EventOut, IntegrityBatch, ShipmentDeviceOut, ShipmentOut, TelemetryOut } from '../types/api';
import { formatInsuranceCoverage, shortenAddress } from '../utils/ethereum';

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

  const confirmCompletion = async () => {
    if (!id || completing) return;
    setCompleting(true);
    try {
      const updated = await completeShipment(id);
      setShipment(updated);
      setCompleteOpen(false);
      setAutoRefresh(false);
      toast.success(updated.refund_status === 'CONFIRMED'
        ? 'Đã giao hàng và hoàn ký quỹ bảo hiểm.'
        : 'Đã xác nhận giao hàng. Backend đang xử lý đánh giá cuối cùng.');
      void fetchData(true);
    } catch (error: unknown) {
      if (!isRequestCancelled(error)) toast.error(formatApiErrorMessage(error, 'Không thể xác nhận giao hàng.'));
    } finally { setCompleting(false); }
  };

  if (loading && !shipment) return <LoadingState fullPage message="Đang tải chi tiết lô hàng..." />;
  if (loadFailed || !shipment) return <><Button variant="tertiary" size="sm" onClick={() => navigate('/shipments')} icon={<ArrowLeft size={16} />}>Quay lại</Button><EmptyState title="Chưa thể tải lô hàng" description="Lô hàng không tồn tại hoặc Backend đang tạm gián đoạn." actionText="Thử lại" onAction={() => fetchData()} /></>;

  const latest = shipment.latest_telemetry;
  const temperature = latest?.temperature_c;
  const isBreach = temperature !== undefined && (temperature < shipment.temp_min_c || temperature > shipment.temp_max_c);
  const primaryDevice = devices.find((device) => device.device_id === latest?.device_id) ?? devices[0];
  const isStale = primaryDevice?.telemetry_status === 'OFFLINE';
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

  const transactionLink = (hash?: string | null) => hash && isSepolia ? `https://sepolia.etherscan.io/tx/${hash}` : null;

  return (
    <div>
      <div className="flex-row items-center justify-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <Button variant="tertiary" size="sm" onClick={() => navigate('/shipments')} icon={<ArrowLeft size={16} />}>Lô hàng</Button>
        <div className="flex-row items-center gap-3">
          <label style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Tự động (6s)</label>
          <Button size="sm" onClick={() => fetchData(true, true)} loading={refreshing} icon={<RefreshCw size={14} />}>Làm mới</Button>
          {shipment.status !== 'delivered' && <Button variant="primary" size="sm" onClick={() => setAssignOpen(true)} icon={<Link2 size={14} />}>Gán thiết bị</Button>}
          {shipment.status !== 'delivered' && <Button variant="primary" size="sm" onClick={() => setCompleteOpen(true)} icon={<CheckCircle2 size={14} />}>Xác nhận đã giao hàng</Button>}
        </div>
      </div>

      <PageHeader title={shipment.name} description={`${shipment.cargo_type} · ${shipment.origin.name} → ${shipment.destination.name}`} action={<div className="flex-row gap-2"><ShipmentStatusBadge status={shipment.status} /><InsuranceStatusBadge status={shipment.insurance.status} payoutStatus={shipment.insurance.payout_status} /></div>} />

      {shipment.status === 'delivered' && <Card title="Kết quả giao hàng" description="Telemetry đã đóng; lịch sử và bằng chứng vẫn được giữ nguyên." style={{ marginBottom: 20 }}>
        <div className="detail-list">
          <div className="detail-item"><div className="compact-label">Thời điểm hoàn tất</div><div className="compact-meta">{shipment.delivered_at ? new Date(shipment.delivered_at).toLocaleString('vi-VN') : '—'}</div></div>
          <div className="detail-item"><div className="compact-label">Đánh giá cuối</div><Badge variant={shipment.delivery_result === 'SAFE' ? 'success' : shipment.delivery_result === 'VIOLATED' ? 'danger' : 'warning'}>{shipment.delivery_result || 'Đang đánh giá'}</Badge><div className="compact-meta">{shipment.delivery_result_reason || '—'}</div></div>
          <div className="detail-item"><div className="compact-label">Hoàn ký quỹ</div><Badge variant={shipment.refund_status === 'CONFIRMED' ? 'success' : shipment.refund_status === 'FAILED' ? 'danger' : 'neutral'}>{shipment.refund_status || '—'}</Badge></div>
          <div className="detail-item"><div className="compact-label">Tiến độ</div><div className="vital-value">100%</div></div>
        </div>
        {transactionLink(shipment.refund_transaction_hash) && <a className="external-link" href={transactionLink(shipment.refund_transaction_hash)!} target="_blank" rel="noreferrer">Xem giao dịch hoàn tiền <ExternalLink size={12} /></a>}
      </Card>}

      {failedBatches.length > 0 && <IntegrityViolationAlert failedBatches={failedBatches} onVerifyBatch={verifyIntegrity} verifyingBatchId={verifyingBatchId} onSelectBatch={(batch) => { setSelectedBatch(batch); setDetailOpen(true); }} />}

      <Card title="Giám sát hiện tại" description="Nhiệt độ, độ ẩm và trạng thái thiết bị mới nhất." style={{ marginBottom: 20 }}>
        <div className="vital-grid">
          <div className="vital"><div className="compact-label">Nhiệt độ</div><div className="vital-value" style={{ color: isBreach ? 'var(--color-danger)' : undefined }}>{temperature !== undefined ? `${temperature.toFixed(1)}°C` : '—'}</div>{isStale && <div className="compact-meta" style={{ color: 'var(--color-warning)' }}>Dữ liệu cũ · thiết bị offline</div>}</div>
          <div className="vital"><div className="compact-label">Độ ẩm</div><div className="vital-value">{latest ? `${latest.humidity_pct.toFixed(1)}%` : '—'}</div></div>
          <div className="vital"><div className="compact-label">Ngưỡng an toàn</div><div className="vital-value">{shipment.temp_min_c}–{shipment.temp_max_c}°C</div></div>
          <div className="vital"><div className="compact-label">Thiết bị</div><div style={{ marginTop: 7 }}>{primaryDevice ? <DeviceOnlineBadge status={primaryDevice.telemetry_status} lastHeartbeat={primaryDevice.last_seen_at} /> : <Badge variant="neutral">Chưa gán</Badge>}</div>{latest?.signature_status && <div style={{ marginTop: 5 }}><SignatureStatusBadge status={latest.signature_status} /></div>}</div>
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
          {policyStatus !== 'CONFIRMED' && <Button size="sm" onClick={retryPolicy} loading={retryingPolicy} style={{ marginTop: 16 }}>Thử lại Policy</Button>}
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
        title="Xác nhận đã giao hàng?"
        message={<>Chuyến hàng <strong>{shipment.name}</strong> sẽ được đánh dấu hoàn tất.</>}
        description="Backend sẽ đóng telemetry, đánh giá bằng chứng cuối và chỉ hoàn ký quỹ khi policy an toàn. Thao tác này không thể mở lại chuyến hàng."
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
