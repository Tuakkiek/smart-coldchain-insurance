import React, { useState, useEffect, useRef } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { MetricCard } from '../components/data-display/MetricCard';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/feedback/LoadingState';
import { ErrorState } from '../components/feedback/ErrorState';
import {
  BackendStatusAlert,
} from '../components/feedback/BackendStatusAlert';
import { useBackendConnectionState } from '../components/feedback/ConnectionStatus';
import { MerkleBatchTable } from '../components/integrity/MerkleBatchTable';
import { IntegrityViolationAlert } from '../components/integrity/IntegrityViolationAlert';
import { BatchVerificationModal } from '../components/integrity/BatchVerificationModal';
import { BatchDetailModal } from '../components/integrity/BatchDetailModal';
import { useToast } from '../components/feedback/Toast';
import {
  getIntegrityBatches,
  getIntegritySummary,
  verifyBatch,
} from '../api/integrity';
import {
  IntegrityBatch,
  IntegritySummaryOut,
  BatchVerifyResultOut,
} from '../types/api';
import { apiClient, ApiError } from '../api/client';
import {
  Layers,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Database,
  Link as LinkIcon,
  CheckCircle2,
  Info,
} from 'lucide-react';

export const DataIntegrityPage: React.FC = () => {
  const { toast } = useToast();
  const backendConnectionState = useBackendConnectionState();
  const [batches, setBatches] = useState<IntegrityBatch[]>([]);
  const [summary, setSummary] = useState<IntegritySummaryOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isColdStart, setIsColdStart] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [staleError, setStaleError] = useState<string | null>(null);

  // Verification State & Modal
  const [verifyingBatchId, setVerifyingBatchId] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<BatchVerifyResultOut | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [isVerifyingLoading, setIsVerifyingLoading] = useState(false);

  // Detail Modal
  const [selectedBatch, setSelectedBatch] = useState<IntegrityBatch | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const isMountedRef = useRef(true);

  const fetchData = async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    setIsColdStart(false);

    try {
      const [batchesRes, summaryRes] = await Promise.all([
        getIntegrityBatches(),
        getIntegritySummary().catch(() => null),
      ]);

      if (isMountedRef.current) {
        setBatches(batchesRes.items);
        setSummary(summaryRes);
        setIsStale(false);
        setStaleError(null);
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
                : 'Lỗi không xác định khi tải danh sách Merkle Batch'
            );
          }
        } else {
          setIsStale(true);
          setStaleError(err instanceof Error ? err.message : 'Lỗi kết nối khi polling nền');
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
    fetchData();

    let timer: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      timer = setInterval(() => {
        fetchData(true);
      }, 10000);
    }

    return () => {
      isMountedRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, [autoRefresh]);

  /**
   * Action handler: "Kiểm tra lại tính toàn vẹn" (Verify batch)
   */
  const handleVerifyBatch = async (batchId: string) => {
    setVerifyingBatchId(batchId);
    setIsVerifyingLoading(true);
    setIsVerifyModalOpen(true);
    setVerificationResult(null);
    setVerifyError(null);

    const adminKey = apiClient.getAdminKey() || undefined;

    try {
      const result = await verifyBatch(batchId, adminKey);
      if (isMountedRef.current) {
        setVerificationResult(result);
        const isTampered = result.verification_status === 'DATA_INTEGRITY_FAILED';
        if (isTampered) {
          toast.warning(
            `Phát hiện sai lệch tính toàn vẹn Merkle Batch '${batchId.slice(0, 8)}...'!`,
            { title: 'Toàn vẹn dữ liệu' }
          );
        } else {
          toast.success(
            `Xác minh tính toàn vẹn Merkle Batch '${batchId.slice(0, 8)}...' trùng khớp hoàn toàn!`,
            { title: 'Toàn vẹn dữ liệu' }
          );
        }

        // Update local batch list state with the new verification status
        setBatches((prev) =>
          prev.map((b) =>
            b.batch_id === batchId
              ? {
                  ...b,
                  verification_status: result.verification_status,
                  last_verified_at: result.verified_at,
                  verified_at: result.verified_at,
                  tamper_detected: isTampered,
                  failure_reason: isTampered ? result.message : null,
                }
              : b
          )
        );

        // Update selected batch if open
        if (selectedBatch && selectedBatch.batch_id === batchId) {
          setSelectedBatch((prev) =>
            prev
              ? {
                  ...prev,
                  verification_status: result.verification_status,
                  last_verified_at: result.verified_at,
                  verified_at: result.verified_at,
                  tamper_detected: isTampered,
                  failure_reason: isTampered ? result.message : null,
                }
              : null
          );
        }
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : 'Lỗi kết nối hoặc quyền truy cập khi gửi yêu cầu xác minh tới Backend';
        setVerifyError(errorMsg);
        toast.error(errorMsg, { title: 'Lỗi xác minh Merkle' });
        // CRITICAL: Do NOT fabricate DATA_INTEGRITY_FAILED on API/network errors!
      }
    } finally {
      if (isMountedRef.current) {
        setVerifyingBatchId(null);
        setIsVerifyingLoading(false);
      }
    }
  };

  const handleSelectBatch = (batch: IntegrityBatch) => {
    setSelectedBatch(batch);
    setIsDetailModalOpen(true);
  };

  const isEffectiveColdStart =
    isColdStart || backendConnectionState === 'COLD_START';

  if (loading) {
    return <LoadingState message="Đang nạp danh sách Merkle Batches và trạng thái neo Blockchain..." />;
  }

  if (error && batches.length === 0) {
    return (
      <div>
        <PageHeader
          title="Toàn vẹn Dữ liệu & Merkle Batches"
          description="Quản lý tính toàn vẹn dữ liệu cảm biến và kiểm tra Merkle root neo on-chain."
        />
        <BackendStatusAlert
          isColdStart={isEffectiveColdStart}
          errorMessage={error}
          onRetry={() => fetchData(false)}
          retrying={refreshing}
        />
        <ErrorState
          title="Không thể tải dữ liệu Merkle Batches"
          message={error}
          onRetry={() => fetchData(false)}
        />
      </div>
    );
  }

  // Find all batches with integrity violation
  const failedBatches = batches.filter(
    (b) => b.verification_status === 'DATA_INTEGRITY_FAILED' || b.tamper_detected
  );

  const totalBatches = batches.length;
  const anchoredBatches = batches.filter((b) => b.anchor_status === 'DATA_ANCHORED').length;
  const totalRecordsCalculated = batches.reduce((acc, b) => acc + (b.record_count || 0), 0);

  return (
    <div>
      {/* Top Controls */}
      <div
        className="flex-row items-center justify-between"
        style={{ marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}
      >
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          Hệ thống đảm bảo tính toàn vẹn: <strong>IoT Signature → MySQL → Merkle-v1 → Blockchain Anchor</strong>
        </div>

        <div className="flex-row items-center gap-3">
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Tự động đồng bộ (10s)
          </label>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchData(false)}
            loading={refreshing}
            icon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />}
          >
            Làm mới
          </Button>
        </div>
      </div>

      <PageHeader
        title="Toàn vẹn Dữ liệu & Merkle Batches"
        description="Quản lý tính toàn vẹn dữ liệu cảm biến và kiểm tra Merkle root neo on-chain."
        action={
          <div className="flex-row items-center gap-2">
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Chuẩn băm: <strong>MERKLE-v1</strong> • Chữ ký: <strong>ECDSA P-256</strong>
            </span>
          </div>
        }
      />

      {/* Backend connection banner if degraded */}
      <BackendStatusAlert
        isColdStart={isEffectiveColdStart}
        errorMessage={error}
        onRetry={() => fetchData(true)}
        retrying={refreshing}
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
            ⚠️ <strong>Dữ liệu chưa cập nhật:</strong> Quá trình polling nền gặp sự cố ({staleError}). Đang hiển thị dữ liệu từ lần tải gần nhất.
          </span>
          <Button size="sm" variant="secondary" onClick={() => fetchData(false)}>
            Thử lại ngay
          </Button>
        </div>
      )}

      {/* 5 KPI Metric Cards */}
      <div
        className="metrics-grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          marginBottom: 'var(--space-6)',
        }}
      >
        <MetricCard
          title="Tổng số bản ghi trong batch"
          value={summary?.record_count ?? totalRecordsCalculated}
          subtitle="Mẫu telemetry đã gom vào batch"
          icon={<Database size={20} />}
        />
        <MetricCard
          title="Tổng số Merkle Batch"
          value={summary?.batch_count ?? totalBatches}
          subtitle="Batch đã niêm phong"
          icon={<Layers size={20} />}
          accentColor="var(--color-primary)"
        />
        <MetricCard
          title="Trạng thái xác minh chung"
          value={summary?.verification_status ?? (failedBatches.length > 0 ? 'DATA_INTEGRITY_FAILED' : batches.length > 0 ? 'MATCHED' : 'NOT_CHECKED')}
          subtitle="Đối soát Merkle Root"
          icon={<CheckCircle2 size={20} />}
          accentColor={failedBatches.length > 0 ? 'var(--color-danger)' : 'var(--color-success)'}
        />
        <MetricCard
          title="Batch đã neo on-chain"
          value={`${anchoredBatches} / ${totalBatches}`}
          subtitle="Đã xác nhận trên Blockchain"
          icon={<LinkIcon size={20} />}
          accentColor="var(--color-accent)"
        />
        <MetricCard
          title="Sai lệch toàn vẹn (Failed)"
          value={failedBatches.length}
          subtitle={
            failedBatches.length > 0
              ? 'Phát hiện can thiệp dữ liệu!'
              : 'Không có sai lệch'
          }
          icon={<ShieldAlert size={20} />}
          accentColor={failedBatches.length > 0 ? 'var(--color-danger)' : undefined}
        />
      </div>

      {/* PROMINENT WARNING WHEN DATA_INTEGRITY_FAILED OCCURS */}
      {failedBatches.length > 0 && (
        <IntegrityViolationAlert
          failedBatches={failedBatches}
          onVerifyBatch={handleVerifyBatch}
          verifyingBatchId={verifyingBatchId}
          onSelectBatch={handleSelectBatch}
        />
      )}

      {/* Architectural Notice Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          backgroundColor: 'var(--color-info-soft)',
          color: 'var(--color-info)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-xs)',
          marginBottom: 'var(--space-6)',
          lineHeight: '18px',
        }}
      >
        <Info size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
        <div>
          <strong>Quy chuẩn Kiến trúc Toàn vẹn:</strong> Dữ liệu từ thiết bị ESP32 được ký ECDSA P-256 và gửi về Backend. Chỉ các bản ghi được xác minh chữ ký thành công mới được gom vào canonical Merkle batch theo chuẩn <code>MERKLE-v1</code>. Merkle root dạng <code>0x + 64 ký tự hex</code> (32 raw bytes) được neo lên Smart Contract để làm bằng chứng bất biến chống chỉnh sửa.
        </div>
      </div>

      {/* MERKLE BATCHES LIST TABLE */}
      <Card
        title="Danh sách Merkle Batches (Merkle Batches Table)"
        description="Toàn bộ các batch dữ liệu đã đóng niêm phong, Merkle root dạng 0x + 64 ký tự hex và trạng thái đối chiếu toàn vẹn."
        style={{ marginBottom: 'var(--space-6)' }}
      >
        <MerkleBatchTable
          batches={batches}
          onVerifyBatch={handleVerifyBatch}
          verifyingBatchId={verifyingBatchId}
          onSelectBatch={handleSelectBatch}
          showFilters={true}
        />
      </Card>

      {/* Modals */}
      <BatchVerificationModal
        isOpen={isVerifyModalOpen}
        onClose={() => {
          setIsVerifyModalOpen(false);
          setVerifyError(null);
        }}
        result={verificationResult}
        error={verifyError}
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
    </div>
  );
};
