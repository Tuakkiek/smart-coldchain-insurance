import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DevicesPage } from '../DevicesPage';
import { ToastProvider } from '../../components/feedback/Toast';
import { mockDevices } from '../../mocks/fixtures';
import * as devicesApi from '../../api/devices';
import { DeviceItemOut } from '../../types/api';

vi.mock('../../api/devices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/devices')>();
  return { ...actual, getDevices: vi.fn() };
});

const renderPage = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ToastProvider><DevicesPage /></ToastProvider></MemoryRouter>);
const rows = () => within(screen.getByRole('listbox', { name: 'Danh sách thiết bị' })).getAllByRole('option');

describe('DevicesPage minimal dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(devicesApi.getDevices).mockResolvedValue({ items: mockDevices, total: mockDevices.length });
  });
  afterEach(() => vi.useRealTimers());

  it('renders only the two operational KPIs and a compact device list', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Thiết bị' })).toBeInTheDocument();
    const stats = screen.getByRole('region', { name: 'Thống kê thiết bị' });
    expect(within(stats).getByText('Tổng thiết bị')).toBeInTheDocument();
    expect(within(stats).getByText('Đang trực tuyến')).toBeInTheDocument();
    expect(within(stats).queryByText(/Chữ ký hợp lệ|Trạng thái Backend|Thiết bị mất gói/)).not.toBeInTheDocument();
    expect(rows()).toHaveLength(mockDevices.length);
    expect(screen.queryByText('Public Key')).not.toBeInTheDocument();
  });

  it('selects a row and keeps technical metadata in the detail panel', async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(mockDevices.length));
    expect(rows()[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(rows()[4]);
    expect(rows()[4]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('B. Thông tin bảo mật')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chọn thiết bị' }));
    expect(screen.getByText('Chọn một thiết bị để xem thông tin chi tiết')).toBeInTheDocument();
  });

  it('searches and filters by online status', async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(mockDevices.length));
    fireEvent.change(screen.getByLabelText('Tìm thiết bị'), { target: { value: 'SHIP-001' } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('ESP32-01');
    fireEvent.change(screen.getByLabelText('Tìm thiết bị'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Lọc trạng thái thiết bị'), { target: { value: 'ONLINE' } });
    expect(rows().length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại' }));
    expect(rows()).toHaveLength(mockDevices.length);
  });

  it('renders an error state and retries the initial request', async () => {
    vi.mocked(devicesApi.getDevices).mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    expect(await screen.findByText('Không thể tải danh sách thiết bị ESP32')).toBeInTheDocument();
    vi.mocked(devicesApi.getDevices).mockResolvedValueOnce({ items: mockDevices, total: mockDevices.length });
    fireEvent.click(screen.getAllByRole('button', { name: /Thử lại/i })[0]);
    await waitFor(() => expect(rows()).toHaveLength(mockDevices.length));
  });

  it('auto-refreshes every 10 seconds without losing selection', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fleet: DeviceItemOut[] = Array.from({ length: 10 }, (_, index) => ({ ...mockDevices[0], id: `dev-${index}`, device_id: `ESP32-${String(index + 1).padStart(2, '0')}`, key_id: `KEY-${index}` }));
    vi.mocked(devicesApi.getDevices).mockResolvedValue({ items: fleet, total: fleet.length });
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(10));
    fireEvent.click(rows()[4]);
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    await waitFor(() => expect(devicesApi.getDevices).toHaveBeenCalledTimes(2));
    expect(rows()[4]).toHaveAttribute('aria-selected', 'true');
  });
});
