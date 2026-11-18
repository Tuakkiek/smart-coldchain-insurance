import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShipmentDetailPage } from '../ShipmentDetailPage';
import { ToastProvider } from '../../components/feedback/Toast';
import * as shipmentsApi from '../../api/shipments';
import * as devicesApi from '../../api/devices';
import * as eventsApi from '../../api/events';
import * as integrityApi from '../../api/integrity';
import { ShipmentOut } from '../../types/api';

vi.mock('../../api/shipments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/shipments')>();
  return {
    ...actual,
    getShipmentById: vi.fn(),
    getShipmentTelemetry: vi.fn(),
    completeShipment: vi.fn(),
    retryShipmentRefund: vi.fn(),
  };
});

vi.mock('../../api/devices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/devices')>();
  return { ...actual, getShipmentDevices: vi.fn() };
});

vi.mock('../../api/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/events')>();
  return { ...actual, getShipmentEvents: vi.fn() };
});

vi.mock('../../api/integrity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/integrity')>();
  return { ...actual, getIntegrityBatches: vi.fn() };
});

const baseShipment: ShipmentOut = {
  id: '11111111-1111-4111-8111-111111111111',
  shipment_id: '11111111-1111-4111-8111-111111111111',
  name: 'Vaccine HN-SG',
  cargo_type: 'Vaccine',
  status: 'in_transit',
  origin: { name: 'Kho Hà Nội', latitude: 21.0285, longitude: 105.8542 },
  destination: { name: 'Kho TP.HCM', latitude: 10.7769, longitude: 106.7009 },
  temp_min_c: 2,
  temp_max_c: 8,
  violation_duration_minutes: 15,
  buyer_wallet_address: '0x2222222222222222222222222222222222222222',
  latest_telemetry: {
    id: 'tel-1',
    device_id: 'ESP32-01',
    temperature_c: 4.8,
    humidity_pct: 62.5,
    recorded_at: '2026-11-19T09:59:00Z',
    received_at: '2026-11-19T09:59:05Z',
    signature_status: 'VALID',
  },
  location: {
    latitude: 18.5,
    longitude: 106.0,
    location_source: 'backend_simulated',
    progress_pct: 25,
  },
  insurance: {
    insured_amount_vnd: 0,
    coverage_amount: '0.05',
    coverage_amount_wei: '50000000000000000',
    currency: 'SepoliaETH',
    chain_id: 11155111,
    buyer_wallet_address: '0x2222222222222222222222222222222222222222',
    policy_contract_address: '0x9999999999999999999999999999999999999999',
    policy_transaction_hash: '0x' + 'aa'.repeat(32),
    policy_status: 'CONFIRMED',
    status: 'active',
    payout_status: 'not_requested',
  },
  blockchain: null,
  created_at: '2026-11-19T09:00:00Z',
};

const deliveredSafeShipment: ShipmentOut = {
  ...baseShipment,
  status: 'delivered',
  delivered_at: '2026-11-19T10:00:00Z',
  delivery_source: 'admin_simulated',
  telemetry_closed: true,
  delivery_result: 'SAFE',
  delivery_result_reason: 'SAFE_DELIVERY_VERIFIED',
  refund_status: 'CONFIRMED',
  refund_transaction_hash: '0x' + 'cc'.repeat(32),
  refunded_amount_wei: '50000000000000000',
  refunded_amount: '0.05',
  currency: 'SepoliaETH',
  refund_recipient_address: '0x1111111111111111111111111111111111111111',
  location: {
    latitude: 10.7769,
    longitude: 106.7009,
    location_source: 'admin_simulated',
    progress_pct: 100,
  },
};

const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={[`/shipments/${baseShipment.id}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ToastProvider>
        <Routes>
          <Route path="/shipments/:id" element={<ShipmentDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );

describe('ShipmentDetailPage delivery completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shipmentsApi.getShipmentById).mockResolvedValue(baseShipment);
    vi.mocked(shipmentsApi.getShipmentTelemetry).mockResolvedValue({ items: [] });
    vi.mocked(eventsApi.getShipmentEvents).mockResolvedValue({ items: [] });
    vi.mocked(integrityApi.getIntegrityBatches).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(devicesApi.getShipmentDevices).mockResolvedValue({
      items: [
        {
          device_id: 'ESP32-01',
          registration_status: 'active',
          telemetry_status: 'OFFLINE',
          last_seen_at: '2026-11-19T09:59:05Z',
          last_sequence_number: 5,
        },
      ],
    });
  });

  it('opens confirmation modal and renders completed delivery + SepoliaETH refund details', async () => {
    vi.mocked(shipmentsApi.completeShipment).mockResolvedValueOnce(deliveredSafeShipment);
    vi.mocked(shipmentsApi.getShipmentById)
      .mockResolvedValueOnce(baseShipment)
      .mockResolvedValue(deliveredSafeShipment);

    renderPage();

    const triggerBtn = await screen.findByRole('button', { name: /Xác nhận đã giao hàng/i });
    fireEvent.click(triggerBtn);

    expect(screen.getByText('Xác nhận hoàn tất chuyến hàng?')).toBeInTheDocument();
    expect(
      screen.getByText(/Chuyến hàng sẽ được mô phỏng là đã đến điểm đích/i),
    ).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: /Xác nhận đã giao hàng/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(shipmentsApi.completeShipment).toHaveBeenCalledWith(baseShipment.id));
    expect(await screen.findByText('Chuyến hàng: Đã giao hàng')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('An toàn')).toBeInTheDocument();
    expect(screen.getByText('Đã hoàn')).toBeInTheDocument();
    expect(screen.getAllByText('0.05 SepoliaETH').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('link', { name: /Xem trên Sepolia Etherscan/i })).toHaveAttribute(
      'href',
      `https://sepolia.etherscan.io/tx/${deliveredSafeShipment.refund_transaction_hash}`,
    );
    expect(screen.queryByText(/Dữ liệu cũ · thiết bị offline/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xác nhận đã giao hàng/i })).not.toBeInTheDocument();
  });

  it('displays pending refund state without infinite spinner when blockchain confirmation is pending', async () => {
    const pendingShipment: ShipmentOut = {
      ...deliveredSafeShipment,
      refund_status: 'PENDING',
      refund_transaction_hash: '0x' + 'ee'.repeat(32),
      refunded_amount_wei: '50000000000000000',
      refunded_amount: '0.05',
    };
    vi.mocked(shipmentsApi.getShipmentById).mockResolvedValue(pendingShipment);

    renderPage();

    expect(await screen.findByText('Chuyến hàng: Đã giao hàng')).toBeInTheDocument();
    expect(screen.getByText('Đang xử lý')).toBeInTheDocument();
    expect(screen.queryByText(/Đang tải chi tiết lô hàng/i)).not.toBeInTheDocument();
  });
});
