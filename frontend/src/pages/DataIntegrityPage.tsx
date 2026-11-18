import React, { useState, useEffect, useRef } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { MetricCard } from '../components/data-display/MetricCard';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/feedback/LoadingState';
import { EmptyState } from '../components/feedback/EmptyState';
import { MerkleBatchTable } from '../components/integrity/MerkleBatchTable';
import { IntegrityViolationAlert } from '../components/integrity/IntegrityViolationAlert';
import { BatchVerificationModal } from '../components/integrity/BatchVerificationModal';
import { BatchDetailModal } from '../components/integrity/BatchDetailModal';
import { formatApiErrorMessage, isRequestCancelled, useToast } from '../components/feedback/Toast';
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
import { Layers, ShieldAlert, RefreshCw, Link as LinkIcon } from 'lucide-react';

export const DataIntegrityPage: React.FC = () => {
  const { toast } = useToast();
  const [batches, setBatches] = useState<IntegrityBatch[]>([]);
  const [summary, setSummary] = useState<IntegritySummaryOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
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
  const wasStaleRef = useRef(false);

  const fetchData = async (isBackground = false, notifyManual = false) => {
    if (!isBackground) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setLoadFailed(false);

    try {
      const [batchesRes, summaryRes] = await Promise.all([
        getIntegrityBatches(),
        getIntegritySummary().catch(() => null),
      ]);

      if (isMountedRef.current) {
        setBatches(batchesRes.items);
        setSummary(summaryRes);
        wasStaleRef.current = false;
        if (notifyManual) {
          toast.success('Đã cập nhật dữ liệu Merkle Batches.', { title: 'Làm mới thành công' });
        }
      }
    } catch (err: unknown) {
      if (isRequestCancelled(err)) return;
      if (isMountedRef.current) {
        const coldStart = err instanceof ApiError && !!err.isBackendColdStart;
        const msg = formatApiErrorMessage(err, 'Không thể tải danh sách Merkle Batch. Vui lòng thử lại.');

        if (!isBackground) {
          setLoadFailed(true);
          if (coldStart) {
            toast.warning(msg, {
              title: 'Backend đang khởi động',
              dedupKey: 'integrity-cold-start',
              action: { label: 'Thử lại', onClick: () => fetchData(false) },
            });
          } else if (msg) {
            toast.error(msg, {
              title: 'Lỗi tải dữ liệu Merkle Batches',
              dedupKey: 'integrity-fetch-error',
              action: { label: 'Thử lại', onClick: () => fetchData(false) },
            });
          }
        } else if (notifyManual) {
          if (msg) {
            toast.error(msg, { title: 'Lỗi làm mới Merkle Batches' });
          }
        } else if (!wasStaleRef.current) {
          wasStaleRef.current = true;
          toast.warning(
            'Đồng bộ Merkle Batches tự động tạm thời gián đoạn. Đang hiển thị dữ liệu gần nhất.',
            {
              title: 'Chưa cập nhật dữ liệu mới',
              dedupKey: 'integrity-polling-error',
              action: { label: 'Thử lại', onClick: () => fetchData(true, true) },
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
        setIsVerifyModalOpen(false);
        // CRITICAL: Do NOT fabricate DATA_INTEGRITY_FAILED on API/network errors!
        if (!isRequestCancelled(err)) {
          const errorMsg = formatApiErrorMessage(
            err,
            'Không thể gửi yêu cầu xác minh tới Backend. Trạng thái toàn vẹn của batch được giữ nguyên.'
          );
          if (errorMsg) {
            toast.error(errorMsg, { title: 'Lỗi xác minh Merkle' });
          }
        }
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

  if (loading && batches.length === 0) {
    return <LoadingState fullPage message="Đang nạp danh sách Merkle Batches và trạng thái neo Blockchain..." />;
  }

  if (loadFailed && batches.length === 0) {
    return (
      <div>
        <PageHeader
          title="Blockchain"
          description="Theo dõi trạng thái neo và đối chiếu Merkle batch."
        />
        <EmptyState
          title="Chưa thể tải dữ liệu Merkle Batches"
          description="Vui lòng kiểm tra kết nối máy chủ Backend và thử tải lại."
          actionText="Thử lại"
          onAction={() => fetchData(false)}
          icon={<Layers size={24} />}
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
  return (
    <div>
      <PageHeader
        title="Blockchain"
        description="Trạng thái neo và đối chiếu toàn vẹn dữ liệu."
        action={<div className="flex-row items-center gap-3"><label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Tự động (10s)</label><Button size="sm" onClick={() => fetchData(true, true)} loading={refreshing} icon={<RefreshCw size={14} />}>Làm mới</Button></div>}
      />

      <div className="metrics-grid integrity-metrics">
        <MetricCard
          title="Tổng Merkle batch"
          value={summary?.batch_count ?? totalBatches}
          icon={<Layers size={20} />}
        />
        <MetricCard
          title="Đã neo blockchain"
          value={anchoredBatches}
          icon={<LinkIcon size={20} />}
          accentColor="var(--color-accent)"
        />
        <MetricCard
          title="Đối chiếu thất bại"
          value={failedBatches.length}
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


      <Card
        title="Merkle batches"
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
