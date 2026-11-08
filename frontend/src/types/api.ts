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

export type SignatureStatus = 'VALID' | 'INVALID' | 'UNKNOWN_KEY';
export type DataStatus = 'DATA_VERIFIED' | 'DATA_INCOMPLETE' | 'INVALID';
export type CompletenessStatus = 'COMPLETE' | 'DATA_INCOMPLETE' | 'OFFLINE' | 'UNKNOWN';
export type DeviceOnlineStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'UNKNOWN';

export interface MissingSequenceRange {
  start_sequence: number;
  end_sequence: number;
  count: number;
  detected_at: string;
}

export interface DeviceHealthOut {
  device_id: string;
  last_sequence_number: number | null;
  missing_sequence_count: number;
  last_heartbeat_at: string | null;
  last_seen_at: string | null;
  online_status: DeviceOnlineStatus;
  firmware_version: string | null;
}

export type DeviceRegistrationStatus = 'active' | 'revoked';
export type DeviceTelemetryStatus = 'UNKNOWN' | 'ONLINE' | 'OFFLINE';

export interface ShipmentDeviceOut {
  device_id: string;
  registration_status: DeviceRegistrationStatus;
  telemetry_status: DeviceTelemetryStatus;
  last_seen_at: string | null;
  last_sequence_number: number;
}

export interface ShipmentDevicesOut {
  items: ShipmentDeviceOut[];
}

export interface DeviceItemOut {
  id: string;
  device_id: string;
  key_id: string;
  public_key_pem?: string;
  firmware_version: string;
  assigned_shipment_id: string | null;
  assigned_shipment_code: string | null;
  signature_status: SignatureStatus;
  completeness_status: CompletenessStatus;
  health: DeviceHealthOut;
  registered_at: string;
}

export interface DevicesOut {
  items: DeviceItemOut[];
  total: number;
}

export interface DeviceMissingSequencesOut {
  device_id: string;
  total_missing: number;
  ranges: MissingSequenceRange[];
}

export type AnchorStatus = 'NOT_READY' | 'BLOCKCHAIN_PENDING' | 'DATA_ANCHORED' | 'BLOCKCHAIN_FAILED';
export type VerificationStatus = 'NOT_CHECKED' | 'MATCHED' | 'DATA_INTEGRITY_FAILED';

export interface IntegrityBatch {
  batch_id: string;
  shipment_id: string;
  shipment_code?: string;
  device_id: string;
  batch_start_time: string;
  batch_end_time: string;
  record_count: number;
  first_sequence_number: number;
  last_sequence_number: number;
  hash_version: string;
  merkle_root: string;
  anchor_status: AnchorStatus;
  verification_status: VerificationStatus;
  anchor_tx_hash: string | null;
  anchored_at: string | null;
  last_verified_at: string | null;
  tamper_detected?: boolean;
  failure_reason?: string | null;
}

export interface IntegrityBatchesOut {
  items: IntegrityBatch[];
  total: number;
}

export interface IntegritySummaryOut {
  total_records: number;
  verified_records: number;
  invalid_records: number;
  missing_records: number;
  total_batches: number;
  anchored_batches: number;
  failed_integrity_batches: number;
}

export interface BatchVerifyResultOut {
  batch_id: string;
  verification_status: VerificationStatus;
  recalculated_root: string;
  expected_root: string;
  matched: boolean;
  verified_at: string;
  message: string;
  network?: string;
}

export interface LocationOut {
  latitude: number;
  longitude: number;
  location_source: LocationSource;
  progress_pct: number;
}

export interface LatestTelemetryOut {
  id: string;
  device_id: string;
  sequence_number?: number;
  temperature_c: number;
  humidity_pct: number;
  recorded_at: string | null;
  received_at: string;
  signature_status?: SignatureStatus;
  data_status?: DataStatus;
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
export type PayoutStatus =
  | 'not_requested'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'NOT_ELIGIBLE'
  | 'EVIDENCE_PENDING'
  | 'PENDING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'evidence_pending';

export interface InsuranceOut {
  insured_amount_vnd: number;
  status: InsuranceStatus;
  payout_status: PayoutStatus;
}

export type BlockchainConfirmationStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'NOT_SUBMITTED'
  | 'confirmed';

export interface BlockchainOut {
  network: string;
  transaction_hash?: string | null;
  anchor_transaction_hash?: string | null;
  insurance_transaction_hash?: string | null;
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
  device_integrity?: DeviceHealthOut | null;
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

