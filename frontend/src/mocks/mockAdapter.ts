import {
  ShipmentOut,
  ShipmentsOut,
  TelemetryListOut,
  EventListOut,
  DemoScenarioOut,
  DemoScenarioPayload,
  HealthOut,
  DevicesOut,
  DeviceItemOut,
  DeviceHealthOut,
  DeviceMissingSequencesOut,
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
      batch.tamper_detected = true;

      const recalculatedRoot =
        '0x99aa887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbb';

      return {
        batch_id: batch.batch_id,
        verification_status: 'DATA_INTEGRITY_FAILED',
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
      batch.tamper_detected = false;

      return {
        batch_id: batch.batch_id,
        verification_status: 'MATCHED',
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

  async getHealth(): Promise<HealthOut> {
    return { status: 'ok' };
  }

  async listShipments(): Promise<ShipmentsOut> {
    return {
      items: [...this.shipments],
      total: this.shipments.length,
    };
  }

  async getShipment(id: string): Promise<ShipmentOut> {
    const item = this.shipments.find((s) => s.id === id);
    if (!item) {
      throw new Error(`Mock 404: Shipment ${id} not found`);
    }
    return JSON.parse(JSON.stringify(item));
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

