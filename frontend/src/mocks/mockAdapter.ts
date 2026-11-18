import {
  ShipmentOut,
  ShipmentsOut,
  ShipmentCreatePayload,
  ShipmentDeleteOut,
  TelemetryOut,
  TelemetryListOut,
  EventOut,
  EventListOut,
  HealthOut,
  DevicesOut,
  DeviceItemOut,
  DeviceHealthOut,
  DeviceMissingSequencesOut,
  ShipmentDevicesOut,
  DeviceTelemetryStatus,
  DeviceAssignmentPayload,
  AdminDeviceViewOut,
  IntegrityBatch,
  IntegrityBatchesOut,
  IntegritySummaryOut,
  BatchVerifyResultOut,
} from '../types/api';
import {
  mockShipments,
  mockTelemetryHistory,
  mockEvents,
  mockDevices,
  mockMissingSequences,
  mockBatches,
  mockIntegritySummary,
} from './fixtures';
import { ApiError } from '../api/client';

class MockAdapter {
  private shipments: ShipmentOut[] = JSON.parse(JSON.stringify(mockShipments));
  private telemetry: Record<string, typeof mockTelemetryHistory[string]> = JSON.parse(JSON.stringify(mockTelemetryHistory));
  private events: Record<string, typeof mockEvents[string]> = JSON.parse(JSON.stringify(mockEvents));
  private devices: DeviceItemOut[] = JSON.parse(JSON.stringify(mockDevices));
  private missingSequences: Record<string, DeviceMissingSequencesOut> = JSON.parse(
    JSON.stringify(mockMissingSequences)
  );
  private batches: IntegrityBatch[] = JSON.parse(JSON.stringify(mockBatches));
  private integritySummary: IntegritySummaryOut = JSON.parse(
    JSON.stringify(mockIntegritySummary)
  );

  async listBatches(shipmentId?: string): Promise<IntegrityBatchesOut> {
    let items = [...this.batches];
    if (shipmentId) {
      items = items.filter((b) => b.shipment_id === shipmentId);
    }
    return {
      items: JSON.parse(JSON.stringify(items)),
      total: items.length,
    };
  }

  async getBatch(batchId: string): Promise<IntegrityBatch> {
    const item = this.batches.find((b) => b.batch_id === batchId);
    if (!item) {
      throw new Error(`Mock 404: Không tìm thấy batch ${batchId}`);
    }
    return JSON.parse(JSON.stringify(item));
  }

  async getIntegritySummary(_shipmentId?: string): Promise<IntegritySummaryOut> {
    return JSON.parse(JSON.stringify(this.integritySummary));
  }

  async verifyBatch(batchId: string): Promise<BatchVerifyResultOut> {
    const batch = this.batches.find((b) => b.batch_id === batchId);
    if (!batch) {
      throw new Error(`Mock 404: Không tìm thấy batch ${batchId} để xác minh`);
    }

    const verifiedAt = new Date().toISOString();

    if (batch.tamper_detected || batch.batch_id === 'BATCH-20261107-003') {
      batch.verification_status = 'DATA_INTEGRITY_FAILED';
      batch.last_verified_at = verifiedAt;
      batch.verified_at = verifiedAt;
      batch.tamper_detected = true;

      const recalculatedRoot =
        '0x99aa887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbb';

      return {
        ...batch,
        batch_id: batch.batch_id,
        verification_status: 'DATA_INTEGRITY_FAILED',
        calculated_root: recalculatedRoot,
        merkle_root: batch.merkle_root,
        on_chain_match: false,
        recalculated_root: recalculatedRoot,
        expected_root: batch.merkle_root,
        matched: false,
        verified_at: verifiedAt,
        message:
          'LỖI TOÀN VẸN: Dữ liệu telemetry trong cơ sở dữ liệu đã bị sửa đổi trái phép sau khi seal. Merkle root tính lại không khớp với root đã neo on-chain!',
        network: 'Ethereum Localnet / Hardhat',
      };
    } else {
      batch.verification_status = 'MATCHED';
      batch.last_verified_at = verifiedAt;
      batch.verified_at = verifiedAt;
      batch.tamper_detected = false;

      return {
        ...batch,
        batch_id: batch.batch_id,
        verification_status: 'MATCHED',
        calculated_root: batch.merkle_root,
        merkle_root: batch.merkle_root,
        on_chain_match: batch.anchor_status === 'DATA_ANCHORED' ? true : null,
        recalculated_root: batch.merkle_root,
        expected_root: batch.merkle_root,
        matched: true,
        verified_at: verifiedAt,
        message:
          'Xác minh thành công: Merkle root tính lại từ telemetry khớp 100% với root đã neo on-chain.',
        network: 'Ethereum Localnet / Hardhat',
      };
    }
  }

  async listShipmentDevices(shipmentId: string): Promise<ShipmentDevicesOut> {
    const assigned = this.devices.filter(
      (d) => d.assigned_shipment_id === shipmentId || d.assigned_shipment_name === shipmentId
    );

    if (assigned.length > 0) {
      return {
        items: assigned.map((d) => {
          let status: DeviceTelemetryStatus = 'ONLINE';
          if (d.health.online_status === 'OFFLINE') status = 'OFFLINE';
          else if (d.health.online_status === 'UNKNOWN') status = 'UNKNOWN';

          return {
            device_id: d.device_id,
            registration_status: 'active',
            telemetry_status: status,
            last_seen_at: d.health.last_seen_at,
            last_sequence_number: d.health.last_sequence_number ?? 0,
          };
        }),
      };
    }

    // Nếu không tìm thấy qua assignment trực tiếp, kiểm tra shipment xem có telemetry không
    const ship = this.shipments.find((s) => s.id === shipmentId);
    if (ship?.latest_telemetry?.device_id) {
      return {
        items: [
          {
            device_id: ship.latest_telemetry.device_id,
            registration_status: 'active',
            telemetry_status: 'ONLINE',
            last_seen_at: ship.latest_telemetry.received_at,
            last_sequence_number: ship.latest_telemetry.sequence_number ?? 1,
          },
        ],
      };
    }

    return { items: [] };
  }

  async listDevices(): Promise<DevicesOut> {
    return {
      items: JSON.parse(JSON.stringify(this.devices)),
      total: this.devices.length,
    };
  }

  async getDevice(deviceId: string): Promise<DeviceItemOut> {
    const item = this.devices.find((d) => d.device_id === deviceId || d.id === deviceId);
    if (!item) {
      throw new Error(`Mock 404: Thiết bị ${deviceId} không tìm thấy`);
    }
    return JSON.parse(JSON.stringify(item));
  }

  async getDeviceHealth(deviceId: string): Promise<DeviceHealthOut> {
    const item = this.devices.find((d) => d.device_id === deviceId || d.id === deviceId);
    if (!item) {
      throw new Error(`Mock 404: Không có dữ liệu sức khỏe cho thiết bị ${deviceId}`);
    }
    return JSON.parse(JSON.stringify(item.health));
  }

  async getDeviceMissingSequences(deviceId: string): Promise<DeviceMissingSequencesOut> {
    const missing = this.missingSequences[deviceId] || {
      device_id: deviceId,
      total_missing: 0,
      ranges: [],
    };
    return JSON.parse(JSON.stringify(missing));
  }

  async assignDevice(deviceId: string, payload: DeviceAssignmentPayload): Promise<AdminDeviceViewOut> {
    const dev = this.devices.find((d) => d.device_id === deviceId);
    if (!dev) {
      throw new ApiError(`Không tìm thấy thiết bị '${deviceId}'`, 404, 'DEVICE_NOT_FOUND');
    }

    const shipment = this.shipments.find((s) => s.id === payload.shipment_id);
    if (!shipment) {
      throw new ApiError(`Không tìm thấy lô hàng với ID UUID '${payload.shipment_id}'`, 404, 'SHIPMENT_NOT_FOUND');
    }

    if (payload.active) {
      if (dev.assigned_shipment_id && dev.assigned_shipment_id !== payload.shipment_id) {
        throw new ApiError(
          `Thiết bị '${deviceId}' đã được liên kết với chuyến hàng khác (${dev.assigned_shipment_name || dev.assigned_shipment_id}). Mỗi thiết bị chỉ được có một liên kết đang kích hoạt. Vui lòng bỏ liên kết cũ (active=false) trước khi gán mới.`,
          409,
          'DEVICE_ALREADY_ASSIGNED'
        );
      }
      dev.assigned_shipment_id = shipment.id;
      dev.assigned_shipment_name = shipment.name;
    } else {
      if (dev.assigned_shipment_id === payload.shipment_id) {
        dev.assigned_shipment_id = null;
        dev.assigned_shipment_name = null;
      }
    }

    return {
      device_id: dev.device_id,
      device_name: dev.device_name,
      status: 'active',
      has_public_key: !!dev.has_public_key,
      current_shipment_id: dev.assigned_shipment_id,
      current_shipment_name: dev.assigned_shipment_name,
      last_sequence_number: dev.health.last_sequence_number ?? 0,
      last_seen_at: dev.health.last_seen_at,
      keys: dev.key_id ? [{ key_id: dev.key_id, status: 'active' }] : [],
      assignments: dev.assigned_shipment_id
        ? [{ shipment_id: dev.assigned_shipment_id, active: true }]
        : [],
    };
  }

  async getAdminDeviceDetails(deviceId: string): Promise<AdminDeviceViewOut> {
    const dev = this.devices.find((d) => d.device_id === deviceId);
    if (!dev) {
      throw new ApiError(`Không tìm thấy thiết bị ${deviceId}`, 404, 'DEVICE_NOT_FOUND');
    }

    return {
      device_id: dev.device_id,
      device_name: dev.device_name,
      status: 'active',
      has_public_key: !!dev.has_public_key,
      current_shipment_id: dev.assigned_shipment_id,
      current_shipment_name: dev.assigned_shipment_name,
      last_sequence_number: dev.health.last_sequence_number ?? 0,
      last_seen_at: dev.health.last_seen_at,
      keys: dev.key_id ? [{ key_id: dev.key_id, status: 'active' }] : [],
      assignments: dev.assigned_shipment_id
        ? [{ shipment_id: dev.assigned_shipment_id, active: true }]
        : [],
    };
  }

  async getHealth(): Promise<HealthOut> {
    return { status: 'ok' };
  }

  async listShipments(): Promise<ShipmentsOut> {
    return {
      items: [...this.shipments],
      total: this.shipments.length,
    };
  }

  async createShipment(payload: ShipmentCreatePayload): Promise<ShipmentOut> {
    const trimmedName = payload.name.trim();
    const newId = crypto.randomUUID();
    const newShipment: ShipmentOut = {
      id: newId,
      shipment_id: newId,
      name: trimmedName,
      cargo_type: payload.cargo_type.trim(),
      status: 'created',
      origin: {
        name: payload.origin.name.trim(),
        formatted_address: payload.origin.formatted_address ?? payload.origin.name.trim(),
        place_id: payload.origin.place_id ?? null,
        latitude: payload.origin.latitude,
        longitude: payload.origin.longitude,
      },
      destination: {
        name: payload.destination.name.trim(),
        formatted_address: payload.destination.formatted_address ?? payload.destination.name.trim(),
        place_id: payload.destination.place_id ?? null,
        latitude: payload.destination.latitude,
        longitude: payload.destination.longitude,
      },
      temp_min_c: payload.temp_min_c,
      temp_max_c: payload.temp_max_c,
      violation_duration_minutes: payload.violation_duration_minutes ?? 15,
      buyer_wallet_address: payload.buyer_wallet_address ?? null,
      latest_telemetry: null,
      location: null,
      insurance: {
        insured_amount_vnd: payload.insured_amount_vnd ?? 0,
        coverage_amount: payload.insurance?.coverage_amount ?? null,
        currency: payload.insurance?.currency ?? 'VND',
        chain_id: payload.insurance?.currency === 'SepoliaETH' ? 11155111 : null,
        buyer_wallet_address: payload.buyer_wallet_address ?? null,
        policy_status: payload.insurance?.currency === 'SepoliaETH' ? 'PENDING' : null,
        status: 'active',
        payout_status: 'not_requested',
      },
      blockchain: null,
      created_at: new Date().toISOString(),
    };

    // Đưa lên đầu danh sách
    this.shipments.unshift(newShipment);
    return JSON.parse(JSON.stringify(newShipment));
  }

  async getShipment(id: string): Promise<ShipmentOut> {
    const item = this.shipments.find((s) => s.id === id);
    if (!item) {
      throw new Error(`Mock 404: Shipment ${id} not found`);
    }
    return JSON.parse(JSON.stringify(item));
  }

  async deleteShipment(id: string): Promise<ShipmentDeleteOut> {
    const index = this.shipments.findIndex((shipment) => shipment.id === id);
    if (index < 0) {
      throw new ApiError(`Không tìm thấy lô hàng '${id}'`, 404, 'SHIPMENT_NOT_FOUND');
    }

    const assignedDevice = this.devices.some((device) => device.assigned_shipment_id === id);
    if (assignedDevice) {
      throw new ApiError(
        'Hãy bỏ liên kết tất cả thiết bị trước khi xóa lô hàng.',
        409,
        'SHIPMENT_HAS_ASSIGNED_DEVICES'
      );
    }

    const hasHistory =
      (this.telemetry[id]?.length ?? 0) > 0 ||
      (this.events[id]?.length ?? 0) > 0 ||
      this.shipments[index].latest_telemetry !== null ||
      this.batches.some((batch) => batch.shipment_id === id);
    if (hasHistory) {
      throw new ApiError(
        'Lô hàng đã có dữ liệu vận hành nên không thể xóa.',
        409,
        'SHIPMENT_HAS_DATA'
      );
    }

    this.shipments.splice(index, 1);
    delete this.telemetry[id];
    delete this.events[id];
    return { shipment_id: id, deleted: true };
  }

  async listTelemetry(id: string): Promise<TelemetryListOut> {
    const samples = this.telemetry[id] || [];
    return {
      items: JSON.parse(JSON.stringify(samples)),
    };
  }

  async listEvents(id: string): Promise<EventListOut> {
    const events = this.events[id] || [];
    return {
      items: JSON.parse(JSON.stringify(events)),
    };
  }

  async listAllEvents(): Promise<EventListOut> {
    const all = Object.values(this.events).flat();
    all.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
    return {
      items: JSON.parse(JSON.stringify(all)),
    };
  }

}

export const mockAdapter = new MockAdapter();

