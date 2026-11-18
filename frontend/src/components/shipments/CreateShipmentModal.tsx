import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ShipmentCreatePayload, ShipmentOut } from '../../types/api';
import { createShipment } from '../../api/shipments';
import { resolveLocationInput } from '../../api/locations';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ApiError } from '../../api/client';
import { formatApiErrorMessage, isRequestCancelled, useToast } from '../feedback/Toast';
import {
  SEPOLIA_CURRENCY,
  validateBuyerWalletAddress,
  validateSepoliaEthAmount,
} from '../../utils/ethereum';
import {
  isGoogleMapsUrl,
  isValidLatLng,
  parseGoogleMapsLocally,
} from '../../utils/googleMaps';
import {
  PackagePlus,
  X,
  MapPin,
  Thermometer,
  Search,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface CreateShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (shipment: ShipmentOut) => void;
}

interface LocationFieldState {
  address: string;
  formattedAddress: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  resolving: boolean;
  resolveError: string | null;
  resolveSource: string | null;
}

interface ResolvedPlacePayload {
  name: string;
  formatted_address: string;
  place_id: string | null;
  latitude: number;
  longitude: number;
}

interface FormState {
  name: string;
  cargo_type: string;
  origin: LocationFieldState;
  destination: LocationFieldState;
  tempMin: string;
  tempMax: string;
  violationDuration: string;
  coverageAmountEth: string;
  buyerWalletAddress: string;
}

function createEmptyLocation(address = ''): LocationFieldState {
  return {
    address,
    formattedAddress: null,
    placeId: null,
    latitude: null,
    longitude: null,
    resolving: false,
    resolveError: null,
    resolveSource: null,
  };
}

function initialFormState(): FormState {
  return {
    name: '',
    cargo_type: 'Vaccine',
    origin: createEmptyLocation(''),
    destination: createEmptyLocation(''),
    tempMin: '2.0',
    tempMax: '8.0',
    violationDuration: '15',
    coverageAmountEth: '0.05',
    buyerWalletAddress: '',
  };
}

export const CreateShipmentModal: React.FC<CreateShipmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  // Request sequencing refs to ensure Origin and Destination never overwrite each other
  const resolveSeqRef = useRef<{ origin: number; destination: number }>({
    origin: 0,
    destination: 0,
  });

  // Lock background scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Close modal on Escape key press (blocked while submitting)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  // Live validation across all 4 groups
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};

    if (!form.name.trim()) {
      errors.name = 'Tên lô hàng không được để trống';
    } else if (form.name.trim().length > 255) {
      errors.name = 'Tên lô hàng không vượt quá 255 ký tự';
    }

    if (!form.cargo_type.trim()) {
      errors.cargo_type = 'Loại hàng hóa không được để trống';
    }

    // Origin & Destination: require Google Maps link or address (coordinates auto-resolved)
    if (!form.origin.address.trim()) {
      errors.originAddress = 'Vui lòng dán link Google Maps hoặc nhập địa chỉ điểm xuất phát';
    }
    if (!form.destination.address.trim()) {
      errors.destAddress = 'Vui lòng dán link Google Maps hoặc nhập địa chỉ điểm đến';
    }

    // Temperature & duration
    const tMin = form.tempMin.trim() === '' ? NaN : Number(form.tempMin);
    const tMax = form.tempMax.trim() === '' ? NaN : Number(form.tempMax);
    if (!Number.isFinite(tMin)) {
      errors.tempMin = 'Nhiệt độ tối thiểu không hợp lệ';
    }
    if (!Number.isFinite(tMax)) {
      errors.tempMax = 'Nhiệt độ tối đa không hợp lệ';
    }
    if (Number.isFinite(tMin) && Number.isFinite(tMax) && tMin >= tMax) {
      errors.tempMax = 'Nhiệt độ tối đa phải lớn hơn nhiệt độ tối thiểu';
    }

    const duration = /^\d+$/.test(form.violationDuration.trim())
      ? parseInt(form.violationDuration.trim(), 10)
      : NaN;
    if (!Number.isInteger(duration) || duration <= 0) {
      errors.violationDuration = 'Thời gian vi phạm phải là số nguyên > 0';
    }

    // SepoliaETH validation (zero float math!)
    const ethResult = validateSepoliaEthAmount(form.coverageAmountEth);
    if (!ethResult.valid && ethResult.error) {
      errors.coverageAmountEth = ethResult.error;
    }

    // Buyer Wallet Address validation (ethers.isAddress + EIP-55)
    const walletResult = validateBuyerWalletAddress(form.buyerWalletAddress);
    if (walletResult.status !== 'valid' && walletResult.error) {
      errors.buyerWalletAddress = walletResult.error;
    }

    const isResolvingAny = form.origin.resolving || form.destination.resolving;
    const isValid = Object.keys(errors).length === 0 && !isResolvingAny;

    return { errors, ethResult, walletResult, isValid };
  }, [form]);

  if (!isOpen) return null;

  const markTouched = (field: string) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  const updateLocationField = (
    side: 'origin' | 'destination',
    patch: Partial<LocationFieldState>
  ) => {
    setForm((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        ...patch,
      },
    }));
  };

  const handleResolveLocation = async (
    side: 'origin' | 'destination',
    overrideInput?: string,
    silentSuccess = false
  ): Promise<ResolvedPlacePayload | null> => {
    const raw = (overrideInput ?? form[side].address).trim();
    if (!raw) {
      updateLocationField(side, {
        latitude: null,
        longitude: null,
        resolveError: 'Vui lòng nhập địa chỉ hoặc dán đường dẫn Google Maps.',
      });
      return null;
    }

    const seq = ++resolveSeqRef.current[side];

    // Case 1: Instant client-side extraction if Google Maps URL already contains coordinates
    const localParsed = parseGoogleMapsLocally(raw);
    if (localParsed && isValidLatLng(localParsed.latitude, localParsed.longitude)) {
      const displayAddress = localParsed.label || `${localParsed.latitude}, ${localParsed.longitude}`;
      updateLocationField(side, {
        address: displayAddress,
        formattedAddress: displayAddress,
        placeId: null,
        latitude: localParsed.latitude,
        longitude: localParsed.longitude,
        resolving: false,
        resolveError: null,
        resolveSource: localParsed.source,
      });
      if (!silentSuccess) {
        toast.success(
          `Đã nhận diện vị trí cho ${side === 'origin' ? 'Điểm xuất phát' : 'Điểm đến'}: ${displayAddress}.`,
          { title: 'Nhận diện Google Maps thành công' }
        );
      }
      return {
        name: displayAddress,
        formatted_address: displayAddress,
        place_id: null,
        latitude: localParsed.latitude,
        longitude: localParsed.longitude,
      };
    }

    // Case 2 & 3: Short link, search URL without coords, or plain text address -> Backend service
    updateLocationField(side, {
      resolving: true,
      resolveError: null,
    });

    try {
      const response = await resolveLocationInput(raw);
      if (resolveSeqRef.current[side] !== seq) return null;
      const loc = response.data;
      if (!isValidLatLng(loc.latitude, loc.longitude)) {
        throw new Error('Tọa độ trả về nằm ngoài phạm vi hợp lệ.');
      }
      const displayAddress = loc.formatted_address || loc.address;
      updateLocationField(side, {
        address: displayAddress,
        formattedAddress: displayAddress,
        placeId: loc.place_id ?? null,
        latitude: loc.latitude,
        longitude: loc.longitude,
        resolving: false,
        resolveError: null,
        resolveSource: loc.source,
      });
      if (!silentSuccess) {
        toast.success(
          `Đã nhận diện vị trí cho ${side === 'origin' ? 'Điểm xuất phát' : 'Điểm đến'}: ${displayAddress}.`,
          { title: 'Nhận diện địa chỉ thành công' }
        );
      }
      return {
        name: displayAddress,
        formatted_address: displayAddress,
        place_id: loc.place_id ?? null,
        latitude: loc.latitude,
        longitude: loc.longitude,
      };
    } catch (err: unknown) {
      if (resolveSeqRef.current[side] !== seq) return null;
      if (isRequestCancelled(err)) return null;
      const message = formatApiErrorMessage(
        err,
        'Không thể nhận diện vị trí từ đường dẫn hoặc địa chỉ này. Vui lòng kiểm tra lại link Google Maps hoặc nhập địa chỉ chi tiết hơn.'
      );
      // Never populate fake coordinates on geocoding failure
      updateLocationField(side, {
        latitude: null,
        longitude: null,
        resolving: false,
        resolveError: message,
        resolveSource: null,
      });
      toast.error(message, { title: 'Không thể nhận diện địa chỉ' });
      return null;
    }
  };

  const handleAddressPaste = (
    side: 'origin' | 'destination',
    e: React.ClipboardEvent<HTMLInputElement>
  ) => {
    const pasted = e.clipboardData?.getData('text') ?? '';
    if (!pasted.trim()) return;
    if (isGoogleMapsUrl(pasted)) {
      e.preventDefault();
      updateLocationField(side, {
        address: pasted.trim(),
        resolveError: null,
      });
      void handleResolveLocation(side, pasted.trim());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Mark all fields touched to show any validation feedback
    setTouched({
      name: true,
      cargo_type: true,
      originAddress: true,
      destAddress: true,
      tempMin: true,
      tempMax: true,
      violationDuration: true,
      coverageAmountEth: true,
      buyerWalletAddress: true,
    });

    if (!validation.isValid || !validation.ethResult.normalizedEth || !validation.walletResult.checksumAddress) {
      toast.warning('Vui lòng kiểm tra lại các trường thông tin chưa hợp lệ.', {
        title: 'Thông tin chưa hợp lệ',
      });
      return;
    }

    setSubmitting(true);

    try {
      // Auto-resolve origin & destination from Google Maps link / address if not yet resolved
      const resolveSideIfNeeded = async (
        side: 'origin' | 'destination'
      ): Promise<ResolvedPlacePayload | null> => {
        const current = form[side];
        if (
          current.latitude !== null &&
          current.longitude !== null &&
          isValidLatLng(current.latitude, current.longitude)
        ) {
          return {
            name: current.address.trim(),
            formatted_address: current.formattedAddress || current.address.trim(),
            place_id: current.placeId,
            latitude: current.latitude,
            longitude: current.longitude,
          };
        }
        return handleResolveLocation(side, current.address, true);
      };

      const [resolvedOrigin, resolvedDestination] = await Promise.all([
        resolveSideIfNeeded('origin'),
        resolveSideIfNeeded('destination'),
      ]);

      if (!resolvedOrigin || !resolvedDestination) {
        return;
      }

      const payload: ShipmentCreatePayload = {
        name: form.name.trim(),
        cargo_type: form.cargo_type.trim(),
        origin: resolvedOrigin,
        destination: resolvedDestination,
        temp_min_c: Number(form.tempMin),
        temp_max_c: Number(form.tempMax),
        violation_duration_minutes: parseInt(form.violationDuration.trim(), 10),
        insurance: {
          coverage_amount: validation.ethResult.normalizedEth,
          currency: SEPOLIA_CURRENCY,
        },
        buyer_wallet_address: validation.walletResult.checksumAddress,
      };

      const created = await createShipment(payload);
      onSuccess(created);
      setForm(initialFormState());
      setTouched({});
      onClose();
    } catch (err: unknown) {
      if (isRequestCancelled(err)) return;
      let msg = '';
      if (err instanceof ApiError) {
        if (err.details && err.details.length > 0) {
          const detailMsg = err.details
            .map((d) => `${d.field ? d.field + ': ' : ''}${d.message}`)
            .join(', ');
          msg = `Lỗi xác thực: ${detailMsg}`;
        } else {
          msg = formatApiErrorMessage(err, 'Lỗi khi tạo lô hàng. Vui lòng thử lại.');
        }
      } else {
        msg = formatApiErrorMessage(err, 'Lỗi không xác định khi tạo lô hàng.');
      }
      if (msg) {
        toast.error(msg, { title: 'Tạo lô hàng thất bại' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderLocationBox = (
    side: 'origin' | 'destination',
    title: string,
    addressErrKey: string
  ) => {
    const loc = form[side];
    const addrError = touched[addressErrKey] ? validation.errors[addressErrKey] : undefined;
    const isResolved =
      loc.latitude !== null &&
      loc.longitude !== null &&
      isValidLatLng(loc.latitude, loc.longitude);

    return (
      <div
        data-testid={`location-box-${side}`}
        style={{
          padding: 'var(--space-3)',
          backgroundColor: 'var(--color-surface-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <div className="flex-row items-center justify-between" style={{ gap: 8 }}>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}
          >
            {title}
          </span>
          {isResolved && (
            <Badge variant="success" icon={<CheckCircle2 size={11} />}>
              Đã xác định vị trí
            </Badge>
          )}
        </div>

        {/* Single Google Maps URL / Address input */}
        <div>
          <label
            htmlFor={`${side}-address-input`}
            style={{
              display: 'block',
              fontSize: '11px',
              color: 'var(--color-text-secondary)',
              marginBottom: 4,
            }}
          >
            {side === 'origin'
              ? 'Link Google Maps hoặc địa chỉ xuất phát *'
              : 'Link Google Maps hoặc địa chỉ điểm đến *'}
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <MapPin
                size={14}
                style={{
                  position: 'absolute',
                  left: 9,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-accent)',
                  pointerEvents: 'none',
                }}
              />
              <input
                id={`${side}-address-input`}
                type="text"
                value={loc.address}
                onChange={(e) => {
                  markTouched(addressErrKey);
                  updateLocationField(side, {
                    address: e.target.value,
                    formattedAddress: null,
                    placeId: null,
                    latitude: null,
                    longitude: null,
                    resolveSource: null,
                    resolveError: null,
                  });
                }}
                onPaste={(e) => handleAddressPaste(side, e)}
                onBlur={() => markTouched(addressErrKey)}
                disabled={submitting || loc.resolving}
                placeholder="Dán link Google Maps hoặc nhập địa chỉ tại đây..."
                style={{
                  width: '100%',
                  padding: loc.address ? '8px 28px 8px 28px' : '8px 10px 8px 28px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${
                    addrError || loc.resolveError
                      ? 'var(--color-danger)'
                      : isResolved
                      ? 'var(--color-success)'
                      : 'var(--color-border)'
                  }`,
                  fontSize: 'var(--text-xs)',
                  backgroundColor: 'var(--color-surface)',
                  boxSizing: 'border-box',
                }}
              />
              {loc.address && !loc.resolving && !submitting && (
                <button
                  type="button"
                  aria-label={side === 'origin' ? 'Xóa điểm xuất phát' : 'Xóa điểm đến'}
                  onClick={() => {
                    markTouched(addressErrKey);
                    updateLocationField(side, createEmptyLocation(''));
                  }}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    padding: 2,
                    cursor: 'pointer',
                    color: 'var(--color-text-tertiary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              type="button"
              data-testid={`resolve-${side}-btn`}
              onClick={() => handleResolveLocation(side)}
              disabled={submitting || loc.resolving || !loc.address.trim()}
              title="Nhận diện địa chỉ từ link Google Maps hoặc văn bản"
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-accent)',
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                cursor: submitting || loc.resolving || !loc.address.trim() ? 'not-allowed' : 'pointer',
                opacity: submitting || loc.resolving || !loc.address.trim() ? 0.55 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
              }}
            >
              {loc.resolving ? <Loader2 size={13} className="spin" /> : <Search size={13} />}
              {loc.resolving ? 'Đang nhận diện...' : 'Nhận diện'}
            </button>
          </div>
          {addrError && (
            <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: 4 }}>
              {addrError}
            </div>
          )}
          {loc.resolveError && (
            <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: 4 }}>
              {loc.resolveError}
            </div>
          )}
          {isResolved && !loc.resolveError ? (
            <div
              data-testid={`resolved-summary-${side}`}
              style={{
                marginTop: 6,
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border-subtle)',
                fontSize: '11px',
                color: 'var(--color-text-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div>
                <strong>Địa điểm:</strong> {loc.formattedAddress || loc.address}
              </div>
              <div className="font-mono" style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                Tự động trích xuất từ Google Maps: {loc.latitude}, {loc.longitude}
              </div>
            </div>
          ) : (
            !addrError &&
            !loc.resolveError && (
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                Hỗ trợ link Google Maps (kể cả link rút gọn <code>maps.app.goo.gl</code>) hoặc nhập trực tiếp địa chỉ.
              </div>
            )
          )}
        </div>
      </div>
    );
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-shipment-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        animation: 'fadeIn 0.15s ease-out',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
      onClick={submitting ? undefined : onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 780,
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-popover)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'min(92vh, 860px)',
          margin: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-surface-secondary)',
            flexShrink: 0,
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
                id="create-shipment-modal-title"
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
                Tích hợp Google Maps, bảo hiểm SepoliaETH và liên kết ví người mua trên Sepolia Testnet
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'none',
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
              color: 'var(--color-text-tertiary)',
              padding: 4,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Container */}
        <form
          onSubmit={handleSubmit}
          noValidate
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Scrollable Form Body */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-5)',
            }}
          >
            {/* NHÓM 1. THÔNG TIN NHẬN DẠNG LÔ HÀNG */}
            <section>
              <h4
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  margin: '0 0 var(--space-3) 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <PackagePlus size={16} style={{ color: 'var(--color-accent)' }} />
                1. Thông tin nhận dạng lô hàng
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label
                    htmlFor="shipment-name-input"
                    style={{
                      display: 'block',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 500,
                      color: 'var(--color-text-secondary)',
                      marginBottom: 4,
                    }}
                  >
                    Tên lô hàng *
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      id="shipment-name-input"
                      type="text"
                      value={form.name}
                      onChange={(e) => {
                        markTouched('name');
                        setForm({ ...form, name: e.target.value });
                      }}
                      onBlur={() => markTouched('name')}
                      disabled={submitting}
                      maxLength={255}
                      placeholder="VD: Vaccine Cần Thơ - đợt 1"
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${touched.name && validation.errors.name ? 'var(--color-danger)' : 'var(--color-border)'}`,
                        fontSize: 'var(--text-sm)',
                        backgroundColor: 'var(--color-surface)',
                      }}
                    />
                  </div>
                  {touched.name && validation.errors.name && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
                      {validation.errors.name}
                    </span>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="shipment-cargo-input"
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
                    id="shipment-cargo-input"
                    type="text"
                    value={form.cargo_type}
                    onChange={(e) => {
                      markTouched('cargo_type');
                      setForm({ ...form, cargo_type: e.target.value });
                    }}
                    onBlur={() => markTouched('cargo_type')}
                    disabled={submitting}
                    placeholder="VD: Vaccine, Dược phẩm, Thịt đông lạnh"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${touched.cargo_type && validation.errors.cargo_type ? 'var(--color-danger)' : 'var(--color-border)'}`,
                      fontSize: 'var(--text-sm)',
                      backgroundColor: 'var(--color-surface)',
                      boxSizing: 'border-box',
                    }}
                  />
                  {touched.cargo_type && validation.errors.cargo_type && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
                      {validation.errors.cargo_type}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* NHÓM 2. TUYẾN ĐƯỜNG VẬN CHUYỂN (GOOGLE MAPS) */}
            <section>
              <h4
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  margin: '0 0 var(--space-3) 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <MapPin size={16} style={{ color: 'var(--color-accent)' }} />
                2. Tuyến đường vận chuyển (Link Google Maps / Địa chỉ)
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {renderLocationBox(
                  'origin',
                  'A. Điểm xuất phát (Origin)',
                  'originAddress'
                )}
                {renderLocationBox(
                  'destination',
                  'B. Điểm đến (Destination)',
                  'destAddress'
                )}
              </div>
            </section>

            {/* NHÓM 3. NGƯỠNG NHIỆT ĐỘ VÀ CHÍNH SÁCH BẢO HIỂM */}
            <section>
              <h4
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  margin: '0 0 var(--space-3) 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Thermometer size={16} style={{ color: 'var(--color-accent)' }} />
                3. Ngưỡng nhiệt độ và Chính sách bảo hiểm
              </h4>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 'var(--space-3)',
                  marginBottom: 'var(--space-3)',
                }}
              >
                <div>
                  <label
                    htmlFor="temp-min-input"
                    style={{
                      display: 'block',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 500,
                      color: 'var(--color-text-secondary)',
                      marginBottom: 4,
                    }}
                  >
                    Nhiệt độ tối thiểu (°C) *
                  </label>
                  <input
                    id="temp-min-input"
                    type="number"
                    step="0.1"
                    value={form.tempMin}
                    onChange={(e) => {
                      markTouched('tempMin');
                      setForm({ ...form, tempMin: e.target.value });
                    }}
                    onBlur={() => markTouched('tempMin')}
                    disabled={submitting}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${touched.tempMin && validation.errors.tempMin ? 'var(--color-danger)' : 'var(--color-border)'}`,
                      fontSize: 'var(--text-sm)',
                      boxSizing: 'border-box',
                    }}
                  />
                  {touched.tempMin && validation.errors.tempMin && (
                    <span style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                      {validation.errors.tempMin}
                    </span>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="temp-max-input"
                    style={{
                      display: 'block',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 500,
                      color: 'var(--color-text-secondary)',
                      marginBottom: 4,
                    }}
                  >
                    Nhiệt độ tối đa (°C) *
                  </label>
                  <input
                    id="temp-max-input"
                    type="number"
                    step="0.1"
                    value={form.tempMax}
                    onChange={(e) => {
                      markTouched('tempMax');
                      setForm({ ...form, tempMax: e.target.value });
                    }}
                    onBlur={() => markTouched('tempMax')}
                    disabled={submitting}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${touched.tempMax && validation.errors.tempMax ? 'var(--color-danger)' : 'var(--color-border)'}`,
                      fontSize: 'var(--text-sm)',
                      boxSizing: 'border-box',
                    }}
                  />
                  {touched.tempMax && validation.errors.tempMax && (
                    <span style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                      {validation.errors.tempMax}
                    </span>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="violation-duration-input"
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
                    id="violation-duration-input"
                    type="number"
                    min="1"
                    value={form.violationDuration}
                    onChange={(e) => {
                      markTouched('violationDuration');
                      setForm({ ...form, violationDuration: e.target.value });
                    }}
                    onBlur={() => markTouched('violationDuration')}
                    disabled={submitting}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${touched.violationDuration && validation.errors.violationDuration ? 'var(--color-danger)' : 'var(--color-border)'}`,
                      fontSize: 'var(--text-sm)',
                      boxSizing: 'border-box',
                    }}
                  />
                  {touched.violationDuration && validation.errors.violationDuration && (
                    <span style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                      {validation.errors.violationDuration}
                    </span>
                  )}
                </div>
              </div>

              {/* SepoliaETH Coverage Amount Input */}
              <div
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface-secondary)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <label
                  htmlFor="coverage-eth-input"
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: 6,
                  }}
                >
                  Số tiền bảo hiểm (SepoliaETH) *
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    id="coverage-eth-input"
                    type="text"
                    inputMode="decimal"
                    value={form.coverageAmountEth}
                    onChange={(e) => {
                      markTouched('coverageAmountEth');
                      setForm({ ...form, coverageAmountEth: e.target.value });
                    }}
                    onBlur={() => markTouched('coverageAmountEth')}
                    disabled={submitting}
                    placeholder="Nhập số ETH bảo hiểm"
                    className="font-mono"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${
                        touched.coverageAmountEth && validation.errors.coverageAmountEth
                          ? 'var(--color-danger)'
                          : 'var(--color-border)'
                      }`,
                      fontSize: 'var(--text-sm)',
                      backgroundColor: 'var(--color-surface)',
                    }}
                  />
                  <span
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-accent-soft)',
                      color: 'var(--color-accent)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {SEPOLIA_CURRENCY}
                  </span>
                </div>

                {touched.coverageAmountEth && validation.errors.coverageAmountEth ? (
                  <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: 4 }}>
                    {validation.errors.coverageAmountEth}
                  </div>
                ) : validation.ethResult.valid && validation.ethResult.weiString ? (
                  <div
                    className="font-mono"
                    style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: 4 }}
                  >
                    Giá trị bảo hiểm (Insurance Coverage): <strong>{form.coverageAmountEth.trim()} SepoliaETH</strong>{' '}
                    ({validation.ethResult.weiString} Wei)
                  </div>
                ) : null}
              </div>
            </section>

            {/* NHÓM 4. THÔNG TIN NGƯỜI MUA BẢO HIỂM */}
            <section>
              <h4
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  margin: '0 0 var(--space-3) 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Wallet size={16} style={{ color: 'var(--color-accent)' }} />
                4. Thông tin người mua bảo hiểm
              </h4>

              <div
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface-secondary)',
                  border: '1px solid var(--color-border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                }}
              >
                {/* A. Buyer Wallet Address input */}
                <div>
                  <div
                    className="flex-row items-center justify-between"
                    style={{ marginBottom: 4, gap: 8, flexWrap: 'wrap' }}
                  >
                    <label
                      htmlFor="buyer-wallet-input"
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      Địa chỉ ví người mua bảo hiểm (Buyer Wallet Address) *
                    </label>
                    {/* Validation Status Badge (strictly NOT MetaMask connection status) */}
                    {validation.walletResult.status === 'empty' && (
                      <Badge variant="neutral">Chưa nhập địa chỉ ví</Badge>
                    )}
                    {validation.walletResult.status === 'valid' && (
                      <Badge variant="success" icon={<CheckCircle2 size={11} />}>
                        Địa chỉ ví hợp lệ
                      </Badge>
                    )}
                    {validation.walletResult.status === 'invalid' && (
                      <Badge variant="danger" icon={<AlertCircle size={11} />}>
                        Địa chỉ ví không hợp lệ
                      </Badge>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      id="buyer-wallet-input"
                      type="text"
                      value={form.buyerWalletAddress}
                      onChange={(e) => {
                        markTouched('buyerWalletAddress');
                        setForm({ ...form, buyerWalletAddress: e.target.value });
                      }}
                      onBlur={() => markTouched('buyerWalletAddress')}
                      disabled={submitting}
                      placeholder="0x..."
                      className="font-mono"
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${
                          touched.buyerWalletAddress && validation.walletResult.status !== 'valid'
                            ? 'var(--color-danger)'
                            : validation.walletResult.status === 'valid'
                            ? 'var(--color-success)'
                            : 'var(--color-border)'
                        }`,
                        fontSize: 'var(--text-xs)',
                        backgroundColor: 'var(--color-surface)',
                      }}
                    />
                    {form.buyerWalletAddress && (
                      <button
                        type="button"
                        aria-label="Xóa địa chỉ ví"
                        title="Xóa nội dung"
                        disabled={submitting}
                        onClick={() => {
                          markTouched('buyerWalletAddress');
                          setForm({ ...form, buyerWalletAddress: '' });
                        }}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--color-border)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-secondary)',
                          cursor: submitting ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {touched.buyerWalletAddress && validation.walletResult.error && (
                    <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: 4 }}>
                      {validation.walletResult.error}
                    </div>
                  )}
                  {validation.walletResult.status === 'valid' && validation.walletResult.checksumAddress && (
                    <div
                      className="font-mono"
                      style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: 4 }}
                    >
                      Chuẩn EIP-55: {validation.walletResult.checksumAddress}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* Footer Actions - Fixed */}
          <div
            style={{
              padding: 'var(--space-3) var(--space-5)',
              borderTop: '1px solid var(--color-border-subtle)',
              backgroundColor: 'var(--color-surface-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
              {validation.isValid
                ? 'Dữ liệu hợp lệ — sẵn sàng khởi tạo lô hàng và chính sách bảo hiểm.'
                : 'Vui lòng hoàn thiện đầy đủ các trường bắt buộc hợp lệ.'}
            </span>
            <div className="flex-row items-center gap-3">
              <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                Hủy
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={submitting || !validation.isValid}
              >
                {submitting ? 'Đang tạo lô hàng...' : 'Tạo Lô Hàng Mới'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
