import { apiClient, ApiError } from './client';
import { mockAdapter } from '../mocks/mockAdapter';
import {
  DevicesOut,
  DeviceItemOut,
  DeviceHealthOut,
  DeviceMissingSequencesOut,
  ShipmentDevicesOut,
} from '../types/api';

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

/**
 * Fetch all registered ESP32 devices and their integrity status.
 */
export async function getDevices(): Promise<DevicesOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.listDevices();
  }
  return apiClient.get<DevicesOut>('/api/v1/devices');
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
