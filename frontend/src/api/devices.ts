import { apiClient, ApiError } from './client';
import {
  DevicesOut,
  DeviceItemOut,
  DeviceHealthOut,
  DeviceMissingSequencesOut,
  ShipmentDevicesOut,
  DeviceRegisterPayload,
  DeviceDeleteOut,
  DeviceAssignmentPayload,
  AdminDeviceViewOut,
  SignatureStatus,
  CompletenessStatus,
  DeviceOnlineStatus,
} from '../types/api';

export { ApiError };

/**
 * Admin: Register a new ESP32 device with minimal fields (device_id and device_name).
 * In local provisioning mode the Backend creates the P-256 pair, stores only
 * the public key, and updates the configured ESP32 config.h. No key material
 * is sent through the browser.
 * Endpoint: POST /api/v1/devices
 * Authentication: current Admin Bearer session (attached by apiClient).
 */
export async function registerDevice(
  payload: DeviceRegisterPayload
): Promise<AdminDeviceViewOut> {
  return apiClient.post<AdminDeviceViewOut>('/api/v1/devices', payload);
}

/**
 * Delete a registered device that has no active shipment assignment.
 * Devices with telemetry history are retained to preserve audit evidence.
 */
export async function deleteDevice(deviceId: string): Promise<DeviceDeleteOut> {
  return apiClient.delete<DeviceDeleteOut>(
    `/api/v1/devices/${encodeURIComponent(deviceId)}`
  );
}

/**
 * Admin: Assign or unassign a device to a shipment.
 * Each device can only have ONE active assignment. Multiple devices can share the same shipment.
 * To change shipment: first unassign old (active=false), then assign new (active=true).
 * Backend enforces constraint; returns 409 DEVICE_ALREADY_ASSIGNED if active assignment exists.
 * Endpoint: POST /api/v1/devices/{device_id}/assignments
 * Authentication: current Admin Bearer session (attached by apiClient).
 */
export async function assignDevice(
  deviceId: string,
  payload: DeviceAssignmentPayload
): Promise<AdminDeviceViewOut> {
  return apiClient.post<AdminDeviceViewOut>(
    `/api/v1/devices/${deviceId}/assignments`,
    payload
  );
}

/**
 * Admin: Fetch detailed cryptographic keys and assignments for a device.
 * Endpoint: GET /api/v1/devices/{device_id}
 * Authentication: current Admin Bearer session (attached by apiClient).
 */
export async function getAdminDeviceDetails(
  deviceId: string
): Promise<AdminDeviceViewOut> {
  return apiClient.get<AdminDeviceViewOut>(`/api/v1/devices/${deviceId}`);
}

/**
 * Fetch devices assigned to a specific shipment and their live telemetry/registration status.
 * Official contract: GET /api/v1/shipments/{shipment_id}/devices
 */
export async function getShipmentDevices(shipmentId: string): Promise<ShipmentDevicesOut> {
  return apiClient.get<ShipmentDevicesOut>(`/api/v1/shipments/${shipmentId}/devices`);
}

export function normalizeDeviceItem(item: any): DeviceItemOut {
  // If item already has full DeviceItemOut structure
  if (item.health && item.signature_status && item.completeness_status) {
    return item as DeviceItemOut;
  }

  // Map Backend DeviceOut (from GET /api/v1/devices) to DeviceItemOut
  const lastSeen = item.last_seen_at ?? item.health?.last_seen_at ?? null;
  const hasTelemetry = lastSeen !== null && (item.last_sequence_number ?? item.health?.last_sequence_number ?? 0) > 0;

  // Online status: Respect backend policy (UNKNOWN if no telemetry received, otherwise diff against threshold)
  let onlineStatus: DeviceOnlineStatus = 'UNKNOWN';
  if (item.telemetry_status) {
    onlineStatus = item.telemetry_status;
  } else if (item.health?.online_status) {
    onlineStatus = item.health.online_status;
  } else if (lastSeen) {
    const diffMs = Date.now() - new Date(lastSeen).getTime();
    onlineStatus = diffMs <= 5 * 60 * 1000 ? 'ONLINE' : 'OFFLINE';
  } else {
    onlineStatus = 'UNKNOWN';
  }

  const activeKey = item.keys?.find((k: any) => k.status === 'active') || item.keys?.[0];
  const activeAssignment = item.assignments?.find((a: any) => a.active) || item.assignments?.[0];

  // Signature status:
  // - Do NOT treat has_public_key=true as signature_status=VALID!
  // - Do NOT default to VALID when response lacks status.
  // - If device has no key registered: UNKNOWN_KEY.
  // - If response has explicit signature_status: use that.
  // - Otherwise: UNKNOWN (unverified / unconfirmed).
  let signatureStatus: SignatureStatus = 'UNKNOWN';
  if (item.signature_status) {
    signatureStatus = item.signature_status;
  } else if (!item.has_public_key && (!item.keys || item.keys.length === 0)) {
    signatureStatus = 'UNKNOWN_KEY';
  } else {
    signatureStatus = 'UNKNOWN';
  }

  // Completeness status:
  // - Do NOT default to COMPLETE or missing_sequence_count=0 when there is no confirmed data!
  // - If device hasn't sent telemetry or lacks sequence audit: UNKNOWN.
  let completenessStatus: CompletenessStatus = 'UNKNOWN';
  let missingSeqCount: number | null = null;

  if (item.completeness_status) {
    completenessStatus = item.completeness_status;
    missingSeqCount =
      typeof item.missing_sequence_count === 'number'
        ? item.missing_sequence_count
        : (completenessStatus === 'COMPLETE' ? 0 : null);
  } else if (item.missing_sequences && typeof item.missing_sequences === 'object') {
    const missingKeys = Object.keys(item.missing_sequences);
    if (missingKeys.length > 0) {
      completenessStatus = 'DATA_INCOMPLETE';
      missingSeqCount = missingKeys.length;
    } else {
      completenessStatus = 'COMPLETE';
      missingSeqCount = 0;
    }
  } else {
    completenessStatus = 'UNKNOWN';
    missingSeqCount = null;
  }

  return {
    id: item.device_id || item.id,
    device_id: item.device_id || item.id,
    device_name: item.device_name || item.device_id,
    key_id: activeKey?.key_id || (item.has_public_key ? 'active-key' : 'NO_KEY'),
    has_public_key: item.has_public_key ?? false,
    firmware_version: item.firmware_version || 'v1.0.0',
    assigned_shipment_id: activeAssignment?.shipment_id || item.current_shipment_id || null,
    assigned_shipment_code: item.assigned_shipment_code || null,
    signature_status: signatureStatus,
    completeness_status: completenessStatus,
    health: {
      device_id: item.device_id || item.id,
      last_sequence_number: hasTelemetry ? (item.last_sequence_number ?? null) : null,
      missing_sequence_count: missingSeqCount,
      last_heartbeat_at: item.last_seen_at || null,
      last_seen_at: item.last_seen_at || null,
      online_status: onlineStatus,
      firmware_version: item.firmware_version || null,
    },
    registered_at: item.created_at || new Date().toISOString(),
  };
}

/**
 * Fetch all registered ESP32 devices and their integrity status.
 */
export async function getDevices(): Promise<DevicesOut> {
  const res = await apiClient.get<any>('/api/v1/devices');
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
  const res = await apiClient.get<any>(`/api/v1/devices/${deviceId}`);
  return normalizeDeviceItem(res);
}

/**
 * Fetch runtime health, sequence and heartbeat status for a device.
 * Note: Backend has no separate /devices/{id}/health endpoint.
 * Health is obtained via admin GET /devices/{id} or GET /shipments/{id}/devices.
 */
export async function getDeviceHealth(deviceId: string): Promise<DeviceHealthOut> {
  const dev = await getDeviceById(deviceId);
  return dev.health;
}

/**
 * Fetch detected missing sequence gap ranges for a device.
 * Note: Backend has no separate /devices/{id}/missing-sequences endpoint.
 */
export async function getDeviceMissingSequences(
  _deviceId: string
): Promise<DeviceMissingSequencesOut> {
  throw new ApiError(
    'Backend chưa hỗ trợ endpoint riêng /devices/{id}/missing-sequences. Thông tin gap chuỗi được xác định từ telemetry trên chuyến hàng.',
    501,
    'NOT_IMPLEMENTED'
  );
}
