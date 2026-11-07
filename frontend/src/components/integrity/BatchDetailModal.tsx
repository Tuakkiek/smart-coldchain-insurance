import React, { useState } from 'react';
import { IntegrityBatch } from '../../types/api';
import { Button } from '../ui/Button';
import { AnchorStatusBadge, VerificationStatusBadge } from '../data-display/StatusBadge';
import {
  Layers,
  Copy,
  Check,
  X,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Clock,
  Cpu,
  Truck,
  Hash,
  Database,
} from 'lucide-react';

interface BatchDetailModalProps {
  batch: IntegrityBatch | null;
  isOpen: boolean;
  onClose: () => void;
  onVerify?: (batchId: string) => Promise<void>;
  isVerifying?: boolean;
}

export const BatchDetailModal: React.FC<BatchDetailModalProps> = ({
  batch,
  isOpen,
  onClose,
  onVerify,
  isVerifying = false,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen || !batch) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isIntegrityFailed = batch.verification_status === 'DATA_INTEGRITY_FAILED';

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
          maxWidth: 680,
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-popover)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: isIntegrityFailed ? '#FFF1F2' : 'var(--color-surface-secondary)',
          }}
        >
          <div className="flex-row items-center gap-3">
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 'var(--radius-md)',
                backgroundColor: isIntegrityFailed ? '#FFE4E6' : 'var(--color-accent-soft)',
                color: isIntegrityFailed ? '#E11D48' : 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Layers size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: 'var(--text-md)', fontWeight: 700 }}>
                  Chi tiết Merkle Batch
                </span>
                <span
                  className="font-mono"
                  style={{
                    fontSize: 'var(--text-xs)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    fontWeight: 600,
                  }}
                >
                  {batch.batch_id}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                Chuẩn băm: <strong>{batch.hash_version}</strong> • Domain: 0x00 (leaf) / 0x01 (node)
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

        {/* Content */}
        <div
          style={{
            padding: 'var(--space-5)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {/* Prominent Warning if integrity failed */}
          {isIntegrityFailed && (
            <div
              style={{
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: '#FFF1F2',
                border: '1.5px solid #E11D48',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
              }}
            >
              <ShieldAlert size={22} style={{ color: '#E11D48', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: '#9F1239' }}>
                  CẢNH BÁO: DỮ LIỆU BATCH ĐÃ BỊ THAY ĐỔI (DATA_INTEGRITY_FAILED)
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: '#BE123C', marginTop: '4px', lineHeight: '18px' }}>
                  {batch.failure_reason ||
                    'Merkle root tính lại từ database không khớp với root đã neo on-chain. Dữ liệu batch này bị nghi ngờ can thiệp và không được sử dụng để thanh toán bồi thường tự động.'}
                </div>
              </div>
            </div>
          )}

          {/* Status Badges Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-4)',
              padding: 'var(--space-4)',
              backgroundColor: 'var(--color-surface-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '6px' }}>
                Trạng thái Neo Blockchain (Anchor Status)
              </div>
              <AnchorStatusBadge status={batch.anchor_status} />
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '6px' }}>
                Trạng thái Đối chiếu Tính toàn vẹn (Verification Status)
              </div>
              <VerificationStatusBadge
                status={batch.verification_status}
                lastVerifiedAt={batch.last_verified_at}
              />
            </div>
          </div>

          {/* Cryptographic Merkle Root (0x + 64 hex characters) */}
          <div
            style={{
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px',
              }}
            >
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Merkle Root (Chuẩn 0x + 64 hex characters - 32 raw bytes):
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copyToClipboard(batch.merkle_root, 'root')}
                icon={copiedKey === 'root' ? <Check size={12} /> : <Copy size={12} />}
                style={{ fontSize: '11px', height: '26px' }}
              >
                {copiedKey === 'root' ? 'Đã sao chép' : 'Sao chép Root'}
              </Button>
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: '12px',
                padding: '10px 12px',
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                wordBreak: 'break-all',
                color: isIntegrityFailed ? '#E11D48' : 'var(--color-text-primary)',
                fontWeight: 600,
                lineHeight: '18px',
              }}
            >
              {batch.merkle_root}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
              Độ dài chuỗi: <strong>{batch.merkle_root.length} ký tự</strong> (tiền tố 0x + 64 ký tự hex hợp lệ)
            </div>
          </div>

          {/* On-chain Anchor Transaction */}
          <div
            style={{
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface-secondary)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              Giao dịch Neo Blockchain (Anchor Transaction Hash):
            </div>
            {batch.anchor_tx_hash ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <div
                  className="font-mono"
                  style={{
                    flex: 1,
                    fontSize: '12px',
                    padding: '8px 10px',
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border-subtle)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--color-text-primary)',
                  }}
                  title={batch.anchor_tx_hash}
                >
                  {batch.anchor_tx_hash}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(batch.anchor_tx_hash || '', 'tx')}
                  icon={copiedKey === 'tx' ? <Check size={12} /> : <Copy size={12} />}
                  style={{ fontSize: '11px', height: '28px' }}
                >
                  {copiedKey === 'tx' ? 'Đã chép' : 'Chép'}
                </Button>
              </div>
            ) : (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                Chưa có giao dịch on-chain (Batch đang thu thập hoặc đang chờ xác nhận).
              </div>
            )}
          </div>

          {/* Key Properties Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-3)',
              fontSize: 'var(--text-xs)',
            }}
          >
            <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Truck size={13} /> Lô hàng (Shipment):
              </div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: 'var(--color-text-primary)' }}>
                {batch.shipment_code || batch.shipment_id}
              </div>
            </div>

            <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Cpu size={13} /> Thiết bị ESP32:
              </div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: 'var(--color-text-primary)' }}>
                {batch.device_id}
              </div>
            </div>

            <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Hash size={13} /> Số bản ghi & Sequence:
              </div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: 'var(--color-text-primary)' }}>
                {batch.record_count} mẫu (#{batch.first_sequence_number} – #{batch.last_sequence_number})
              </div>
            </div>

            <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} /> Khoảng thời gian thu thập:
              </div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: 'var(--color-text-primary)' }}>
                {new Date(batch.batch_start_time).toLocaleTimeString('vi-VN')} –{' '}
                {new Date(batch.batch_end_time).toLocaleTimeString('vi-VN')}
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Verify action button */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
            Xác minh lần cuối:{' '}
            <strong>
              {batch.last_verified_at
                ? new Date(batch.last_verified_at).toLocaleString('vi-VN')
                : 'Chưa đối chiếu'}
            </strong>
          </div>

          <div className="flex-row items-center gap-2">
            {onVerify && (
              <Button
                variant={isIntegrityFailed ? 'danger' : 'primary'}
                size="sm"
                onClick={() => onVerify(batch.batch_id)}
                loading={isVerifying}
                icon={<RefreshCw size={14} />}
              >
                Kiểm tra lại tính toàn vẹn
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

