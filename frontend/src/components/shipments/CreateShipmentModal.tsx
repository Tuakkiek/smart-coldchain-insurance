import React, { useState } from 'react';
import { ShipmentCreatePayload, ShipmentOut } from '../../types/api';
import { createShipment } from '../../api/shipments';
import { Button } from '../ui/Button';
import { ApiError } from '../../api/client';
import {
  PackagePlus,
  X,
  MapPin,
  Thermometer,
  Shield,
  Clock,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface CreateShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (shipment: ShipmentOut) => void;
}

interface FormState {
  code: string;
  cargo_type: string;
  originName: string;
  originLat: string;
  originLng: string;
  destName: string;
  destLat: string;
  destLng: string;
  tempMin: string;
  tempMax: string;
  violationDuration: string;
  insuredAmount: string;
}

const PRESETS = [
  {
    name: 'Vaccine Tiêu Chuẩn (2°C - 8°C)',
    cargo_type: 'Vaccine Chống Lao & Viêm Gan B',
    tempMin: '2.0',
    tempMax: '8.0',
    duration: '15',
    amount: '50000000',
    origin: { name: 'Kho Trung Ương 1, Hà Nội', lat: '21.0285', lng: '105.8542' },
    dest: { name: 'Trung Tâm Tiêm Chủng CDC Đà Nẵng', lat: '16.0544', lng: '108.2022' },
  },
  {
    name: 'Dược Phẩm Sinh Học (0°C - 4°C)',
    cargo_type: 'Kháng Thể Đơn Dòng MAb-104',
    tempMin: '0.0',
    tempMax: '4.0',
    duration: '10',
    amount: '120000000',
    origin: { name: 'Viện Sinh Học Y Dược TP.HCM', lat: '10.7769', lng: '106.7009' },
    dest: { name: 'Bệnh Viện Đa Khoa Cần Thơ', lat: '10.0333', lng: '105.7833' },
  },
  {
    name: 'Thịt Bò & Hải Sản Đông Lạnh (-20°C - -15°C)',
    cargo_type: 'Hải Sản Tươi Đông Lạnh Xuất Khẩu',
    tempMin: '-20.0',
    tempMax: '-15.0',
    duration: '20',
    amount: '35000000',
    origin: { name: 'Cảng Tân Cảng Cát Lái, TP.HCM', lat: '10.7626', lng: '106.7924' },
    dest: { name: 'Kho Lạnh Bình Dương Logistics', lat: '10.9804', lng: '106.6519' },
  },
];

export const CreateShipmentModal: React.FC<CreateShipmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const generateRandomCode = () => {
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `SHIP-${dateStr}-${rand}`;
  };

  const [form, setForm] = useState<FormState>({
    code: generateRandomCode(),
    cargo_type: 'Vaccine MRNA Cold-Chain',
    originName: 'Kho Dược Trung Tâm A - TP.HCM',
    originLat: '10.7769',
    originLng: '106.7009',
    destName: 'Bệnh Viện Nhi Đồng 1 - TP.HCM',
    destLat: '10.7674',
    destLng: '106.6669',
    tempMin: '2.0',
    tempMax: '8.0',
    violationDuration: '15',
    insuredAmount: '50000000',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: (typeof PRESETS)[0]) => {
    setForm((prev) => ({
      ...prev,
      code: generateRandomCode(),
      cargo_type: preset.cargo_type,
      tempMin: preset.tempMin,
      tempMax: preset.tempMax,
      violationDuration: preset.duration,
      insuredAmount: preset.amount,
      originName: preset.origin.name,
      originLat: preset.origin.lat,
      originLng: preset.origin.lng,
      destName: preset.dest.name,
      destLat: preset.dest.lat,
      destLng: preset.dest.lng,
    }));
    setErrors({});
    setApiError(null);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.code.trim()) {
      newErrors.code = 'Mã lô hàng không được để trống';
    } else if (form.code.length > 64) {
      newErrors.code = 'Mã lô hàng không vượt quá 64 ký tự';
    }

    if (!form.cargo_type.trim()) {
      newErrors.cargo_type = 'Loại hàng hóa không được để trống';
    }

    if (!form.originName.trim()) {
      newErrors.originName = 'Tên điểm xuất phát không được để trống';
    }
    const oLat = parseFloat(form.originLat);
    const oLng = parseFloat(form.originLng);
    if (isNaN(oLat) || oLat < -90 || oLat > 90) {
      newErrors.originLat = 'Vĩ độ phải từ -90 đến 90';
    }
    if (isNaN(oLng) || oLng < -180 || oLng > 180) {
      newErrors.originLng = 'Kinh độ phải từ -180 đến 180';
    }

    if (!form.destName.trim()) {
      newErrors.destName = 'Tên điểm đến không được để trống';
    }
    const dLat = parseFloat(form.destLat);
    const dLng = parseFloat(form.destLng);
    if (isNaN(dLat) || dLat < -90 || dLat > 90) {
      newErrors.destLat = 'Vĩ độ phải từ -90 đến 90';
    }
    if (isNaN(dLng) || dLng < -180 || dLng > 180) {
      newErrors.destLng = 'Kinh độ phải từ -180 đến 180';
    }

    const tMin = parseFloat(form.tempMin);
    const tMax = parseFloat(form.tempMax);
    if (isNaN(tMin)) {
      newErrors.tempMin = 'Nhiệt độ tối thiểu không hợp lệ';
    }
    if (isNaN(tMax)) {
      newErrors.tempMax = 'Nhiệt độ tối đa không hợp lệ';
    }
    if (!isNaN(tMin) && !isNaN(tMax) && tMin >= tMax) {
      newErrors.tempMax = 'Nhiệt độ tối đa phải lớn hơn nhiệt độ tối thiểu';
    }

    const duration = parseInt(form.violationDuration, 10);
    if (isNaN(duration) || duration <= 0) {
      newErrors.violationDuration = 'Thời gian vi phạm phải là số nguyên > 0';
    }

    const amount = parseInt(form.insuredAmount, 10);
    if (isNaN(amount) || amount < 0) {
      newErrors.insuredAmount = 'Số tiền bảo hiểm phải >= 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setApiError(null);

    const payload: ShipmentCreatePayload = {
      code: form.code.trim(),
      cargo_type: form.cargo_type.trim(),
      origin: {
        name: form.originName.trim(),
        latitude: parseFloat(form.originLat),
        longitude: parseFloat(form.originLng),
      },
      destination: {
        name: form.destName.trim(),
        latitude: parseFloat(form.destLat),
        longitude: parseFloat(form.destLng),
      },
      temp_min_c: parseFloat(form.tempMin),
      temp_max_c: parseFloat(form.tempMax),
      violation_duration_minutes: parseInt(form.violationDuration, 10),
      insured_amount_vnd: parseInt(form.insuredAmount, 10),
    };

    try {
      const created = await createShipment(payload);
      onSuccess(created);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'DUPLICATE_SHIPMENT_CODE') {
          setApiError(`Mã lô hàng '${payload.code}' đã tồn tại trên hệ thống. Vui lòng đổi mã khác.`);
        } else if (err.details && err.details.length > 0) {
          const detailMsg = err.details.map((d) => `${d.field ? d.field + ': ' : ''}${d.message}`).join(', ');
          setApiError(`Lỗi xác thực: ${detailMsg}`);
        } else {
          setApiError(err.message || 'Lỗi khi tạo lô hàng');
        }
      } else {
        setApiError(err instanceof Error ? err.message : 'Lỗi không xác định khi tạo lô hàng');
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
          maxWidth: 720,
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
              <PackagePlus size={20} />
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
                Tạo Lô Hàng Lạnh Mới
              </h3>
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                }}
              >
                Khởi tạo hợp đồng bảo hiểm và giám sát chuỗi lạnh qua REST API Backend
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
          {/* Quick Presets */}
          <div
            style={{
              marginBottom: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'var(--color-surface-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--color-border)',
            }}
          >
            <div
              className="flex-row items-center gap-1"
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-2)',
              }}
            >
              <Sparkles size={14} style={{ color: 'var(--color-accent)' }} />
              <span>Gợi ý cấu hình nhanh (Demo Presets):</span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  style={{
                    fontSize: 'var(--text-xs)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-pill)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-accent)';
                    e.currentTarget.style.color = 'var(--color-accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* API Error Alert */}
          {apiError && (
            <div
              style={{
                marginBottom: 'var(--space-4)',
                padding: 'var(--space-3) var(--space-4)',
                backgroundColor: 'var(--color-danger-soft)',
                border: '1px solid var(--color-danger)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                color: 'var(--color-danger)',
                fontSize: 'var(--text-sm)',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div>{apiError}</div>
            </div>
          )}

          {/* Section 1: Thông tin cơ bản */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <h4
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <PackagePlus size={16} style={{ color: 'var(--color-accent)' }} />
              Thông tin nhận dạng lô hàng
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  Mã Lô Hàng (Code) *
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="VD: SHIP-202611-001"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${errors.code ? 'var(--color-danger)' : 'var(--color-border)'}`,
                      fontSize: 'var(--text-sm)',
                      backgroundColor: 'var(--color-surface)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, code: generateRandomCode() })}
                    title="Tạo mã ngẫu nhiên"
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                {errors.code && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
                    {errors.code}
                  </span>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  Loại Hàng Hóa (Cargo Type) *
                </label>
                <input
                  type="text"
                  value={form.cargo_type}
                  onChange={(e) => setForm({ ...form, cargo_type: e.target.value })}
                  placeholder="VD: Vaccine, Dược phẩm, Thịt đông lạnh"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${errors.cargo_type ? 'var(--color-danger)' : 'var(--color-border)'}`,
                    fontSize: 'var(--text-sm)',
                    backgroundColor: 'var(--color-surface)',
                  }}
                />
                {errors.cargo_type && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
                    {errors.cargo_type}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Tuyến đường vận chuyển */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <h4
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <MapPin size={16} style={{ color: 'var(--color-accent)' }} />
              Tuyến đường và Tọa độ (Origin & Destination)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              {/* Origin */}
              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Điểm xuất phát (Origin)
                </span>
                <div style={{ marginBottom: 6 }}>
                  <input
                    type="text"
                    value={form.originName}
                    onChange={(e) => setForm({ ...form, originName: e.target.value })}
                    placeholder="Tên điểm đi (VD: Kho A)"
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${errors.originName ? 'var(--color-danger)' : 'var(--color-border)'}`,
                      fontSize: 'var(--text-xs)',
                      marginBottom: 4,
                    }}
                  />
                  {errors.originName && (
                    <div style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                      {errors.originName}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div>
                    <input
                      type="number"
                      step="any"
                      value={form.originLat}
                      onChange={(e) => setForm({ ...form, originLat: e.target.value })}
                      placeholder="Latitude"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${errors.originLat ? 'var(--color-danger)' : 'var(--color-border)'}`,
                        fontSize: 'var(--text-xs)',
                      }}
                    />
                    {errors.originLat && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                        {errors.originLat}
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      type="number"
                      step="any"
                      value={form.originLng}
                      onChange={(e) => setForm({ ...form, originLng: e.target.value })}
                      placeholder="Longitude"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${errors.originLng ? 'var(--color-danger)' : 'var(--color-border)'}`,
                        fontSize: 'var(--text-xs)',
                      }}
                    />
                    {errors.originLng && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                        {errors.originLng}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Destination */}
              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Điểm đến (Destination)
                </span>
                <div style={{ marginBottom: 6 }}>
                  <input
                    type="text"
                    value={form.destName}
                    onChange={(e) => setForm({ ...form, destName: e.target.value })}
                    placeholder="Tên điểm đến (VD: Bệnh viện B)"
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${errors.destName ? 'var(--color-danger)' : 'var(--color-border)'}`,
                      fontSize: 'var(--text-xs)',
                      marginBottom: 4,
                    }}
                  />
                  {errors.destName && (
                    <div style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                      {errors.destName}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div>
                    <input
                      type="number"
                      step="any"
                      value={form.destLat}
                      onChange={(e) => setForm({ ...form, destLat: e.target.value })}
                      placeholder="Latitude"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${errors.destLat ? 'var(--color-danger)' : 'var(--color-border)'}`,
                        fontSize: 'var(--text-xs)',
                      }}
                    />
                    {errors.destLat && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                        {errors.destLat}
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      type="number"
                      step="any"
                      value={form.destLng}
                      onChange={(e) => setForm({ ...form, destLng: e.target.value })}
                      placeholder="Longitude"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${errors.destLng ? 'var(--color-danger)' : 'var(--color-border)'}`,
                        fontSize: 'var(--text-xs)',
                      }}
                    />
                    {errors.destLng && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                        {errors.destLng}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Ngưỡng nhiệt độ & Chính sách bảo hiểm */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h4
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Thermometer size={16} style={{ color: 'var(--color-accent)' }} />
              Ngưỡng nhiệt độ & Chính sách bảo hiểm
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  Min Temp (°C) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.tempMin}
                  onChange={(e) => setForm({ ...form, tempMin: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${errors.tempMin ? 'var(--color-danger)' : 'var(--color-border)'}`,
                    fontSize: 'var(--text-sm)',
                  }}
                />
                {errors.tempMin && (
                  <span style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                    {errors.tempMin}
                  </span>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  Max Temp (°C) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.tempMax}
                  onChange={(e) => setForm({ ...form, tempMax: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${errors.tempMax ? 'var(--color-danger)' : 'var(--color-border)'}`,
                    fontSize: 'var(--text-sm)',
                  }}
                />
                {errors.tempMax && (
                  <span style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                    {errors.tempMax}
                  </span>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 4,
                  }}
                  title="Thời gian liên tục ngoài ngưỡng để kích hoạt chi trả"
                >
                  Thời gian vi phạm (phút) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.violationDuration}
                  onChange={(e) => setForm({ ...form, violationDuration: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${errors.violationDuration ? 'var(--color-danger)' : 'var(--color-border)'}`,
                    fontSize: 'var(--text-sm)',
                  }}
                />
                {errors.violationDuration && (
                  <span style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                    {errors.violationDuration}
                  </span>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  Số tiền bảo hiểm (VND) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000000"
                  value={form.insuredAmount}
                  onChange={(e) => setForm({ ...form, insuredAmount: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${errors.insuredAmount ? 'var(--color-danger)' : 'var(--color-border)'}`,
                    fontSize: 'var(--text-sm)',
                  }}
                />
                {errors.insuredAmount && (
                  <span style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                    {errors.insuredAmount}
                  </span>
                )}
              </div>
            </div>

            <div
              style={{
                marginTop: 6,
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-tertiary)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                Phạm vi an toàn:{' '}
                <strong>
                  {form.tempMin}°C đến {form.tempMax}°C
                </strong>
              </span>
              <span>
                Giá trị bảo hiểm:{' '}
                <strong>
                  {parseInt(form.insuredAmount || '0', 10).toLocaleString('vi-VN')} ₫
                </strong>
              </span>
            </div>
          </div>

          {/* Footer Actions */}
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
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Đang tạo lô hàng...' : 'Tạo Lô Hàng Mới'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

