import { apiClient } from './client';
import { mockAdapter } from '../mocks/mockAdapter';
import {
  IntegritySummaryOut,
  IntegrityBatchesOut,
  IntegrityBatch,
  BatchVerifyResultOut,
} from '../types/api';

/**
 * Fetch overall integrity summary (total records, verified, missing, batch statistics).
 */
export async function getIntegritySummary(shipmentId?: string): Promise<IntegritySummaryOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.getIntegritySummary(shipmentId);
  }
  const endpoint = shipmentId
    ? `/api/v1/shipments/${shipmentId}/integrity`
    : '/api/v1/integrity/summary';
  return apiClient.get<IntegritySummaryOut>(endpoint);
}

/**
 * Fetch Merkle batches list, optionally filtered by shipment or device.
 */
export async function getIntegrityBatches(params?: {
  shipment_id?: string;
  device_id?: string;
}): Promise<IntegrityBatchesOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.listBatches(params?.shipment_id);
  }
  const endpoint = params?.shipment_id
    ? `/api/v1/shipments/${params.shipment_id}/batches`
    : '/api/v1/batches';
  return apiClient.get<IntegrityBatchesOut>(endpoint);
}

/**
 * Fetch single Merkle batch detail by batch_id.
 */
export async function getBatchById(batchId: string): Promise<IntegrityBatch> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.getBatch(batchId);
  }
  return apiClient.get<IntegrityBatch>(`/api/v1/batches/${batchId}`);
}

/**
 * Request backend to recalculate Merkle root from MySQL and verify against on-chain anchor.
 * Frontend NEVER hashes data locally or interacts with private keys/RPC directly.
 */
export async function verifyBatch(batchId: string): Promise<BatchVerifyResultOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.verifyBatch(batchId);
  }
  return apiClient.post<BatchVerifyResultOut>(`/api/v1/batches/${batchId}/verify`);
}
