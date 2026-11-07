import React, { useState } from 'react';
import { IntegrityBatch } from '../../types/api';
import { Button } from '../ui/Button';
import {
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  FileWarning,
  ExternalLink,
} from 'lucide-react';

interface IntegrityViolationAlertProps {
  failedBatches: IntegrityBatch[];
  onVerifyBatch?: (batchId: string) => Promise<void>;
  verifyingBatchId?: string | null;
  onSelectBatch?: (batch: IntegrityBatch) => void;
}

export const IntegrityViolationAlert: React.FC<IntegrityViolationAlertProps> = ({
  failedBatches,
  onVerifyBatch,
  verifyingBatchId,
  onSelectBatch,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [copiedRootId, setCopiedRootId] = useState<string | null>(null);

  if (!failedBatches || failedBatches.length === 0) {
    return null;
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRootId(id);
    setTimeout(() => setCopiedRootId(null), 2000);
  };

  return (
    <div
      role="alert"
      style={{
        backgroundColor: '#FFF1F2',
        border: '2px solid #E11D48',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        marginBottom: 'var(--space-6)',
        boxShadow: '0 4px 16px rgba(225, 29, 72, 0.12)',
        animation: 'fadeIn 0.25s ease-out',
      }}
    >
      {/* Alert Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#FFE4E6',
              color: '#E11D48',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldAlert size={26} strokeWidth={2.2} />
          </div>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                flexWrap: 'wrap',
              }}
            >
              <h3
                style={{
                  fontSize: 'var(--text-lg)',
                  fontWeight: 700,
                  color: '#9F1239',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                CẢNH BÁO VI PHẠM TOÀN VẸN DỮ LIỆU
              </h3>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-pill)',
                  backgroundColor: '#E11D48',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.04em',
                }}
              >
                DATA_INTEGRITY_FAILED
              </span>
            </div>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: '#BE123C',
                margin: '4px 0 0 0',
                fontWeight: 500,
              }}
            >
              Phát hiện {failedBatches.length} Merkle Batch có Merkle root tính lại từ database <strong>không khớp</strong> với root đã neo (anchored) trên Blockchain.
            </p>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            color: '#BE123C',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {expanded ? (
            <>
              Thu gọn <ChevronUp size={16} />
            </>
          ) : (
            <>
              Chi tiết {failedBatches.length} batch vi phạm <ChevronDown size={16} />
            </>
          )}
        </button>
      </div>

      {/* Crucial Policy & Architecture Warning */}
      <div
        style={{
          marginTop: 'var(--space-4)',
          padding: 'var(--space-3) var(--space-4)',
          backgroundColor: '#FFFFFF',
          borderRadius: 'var(--radius-md)',
          border: '1px solid #FECDD3',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
        }}
      >
        <AlertTriangle size={18} style={{ color: '#E11D48', flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: 'var(--text-xs)', color: '#881337', lineHeight: '18px' }}>
          <strong>Chính sách bồi thường bảo hiểm:</strong> Dữ liệu thuộc các batch này <strong>bị đình chỉ sử dụng</strong> làm bằng chứng hợp lệ để giải quyết chi trả bảo hiểm tự động (Smart Contract Evidence Gate). Mọi yêu cầu bồi thường liên quan sẽ bị chuyển sang trạng thái <em>EVIDENCE_PENDING</em> hoặc <em>BLOCKED</em> cho đến khi hoàn tất thanh tra bảo mật.
        </div>
      </div>

      {/* Expanded List of Compromised Batches */}
      {expanded && (
        <div
          style={{
            marginTop: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          {failedBatches.map((batch) => {
            const isVerifying = verifyingBatchId === batch.batch_id;
            return (
              <div
                key={batch.batch_id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid #FDA4AF',
                  padding: 'var(--space-4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                }}
              >
                {/* Batch Identification Line */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 'var(--space-2)',
                    paddingBottom: 'var(--space-2)',
                    borderBottom: '1px solid #FFE4E6',
                  }}
                >
                  <div className="flex-row items-center gap-3">
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 700,
                        color: '#9F1239',
                      }}
                    >
                      {batch.batch_id}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: '#FFE4E6',
                        color: '#E11D48',
                        fontWeight: 600,
                      }}
                    >
                      {batch.shipment_code || batch.shipment_id}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: '#6E6E73' }}>
                      Thiết bị: <strong>{batch.device_id}</strong>
                    </span>
                  </div>

                  <div className="flex-row items-center gap-2">
                    {onVerifyBatch && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => onVerifyBatch(batch.batch_id)}
                        loading={isVerifying}
                        icon={<RefreshCw size={14} />}
                        title="Yêu cầu Backend tính lại Merkle root từ MySQL và so sánh với on-chain root"
                      >
                        Kiểm tra lại tính toàn vẹn
                      </Button>
                    )}
                    {onSelectBatch && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onSelectBatch(batch)}
                      >
                        Xem chi tiết
                      </Button>
                    )}
                  </div>
                </div>

                {/* Reason description */}
                {batch.failure_reason && (
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: '#9F1239',
                      backgroundColor: '#FFF1F2',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 500,
                    }}
                  >
                    <strong>Lý do vi phạm:</strong> {batch.failure_reason}
                  </div>
                )}

                {/* Merkle Root Comparison Diff */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 'var(--space-3)',
                    backgroundColor: '#FFF5F5',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px dashed #FDA4AF',
                  }}
                >
                  {/* Expected Root */}
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#4B5563',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Merkle Root đã neo on-chain (Kỳ vọng):</span>
                      <button
                        onClick={() => copyToClipboard(batch.merkle_root, `exp-${batch.batch_id}`)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#6B7280',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontSize: '11px',
                        }}
                      >
                        {copiedRootId === `exp-${batch.batch_id}` ? (
                          <>
                            <Check size={11} color="#16A34A" /> Đã chép
                          </>
                        ) : (
                          <>
                            <Copy size={11} /> Chép
                          </>
                        )}
                      </button>
                    </div>
                    <div
                      className="font-mono"
                      style={{
                        fontSize: '11px',
                        color: '#1F2937',
                        backgroundColor: '#FFFFFF',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid #E5E7EB',
                        wordBreak: 'break-all',
                        lineHeight: '15px',
                      }}
                      title={batch.merkle_root}
                    >
                      {batch.merkle_root}
                    </div>
                  </div>

                  {/* Tampered / Recalculated Indicator */}
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#E11D48',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Root tính lại từ Database:</span>
                      <span
                        style={{
                          color: '#E11D48',
                          fontWeight: 700,
                          fontSize: '11px',
                        }}
                      >
                        [KHÔNG TRÙNG KHỚP - MISMATCH]
                      </span>
                    </div>
                    <div
                      className="font-mono"
                      style={{
                        fontSize: '11px',
                        color: '#E11D48',
                        backgroundColor: '#FFF1F2',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid #FECDD3',
                        wordBreak: 'break-all',
                        lineHeight: '15px',
                        fontWeight: 600,
                      }}
                    >
                      {/* Recalculated simulated root */}
                      0x99aa887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbb
                    </div>
                  </div>
                </div>

                {/* Audit Context Footer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 'var(--space-2)',
                    fontSize: '11px',
                    color: '#6E6E73',
                  }}
                >
                  <div>
                    Số bản ghi: <strong>{batch.record_count}</strong> • Sequence: #
                    <strong>{batch.first_sequence_number}</strong> – #
                    <strong>{batch.last_sequence_number}</strong> • Chuẩn:{' '}
                    <strong>{batch.hash_version}</strong>
                  </div>
                  <div>
                    Xác minh lần cuối:{' '}
                    <strong>
                      {batch.last_verified_at
                        ? new Date(batch.last_verified_at).toLocaleString('vi-VN')
                        : 'Vừa phát hiện'}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

