import React, { useState } from 'react';
import { BatchVerifyResultOut, IntegrityBatch } from '../../types/api';
import { Button } from '../ui/Button';
import { VerificationStatusBadge } from '../data-display/StatusBadge';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  X,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface BatchVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: BatchVerifyResultOut | null;
  batch?: IntegrityBatch | null;
  loading?: boolean;
}

export const BatchVerificationModal: React.FC<BatchVerificationModalProps> = ({
  isOpen,
  onClose,
  result,
  batch,
  loading = false,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isMatched = result?.matched ?? false;
  const isFailed = result?.verification_status === 'DATA_INTEGRITY_FAILED';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-popover)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: isFailed ? '#FFF1F2' : 'var(--color-surface-secondary)',
          }}
        >
          <div className="flex-row items-center gap-2">
            {isFailed ? (
              <ShieldAlert size={22} style={{ color: '#E11D48' }} />
            ) : (
              <ShieldCheck size={22} style={{ color: 'var(--color-success)' }} />
            )}
            <div>
              <div
                style={{
                  fontSize: 'var(--text-md)',
                  fontWeight: 600,
                  color: isFailed ? '#9F1239' : 'var(--color-text-primary)',
                }}
              >
                Kết quả Kiểm tra Tính toàn vẹn Merkle Batch
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                Mã Batch: <span className="font-mono">{result?.batch_id || batch?.batch_id}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: 'var(--space-5)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {loading ? (
            <div
              style={{
                padding: 'var(--space-10) var(--space-4)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--space-3)',
              }}
            >
              <div className="spinner" style={{ width: 36, height: 36 }} />
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                Đang yêu cầu Backend tính lại Merkle Root...
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', maxWidth: 420 }}>
                Hệ thống đang duyệt toàn bộ accepted telemetry của batch từ MySQL, tính toán cây Merkle theo chuẩn MERKLE-v1 và đối chiếu với Root đã neo on-chain.
              </p>
            </div>
          ) : result ? (
            <>
              {/* Status Outcome Banner */}
              <div
                style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isFailed ? '#FFF1F2' : 'var(--color-success-soft)',
                  border: `1px solid ${isFailed ? '#FDA4AF' : 'rgba(36, 138, 61, 0.25)'}`,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-3)',
                }}
              >
                {isFailed ? (
                  <XCircle size={24} style={{ color: '#E11D48', flexShrink: 0, marginTop: '2px' }} />
                ) : (
                  <CheckCircle2 size={24} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: '2px' }} />
                )}
                <div>
                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 700,
                      color: isFailed ? '#9F1239' : 'var(--color-success)',
                    }}
                  >
                    {isFailed ? 'PHÁT HIỆN SAI LỆCH TOÀN VẸN (INTEGRITY FAILED)' : 'XÁC MINH TOÀN VẸN THÀNH CÔNG (MATCHED)'}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: isFailed ? '#BE123C' : 'var(--color-text-secondary)',
                      marginTop: '4px',
                      lineHeight: '18px',
                    }}
                  >
                    {result.message}
                  </div>
                </div>
              </div>

              {/* Root Comparison Card */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                  backgroundColor: 'var(--color-surface-secondary)',
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  ĐỐI CHIẾU MERKLE ROOT (CHUẨN 0x + 64 KÝ TỰ HEX)
                </div>

                {/* Expected On-chain Root */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: 'var(--color-text-tertiary)',
                      marginBottom: '4px',
                    }}
                  >
                    <span>1. Merkle Root đã neo on-chain (Kỳ vọng):</span>
                    <button
                      onClick={() => copyToClipboard(result.expected_root, 'expected')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-accent)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                      }}
                    >
                      {copiedKey === 'expected' ? <Check size={12} /> : <Copy size={12} />}
                      {copiedKey === 'expected' ? 'Đã sao chép' : 'Sao chép'}
                    </button>
                  </div>
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '11px',
                      backgroundColor: 'var(--color-surface)',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border-subtle)',
                      wordBreak: 'break-all',
                      color: 'var(--color-text-primary)',
                      lineHeight: '16px',
                    }}
                  >
                    {result.expected_root}
                  </div>
                </div>

                {/* Recalculated Root */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: isFailed ? '#E11D48' : 'var(--color-text-tertiary)',
                      marginBottom: '4px',
                      fontWeight: isFailed ? 600 : 400,
                    }}
                  >
                    <span>2. Merkle Root tính lại từ Database (Thực tế):</span>
                    <button
                      onClick={() => copyToClipboard(result.recalculated_root, 'recalculated')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isFailed ? '#E11D48' : 'var(--color-accent)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                      }}
                    >
                      {copiedKey === 'recalculated' ? <Check size={12} /> : <Copy size={12} />}
                      {copiedKey === 'recalculated' ? 'Đã sao chép' : 'Sao chép'}
                    </button>
                  </div>
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '11px',
                      backgroundColor: isFailed ? '#FFF1F2' : 'var(--color-surface)',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${isFailed ? '#FDA4AF' : 'var(--color-border-subtle)'}`,
                      wordBreak: 'break-all',
                      color: isFailed ? '#E11D48' : 'var(--color-text-primary)',
                      fontWeight: isFailed ? 600 : 400,
                      lineHeight: '16px',
                    }}
                  >
                    {result.recalculated_root}
                  </div>
                </div>

                {/* Match conclusion tag */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--text-xs)',
                    paddingTop: 'var(--space-2)',
                    borderTop: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <span style={{ color: 'var(--color-text-tertiary)' }}>Kết luận đối chiếu:</span>
                  {isMatched ? (
                    <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                      ✓ Trùng khớp hoàn toàn (MATCHED)
                    </span>
                  ) : (
                    <span style={{ color: '#E11D48', fontWeight: 700 }}>
                      ✗ Sai lệch dữ liệu (DATA_INTEGRITY_FAILED)
                    </span>
                  )}
                </div>
              </div>

              {/* Audit Metadata Details */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--space-3)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <div>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>Thời điểm xác minh:</span>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>
                    {new Date(result.verified_at).toLocaleString('vi-VN')}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>Mạng Blockchain:</span>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>
                    {result.network || 'Ethereum Localnet / Hardhat'}
                  </div>
                </div>
              </div>

              {/* Architecture Principle Note */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-2)',
                  fontSize: '11px',
                  color: 'var(--color-text-tertiary)',
                  lineHeight: '16px',
                  padding: '8px 12px',
                  backgroundColor: 'var(--color-canvas)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  <strong>Nguyên tắc Kiến trúc:</strong> Frontend gọi endpoint xác minh từ Backend qua REST API, không tự băm SHA-256 ở client và không lưu giữ khóa riêng tư (Private Key). Merkle root được lưu trữ bất biến trên Smart Contract và làm căn cứ đối chiếu tính toàn vẹn.
                </span>
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-5)',
            borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          <Button variant="secondary" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
};

