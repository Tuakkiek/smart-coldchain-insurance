import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Search, X, RotateCcw } from 'lucide-react';

export interface DeviceFilterToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  signatureFilter: string;
  onSignatureFilterChange: (value: string) => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
}

export const DeviceFilterToolbar: React.FC<DeviceFilterToolbarProps> = ({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  signatureFilter,
  onSignatureFilterChange,
  onResetFilters,
  hasActiveFilters,
}) => {
  return (
    <Card className="devices-toolbar-card">
      <div className="devices-toolbar" role="search" aria-label="Tìm kiếm và lọc thiết bị ESP32">
        <div className="devices-filter-field devices-filter-field--search">
          <label htmlFor="device-search-input" className="devices-filter-label">
            Tìm kiếm thiết bị
          </label>
          <div className="devices-search-box">
            <Search size={15} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} aria-hidden="true" />
            <input
              id="device-search-input"
              type="text"
              className="devices-search-input"
              placeholder="Tìm theo Device ID, Firmware, Public Key ID hoặc lô hàng..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="devices-search-clear"
                onClick={() => onSearchChange('')}
                aria-label="Xóa từ khóa tìm kiếm"
                title="Xóa từ khóa"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="devices-filter-field">
          <label htmlFor="device-status-filter" className="devices-filter-label">
            Trạng thái ESP32
          </label>
          <select
            id="device-status-filter"
            className="devices-select"
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="ONLINE">ONLINE (Trực tuyến)</option>
            <option value="OFFLINE">OFFLINE (Ngoại tuyến)</option>
            <option value="DEGRADED">DEGRADED (Chập chờn)</option>
            <option value="UNKNOWN">UNKNOWN (Chưa ghi nhận)</option>
          </select>
        </div>

        <div className="devices-filter-field">
          <label htmlFor="device-signature-filter" className="devices-filter-label">
            Trạng thái chữ ký
          </label>
          <select
            id="device-signature-filter"
            className="devices-select"
            value={signatureFilter}
            onChange={(e) => onSignatureFilterChange(e.target.value)}
          >
            <option value="all">Tất cả chữ ký</option>
            <option value="VALID">Hợp lệ (VALID)</option>
            <option value="INVALID">Chữ ký sai (INVALID)</option>
            <option value="UNKNOWN_KEY">Khóa chưa đăng ký (UNKNOWN_KEY)</option>
            <option value="UNKNOWN">Chưa xác định (UNKNOWN)</option>
          </select>
        </div>

        <div className="devices-toolbar-reset">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onResetFilters}
            disabled={!hasActiveFilters}
            icon={<RotateCcw size={13} />}
            className="devices-reset-btn"
            title="Đặt lại tìm kiếm và bộ lọc"
          >
            Xóa bộ lọc
          </Button>
        </div>
      </div>
    </Card>
  );
};
