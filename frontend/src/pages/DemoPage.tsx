import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ShipmentStatusBadge, InsuranceStatusBadge, BlockchainBadge } from '../components/data-display/StatusBadge';
import { LoadingState } from '../components/feedback/LoadingState';
import { ErrorState } from '../components/feedback/ErrorState';
import { getShipments } from '../api/shipments';
import { triggerDemoScenario } from '../api/demo';
import { ShipmentOut, DemoScenarioOut } from '../types/api';
import {
  FlaskConical,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

export const DemoPage: React.FC = () => {
  const [shipments, setShipments] = useState<ShipmentOut[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [runningScenario, setRunningScenario] = useState<string | null>(null);
  const [scenarioResult, setScenarioResult] = useState<DemoScenarioOut | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchShipmentsList = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getShipments();
      setShipments(data.items);
      if (data.items.length > 0 && !selectedId) {
        setSelectedId(data.items[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi tải danh sách lô hàng demo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipmentsList();
  }, []);

  const handleRunScenario = async (scenario: 'normal' | 'temperature_breach') => {
    if (!selectedId) return;
    setRunningScenario(scenario);
    setActionError(null);
    setScenarioResult(null);

    try {
      const result = await triggerDemoScenario(selectedId, { scenario });
      setScenarioResult(result);
      // Refresh shipments list to show updated state
      await fetchShipmentsList();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Không thể kích hoạt kịch bản demo trên Backend'
      );
    } finally {
      setRunningScenario(null);
    }
  };

  if (loading) {
    return <LoadingState message="Đang nạp môi trường kiểm thử demo..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Lỗi khởi tạo khu vực demo"
        message={error}
        onRetry={fetchShipmentsList}
      />
    );
  }

  const selectedShipment = shipments.find((s) => s.id === selectedId);

  return (
    <div>
      <PageHeader
        title="Khu vực Trình diễn & Mô phỏng Demo"
        description="Thực thi các kịch bản kiểm thử tự động chuỗi nghiệp vụ từ cảm biến đến kích hoạt bảo hiểm Blockchain."
        action={
          <Badge variant="warning" icon={<FlaskConical size={14} />}>
            Môi trường Kiểm thử / Demo
          </Badge>
        }
      />

      {/* Mandatory note */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-secondary)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <Info size={16} style={{ color: 'var(--color-accent)' }} />
        <span>
          <strong>Lưu ý trình diễn:</strong> Endpoint demo rút ngắn thời gian thử thách 15 phút bằng virtual clock của Backend.
          Toàn bộ quy trình xác thực vi phạm, tính toán bằng chứng bồi thường và phát lệnh on-chain đều tuân thủ logic sản xuất.
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-6)',
        }}
      >
        {/* Controls card */}
        <Card
          title="1. Chọn Lô hàng & Kích hoạt Kịch bản"
          description="Lựa chọn lô hàng mục tiêu để chạy kịch bản thử nghiệm"
        >
          <div style={{ marginTop: 'var(--space-4)' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Lô hàng mục tiêu:
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={!!runningScenario}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-5)',
              }}
            >
              {shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.cargo_type} ({s.status})
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* Scenario 1: Temperature breach */}
              <div
                style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: 'var(--color-surface-secondary)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-danger)' }}>
                  Kịch bản: Vi phạm nhiệt độ & Kích hoạt bảo hiểm
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 12px 0' }}>
                  Backend sẽ mô phỏng nhiệt độ tăng vọt &gt; {selectedShipment?.temp_max_c}°C liên tục {selectedShipment?.violation_duration_minutes} phút,
                  tạo sự kiện vi phạm và kích hoạt giao dịch Smart Contract.
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  loading={runningScenario === 'temperature_breach'}
                  disabled={!!runningScenario}
                  onClick={() => handleRunScenario('temperature_breach')}
                  icon={<Play size={14} />}
                >
                  Chạy kịch bản Vi phạm (Temperature Breach)
                </Button>
              </div>

              {/* Scenario 2: Normal reset */}
              <div
                style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: 'var(--color-surface-secondary)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                  Kịch bản: Vận hành bình thường (Reset)
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 12px 0' }}>
                  Đưa nhiệt độ về dải an toàn ({selectedShipment?.temp_min_c} - {selectedShipment?.temp_max_c}°C),
                  thiết lập lại trạng thái lô hàng về đang vận chuyển bình thường.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={runningScenario === 'normal'}
                  disabled={!!runningScenario}
                  onClick={() => handleRunScenario('normal')}
                  icon={<RotateCcw size={14} />}
                >
                  Khôi phục kịch bản Bình thường
                </Button>
              </div>
            </div>

            {actionError && (
              <div
                style={{
                  marginTop: 'var(--space-4)',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-danger-soft)',
                  color: 'var(--color-danger)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertTriangle size={14} />
                <span>{actionError}</span>
              </div>
            )}
          </div>
        </Card>

        {/* State preview card */}
        <Card
          title="2. Trạng thái Hiện tại & Phản hồi"
          description="Kết quả thời gian thực sau khi thực thi kịch bản"
        >
          {selectedShipment ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <div
                style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface-secondary)',
                  border: '1px solid var(--color-border)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <div className="flex-row items-center justify-between" style={{ marginBottom: 'var(--space-2)' }}>
                  <span className="font-mono" style={{ fontWeight: 600 }}>{selectedShipment.code}</span>
                  <ShipmentStatusBadge status={selectedShipment.status} />
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  Nhiệt độ hiện thời:{' '}
                  <strong>
                    {selectedShipment.latest_telemetry
                      ? `${selectedShipment.latest_telemetry.temperature_c.toFixed(1)}°C`
                      : 'Chưa có'}
                  </strong>{' '}
                  (Chuẩn: {selectedShipment.temp_min_c} - {selectedShipment.temp_max_c}°C)
                </div>
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <InsuranceStatusBadge
                    status={selectedShipment.insurance.status}
                    payoutStatus={selectedShipment.insurance.payout_status}
                  />
                </div>
                {selectedShipment.blockchain && (
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <BlockchainBadge status={selectedShipment.blockchain.confirmation_status} />
                  </div>
                )}
              </div>

              {/* Scenario execution sequence summary */}
              {scenarioResult && (
                <div
                  style={{
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-success-soft)',
                    border: '1px solid rgba(36, 138, 61, 0.2)',
                  }}
                >
                  <div className="flex-row items-center gap-2" style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                    <CheckCircle2 size={16} />
                    <span>Kịch bản thực thi thành công</span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)' }}>
                    Số mẫu được tạo: <strong>{scenarioResult.generated_samples}</strong> • Trạng thái lô hàng mới:{' '}
                    <strong>{scenarioResult.shipment_status}</strong>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-4)' }}>
              Vui lòng chọn một lô hàng bên trái để xem trạng thái.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

