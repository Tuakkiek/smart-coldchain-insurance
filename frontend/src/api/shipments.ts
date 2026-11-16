import { apiClient, ApiError } from './client';
import { mockAdapter } from '../mocks/mockAdapter';
import {
  ShipmentOut,
  ShipmentsOut,
  ShipmentCreatePayload,
  TelemetryListOut,
  TelemetryCreatePayload,
  TelemetryOut,
  HealthOut,
} from '../types/api';

export async function checkBackendHealth(): Promise<HealthOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.getHealth();
  }
  return apiClient.get<HealthOut>('/api/v1/health');
}

export async function getShipments(): Promise<ShipmentsOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.listShipments();
  }
  return apiClient.get<ShipmentsOut>('/api/v1/shipments');
}

export async function getShipmentById(id: string): Promise<ShipmentOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.getShipment(id);
  }
  return apiClient.get<ShipmentOut>(`/api/v1/shipments/${id}`);
}

export async function createShipment(
  payload: ShipmentCreatePayload,
  adminKey?: string
): Promise<ShipmentOut> {
  const key = adminKey || apiClient.getAdminKey();
  if (!key) {
    throw new ApiError(
      'Chưa cấu hình X-Admin-Key. Vui lòng cung cấp Admin API Key để tạo lô hàng.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (apiClient.isMockEnabled()) {
    return mockAdapter.createShipment(payload);
  }
  return apiClient.post<ShipmentOut>('/api/v1/shipments', payload, undefined, {
    'X-Admin-Key': key,
  });
}

export async function getShipmentTelemetry(shipmentId: string): Promise<TelemetryListOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.listTelemetry(shipmentId);
  }
  return apiClient.get<TelemetryListOut>(`/api/v1/shipments/${shipmentId}/telemetry`);
}

export async function postShipmentTelemetry(
  shipmentId: string,
  payload: TelemetryCreatePayload
): Promise<TelemetryOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.postTelemetry(shipmentId, payload);
  }
  return apiClient.post<TelemetryOut>(`/api/v1/shipments/${shipmentId}/telemetry`, payload);
}
