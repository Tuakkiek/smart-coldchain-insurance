import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { IntegrityBatch, AnchorStatus, VerificationStatus } from '../../types/api';
import { AnchorStatusBadge, VerificationStatusBadge } from '../data-display/StatusBadge';
import { Button } from '../ui/Button';
import {
  Layers,
  Search,
  Filter,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Eye,
  AlertTriangle,
} from 'lucide-react';

interface MerkleBatchTableProps {
  batches: IntegrityBatch[];
  onVerifyBatch: (batchId: string) => Promise<void>;
  verifyingBatchId?: string | null;
  onSelectBatch?: (batch: IntegrityBatch) => void;
  showFilters?: boolean;
}

export const MerkleBatchTable: React.FC<MerkleBatchTableProps> = ({
  batches,
  onVerifyBatch,
  verifyingBatchId,
  onSelectBatch,
  showFilters = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [anchorFilter, setAnchorFilter] = useState<string>('all');
  const [verificationFilter, setVerificationFilter] = useState<string>('all');
  const [copiedRootId, setCopiedRootId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedRootId(id);
    setTimeout(() => setCopiedRootId(null), 2000);
  };

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        b.batch_id.toLowerCase().includes(term) ||
        (b.shipment_code && b.shipment_code.toLowerCase().includes(term)) ||
        b.shipment_id.toLowerCase().includes(term) ||
        b.device_id.toLowerCase().includes(term) ||
        b.merkle_root.toLowerCase().includes(term);

      const matchesAnchor =
        anchorFilter === 'all' || b.anchor_status === anchorFilter;

      const matchesVerification =
        verificationFilter === 'all' || b.verification_status === verificationFilter;

      return matchesSearch && matchesAnchor && matchesVerification;
    });
  }, [batches, searchTerm, anchorFilter, verificationFilter]);

  const truncateHex = (hex: string) => {
    if (!hex) return 'N/A';
    if (hex.length <= 16) return hex;
    return `${hex.slice(0, 10)}...${hex.slice(-8)}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Search and Filters Bar */}
      {showFilters && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-surface-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          {/* Search Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              minWidth: 260,
              flex: 1,
            }}
          >
            <Search size={15} style={{ color: 'var(--color-text-tertiary)' }} />
            <input
              type="text"
              placeholder="Tìm theo Batch ID, Lô hàng, ESP32, Root hex..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontSize: 'var(--text-xs)',
                width: '100%',
                color: 'var(--color-text-primary)',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'var(--color-text-tertiary)',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex-row items-center gap-3" style={{ flexWrap: 'wrap' }}>
            <div className="flex-row items-center gap-2">
              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
                Neo Blockchain:
              </span>
              <select
                value={anchorFilter}
                onChange={(e) => setAnchorFilter(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                }}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="DATA_ANCHORED">Đã neo (DATA_ANCHORED)</option>
                <option value="BLOCKCHAIN_PENDING">Đang chờ (PENDING)</option>
                <option value="NOT_READY">Chưa sẵn sàng (NOT_READY)</option>
                <option value="BLOCKCHAIN_FAILED">Thất bại (FAILED)</option>
              </select>
            </div>

            <div className="flex-row items-center gap-2">
              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
                Đối chiếu:
              </span>
              <select
                value={verificationFilter}
                onChange={(e) => setVerificationFilter(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                }}
              >
                <option value="all">Tất cả đối chiếu</option>
                <option value="MATCHED">Toàn vẹn khớp (MATCHED)</option>
                <option value="DATA_INTEGRITY_FAILED">Sai lệch (INTEGRITY_FAILED)</option>
                <option value="NOT_CHECKED">Chưa đối chiếu (NOT_CHECKED)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Batches Table */}
      {filteredBatches.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-10) var(--space-4)',
            textAlign: 'center',
            backgroundColor: 'var(--color-surface-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--color-border)',
          }}
        >
          <Layers size={36} style={{ color: 'var(--color-text-tertiary)', margin: '0 auto 12px auto' }} />
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Không tìm thấy Merkle Batch nào
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            Không có dữ liệu batch khớp với bộ lọc hiện tại.
          </p>
        </div>
      ) : (
        <div
          style={{
            overflowX: 'auto',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface)',
          }}
        >
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
                  borderBottom: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                <th style={{ padding: '10px 14px' }}>Mã Batch (batch_id)</th>
                <th style={{ padding: '10px 14px' }}>Lô hàng & ESP32</th>
                <th style={{ padding: '10px 14px' }}>Khoảng thời gian (Time Range)</th>
                <th style={{ padding: '10px 14px' }}>Số mẫu (Count)</th>
                <th style={{ padding: '10px 14px' }}>Merkle Root (0x + 64 hex chars)</th>
                <th style={{ padding: '10px 14px' }}>Neo Blockchain</th>
                <th style={{ padding: '10px 14px' }}>Đối chiếu Toàn vẹn</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map((batch) => {
                const isVerifying = verifyingBatchId === batch.batch_id;
                const isIntegrityFailed = batch.verification_status === 'DATA_INTEGRITY_FAILED';

                return (
                  <tr
                    key={batch.batch_id}
                    style={{
                      borderBottom: '1px solid var(--color-border-subtle)',
                      backgroundColor: isIntegrityFailed
                        ? '#FFF5F5'
                        : 'var(--color-surface)',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isIntegrityFailed) {
                        e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isIntegrityFailed
                        ? '#FFF5F5'
                        : 'var(--color-surface)';
                    }}
                  >
                    {/* Batch ID */}
                    <td style={{ padding: '10px 14px' }}>
                      <div className="flex-row items-center gap-2">
                        <span
                          className="font-mono"
                          style={{
                            fontWeight: 700,
                            color: isIntegrityFailed ? '#E11D48' : 'var(--color-text-primary)',
                          }}
                        >
                          {batch.batch_id}
                        </span>
                        <button
                          onClick={(e) => copyToClipboard(batch.batch_id, `id-${batch.batch_id}`, e)}
                          title="Sao chép batch_id"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-text-tertiary)',
                            padding: '2px',
                            display: 'flex',
                          }}
                        >
                          {copiedRootId === `id-${batch.batch_id}` ? (
                            <Check size={12} color="#16A34A" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                        {batch.hash_version}
                      </div>
                    </td>

                    {/* Shipment & Device */}
                    <td style={{ padding: '10px 14px' }}>
                      <div>
                        <Link
                          to={`/shipments/${batch.shipment_id}`}
                          style={{
                            fontWeight: 600,
                            color: 'var(--color-accent)',
                            textDecoration: 'none',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {batch.shipment_code || batch.shipment_id.slice(0, 8)}
                        </Link>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                        Thiết bị: <span className="font-mono">{batch.device_id}</span>
                      </div>
                    </td>

                    {/* Time Range */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                        <span>
                          {new Date(batch.batch_start_time).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          –{' '}
                          {new Date(batch.batch_end_time).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                        {new Date(batch.batch_start_time).toLocaleDateString('vi-VN')}
                      </div>
                    </td>

                    {/* Record count & sequence */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div className="tabular-nums" style={{ fontWeight: 600 }}>
                        {batch.record_count} bản ghi
                      </div>
                      <div
                        className="font-mono"
                        style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}
                      >
                        #{batch.first_sequence_number} – #{batch.last_sequence_number}
                      </div>
                    </td>

                    {/* Merkle Root (0x + 64 hex characters) */}
                    <td style={{ padding: '10px 14px' }}>
                      <div className="flex-row items-center gap-2">
                        <span
                          className="font-mono"
                          title={`Toàn bộ Merkle Root (66 ký tự):\n${batch.merkle_root}`}
                          style={{
                            fontSize: '11px',
                            backgroundColor: isIntegrityFailed ? '#FFE4E6' : 'var(--color-surface-secondary)',
                            color: isIntegrityFailed ? '#BE123C' : 'var(--color-text-primary)',
                            padding: '3px 6px',
                            borderRadius: 'var(--radius-sm)',
                            border: `1px solid ${isIntegrityFailed ? '#FDA4AF' : 'var(--color-border-subtle)'}`,
                            fontWeight: isIntegrityFailed ? 700 : 500,
                            letterSpacing: '0.02em',
                          }}
                        >
                          {truncateHex(batch.merkle_root)}
                        </span>
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={(e) => copyToClipboard(batch.merkle_root, `root-${batch.batch_id}`, e)}
                          title="Sao chép toàn bộ Merkle Root 64 ký tự hex"
                          icon={
                            copiedRootId === `root-${batch.batch_id}` ? (
                              <Check size={12} color="#16A34A" />
                            ) : (
                              <Copy size={12} />
                            )
                          }
                          style={{ padding: '4px 6px', height: '24px', fontSize: '10px' }}
                        >
                          {copiedRootId === `root-${batch.batch_id}` ? 'Đã chép' : 'Chép'}
                        </Button>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                        Độ dài: {batch.merkle_root.length} chars (0x + 64 hex)
                      </div>
                    </td>

                    {/* Anchor Status */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <AnchorStatusBadge status={batch.anchor_status} />
                    </td>

                    {/* Verification Status */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <VerificationStatusBadge
                        status={batch.verification_status}
                        lastVerifiedAt={batch.last_verified_at}
                      />
                    </td>

                    {/* Actions: Verify batch button & view detail */}
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div className="flex-row items-center justify-end gap-2">
                        {/* NÚT HÀNH ĐỘNG: KIỂM TRA LẠI TÍNH TOÀN VẸN (VERIFY BATCH) */}
                        <Button
                          variant={isIntegrityFailed ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onVerifyBatch(batch.batch_id);
                          }}
                          loading={isVerifying}
                          icon={<RefreshCw size={13} />}
                          title="Yêu cầu Backend đối chiếu lại Merkle Root từ MySQL với Blockchain"
                          style={{ fontSize: '11px', padding: '5px 9px' }}
                        >
                          Kiểm tra lại tính toàn vẹn
                        </Button>

                        {onSelectBatch && (
                          <Button
                            variant="tertiary"
                            size="sm"
                            onClick={() => onSelectBatch(batch)}
                            title="Xem chi tiết toàn bộ metadata của batch"
                            icon={<Eye size={13} />}
                            style={{ padding: '5px 8px' }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Table Footer info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          padding: '0 var(--space-1)',
        }}
      >
        <span>
          Hiển thị <strong>{filteredBatches.length}</strong> / <strong>{batches.length}</strong> Merkle Batch
        </span>
        <span>
          Quy tắc băm: <strong>MERKLE-v1</strong> (SHA-256 canonical projection) • Smart Contract lưu Root 32 bytes
        </span>
      </div>
    </div>
  );
};

