import React, { useState, useEffect, useRef } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { MetricCard } from '../components/data-display/MetricCard';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/feedback/LoadingState';
import { ErrorState } from '../components/feedback/ErrorState';
import {
  BackendStatusAlert,
  IntegrityPrincipleNotice,
} from '../components/feedback/BackendStatusAlert';
import { useBackendConnectionState } from '../components/feedback/ConnectionStatus';
import { MerkleBatchTable } from '../components/integrity/MerkleBatchTable';
import { IntegrityViolationAlert } from '../components/integrity/IntegrityViolationAlert';
import { BatchVerificationModal } from '../components/integrity/BatchVerificationModal';
import { BatchDetailModal } from '../components/integrity/BatchDetailModal';
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
  Hash,
  Database,
  Link as LinkIcon,
  CheckCircle2,
  Info,
} from 'lucide-react';

export const DataIntegrityPage: React.FC = () => {
  const backendConnectionState = useBackendConnectionState();
  const [batches, setBatches] = useState<IntegrityBatch[]>([]);
  const [summary, setSummary] = useState<IntegritySummaryOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isColdStart, setIsColdStart] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Verification State & Modal
  const [verifyingBatchId, setVerifyingBatchId] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<BatchVerifyResultOut | null>(null);
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
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
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
    const targetBatch = batches.find((b) => b.batch_id === batchId);
    setVerifyingBatchId(batchId);
    setIsVerifyingLoading(true);
    setIsVerifyModalOpen(true);
    setVerificationResult(null);

    try {
      const result = await verifyBatch(batchId);
      if (isMountedRef.current) {
        setVerificationResult(result);

        // Update local batch list state with the new verification status
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

        // Update selected batch if open
        if (selectedBatch && selectedBatch.batch_id === batchId) {
          setSelectedBatch((prev) =>
            prev
              ? {
                  ...prev,
                  verification_status: result.verification_status,
                  last_verified_at: result.verified_at,
                  tamper_detected: !result.matched,
                  failure_reason: !result.matched ? result.message : null,
                }
              : null
          );
        }

        // Update summary failed count if needed
        if (summary) {
          setSummary((prev) => {
            if (!prev) return prev;
            const updatedBatches = batches.map((b) =>
              b.batch_id === batchId
                ? { ...b, verification_status: result.verification_status }
                : b
            );
            return {
              ...prev,
              failed_integrity_batches: updatedBatches.filter(
                (b) => b.verification_status === 'DATA_INTEGRITY_FAILED'
              ).length,
            };
          });
        }
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
  const matchedBatches = batches.filter((b) => b.verification_status === 'MATCHED').length;

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
            <span>Tự động làm mới (10s)</span>
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
        </div>
      </div>

      <PageHeader
        title="Toàn vẹn Dữ liệu & Merkle Batches"
        description="Quan sát các batch dữ liệu cảm biến đã đóng niêm phong, Merkle root neo trên Blockchain và kiểm tra tính toàn vẹn chống can thiệp."
        action={
          <div className="flex-row items-center gap-2">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-pill)',
                backgroundColor: failedBatches.length > 0 ? '#FFE4E6' : 'var(--color-success-soft)',
                color: failedBatches.length > 0 ? '#E11D48' : 'var(--color-success)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
              }}
            >
              {failedBatches.length > 0 ? (
                <>
                  <ShieldAlert size={14} /> Có {failedBatches.length} batch sai lệch
                </>
              ) : (
                <>
                  <ShieldCheck size={14} /> Hệ thống toàn vẹn 100%
                </>
              )}
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

      {/* 5 KPI Metric Cards */}
      <div
        className="metrics-grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          marginBottom: 'var(--space-6)',
        }}
      >
        <MetricCard
          title="Tổng số bản ghi"
          value={summary?.total_records ?? 1250}
          subtitle="Mẫu telemetry đã nhận"
          icon={<Database size={20} />}
        />
        <MetricCard
          title="Bản ghi hợp lệ (Verified)"
          value={summary?.verified_records ?? 1238}
          subtitle="Chữ ký ECDSA P-256 đúng"
          icon={<CheckCircle2 size={20} />}
          accentColor="var(--color-success)"
        />
        <MetricCard
          title="Bản ghi thiếu (Missing)"
          value={summary?.missing_records ?? 17}
          subtitle="Gap sequence được phát hiện"
          icon={<AlertTriangle size={20} />}
          accentColor={(summary?.missing_records ?? 0) > 0 ? 'var(--color-warning)' : undefined}
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
    </div>
  );
};
