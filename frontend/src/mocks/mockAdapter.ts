import {
  ShipmentOut,
  ShipmentsOut,
  ShipmentCreatePayload,
  ShipmentDeleteOut,
  TelemetryCreatePayload,
  TelemetryOut,
  TelemetryListOut,
  EventOut,
  EventListOut,
  DemoScenarioOut,
  DemoScenarioPayload,
  HealthOut,
  DevicesOut,
  DeviceItemOut,
  DeviceHealthOut,
  DeviceMissingSequencesOut,
  ShipmentDevicesOut,
  DeviceTelemetryStatus,
  DeviceRegisterPayload,
  DeviceDeleteOut,
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
      (d) => d.assigned_shipment_id === shipmentId || d.assigned_shipment_code === shipmentId
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
    const ship = this.shipments.find((s) => s.id === shipmentId || s.code === shipmentId);
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

  async registerDevice(payload: DeviceRegisterPayload): Promise<AdminDeviceViewOut> {
    const trimmedId = payload.device_id.trim();
    const trimmedName = payload.device_name.trim();

    const existing = this.devices.find((d) => d.device_id.toLowerCase() === trimmedId.toLowerCase());
    if (existing) {
      throw new ApiError(`Thiết bị '${trimmedId}' đã tồn tại trong hệ thống.`, 409, 'DEVICE_EXISTS');
    }

    const newDevice: DeviceItemOut = {
      id: `dev-mock-${Date.now()}`,
      device_id: trimmedId,
      device_name: trimmedName,
      key_id: 'key-v1',
      has_public_key: true,
      firmware_version: 'v1.2.0',
      assigned_shipment_id: null,
      assigned_shipment_code: null,
      signature_status: 'UNKNOWN_KEY',
      completeness_status: 'UNKNOWN',
      registered_at: new Date().toISOString(),
      health: {
        device_id: trimmedId,
        last_sequence_number: null,
        missing_sequence_count: null,
        last_heartbeat_at: null,
        last_seen_at: null,
        online_status: 'UNKNOWN',
        firmware_version: 'v1.2.0',
      },
    };

    this.devices.unshift(newDevice);

    return {
      device_id: newDevice.device_id,
      device_name: newDevice.device_name,
      status: 'active',
      key_id: 'key-v1',
      provisioning_status: 'ready',
      has_public_key: true,
      current_shipment_id: null,
      current_shipment_code: null,
      last_sequence_number: 0,
      last_seen_at: null,
      keys: [{ key_id: 'key-v1', status: 'active' }],
      assignments: [],
    };
  }

  async deleteDevice(deviceId: string): Promise<DeviceDeleteOut> {
    const index = this.devices.findIndex((d) => d.device_id === deviceId);
    if (index < 0) {
      throw new ApiError(`Không tìm thấy thiết bị '${deviceId}'`, 404, 'DEVICE_NOT_FOUND');
    }

    const device = this.devices[index];
    if (device.assigned_shipment_id) {
      throw new ApiError(
        'Hãy bỏ liên kết chuyến hàng trước khi xóa thiết bị.',
        409,
        'DEVICE_ASSIGNED'
      );
    }
    if ((device.health.last_sequence_number ?? 0) > 0) {
      throw new ApiError(
        'Thiết bị đã có dữ liệu telemetry nên không thể xóa. Hãy thu hồi thiết bị thay thế.',
        409,
        'DEVICE_HAS_DATA'
      );
    }

    this.devices.splice(index, 1);
    return { device_id: deviceId, deleted: true };
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
          `Thiết bị '${deviceId}' đã được liên kết với chuyến hàng khác (${dev.assigned_shipment_code || dev.assigned_shipment_id}). Mỗi thiết bị chỉ được có một liên kết đang kích hoạt. Vui lòng bỏ liên kết cũ (active=false) trước khi gán mới.`,
          409,
          'DEVICE_ALREADY_ASSIGNED'
        );
      }
      dev.assigned_shipment_id = shipment.id;
      dev.assigned_shipment_code = shipment.code;
    } else {
      if (dev.assigned_shipment_id === payload.shipment_id) {
        dev.assigned_shipment_id = null;
        dev.assigned_shipment_code = null;
      }
    }

    return {
      device_id: dev.device_id,
      device_name: dev.device_name,
      status: 'active',
      has_public_key: !!dev.has_public_key,
      current_shipment_id: dev.assigned_shipment_id,
      current_shipment_code: dev.assigned_shipment_code,
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
      current_shipment_code: dev.assigned_shipment_code,
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
    const trimmedCode = payload.code.trim();
    const existing = this.shipments.find((s) => s.code.toLowerCase() === trimmedCode.toLowerCase());
    if (existing) {
      throw new Error(`Mã lô hàng '${trimmedCode}' đã tồn tại trong hệ thống.`);
    }

    const newId = `mock-ship-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newShipment: ShipmentOut = {
      id: newId,
      code: trimmedCode,
      cargo_type: payload.cargo_type.trim(),
      status: 'created',
      origin: {
        name: payload.origin.name.trim(),
        latitude: payload.origin.latitude,
        longitude: payload.origin.longitude,
      },
      destination: {
        name: payload.destination.name.trim(),
        latitude: payload.destination.latitude,
        longitude: payload.destination.longitude,
      },
      temp_min_c: payload.temp_min_c,
      temp_max_c: payload.temp_max_c,
      violation_duration_minutes: payload.violation_duration_minutes ?? 15,
      latest_telemetry: null,
      location: null,
      insurance: {
        insured_amount_vnd: payload.insured_amount_vnd,
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

  async postTelemetry(shipmentId: string, payload: TelemetryCreatePayload): Promise<TelemetryOut> {
    const item = this.shipments.find((s) => s.id === shipmentId || s.code === shipmentId);
    if (!item) {
      throw new Error(`Mock 404: Shipment ${shipmentId} not found`);
    }

    const now = new Date().toISOString();
    const currentSamples = this.telemetry[item.id] || [];
    const sampleCount = currentSamples.length + 1;
    const progress = Math.min(100, Math.max(5, sampleCount * 5));

    const lat = item.origin.latitude + ((item.destination.latitude - item.origin.latitude) * progress) / 100;
    const lng = item.origin.longitude + ((item.destination.longitude - item.origin.longitude) * progress) / 100;

    const sample: TelemetryOut = {
      id: `tel-mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      shipment_id: item.id,
      device_id: payload.device_id,
      sequence_number: sampleCount,
      temperature_c: payload.temperature_c,
      humidity_pct: payload.humidity_pct,
      recorded_at: payload.recorded_at || now,
      received_at: now,
      signature_status: 'VALID',
      data_status: 'DATA_VERIFIED',
      location: {
        latitude: parseFloat(lat.toFixed(6)),
        longitude: parseFloat(lng.toFixed(6)),
        location_source: 'backend_simulated',
        progress_pct: progress,
      },
    };

    if (!this.telemetry[item.id]) {
      this.telemetry[item.id] = [];
    }
    this.telemetry[item.id].push(sample);

    item.status = 'in_transit';
    item.latest_telemetry = {
      id: sample.id,
      device_id: sample.device_id,
      sequence_number: sample.sequence_number,
      temperature_c: sample.temperature_c,
      humidity_pct: sample.humidity_pct,
      recorded_at: sample.recorded_at,
      received_at: sample.received_at,
      signature_status: sample.signature_status,
      data_status: sample.data_status,
    };
    item.location = sample.location;

    // Kiểm tra xem có vượt ngưỡng nhiệt độ không
    if (payload.temperature_c < item.temp_min_c || payload.temperature_c > item.temp_max_c) {
      const breachEvent: EventOut = {
        id: `ev-breach-${Date.now()}`,
        shipment_id: item.id,
        type: 'TEMPERATURE_BREACH_STARTED',
        occurred_at: now,
        details: {
          temperature_c: payload.temperature_c,
          temp_min_c: item.temp_min_c,
          temp_max_c: item.temp_max_c,
        },
      };
      if (!this.events[item.id]) {
        this.events[item.id] = [];
      }
      this.events[item.id].push(breachEvent);
    }

    return JSON.parse(JSON.stringify(sample));
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

  async runDemoScenario(id: string, payload: DemoScenarioPayload): Promise<DemoScenarioOut> {
    const item = this.shipments.find((s) => s.id === id);
    if (!item) {
      throw new Error(`Mock 404: Shipment ${id} not found`);
    }

    const now = new Date().toISOString();

    if (payload.scenario === 'temperature_breach') {
      item.status = 'insurance_triggered';
      item.latest_telemetry = {
        id: `tel-demo-${Date.now()}`,
        device_id: item.latest_telemetry?.device_id || 'ESP32-DEMO',
        temperature_c: 12.8,
        humidity_pct: 85.0,
        recorded_at: now,
        received_at: now,
      };
      item.insurance = {
        insured_amount_vnd: item.insurance.insured_amount_vnd,
        status: 'triggered',
        payout_status: 'paid',
      };
      const anchorHash =
        '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      const insuranceHash =
        '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      item.blockchain = {
        network: 'localhost',
        transaction_hash: insuranceHash,
        anchor_transaction_hash: anchorHash,
        insurance_transaction_hash: insuranceHash,
        confirmation_status: 'success',
      };

      // Add breach event
      if (!this.events[id]) this.events[id] = [];
      this.events[id].push({
        id: `evt-demo-${Date.now()}`,
        shipment_id: id,
        type: 'INSURANCE_TRIGGERED',
        occurred_at: now,
        details: {
          breach_started_at: now,
          duration_minutes: item.violation_duration_minutes,
        },
      });

      return {
        shipment_id: id,
        scenario: 'temperature_breach',
        generated_samples: 2,
        shipment_status: 'insurance_triggered',
      };
    } else {
      // Normal scenario reset
      item.status = 'in_transit';
      item.latest_telemetry = {
        id: `tel-demo-${Date.now()}`,
        device_id: item.latest_telemetry?.device_id || 'ESP32-DEMO',
        temperature_c: (item.temp_min_c + item.temp_max_c) / 2,
        humidity_pct: 65.0,
        recorded_at: now,
        received_at: now,
      };
      item.insurance = {
        insured_amount_vnd: item.insurance.insured_amount_vnd,
        status: 'active',
        payout_status: 'not_requested',
      };
      item.blockchain = null;

      return {
        shipment_id: id,
        scenario: 'normal',
        generated_samples: 1,
        shipment_status: 'in_transit',
      };
    }
  }
}

export const mockAdapter = new MockAdapter();

