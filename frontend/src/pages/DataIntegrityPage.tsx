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
import { ApiError } from '../api/client';
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

  const isVerifyingRef = useRef(false);
  isVerifyingRef.current = isVerifyingLoading;

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();

    let timer: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      timer = setInterval(() => {
        if (isVerifyingRef.current) return;
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


    try {
      const result = await verifyBatch(batchId);
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

  if (loading && batches.length === 0) {
    return <LoadingState fullPage message="Đang nạp danh sách Merkle Batches và trạng thái neo Blockchain..." />;
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

  const getOverallVerificationDisplay = () => {
    const status = summary?.verification_status ?? (failedBatches.length > 0 ? 'DATA_INTEGRITY_FAILED' : batches.length > 0 ? 'MATCHED' : 'NOT_CHECKED');
    switch (status) {
      case 'MATCHED':
        return {
          text: 'Toàn vẹn khớp',
          subtitle: 'Đối soát Merkle Root trùng khớp',
          color: 'var(--color-success)',
        };
      case 'DATA_INTEGRITY_FAILED':
        return {
          text: 'Sai lệch dữ liệu',
          subtitle: 'Phát hiện can thiệp Merkle Root!',
          color: 'var(--color-danger)',
        };
      case 'NOT_CHECKED':
      default:
        return {
          text: 'Chưa đối chiếu',
          subtitle: 'Chưa kiểm tra Merkle Root',
          color: 'var(--color-neutral)',
        };
    }
  };

  return (
    <div>
      {/* Top Controls */}
      <div
        className="flex-row items-center justify-between"
        style={{ marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}
      >

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
            onClick={() => {
              fetchData(true);
              toast.info('Đang làm mới dữ liệu Merkle Batches...', { title: 'Làm mới', duration: 2500 });
            }}
            loading={refreshing}
            disabled={loading || refreshing}
            icon={<RefreshCw size={14} />}
          >
            Làm mới
          </Button>
        </div>
      </div>

      <PageHeader
        title="Toàn vẹn Dữ liệu & Merkle Batches"
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
          value={getOverallVerificationDisplay().text}
          subtitle={getOverallVerificationDisplay().subtitle}
          icon={<CheckCircle2 size={20} />}
          accentColor={getOverallVerificationDisplay().color}
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


      {/* MERKLE BATCHES LIST TABLE */}
      <Card
        title="Danh sách Merkle Batches (Merkle Batches Table)"
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
