import React from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import { Button } from '../ui/Button';

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
  onResetFilters,
  hasActiveFilters,
}) => (
  <div className="filter-bar" role="search" aria-label="Tìm và lọc thiết bị">
    <label className="search-field">
      <Search size={15} color="var(--color-text-tertiary)" />
      <input aria-label="Tìm thiết bị" placeholder="Tìm Device ID hoặc lô hàng" value={searchTerm} onChange={(event) => onSearchChange(event.target.value)} />
      {searchTerm && <button type="button" onClick={() => onSearchChange('')} aria-label="Xóa từ khóa"><X size={14} /></button>}
    </label>
    <select className="minimal-select" aria-label="Lọc trạng thái thiết bị" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
      <option value="all">Tất cả trạng thái</option>
      <option value="ONLINE">Trực tuyến</option>
      <option value="OFFLINE">Ngoại tuyến</option>
      <option value="DEGRADED">Chập chờn</option>
      <option value="UNKNOWN">Chưa ghi nhận</option>
    </select>
    {hasActiveFilters && <Button type="button" size="sm" onClick={onResetFilters} icon={<RotateCcw size={13} />}>Đặt lại</Button>}
  </div>
);
