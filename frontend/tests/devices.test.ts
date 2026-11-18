import { describe, expect, it } from 'vitest';
import { normalizeDeviceItem } from '../src/api/devices';

const device = {
  device_id: 'ESP32-001',
  device_name: 'Cold Chain Sensor',
  has_public_key: true,
  keys: [{ key_id: 'key-v1', status: 'active' }],
  last_sequence_number: 0,
  last_seen_at: null,
};

describe('device assignment projection', () => {
  it.each([null, undefined])('ignores inactive history when current_shipment_id is %s', (currentShipmentId) => {
    const result = normalizeDeviceItem({
      ...device,
      current_shipment_id: currentShipmentId,
      assigned_shipment_code: 'OLD-SHIPMENT',
      assignments: [{ shipment_id: 'old-shipment', active: false }],
    });

    expect(result.assigned_shipment_id).toBeNull();
    expect(result.assigned_shipment_code).toBeNull();
  });

  it('uses only the active assignment when current_shipment_id is omitted', () => {
    const result = normalizeDeviceItem({
      ...device,
      assignments: [
        { shipment_id: 'old-shipment', active: false },
        { shipment_id: 'new-shipment', active: true },
      ],
    });

    expect(result.assigned_shipment_id).toBe('new-shipment');
  });

  it('respects an explicit null current shipment from the backend', () => {
    const result = normalizeDeviceItem({
      ...device,
      current_shipment_id: null,
      assignments: [{ shipment_id: 'stale-shipment', active: true }],
    });

    expect(result.assigned_shipment_id).toBeNull();
  });

  it('uses the current shipment returned by the backend', () => {
    const result = normalizeDeviceItem({
      ...device,
      current_shipment_id: 'current-shipment',
      assigned_shipment_code: 'SHIP-002',
      assignments: [{ shipment_id: 'old-shipment', active: false }],
    });

    expect(result.assigned_shipment_id).toBe('current-shipment');
    expect(result.assigned_shipment_code).toBe('SHIP-002');
  });
});
