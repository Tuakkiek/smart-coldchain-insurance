import { apiClient } from './client';
import {
  BlockchainPublicConfigOut,
  ShipmentOut,
  ShipmentsOut,
  ShipmentCreatePayload,
  ShipmentDeleteOut,
  TelemetryListOut,
  TelemetryCreatePayload,
  TelemetryOut,
  HealthOut,
} from '../types/api';

export async function checkBackendHealth(): Promise<HealthOut> {
  return apiClient.get<HealthOut>('/api/v1/health', undefined, false);
}

export async function getShipments(): Promise<ShipmentsOut> {
  return apiClient.get<ShipmentsOut>('/api/v1/shipments');
}

export async function getShipmentById(id: string): Promise<ShipmentOut> {
  return apiClient.get<ShipmentOut>(`/api/v1/shipments/${id}`);
}

export async function createShipment(
  payload: ShipmentCreatePayload
): Promise<ShipmentOut> {
  return apiClient.post<ShipmentOut>('/api/v1/shipments', payload, 60_000);
}

export async function deleteShipment(shipmentId: string): Promise<ShipmentDeleteOut> {
  return apiClient.delete<ShipmentDeleteOut>(
    `/api/v1/shipments/${encodeURIComponent(shipmentId)}`
  );
}

export async function getShipmentTelemetry(shipmentId: string): Promise<TelemetryListOut> {
  return apiClient.get<TelemetryListOut>(`/api/v1/shipments/${shipmentId}/telemetry`);
}

export async function postShipmentTelemetry(
  shipmentId: string,
  payload: TelemetryCreatePayload
): Promise<TelemetryOut> {
  return apiClient.post<TelemetryOut>(`/api/v1/shipments/${shipmentId}/telemetry`, payload, undefined, false);
}

export async function getBlockchainPublicConfig(): Promise<BlockchainPublicConfigOut> {
  return apiClient.get<BlockchainPublicConfigOut>('/api/v1/blockchain/config');
}

export async function retryShipmentPolicy(shipmentId: string): Promise<ShipmentOut> {
  return apiClient.post<ShipmentOut>(
    `/api/v1/shipments/${encodeURIComponent(shipmentId)}/policy/retry`,
    undefined,
    130_000
  );
}

export async function confirmShipmentPolicy(
  shipmentId: string,
  transactionHash: string
): Promise<ShipmentOut> {
  return apiClient.post<ShipmentOut>(
    `/api/v1/shipments/${encodeURIComponent(shipmentId)}/policy/confirm`,
    { transaction_hash: transactionHash },
    130_000
  );
}
