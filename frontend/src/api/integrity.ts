import { apiClient, ApiError } from './client';
import { mockAdapter } from '../mocks/mockAdapter';
import {
  IntegritySummaryOut,
  IntegrityBatchesOut,
  IntegrityBatch,
  BatchVerifyResultOut,
} from '../types/api';

export function adaptBatch(raw: any): IntegrityBatch {
  return {
    ...raw,
    first_sequence: raw.first_sequence ?? raw.first_sequence_number ?? 0,
    last_sequence: raw.last_sequence ?? raw.last_sequence_number ?? 0,
    first_sequence_number: raw.first_sequence ?? raw.first_sequence_number ?? 0,
    last_sequence_number: raw.last_sequence ?? raw.last_sequence_number ?? 0,
    verified_at: raw.verified_at ?? raw.last_verified_at ?? null,
    last_verified_at: raw.verified_at ?? raw.last_verified_at ?? null,
    anchor_tx_hash: raw.anchor_transaction?.transaction_hash ?? raw.anchor_tx_hash ?? null,
    sealed_at: raw.sealed_at ?? raw.batch_end_time ?? new Date().toISOString(),
    batch_start_time: raw.batch_start_time ?? raw.sealed_at,
    batch_end_time: raw.batch_end_time ?? raw.sealed_at,
  };
}

export function adaptVerifyResult(raw: any): BatchVerifyResultOut {
  const batch = adaptBatch(raw);
  const isFailed = raw.verification_status === 'DATA_INTEGRITY_FAILED';
  const onChainMatch = raw.on_chain_match ?? null;

  let message = '';
  if (isFailed) {
    if (onChainMatch === false) {
      message = 'Phát hiện sai lệch toàn vẹn: Merkle root không khớp với root đã neo trên Blockchain.';
    } else {
      message = 'LỖI TOÀN VẸN: Dữ liệu telemetry trong cơ sở dữ liệu đã bị sửa đổi trái phép sau khi seal (Merkle root tính lại không khớp với root đã lưu).';
    }
  } else {
    if (onChainMatch === true) {
      message = 'Xác minh thành công: Merkle root tính lại khớp 100% với bản ghi lưu trữ và khớp dữ liệu trên Blockchain.';
    } else {
      message = 'Xác minh thành công: Merkle root tính lại khớp 100% với bản ghi lưu trữ (Lưu ý: Chưa đối chiếu on-chain do batch chưa neo).';
    }
  }

  return {
    ...batch,
    calculated_root: raw.calculated_root ?? null,
    on_chain_match: onChainMatch,
    expected_root: raw.merkle_root,
    recalculated_root: raw.calculated_root ?? '',
    message,
  };
}

/**
 * Fetch overall integrity summary (batch_count, record_count, verification_status, anchor_status).
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
 * Fetch Merkle batches list, optionally filtered by shipment.
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
  const res = await apiClient.get<any>(endpoint);
  const items = Array.isArray(res?.items) ? res.items.map(adaptBatch) : [];
  return {
    items,
    total: res?.total ?? items.length,
  };
}

/**
 * Fetch single Merkle batch detail by batch_id.
 */
export async function getBatchById(batchId: string): Promise<IntegrityBatch> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.getBatch(batchId);
  }
  const res = await apiClient.get<any>(`/api/v1/batches/${batchId}`);
  return adaptBatch(res);
}

/**
 * Request backend to recalculate Merkle root from MySQL and verify against on-chain anchor.
 * Frontend NEVER hashes data locally or interacts with private keys/RPC directly.
 * Endpoint: POST /api/v1/batches/{batch_id}/verify
 * Requires header: X-Admin-Key
 */
export async function verifyBatch(
  batchId: string,
  adminKey?: string
): Promise<BatchVerifyResultOut> {
  const key = adminKey || apiClient.getAdminKey();
  if (!key) {
    throw new ApiError(
      'Chưa cấu hình X-Admin-Key. Vui lòng cung cấp Admin API Key để xác minh batch.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (apiClient.isMockEnabled()) {
    return mockAdapter.verifyBatch(batchId);
  }

  const res = await apiClient.post<any>(
    `/api/v1/batches/${batchId}/verify`,
    undefined,
    undefined,
    { 'X-Admin-Key': key }
  );
  return adaptVerifyResult(res);
}
