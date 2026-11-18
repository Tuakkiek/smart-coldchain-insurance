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
    getShipmentDevices: vi.fn().mockResolvedValue({ items: [] }),
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

  it('keeps technical copy actions out of compact device rows', async () => {
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

    const listbox = await screen.findByRole('listbox', { name: 'Danh sách thiết bị' });
    const rows = within(listbox).getAllByRole('option');
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
    expect(rows[1]).toHaveAttribute('aria-selected', 'false');
    expect(within(rows[1]).queryByRole('button', { name: 'Sao chép ID' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tìm thiết bị'), {
      target: { value: 'ESP32-05' },
    });
    const filteredRows = within(listbox).getAllByRole('option');
    expect(filteredRows).toHaveLength(1);
    expect(within(filteredRows[0]).queryByRole('button', { name: 'Sao chép ID' })).not.toBeInTheDocument();
  });

  it('hides Shipment UUID from the compact ShipmentsPage row', async () => {
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
      'Tìm theo tên, hàng hóa hoặc địa điểm'
    );
    fireEvent.change(searchInput, { target: { value: targetShipment.name } });
    expect(await screen.findByText(targetShipment.name)).toBeInTheDocument();
    expect(screen.queryByText(targetShipment.shipment_id || targetShipment.id)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sao chép ID' })).not.toBeInTheDocument();
    expect(screen.queryByText('Detail Page Navigated')).not.toBeInTheDocument();
  });

  it('hides Shipment UUID from Overview progressive disclosure rows', async () => {
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

    expect(await screen.findByText(mockShipments[0].name)).toBeInTheDocument();
    expect(screen.queryByText(mockShipments[0].shipment_id || mockShipments[0].id)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sao chép ID' })).not.toBeInTheDocument();
    expect(screen.queryByText('Detail Page Navigated')).not.toBeInTheDocument();
  });
});
