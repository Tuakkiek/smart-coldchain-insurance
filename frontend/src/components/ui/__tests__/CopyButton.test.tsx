import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CopyButton } from '../CopyButton';
import { ToastProvider } from '../../feedback/Toast';
import { DevicesPage } from '../../../pages/DevicesPage';
import { ShipmentsPage } from '../../../pages/ShipmentsPage';
import { OverviewPage } from '../../../pages/OverviewPage';
import { mockDevices, mockShipments } from '../../../mocks/fixtures';
import * as devicesApi from '../../../api/devices';
import * as shipmentsApi from '../../../api/shipments';
import * as eventsApi from '../../../api/events';

vi.mock('../../../api/devices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/devices')>();
  return {
    ...actual,
    getDevices: vi.fn(),
  };
});

vi.mock('../../../api/shipments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/shipments')>();
  return {
    ...actual,
    getShipments: vi.fn(),
  };
});

vi.mock('../../../api/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/events')>();
  return {
    ...actual,
    getAllEvents: vi.fn(),
  };
});

describe('CopyButton component', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: originalClipboard,
    });
  });

  it('copies Shipment ID accurately and shows success toast with tooltip "Sao chép ID"', async () => {
    const shipmentId = '8b4fb8a2-2996-4da2-90b9-35019517f56f';

    render(
      <ToastProvider>
        <div>
          <span>{shipmentId}</span>
          <CopyButton value={`  ${shipmentId}  `} />
        </div>
      </ToastProvider>
    );

    const btn = screen.getByRole('button', { name: 'Sao chép ID' });
    expect(btn).toHaveAttribute('title', 'Sao chép ID');

    fireEvent.click(btn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(shipmentId);
    });
    expect(await screen.findByText('Đã sao chép ID thành công!')).toBeInTheDocument();
  });

  it('copies Device ID accurately and shows success toast', async () => {
    render(
      <ToastProvider>
        <div>
          <span>ESP32-01</span>
          <CopyButton value="ESP32-01" />
        </div>
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép ID' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ESP32-01');
    });
    expect(await screen.findByText('Đã sao chép ID thành công!')).toBeInTheDocument();
  });

  it('shows error toast and never shows success toast when clipboard rejects', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('Permission denied'));

    render(
      <ToastProvider>
        <CopyButton value="ESP32-02" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép ID' }));

    expect(
      await screen.findByText('Không thể sao chép ID. Vui lòng thử lại!')
    ).toBeInTheDocument();
    expect(screen.queryByText('Đã sao chép ID thành công!')).not.toBeInTheDocument();
  });

  it('shows error toast when Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    render(
      <ToastProvider>
        <CopyButton value="ESP32-03" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép ID' }));

    expect(
      await screen.findByText('Không thể sao chép ID. Vui lòng thử lại!')
    ).toBeInTheDocument();
    expect(screen.queryByText('Đã sao chép ID thành công!')).not.toBeInTheDocument();
  });

  it('does not trigger parent card/row click or keyboard handler', async () => {
    const onParentClick = vi.fn();
    const onParentKeyDown = vi.fn();

    render(
      <ToastProvider>
        <div onClick={onParentClick} onKeyDown={onParentKeyDown}>
          <CopyButton value="ESP32-04" />
        </div>
      </ToastProvider>
    );

    const btn = screen.getByRole('button', { name: 'Sao chép ID' });
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ESP32-04');
    });
    expect(onParentClick).not.toHaveBeenCalled();
    expect(onParentKeyDown).not.toHaveBeenCalled();
  });

  it('copies Device ID and assigned Shipment ID on DevicesPage without changing row selection and after filtering', async () => {
    vi.mocked(devicesApi.getDevices).mockResolvedValue({
      items: mockDevices,
      total: mockDevices.length,
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <DevicesPage />
        </ToastProvider>
      </MemoryRouter>
    );

    const listbox = await screen.findByRole('listbox', { name: 'Danh sách thiết bị ESP32' });
    const rows = within(listbox).getAllByRole('option');
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
    expect(rows[1]).toHaveAttribute('aria-selected', 'false');

    // Click Copy button on 2nd row (ESP32-02) -> should NOT select row 2
    const row2CopyButtons = within(rows[1]).getAllByRole('button', { name: 'Sao chép ID' });
    fireEvent.click(row2CopyButtons[0]);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockDevices[1].device_id);
    });
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
    expect(rows[1]).toHaveAttribute('aria-selected', 'false');

    // Filter devices and copy the filtered device's ID
    fireEvent.change(screen.getByLabelText('Tìm kiếm thiết bị'), {
      target: { value: 'ESP32-05' },
    });
    const filteredRows = within(listbox).getAllByRole('option');
    expect(filteredRows).toHaveLength(1);
    const filteredCopyBtn = within(filteredRows[0]).getAllByRole('button', { name: 'Sao chép ID' })[0];
    fireEvent.click(filteredCopyBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ESP32-05');
    });
  });

  it('copies Shipment UUID on ShipmentsPage without navigating away and after search filtering', async () => {
    vi.mocked(shipmentsApi.getShipments).mockResolvedValue({
      items: mockShipments,
      total: mockShipments.length,
    });

    render(
      <MemoryRouter
        initialEntries={['/shipments']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ToastProvider>
          <Routes>
            <Route path="/shipments" element={<ShipmentsPage />} />
            <Route path="/shipments/:id" element={<div>Detail Page Navigated</div>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );

    const targetShipment = mockShipments[1];
    const searchInput = await screen.findByPlaceholderText(
      'Tìm theo tên lô hàng, loại hàng, địa điểm...'
    );
    fireEvent.change(searchInput, { target: { value: targetShipment.name } });

    const copyBtn = await screen.findByRole('button', { name: 'Sao chép ID' });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        targetShipment.shipment_id || targetShipment.id
      );
    });
    expect(await screen.findByText('Đã sao chép ID thành công!')).toBeInTheDocument();
    expect(screen.queryByText('Detail Page Navigated')).not.toBeInTheDocument();
  });

  it('copies Shipment UUID on OverviewPage dashboard card without navigating away', async () => {
    vi.mocked(shipmentsApi.getShipments).mockResolvedValue({
      items: mockShipments,
      total: mockShipments.length,
    });
    vi.mocked(eventsApi.getAllEvents).mockResolvedValue({ items: [] });
    vi.mocked(devicesApi.getDevices).mockResolvedValue({ items: [], total: 0 });

    render(
      <MemoryRouter
        initialEntries={['/']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ToastProvider>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/shipments/:id" element={<div>Detail Page Navigated</div>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );

    const copyButtons = await screen.findAllByRole('button', { name: 'Sao chép ID' });
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        mockShipments[0].shipment_id || mockShipments[0].id
      );
    });
    expect(await screen.findByText('Đã sao chép ID thành công!')).toBeInTheDocument();
    expect(screen.queryByText('Detail Page Navigated')).not.toBeInTheDocument();
  });
});
