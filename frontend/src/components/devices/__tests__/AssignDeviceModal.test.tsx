import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AssignDeviceModal } from '../AssignDeviceModal';
import { ToastProvider } from '../../feedback/Toast';
import { apiClient, ApiError } from '../../../api/client';
import { getDevices } from '../../../api/devices';
import { AdminDeviceViewOut } from '../../../types/api';

vi.mock('../../../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../api/client')>(),
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const renderWithToast = (ui: React.ReactElement) =>
  render(<ToastProvider>{ui}</ToastProvider>);

const firstShipment = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secondShipment = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const shipments = [
  { id: firstShipment, code: 'SHIP-001', cargo_type: 'Vaccine' },
  { id: secondShipment, code: 'SHIP-002', cargo_type: 'Vaccine' },
];

let device: AdminDeviceViewOut;

beforeEach(() => {
  vi.clearAllMocks();
  device = {
    device_id: 'ESP32-001', device_name: 'Cold Chain Sensor', status: 'active',
    has_public_key: false, current_shipment_id: firstShipment,
    last_sequence_number: 0, last_seen_at: null, keys: [],
    assignments: [{ shipment_id: firstShipment, active: true }],
  };
  vi.mocked(apiClient.get).mockImplementation(async (path) => {
    if (path === '/api/v1/devices') return { items: [structuredClone(device)], total: 1 };
    if (path === '/api/v1/shipments') return { items: shipments, total: shipments.length };
    throw new Error(`Unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (_path, payload) => {
    const { shipment_id, active } = payload as { shipment_id: string; active: boolean };
    const assignment = device.assignments.find((item) => item.shipment_id === shipment_id);
    if (assignment) assignment.active = active;
    else device.assignments.push({ shipment_id, active });
    device.current_shipment_id = device.assignments.find((item) => item.active)?.shipment_id ?? null;
    return structuredClone(device);
  });
});

describe('device linking lifecycle', () => {
  it('keeps a device unlinked after reloading the catalog and reopening the modal', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const { rerender } = renderWithToast(
      <AssignDeviceModal isOpen onClose={onClose} onSuccess={onSuccess} initialDeviceId="ESP32-001" />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Bỏ liên kết chuyến hàng' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/devices/ESP32-001/assignments', {
      shipment_id: firstShipment, active: false,
    });
    expect(device.assignments).toEqual([{ shipment_id: firstShipment, active: false }]);
    expect((await getDevices()).items[0].assigned_shipment_id).toBeNull();

    rerender(
      <ToastProvider>
        <AssignDeviceModal isOpen={false} onClose={onClose} onSuccess={onSuccess} />
      </ToastProvider>
    );
    rerender(
      <ToastProvider>
        <AssignDeviceModal isOpen onClose={onClose} onSuccess={onSuccess} initialDeviceId="ESP32-001" />
      </ToastProvider>
    );
    await screen.findByText('Chưa liên kết với chuyến hàng nào (Sẵn sàng gán).');
    expect(screen.queryByRole('button', { name: 'Bỏ liên kết chuyến hàng' })).not.toBeInTheDocument();
  });

  it('unlinks the current shipment before linking a different shipment', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    renderWithToast(<AssignDeviceModal isOpen onClose={onClose} onSuccess={onSuccess} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bỏ liên kết chuyến hàng' }));
    await screen.findByText('Chưa liên kết với chuyến hàng nào (Sẵn sàng gán).');
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: secondShipment } });
    fireEvent.click(screen.getByRole('button', { name: 'Liên Kết Chuyến Hàng' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/api/v1/devices/ESP32-001/assignments', {
      shipment_id: secondShipment, active: true,
    });
    expect((await getDevices()).items[0].assigned_shipment_id).toBe(secondShipment);
    expect(device.assignments).toEqual([
      { shipment_id: firstShipment, active: false },
      { shipment_id: secondShipment, active: true },
    ]);
  });

  it('retains the current link and displays the backend error via Toast only when unlinking fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError('Không thể gỡ liên kết', 500, 'INTERNAL_ERROR'));
    const onSuccess = vi.fn();
    renderWithToast(<AssignDeviceModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bỏ liên kết chuyến hàng' }));

    const toastAlert = await screen.findByRole('alert');
    expect(toastAlert).toHaveTextContent('Không thể gỡ liên kết');
    expect(screen.getAllByText('Không thể gỡ liên kết')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Bỏ liên kết chuyến hàng' })).toBeEnabled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(device.current_shipment_id).toBe(firstShipment);
  });

  it('clears previous selections when reopened with empty catalogs', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const { rerender } = renderWithToast(
      <AssignDeviceModal isOpen onClose={onClose} onSuccess={onSuccess} />
    );
    await screen.findByRole('button', { name: 'Bỏ liên kết chuyến hàng' });
    rerender(
      <ToastProvider>
        <AssignDeviceModal isOpen={false} onClose={onClose} onSuccess={onSuccess} />
      </ToastProvider>
    );
    vi.mocked(apiClient.get).mockResolvedValue({ items: [], total: 0 });
    rerender(
      <ToastProvider>
        <AssignDeviceModal isOpen onClose={onClose} onSuccess={onSuccess} />
      </ToastProvider>
    );

    await waitFor(() => expect(screen.getAllByRole('combobox')[0].children).toHaveLength(0));
    expect(screen.getByRole('button', { name: 'Liên Kết Chuyến Hàng' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Bỏ liên kết chuyến hàng' })).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
