import React, { useState, useEffect } from 'react';
import { TelemetryCreatePayload, TelemetryOut } from '../../types/api';
import { postShipmentTelemetry } from '../../api/shipments';
import { Button } from '../ui/Button';
import { ApiError } from '../../api/client';
import {
  Radio,
  X,
  Thermometer,
  Droplets,
  Cpu,
  Clock,
  AlertTriangle,
  CheckCircle,
  Info,
} from 'lucide-react';

interface SendTelemetryModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipmentId: string;
  shipmentCode: string;
  tempMin: number;
  tempMax: number;
  assignedDevices: string[];
  onSuccess: (sample: TelemetryOut) => void;
}

export const SendTelemetryModal: React.FC<SendTelemetryModalProps> = ({
  isOpen,
  onClose,
  shipmentId,
  shipmentCode,
  tempMin,
  tempMax,
  assignedDevices,
  onSuccess,
}) => {
  const defaultDevice = assignedDevices.length > 0 ? assignedDevices[0] : 'ESP32-01';
  const midTemp = ((tempMin + tempMax) / 2).toFixed(1);

  const [deviceId, setDeviceId] = useState(defaultDevice);
  const [temperature, setTemperature] = useState(midTemp);
  const [humidity, setHumidity] = useState('65.0');
  const [useCurrentTime, setUseCurrentTime] = useState(true);
  const [customRecordedAt, setCustomRecordedAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (assignedDevices.length > 0) {
        setDeviceId(assignedDevices[0]);
      }
      setTemperature(((tempMin + tempMax) / 2).toFixed(1));
      setError(null);
    }
  }, [isOpen, assignedDevices, tempMin, tempMax]);

  if (!isOpen) return null;

  const tempVal = parseFloat(temperature);
  const isOutOfRange = !isNaN(tempVal) && (tempVal < tempMin || tempVal > tempMax);
  const isTooHot = !isNaN(tempVal) && tempVal > tempMax;
  const isTooCold = !isNaN(tempVal) && tempVal < tempMin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId.trim()) {
      setError('Mã thiết bị (Device ID) không được để trống');
      return;
    }
    const t = parseFloat(temperature);
    if (isNaN(t)) {
      setError('Nhiệt độ không hợp lệ');
      return;
    }
    const h = parseFloat(humidity);
    if (isNaN(h) || h < 0 || h > 100) {
      setError('Độ ẩm phải từ 0% đến 100%');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload: TelemetryCreatePayload = {
      device_id: deviceId.trim(),
      temperature_c: t,
      humidity_pct: h,
      recorded_at: useCurrentTime ? new Date().toISOString() : customRecordedAt || null,
    };

    try {
      const sample = await postShipmentTelemetry(shipmentId, payload);
      onSuccess(sample);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'SIGNED_TELEMETRY_REQUIRED' || err.status === 403) {
          setError(
            'Backend trên Production yêu cầu Signed Telemetry v1 (có chữ ký mật mã ECDSA P-256 từ ESP32). Trên Development hoặc Mock Mode, bạn có thể gửi dữ liệu trực tiếp.'
          );
        } else if (err.code === 'SHIPMENT_NOT_FOUND') {
          setError('Không tìm thấy lô hàng này trên máy chủ.');
        } else {
          setError(err.message || 'Lỗi gửi dữ liệu đo cảm biến');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Lỗi không xác định khi gửi telemetry');
      }
    } finally {
      setSubmitting(false);
    }
  };

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
          maxWidth: 580,
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
            backgroundColor: 'var(--color-surface-secondary)',
          }}
        >
          <div className="flex-row items-center gap-3">
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Radio size={20} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: 'var(--text-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  margin: 0,
                }}
              >
                Gửi Dữ Liệu Đo Cảm Biến
              </h3>
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                }}
              >
                Mô phỏng gửi Telemetry (POST /api/v1/shipments/:id/telemetry) cho {shipmentCode}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              padding: 4,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: 'var(--space-5)' }}>
          {/* Information box */}
          <div
            style={{
              marginBottom: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'var(--color-info-soft)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-info)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-info)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Dải nhiệt độ an toàn của lô hàng: <strong>{tempMin}°C đến {tempMax}°C</strong>.
              Dữ liệu gửi sẽ được Backend ghi nhận, cập nhật tọa độ hành trình và kiểm tra quy tắc vi phạm bảo hiểm.
            </div>
          </div>

          {error && (
            <div
              style={{
                marginBottom: 'var(--space-4)',
                padding: 'var(--space-3) var(--space-4)',
                backgroundColor: 'var(--color-danger-soft)',
                border: '1px solid var(--color-danger)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-danger)',
                fontSize: 'var(--text-xs)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{error}</div>
            </div>
          )}

          {/* Device ID Selection */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 6,
              }}
            >
              Thiết bị gửi (Device ID) *
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <div
                style={{
                  position: 'relative',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Cpu
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 10,
                    color: 'var(--color-text-tertiary)',
                  }}
                />
                <input
                  type="text"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  placeholder="VD: ESP32-01 hoặc WOKWI-85499B16C8"
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--text-sm)',
                    backgroundColor: 'var(--color-surface)',
                  }}
                />
              </div>

              {assignedDevices.length > 0 && (
                <select
                  onChange={(e) => {
                    if (e.target.value) setDeviceId(e.target.value);
                  }}
                  value={deviceId}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--text-xs)',
                    backgroundColor: 'var(--color-surface-secondary)',
                  }}
                >
                  <option value="">Chọn thiết bị gán</option>
                  {assignedDevices.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Temperature Section */}
          <div
            style={{
              marginBottom: 'var(--space-4)',
              padding: 'var(--space-4)',
              backgroundColor: isOutOfRange ? 'var(--color-danger-soft)' : 'var(--color-surface-secondary)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${isOutOfRange ? 'var(--color-danger)' : 'var(--color-border-subtle)'}`,
              transition: 'all 0.2s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <label
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: isOutOfRange ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Thermometer size={14} /> Nhiệt độ cảm biến (°C) *
              </label>

              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: isOutOfRange ? 'var(--color-danger)' : 'var(--color-success)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {isOutOfRange ? (
                  <>
                    <AlertTriangle size={14} />
                    {isTooHot ? 'Vượt quá nhiệt độ tối đa!' : 'Thấp hơn nhiệt độ tối thiểu!'}
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} /> An toàn ({tempMin}°C - {tempMax}°C)
                  </>
                )}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 10 }}>
              <input
                type="range"
                min={Math.min(-30, Math.floor(tempMin - 10))}
                max={Math.max(50, Math.ceil(tempMax + 15))}
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                style={{ flex: 1, cursor: 'pointer' }}
              />
              <div style={{ width: 90 }}>
                <input
                  type="number"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    textAlign: 'right',
                  }}
                />
              </div>
            </div>

            {/* Quick buttons */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setTemperature(midTemp)}
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--color-success)',
                  backgroundColor: 'var(--color-success-soft)',
                  color: 'var(--color-success)',
                  cursor: 'pointer',
                }}
              >
                An toàn ({midTemp}°C)
              </button>
              <button
                type="button"
                onClick={() => setTemperature((tempMax + 4.5).toFixed(1))}
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--color-danger)',
                  backgroundColor: 'var(--color-danger-soft)',
                  color: 'var(--color-danger)',
                  cursor: 'pointer',
                }}
              >
                Quá nóng ({(tempMax + 4.5).toFixed(1)}°C)
              </button>
              <button
                type="button"
                onClick={() => setTemperature((tempMin - 4.0).toFixed(1))}
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--color-danger)',
                  backgroundColor: 'var(--color-danger-soft)',
                  color: 'var(--color-danger)',
                  cursor: 'pointer',
                }}
              >
                Quá lạnh ({(tempMin - 4.0).toFixed(1)}°C)
              </button>
            </div>
          </div>

          {/* Humidity Section */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 6,
              }}
            >
              <Droplets size={14} /> Độ ẩm không khí (%) *
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <input
                type="range"
                min="0"
                max="100"
                step="0.5"
                value={humidity}
                onChange={(e) => setHumidity(e.target.value)}
                style={{ flex: 1, cursor: 'pointer' }}
              />
              <div style={{ width: 90 }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={humidity}
                  onChange={(e) => setHumidity(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--text-sm)',
                    textAlign: 'right',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Timestamp section */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={useCurrentTime}
                onChange={(e) => setUseCurrentTime(e.target.checked)}
              />
              <span>Sử dụng thời gian hiện tại của hệ thống (Now UTC)</span>
            </label>
            {!useCurrentTime && (
              <div style={{ marginTop: 6 }}>
                <input
                  type="text"
                  placeholder="YYYY-MM-DDTHH:mm:ssZ"
                  value={customRecordedAt}
                  onChange={(e) => setCustomRecordedAt(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--text-xs)',
                  }}
                />
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div
            style={{
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 'var(--space-3)',
            }}
          >
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Đóng
            </Button>
            <Button
              type="submit"
              variant={isOutOfRange ? 'danger' : 'primary'}
              disabled={submitting}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Radio size={14} />
              {submitting ? 'Đang gửi...' : 'Gửi Dữ Liệu Đo'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

