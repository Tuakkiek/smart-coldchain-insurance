import { ShipmentOut, TelemetryOut, EventOut } from '../types/api';

/**
 * Fixture 1: Lô hàng bình thường (Normal)
 * Trạng thái: in_transit, nhiệt độ 4.5°C nằm trong khoảng an toàn 2.0 - 8.0°C.
 */
export const mockShipmentNormal: ShipmentOut = {
  id: '8b4fb8a2-2996-4da2-90b9-35019517f561',
  code: 'SHIP-VACCINE-01',
  cargo_type: 'Vaccine COVID-19 / mRNA',
  status: 'in_transit',
  origin: {
    name: 'Tổng kho Dược Hậu Giang - Cần Thơ',
    latitude: 10.0345,
    longitude: 105.7725,
  },
  destination: {
    name: 'Bệnh viện Đa khoa Trung ương Cần Thơ',
    latitude: 10.0521,
    longitude: 105.8114,
  },
  temp_min_c: 2.0,
  temp_max_c: 8.0,
  violation_duration_minutes: 15,
  latest_telemetry: {
    id: 'tel-norm-03',
    device_id: 'ESP32-COLD-01',
    temperature_c: 4.5,
    humidity_pct: 68.2,
    recorded_at: '2026-11-03T06:45:00Z',
    received_at: '2026-11-03T06:45:02Z',
  },
  location: {
    latitude: 10.0412,
    longitude: 105.7891,
    location_source: 'backend_simulated',
    progress_pct: 42.0,
  },
  insurance: {
    insured_amount_vnd: 250000000,
    status: 'active',
    payout_status: 'not_requested',
  },
  blockchain: null,
  created_at: '2026-11-03T06:00:00Z',
};

/**
 * Fixture 2: Lô hàng đang vi phạm ngưỡng nhiệt độ (Active Breach)
 * Trạng thái: in_transit, nhiệt độ 9.4°C > ngưỡng 8.0°C, đã có event TEMPERATURE_BREACH_STARTED.
 */
export const mockShipmentBreached: ShipmentOut = {
  id: '9c5ac9b3-3aa7-4eb3-81ca-46128628f672',
  code: 'SHIP-BIOLOGIC-02',
  cargo_type: 'Kháng thể đơn dòng (Monoclonal Antibodies)',
  status: 'in_transit',
  origin: {
    name: 'Kho Lạnh Cảng Cát Lái - TP.HCM',
    latitude: 10.7583,
    longitude: 106.7932,
  },
  destination: {
    name: 'Trung tâm Y tế Dự phòng Bình Dương',
    latitude: 10.9804,
    longitude: 106.6519,
  },
  temp_min_c: 2.0,
  temp_max_c: 8.0,
  violation_duration_minutes: 15,
  latest_telemetry: {
    id: 'tel-breach-04',
    device_id: 'ESP32-COLD-02',
    temperature_c: 9.4,
    humidity_pct: 75.0,
    recorded_at: '2026-11-03T06:50:00Z',
    received_at: '2026-11-03T06:50:03Z',
  },
  location: {
    latitude: 10.8251,
    longitude: 106.7512,
    location_source: 'backend_simulated',
    progress_pct: 35.5,
  },
  insurance: {
    insured_amount_vnd: 150000000,
    status: 'active',
    payout_status: 'not_requested',
  },
  blockchain: null,
  created_at: '2026-11-03T06:15:00Z',
};

/**
 * Fixture 3: Lô hàng đã kích hoạt bồi thường bảo hiểm & Blockchain (Insurance Triggered)
 * Trạng thái: insurance_triggered, vi phạm liên tục > 15 phút, đã gửi giao dịch Smart Contract.
 */
export const mockShipmentTriggered: ShipmentOut = {
  id: 'd17bf2e4-4bb8-5fc4-92db-57239739a783',
  code: 'SHIP-INSULIN-03',
  cargo_type: 'Insulin sinh học bảo quản lạnh sâu',
  status: 'insurance_triggered',
  origin: {
    name: 'Viện Vắc xin Nha Trang',
    latitude: 12.2388,
    longitude: 109.1967,
  },
  destination: {
    name: 'Kho Phân phối Dược Đà Nẵng',
    latitude: 16.0544,
    longitude: 108.2022,
  },
  temp_min_c: 2.0,
  temp_max_c: 8.0,
  violation_duration_minutes: 15,
  latest_telemetry: {
    id: 'tel-trig-06',
    device_id: 'ESP32-COLD-03',
    temperature_c: 12.1,
    humidity_pct: 82.4,
    recorded_at: '2026-11-03T06:55:00Z',
    received_at: '2026-11-03T06:55:02Z',
  },
  location: {
    latitude: 13.7820,
    longitude: 108.8540,
    location_source: 'backend_simulated',
    progress_pct: 60.0,
  },
  insurance: {
    insured_amount_vnd: 500000000,
    status: 'triggered',
    payout_status: 'paid',
  },
  blockchain: {
    network: 'Ethereum Localnet / Hardhat',
    transaction_hash: '0x7e8b91a24d03ef1897c5f8910b2a349d76c5b91a238df489bc109f4567ac89ef',
    confirmation_status: 'success',
  },
  created_at: '2026-11-03T05:30:00Z',
};

export const mockShipments: ShipmentOut[] = [
  mockShipmentNormal,
  mockShipmentBreached,
  mockShipmentTriggered,
];

export const mockTelemetryHistory: Record<string, TelemetryOut[]> = {
  [mockShipmentNormal.id]: [
    {
      id: 'tel-norm-01',
      shipment_id: mockShipmentNormal.id,
      device_id: 'ESP32-COLD-01',
      temperature_c: 4.1,
      humidity_pct: 67.0,
      recorded_at: '2026-11-03T06:15:00Z',
      received_at: '2026-11-03T06:15:02Z',
      location: {
        latitude: 10.035,
        longitude: 105.775,
        location_source: 'backend_simulated',
        progress_pct: 10.0,
      },
    },
    {
      id: 'tel-norm-02',
      shipment_id: mockShipmentNormal.id,
      device_id: 'ESP32-COLD-01',
      temperature_c: 4.3,
      humidity_pct: 67.8,
      recorded_at: '2026-11-03T06:30:00Z',
      received_at: '2026-11-03T06:30:01Z',
      location: {
        latitude: 10.038,
        longitude: 105.782,
        location_source: 'backend_simulated',
        progress_pct: 25.0,
      },
    },
    {
      id: 'tel-norm-03',
      shipment_id: mockShipmentNormal.id,
      device_id: 'ESP32-COLD-01',
      temperature_c: 4.5,
      humidity_pct: 68.2,
      recorded_at: '2026-11-03T06:45:00Z',
      received_at: '2026-11-03T06:45:02Z',
      location: {
        latitude: 10.0412,
        longitude: 105.7891,
        location_source: 'backend_simulated',
        progress_pct: 42.0,
      },
    },
  ],
  [mockShipmentBreached.id]: [
    {
      id: 'tel-breach-01',
      shipment_id: mockShipmentBreached.id,
      device_id: 'ESP32-COLD-02',
      temperature_c: 5.2,
      humidity_pct: 70.1,
      recorded_at: '2026-11-03T06:20:00Z',
      received_at: '2026-11-03T06:20:01Z',
      location: {
        latitude: 10.762,
        longitude: 106.789,
        location_source: 'backend_simulated',
        progress_pct: 12.0,
      },
    },
    {
      id: 'tel-breach-02',
      shipment_id: mockShipmentBreached.id,
      device_id: 'ESP32-COLD-02',
      temperature_c: 7.8,
      humidity_pct: 72.3,
      recorded_at: '2026-11-03T06:35:00Z',
      received_at: '2026-11-03T06:35:02Z',
      location: {
        latitude: 10.785,
        longitude: 106.772,
        location_source: 'backend_simulated',
        progress_pct: 22.0,
      },
    },
    {
      id: 'tel-breach-03',
      shipment_id: mockShipmentBreached.id,
      device_id: 'ESP32-COLD-02',
      temperature_c: 9.1,
      humidity_pct: 74.8,
      recorded_at: '2026-11-03T06:45:00Z',
      received_at: '2026-11-03T06:45:02Z',
      location: {
        latitude: 10.805,
        longitude: 106.761,
        location_source: 'backend_simulated',
        progress_pct: 28.0,
      },
    },
    {
      id: 'tel-breach-04',
      shipment_id: mockShipmentBreached.id,
      device_id: 'ESP32-COLD-02',
      temperature_c: 9.4,
      humidity_pct: 75.0,
      recorded_at: '2026-11-03T06:50:00Z',
      received_at: '2026-11-03T06:50:03Z',
      location: {
        latitude: 10.8251,
        longitude: 106.7512,
        location_source: 'backend_simulated',
        progress_pct: 35.5,
      },
    },
  ],
  [mockShipmentTriggered.id]: [
    {
      id: 'tel-trig-01',
      shipment_id: mockShipmentTriggered.id,
      device_id: 'ESP32-COLD-03',
      temperature_c: 4.8,
      humidity_pct: 65.0,
      recorded_at: '2026-11-03T05:40:00Z',
      received_at: '2026-11-03T05:40:02Z',
      location: {
        latitude: 12.35,
        longitude: 109.15,
        location_source: 'backend_simulated',
        progress_pct: 10.0,
      },
    },
    {
      id: 'tel-trig-02',
      shipment_id: mockShipmentTriggered.id,
      device_id: 'ESP32-COLD-03',
      temperature_c: 9.8,
      humidity_pct: 78.0,
      recorded_at: '2026-11-03T06:00:00Z',
      received_at: '2026-11-03T06:00:02Z',
      location: {
        latitude: 12.80,
        longitude: 109.05,
        location_source: 'backend_simulated',
        progress_pct: 25.0,
      },
    },
    {
      id: 'tel-trig-03',
      shipment_id: mockShipmentTriggered.id,
      device_id: 'ESP32-COLD-03',
      temperature_c: 10.5,
      humidity_pct: 80.0,
      recorded_at: '2026-11-03T06:16:00Z',
      received_at: '2026-11-03T06:16:02Z',
      location: {
        latitude: 13.20,
        longitude: 108.95,
        location_source: 'backend_simulated',
        progress_pct: 40.0,
      },
    },
    {
      id: 'tel-trig-06',
      shipment_id: mockShipmentTriggered.id,
      device_id: 'ESP32-COLD-03',
      temperature_c: 12.1,
      humidity_pct: 82.4,
      recorded_at: '2026-11-03T06:55:00Z',
      received_at: '2026-11-03T06:55:02Z',
      location: {
        latitude: 13.7820,
        longitude: 108.8540,
        location_source: 'backend_simulated',
        progress_pct: 60.0,
      },
    },
  ],
};

export const mockEvents: Record<string, EventOut[]> = {
  [mockShipmentNormal.id]: [],
  [mockShipmentBreached.id]: [
    {
      id: 'evt-br-01',
      shipment_id: mockShipmentBreached.id,
      type: 'TEMPERATURE_BREACH_STARTED',
      occurred_at: '2026-11-03T06:45:02Z',
      details: {
        temperature_c: 9.1,
        temp_min_c: 2.0,
        temp_max_c: 8.0,
      },
    },
  ],
  [mockShipmentTriggered.id]: [
    {
      id: 'evt-tr-01',
      shipment_id: mockShipmentTriggered.id,
      type: 'TEMPERATURE_BREACH_STARTED',
      occurred_at: '2026-11-03T06:00:02Z',
      details: {
        temperature_c: 9.8,
        temp_min_c: 2.0,
        temp_max_c: 8.0,
      },
    },
    {
      id: 'evt-tr-02',
      shipment_id: mockShipmentTriggered.id,
      type: 'INSURANCE_TRIGGERED',
      occurred_at: '2026-11-03T06:16:02Z',
      details: {
        breach_started_at: '2026-11-03T06:00:02Z',
        duration_minutes: 16,
      },
    },
  ],
};

