/**
 * TypeScript definitions strictly aligned with docs/contracts/api-v1.md
 * and backend/app/schemas/api.py.
 *
 * DO NOT alter field names or types without updating the API contract.
 */

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
}

export type LocationSource = 'backend_simulated';

export interface LocationOut {
  latitude: number;
  longitude: number;
  location_source: LocationSource;
  progress_pct: number;
}

export interface LatestTelemetryOut {
  id: string;
  device_id: string;
  temperature_c: number;
  humidity_pct: number;
  recorded_at: string | null;
  received_at: string;
}

export interface TelemetryOut extends LatestTelemetryOut {
  shipment_id: string;
  location: LocationOut;
}

export interface TelemetryListOut {
  items: TelemetryOut[];
}

export interface TelemetryCreatePayload {
  device_id: string;
  temperature_c: number;
  humidity_pct: number;
  recorded_at?: string | null;
}

export type InsuranceStatus = 'active' | 'triggered';
export type PayoutStatus = 'not_requested' | 'pending' | 'paid' | 'failed';

export interface InsuranceOut {
  insured_amount_vnd: number;
  status: InsuranceStatus;
  payout_status: PayoutStatus;
}

export type BlockchainConfirmationStatus = 'pending' | 'success' | 'failed';

export interface BlockchainOut {
  network: string;
  transaction_hash: string | null;
  confirmation_status: BlockchainConfirmationStatus;
}

export type ShipmentStatus = 'created' | 'in_transit' | 'sensor_data_gap' | 'insurance_triggered';

export interface ShipmentOut {
  id: string;
  code: string;
  cargo_type: string;
  status: ShipmentStatus;
  origin: Place;
  destination: Place;
  temp_min_c: number;
  temp_max_c: number;
  violation_duration_minutes: number;
  latest_telemetry: LatestTelemetryOut | null;
  location: LocationOut | null;
  insurance: InsuranceOut;
  blockchain: BlockchainOut | null;
  created_at: string;
}

export interface ShipmentsOut {
  items: ShipmentOut[];
  total: number;
}

export interface ShipmentCreatePayload {
  code: string;
  cargo_type: string;
  origin: Place;
  destination: Place;
  temp_min_c: number;
  temp_max_c: number;
  violation_duration_minutes?: number;
  insured_amount_vnd: number;
}

export type EventType = 'TEMPERATURE_BREACH_STARTED' | 'INSURANCE_TRIGGERED' | 'SENSOR_DATA_GAP';

export interface TemperatureBreachDetails {
  temperature_c: number;
  temp_min_c: number;
  temp_max_c: number;
}

export interface InsuranceTriggeredDetails {
  breach_started_at: string;
  duration_minutes: number;
}

export interface SensorDataGapDetails {
  last_received_at: string;
  gap_minutes: number;
}

export type EventDetails =
  | TemperatureBreachDetails
  | InsuranceTriggeredDetails
  | SensorDataGapDetails
  | Record<string, unknown>;

export interface EventOut {
  id: string;
  shipment_id: string;
  type: EventType;
  occurred_at: string;
  details: EventDetails;
}

export interface EventListOut {
  items: EventOut[];
}

export interface DemoScenarioPayload {
  scenario: 'normal' | 'temperature_breach';
}

export interface DemoScenarioOut {
  shipment_id: string;
  scenario: 'normal' | 'temperature_breach';
  generated_samples: number;
  shipment_status: ShipmentStatus;
}

export interface HealthOut {
  status: 'ok';
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

