import React, { useMemo, useState } from 'react';
import { Eye, RefreshCw, Search } from 'lucide-react';
import { AnchorStatusBadge, VerificationStatusBadge } from '../data-display/StatusBadge';
import { EmptyState } from '../feedback/EmptyState';
import { Button } from '../ui/Button';
import { IntegrityBatch } from '../../types/api';

interface MerkleBatchTableProps {
  batches: IntegrityBatch[];
  onVerifyBatch: (batchId: string) => Promise<void>;
  verifyingBatchId?: string | null;
  onSelectBatch?: (batch: IntegrityBatch) => void;
  showFilters?: boolean;
}

const shortId = (value: string) => value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;

export const MerkleBatchTable: React.FC<MerkleBatchTableProps> = ({
  batches,
  onVerifyBatch,
  verifyingBatchId,
  onSelectBatch,
  showFilters = true,
}) => {
  const [search, setSearch] = useState('');
  const [anchor, setAnchor] = useState('all');
  const [verification, setVerification] = useState('all');
  const filtered = useMemo(() => batches.filter((batch) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || batch.batch_id.toLowerCase().includes(term) || batch.shipment_name?.toLowerCase().includes(term) || batch.device_id.toLowerCase().includes(term);
    return matchesSearch && (anchor === 'all' || batch.anchor_status === anchor) && (verification === 'all' || batch.verification_status === verification);
  }), [anchor, batches, search, verification]);

  return (
    <div>
      {showFilters && <div className="filter-bar" style={{ marginBottom: 12 }}>
        <label className="search-field"><Search size={15} color="var(--color-text-tertiary)" /><input aria-label="Tìm Merkle batch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm batch, lô hàng hoặc thiết bị" /></label>
        <select className="minimal-select" aria-label="Lọc trạng thái neo" value={anchor} onChange={(event) => setAnchor(event.target.value)}><option value="all">Tất cả blockchain</option><option value="DATA_ANCHORED">Đã neo</option><option value="BLOCKCHAIN_PENDING">Đang chờ</option><option value="NOT_READY">Chưa sẵn sàng</option><option value="BLOCKCHAIN_FAILED">Thất bại</option></select>
        <select className="minimal-select" aria-label="Lọc đối chiếu" value={verification} onChange={(event) => setVerification(event.target.value)}><option value="all">Tất cả đối chiếu</option><option value="MATCHED">Khớp</option><option value="DATA_INTEGRITY_FAILED">Sai lệch</option><option value="NOT_CHECKED">Chưa kiểm tra</option></select>
      </div>}

      {filtered.length === 0 ? <EmptyState title="Không có Merkle batch phù hợp" description="Thử thay đổi bộ lọc hoặc chờ hệ thống tạo batch mới." /> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="compact-table">
            <thead><tr><th>Batch</th><th>Số bản ghi</th><th>Blockchain</th><th>Đối chiếu</th><th>Thao tác</th></tr></thead>
            <tbody>
              {filtered.map((batch) => {
                const failed = batch.verification_status === 'DATA_INTEGRITY_FAILED' || batch.tamper_detected;
                return <tr key={batch.batch_id} style={{ background: failed ? 'var(--color-danger-soft)' : undefined }}>
                  <td><div className="compact-title font-mono" title={batch.batch_id}>{shortId(batch.batch_id)}</div><div className="compact-meta">{batch.shipment_name || 'Lô hàng'} · {batch.device_id}</div></td>
                  <td><strong className="tabular-nums">{batch.record_count}</strong><div className="compact-meta">{batch.sealed_at ? new Date(batch.sealed_at).toLocaleString('vi-VN') : 'Chưa niêm phong'}</div></td>
                  <td><AnchorStatusBadge status={batch.anchor_status} /></td>
                  <td><VerificationStatusBadge status={batch.verification_status} lastVerifiedAt={batch.verified_at ?? batch.last_verified_at} /></td>
                  <td><div className="flex-row gap-2"><Button variant={failed ? 'danger' : 'secondary'} size="sm" loading={verifyingBatchId === batch.batch_id} disabled={Boolean(verifyingBatchId)} onClick={() => onVerifyBatch(batch.batch_id)} icon={<RefreshCw size={13} />}>Kiểm tra</Button>{onSelectBatch && <Button variant="tertiary" size="sm" onClick={() => onSelectBatch(batch)} icon={<Eye size={14} />} aria-label="Xem chi tiết batch" />}</div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
