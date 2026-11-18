import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DevicesPage } from '../DevicesPage';
import { ToastProvider } from '../../components/feedback/Toast';
import { mockDevices } from '../../mocks/fixtures';
import * as devicesApi from '../../api/devices';
import { DeviceItemOut } from '../../types/api';

vi.mock('../../api/devices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/devices')>();
  return {
    ...actual,
    getDevices: vi.fn(),
    deleteDevice: vi.fn(),
  };
});

function renderDevicesPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <DevicesPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

function getDeviceRows() {
  const listbox = screen.getByRole('listbox', { name: 'Danh sách thiết bị ESP32' });
  return within(listbox).getAllByRole('option');
}

describe('DevicesPage redesign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(devicesApi.getDevices).mockResolvedValue({
      items: mockDevices,
      total: mockDevices.length,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders 5 overview stat cards, device list, and removes the bottom comparison table', async () => {
    renderDevicesPage();

    await waitFor(() => {
      expect(screen.getByText('Quản lý Thiết bị ESP32 & Toàn vẹn Phần cứng')).toBeInTheDocument();
    });

    // 5 overview stat cards
    const statsRegion = screen.getByRole('region', {
      name: 'Thống kê tổng quan thiết bị ESP32',
    });
    expect(within(statsRegion).getByText('Tổng số thiết bị')).toBeInTheDocument();
    expect(within(statsRegion).getByText('Thiết bị Online')).toBeInTheDocument();
    expect(within(statsRegion).getByText('Chữ ký hợp lệ')).toBeInTheDocument();
    expect(within(statsRegion).getByText('Thiết bị mất gói')).toBeInTheDocument();
    expect(within(statsRegion).getByText('Trạng thái Backend')).toBeInTheDocument();

    // Comparison table & key protection note completely removed
    expect(screen.queryByText(/Bảng đối chiếu phân biệt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Render Cold Start/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bảo vệ nội dung khóa thiết bị/i)).not.toBeInTheDocument();
  });

  it('selects devices, shows 3 grouped detail sections, and shows guidance state when cleared', async () => {
    renderDevicesPage();

    await waitFor(() => {
      expect(getDeviceRows()).toHaveLength(mockDevices.length);
    });

    // First device auto-selected initially
    const rows = getDeviceRows();
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');

    // Detail panel shows 3 grouped sections
    expect(screen.getByText('A. Thông tin định danh')).toBeInTheDocument();
    expect(screen.getByText('B. Thông tin bảo mật')).toBeInTheDocument();
    expect(screen.getByText('C. Thông tin vận hành')).toBeInTheDocument();
    expect(screen.getByText('KEY-ECDSA-P256-01')).toBeInTheDocument();
    expect(screen.getByText('ECDSA P-256 (secp256r1)')).toBeInTheDocument();

    // Click another device (ESP32-TAMPER-05 with missing sequences)
    fireEvent.click(rows[4]);
    expect(rows[4]).toHaveAttribute('aria-selected', 'true');
    expect(rows[0]).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('KEY-ECDSA-P256-05')).toBeInTheDocument();
    expect(screen.getByText('5 gói bị mất')).toBeInTheDocument();
    expect(screen.getByText(/Phát hiện mất sequence \(DATA_INCOMPLETE\)/i)).toBeInTheDocument();

    // Clear selection -> displays guidance state instead of empty area
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chọn thiết bị' }));
    expect(
      screen.getByText('Chọn một thiết bị để xem thông tin chi tiết')
    ).toBeInTheDocument();
  });

  it('supports searching, filtering by status and signature, and resetting filters', async () => {
    renderDevicesPage();

    await waitFor(() => {
      expect(getDeviceRows()).toHaveLength(mockDevices.length);
    });

    const searchInput = screen.getByLabelText('Tìm kiếm thiết bị');
    fireEvent.change(searchInput, { target: { value: 'SHIP-001' } });
    expect(getDeviceRows()).toHaveLength(1);
    expect(getDeviceRows()[0]).toHaveTextContent('ESP32-001');

    // Clear search and test status + signature filters
    fireEvent.change(searchInput, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Trạng thái chữ ký'), {
      target: { value: 'INVALID' },
    });
    expect(getDeviceRows()).toHaveLength(1);
    expect(getDeviceRows()[0]).toHaveTextContent('ESP32-TAMPER-05');

    // Filter with no match shows empty state with reset action
    fireEvent.change(screen.getByLabelText('Trạng thái ESP32'), {
      target: { value: 'OFFLINE' },
    });
    expect(screen.getByText('Không tìm thấy thiết bị phù hợp')).toBeInTheDocument();

    // Click toolbar reset button
    const resetButtons = screen.getAllByRole('button', { name: /Xóa bộ lọc/i });
    fireEvent.click(resetButtons[0]);
    expect(getDeviceRows()).toHaveLength(mockDevices.length);
  });

  it('renders error state with retry when initial load fails', async () => {
    vi.mocked(devicesApi.getDevices).mockRejectedValueOnce(new Error('Network error'));

    renderDevicesPage();

    await waitFor(() => {
      expect(screen.getByText('Không thể tải danh sách thiết bị ESP32')).toBeInTheDocument();
    });

    vi.mocked(devicesApi.getDevices).mockResolvedValueOnce({
      items: mockDevices,
      total: mockDevices.length,
    });

    const retryButtons = screen.getAllByRole('button', { name: /Thử lại/i });
    fireEvent.click(retryButtons[0]);

    await waitFor(() => {
      expect(getDeviceRows()).toHaveLength(mockDevices.length);
    });
  });

  it('auto-refreshes every 10 seconds and preserves the currently selected device', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const manyDevices: DeviceItemOut[] = Array.from({ length: 12 }, (_, idx) => ({
      ...mockDevices[0],
      id: `dev-${idx + 1}`,
      device_id: `ESP32-FLEET-${String(idx + 1).padStart(2, '0')}`,
      device_name: `Cold Sensor #${idx + 1}`,
      key_id: `KEY-FLEET-${idx + 1}`,
    }));

    vi.mocked(devicesApi.getDevices).mockResolvedValue({
      items: manyDevices,
      total: manyDevices.length,
    });

    renderDevicesPage();

    await waitFor(() => {
      expect(getDeviceRows()).toHaveLength(12);
    });

    // Select the 5th device
    const fifthOption = getDeviceRows()[4];
    fireEvent.click(fifthOption);
    expect(fifthOption).toHaveAttribute('aria-selected', 'true');
    expect(devicesApi.getDevices).toHaveBeenCalledTimes(1);

    // Advance 10 seconds -> triggers background auto-refresh
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    await waitFor(() => {
      expect(devicesApi.getDevices).toHaveBeenCalledTimes(2);
    });

    // Selection must remain on the 5th device, not reset to the 1st
    expect(getDeviceRows()[4]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('KEY-FLEET-5')).toBeInTheDocument();
  });
});
