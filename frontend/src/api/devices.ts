import { apiClient, ApiError } from './client';
import { mockAdapter } from '../mocks/mockAdapter';
import {
  DevicesOut,
  DeviceItemOut,
  DeviceHealthOut,
  DeviceMissingSequencesOut,
  ShipmentDevicesOut,
  DeviceRegisterPayload,
  DeviceAssignmentPayload,
  AdminDeviceViewOut,
} from '../types/api';

/**
 * Admin: Register a new ESP32 device with minimal fields (device_id and device_name).
 * Cryptographic keys are provisioned outside browser via trusted Python script via USB.
 * Endpoint: POST /api/v1/devices
 * Requires header: X-Admin-Key
 */
export async function registerDevice(
  payload: DeviceRegisterPayload,
  adminKey?: string
): Promise<AdminDeviceViewOut> {
  const key = adminKey || apiClient.getAdminKey();
  if (!key) {
    throw new ApiError(
      'Chưa cấu hình X-Admin-Key. Vui lòng cung cấp Admin API Key để thực hiện.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (apiClient.isMockEnabled()) {
    return mockAdapter.registerDevice(payload);
  }

  return apiClient.post<AdminDeviceViewOut>('/api/v1/devices', payload, undefined, {
    'X-Admin-Key': key,
  });
}

/**
 * Admin: Assign or unassign a device to a shipment.
 * Each device can only have ONE active assignment. Multiple devices can share the same shipment.
 * To change shipment: first unassign old (active=false), then assign new (active=true).
 * Backend enforces constraint; returns 409 DEVICE_ALREADY_ASSIGNED if active assignment exists.
 * Endpoint: POST /api/v1/devices/{device_id}/assignments
 * Requires header: X-Admin-Key
 */
export async function assignDevice(
  deviceId: string,
  payload: DeviceAssignmentPayload,
  adminKey?: string
): Promise<AdminDeviceViewOut> {
  const key = adminKey || apiClient.getAdminKey();
  if (!key) {
    throw new ApiError(
      'Chưa cấu hình X-Admin-Key. Vui lòng cung cấp Admin API Key để thực hiện.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (apiClient.isMockEnabled()) {
    return mockAdapter.assignDevice(deviceId, payload);
  }

  return apiClient.post<AdminDeviceViewOut>(
    `/api/v1/devices/${deviceId}/assignments`,
    payload,
    undefined,
    {
      'X-Admin-Key': key,
    }
  );
}

/**
 * Admin: Fetch detailed cryptographic keys and assignments for a device.
 * Endpoint: GET /api/v1/devices/{device_id}
 * Requires header: X-Admin-Key
 */
export async function getAdminDeviceDetails(
  deviceId: string,
  adminKey?: string
): Promise<AdminDeviceViewOut> {
  const key = adminKey || apiClient.getAdminKey();
  if (!key) {
    throw new ApiError(
      'Chưa cấu hình X-Admin-Key. Vui lòng cung cấp Admin API Key để thực hiện.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (apiClient.isMockEnabled()) {
    return mockAdapter.getAdminDeviceDetails(deviceId);
  }

  return apiClient.get<AdminDeviceViewOut>(`/api/v1/devices/${deviceId}`, undefined, {
    'X-Admin-Key': key,
  });
}

/**
 * Fetch devices assigned to a specific shipment and their live telemetry/registration status.
 * Official contract: GET /api/v1/shipments/{shipment_id}/devices
 */
export async function getShipmentDevices(shipmentId: string): Promise<ShipmentDevicesOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.listShipmentDevices(shipmentId);
  }
  return apiClient.get<ShipmentDevicesOut>(`/api/v1/shipments/${shipmentId}/devices`);
}

function normalizeDeviceItem(item: any): DeviceItemOut {
  // If item already has full DeviceItemOut structure (e.g. mockAdapter)
  if (item.health && item.signature_status) {
    return item as DeviceItemOut;
  }

  // Map Backend DeviceOut (from GET /api/v1/devices) to DeviceItemOut
  const lastSeen = item.last_seen_at;
  const isOnline = lastSeen
    ? Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000
    : false;

  const activeKey = item.keys?.find((k: any) => k.status === 'active') || item.keys?.[0];
  const activeAssignment = item.assignments?.find((a: any) => a.active) || item.assignments?.[0];

  return {
    id: item.device_id || item.id,
    device_id: item.device_id || item.id,
    device_name: item.device_name || item.device_id,
    key_id: activeKey?.key_id || (item.has_public_key ? 'active-key' : 'NO_KEY'),
    has_public_key: item.has_public_key ?? false,
    public_key_pem: item.public_key_pem,
    firmware_version: item.firmware_version || 'v1.0.0',
    assigned_shipment_id: activeAssignment?.shipment_id || item.current_shipment_id || null,
    assigned_shipment_code: item.assigned_shipment_code || null,
    signature_status: item.has_public_key ? 'VALID' : 'UNKNOWN_KEY',
    completeness_status: 'COMPLETE',
    health: {
      device_id: item.device_id || item.id,
      last_sequence_number: item.last_sequence_number ?? null,
      missing_sequence_count: 0,
      last_heartbeat_at: item.last_seen_at || null,
      last_seen_at: item.last_seen_at || null,
      online_status: isOnline ? 'ONLINE' : 'OFFLINE',
      firmware_version: item.firmware_version || 'v1.0.0',
    },
    registered_at: item.created_at || new Date().toISOString(),
  };
}

/**
 * Fetch all registered ESP32 devices and their integrity status.
 */
export async function getDevices(adminKey?: string): Promise<DevicesOut> {
  if (apiClient.isMockEnabled()) {
    const res = await mockAdapter.listDevices();
    return {
      items: res.items.map(normalizeDeviceItem),
      total: res.total,
    };
  }
  const key = adminKey || apiClient.getAdminKey();
  const headers = key ? { 'X-Admin-Key': key } : undefined;
  const res = await apiClient.get<any>('/api/v1/devices', undefined, headers);
  const items = Array.isArray(res?.items) ? res.items.map(normalizeDeviceItem) : [];
  return {
    items,
    total: res?.total ?? items.length,
  };
}

/**
 * Fetch detailed registration and cryptographic metadata for a specific ESP32 device.
 */
export async function getDeviceById(deviceId: string): Promise<DeviceItemOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.getDevice(deviceId);
  }
  return apiClient.get<DeviceItemOut>(`/api/v1/devices/${deviceId}`);
}

/**
 * Fetch runtime health, sequence and heartbeat status for a device.
 */
export async function getDeviceHealth(deviceId: string): Promise<DeviceHealthOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.getDeviceHealth(deviceId);
  }
  return apiClient.get<DeviceHealthOut>(`/api/v1/devices/${deviceId}/health`);
}

/**
 * Fetch detected missing sequence gap ranges for a device.
 */
export async function getDeviceMissingSequences(
  deviceId: string
): Promise<DeviceMissingSequencesOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.getDeviceMissingSequences(deviceId);
  }
  return apiClient.get<DeviceMissingSequencesOut>(
    `/api/v1/devices/${deviceId}/missing-sequences`
  );
}
