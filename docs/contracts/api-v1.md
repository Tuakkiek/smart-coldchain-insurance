# Hợp đồng REST API v1 — Smart Cold Chain Insurance

Tài liệu này mô tả API đã triển khai trong Backend, gồm Signed Telemetry v1, Merkle/anchoring và bộ 10 thiết bị cố định và tên lô hàng cập nhật 2026-11-18. Sự tồn tại của route không phải bằng chứng đã deploy lên Render/testnet. Thay đổi DTO đăng ký và quyền tạo shipment cần được Frontend/các caller cập nhật đồng thời.

## Quy ước chung

- Stack: FastAPI + Python; MySQL là database chính, SQLite chỉ dùng trong unit test độc lập. Frontend chỉ gọi REST API của Backend. ESP32 chỉ gửi dữ liệu cảm biến.
- Base path: `/api/v1`. JSON dùng `snake_case`, UTF-8, `Content-Type: application/json`.
- `shipment_id` và mọi `id` trong response là **UUID v4 dạng chuỗi chữ thường chuẩn** (ví dụ `8b4fb8a2-2996-4da2-90b9-35019517f56f`). Backend tạo ID; client không truyền ID khi tạo lô hàng. Path `{id}` và `{shipment_id}` là cùng ID này. `name` là tên hiển thị, tối đa 255 ký tự và có thể trùng. Response trả cả `shipment_id` và `id` cùng UUID; không dùng tên làm khóa Blockchain.
- Mọi timestamp trong REST API là ISO 8601 UTC, dạng `YYYY-MM-DDTHH:mm:ssZ` (có thể có phần giây thập phân). Input timestamp phải có múi giờ; Backend chuẩn hóa về UTC. `received_at`/`occurred_at` do Backend tạo. `recorded_at` là thời gian tùy chọn từ thiết bị, chỉ để đối chiếu, không dùng tính thời gian vi phạm.
- Tọa độ trong response là **mô phỏng ở Backend**, nội suy đường thẳng từ `origin` đến `destination` theo số mẫu telemetry đã nhận: mẫu đầu tiên ở 5%, mẫu thứ 20 ở 100%, các mẫu sau giữ vị trí đích. Đây không phải GPS hoặc đường giao thông thực. Mọi vị trí telemetry có `location_source: "backend_simulated"`. Khi chưa có telemetry, `status` là `created`, `latest_telemetry` và `location` là `null`.
- `insured_amount_vnd` là số tiền mô tả chính sách demo bằng VND, **không phải** số token được chuyển trên chain. Việc cấu hình token demo do Member 2 thống nhất riêng.
- POST telemetry hỗ trợ payload cũ chỉ trong `APP_ENV=development`; production bắt buộc signed v1. Mẫu cũ không được gọi là `DATA_VERIFIED` hoặc làm bằng chứng integrity. Các API integrity/anchoring ở cuối tài liệu đã có trong code.
- Admin/monitoring API dùng JWT Bearer: đăng nhập `POST /api/v1/auth/login` với JSON `{username, password}`, nhận `{access_token, token_type: "bearer"}` và cookie refresh `HttpOnly`. Access và refresh đều là JWT HS256 dạng `header.payload.signature`. `POST /api/v1/auth/refresh` không nhận body, đọc cookie, đánh dấu refresh cũ hết hạn và sinh đồng thời access/refresh JWT mới; `POST /api/v1/auth/logout` đánh dấu refresh hiện tại hết hạn rồi xóa cookie. Refresh token không bao giờ nằm trong JSON/header tùy chỉnh/log. Bảng `refresh_tokens` chỉ có `id` (claim `jti`), `admin_account_id`, `expires_at`; không lưu toàn bộ JWT. Frontend gửi ba auth endpoint với `credentials: 'include'`. Các lỗi refresh: `REFRESH_TOKEN_MISSING`, `REFRESH_TOKEN_INVALID`, `REFRESH_TOKEN_EXPIRED`, `SESSION_INVALID`; origin ngoài allowlist trả 403 `ORIGIN_NOT_ALLOWED`. Backend đọc username/password hash từ `admin_accounts` của MySQL/Aiven; env chỉ seed lần đầu. Sai credential/token trả 401; giới hạn login trả 429 cùng Retry-After; DB/schema lỗi trả 503 `AUTH_STORAGE_UNAVAILABLE`, chưa seed trả 503 `ADMIN_NOT_INITIALIZED`. Không Register/thêm Admin hoặc API key fallback. CORS không thay auth.

## Tạo lô hàng

`POST /api/v1/shipments` → `201 Created`, yêu cầu `Authorization: Bearer <access_token>`; body response là **ShipmentDetail** bên dưới. Người dùng nhập `name`; UUID `shipment_id` trả về dùng cho assignment, firmware, signed payload và Blockchain. Với SepoliaETH, Backend tạo policy khi đã cấu hình Insurer signer; nếu chưa có thì giữ PENDING và hỗ trợ xác nhận qua ví.

```json
{
  "name": "Vaccine Cần Thơ - đợt 1",
  "cargo_type": "vaccine",
  "origin": {"name": "Kho A", "latitude": 10.03, "longitude": 105.77},
  "destination": {"name": "Điểm nhận B", "latitude": 10.05, "longitude": 105.81},
  "temp_min_c": 2.0,
  "temp_max_c": 8.0,
  "violation_duration_minutes": 15,
  "insured_amount_vnd": 10000000
}
```

| Field | Quy tắc |
|---|---|
| `name` | Chuỗi không rỗng sau khi trim, tối đa 255 ký tự; cho phép trùng tên. |
| `cargo_type` | Chuỗi không rỗng, tối đa 100 ký tự. |
| `origin`, `destination` | Bắt buộc; `name` không rỗng; `latitude` hữu hạn trong `[-90, 90]`, `longitude` hữu hạn trong `[-180, 180]`. |
| `temp_min_c`, `temp_max_c` | Số hữu hạn, `temp_min_c < temp_max_c`. |
| `violation_duration_minutes` | Số nguyên dương; mặc định `15` nếu bỏ qua. |
| `insured_amount_vnd` | Số nguyên không âm. |

### ShipmentDetail

`GET /api/v1/shipments/{id}` → `200 OK` cùng cấu trúc này. Ví dụ khi vừa tạo, chưa có telemetry:

```json
{
  "id": "8b4fb8a2-2996-4da2-90b9-35019517f56f",
  "shipment_id": "8b4fb8a2-2996-4da2-90b9-35019517f56f",
  "name": "Vaccine Cần Thơ - đợt 1",
  "cargo_type": "vaccine",
  "status": "created",
  "origin": {"name": "Kho A", "latitude": 10.03, "longitude": 105.77},
  "destination": {"name": "Điểm nhận B", "latitude": 10.05, "longitude": 105.81},
  "temp_min_c": 2.0,
  "temp_max_c": 8.0,
  "violation_duration_minutes": 15,
  "latest_telemetry": null,
  "location": null,
  "insurance": {
    "insured_amount_vnd": 10000000,
    "status": "active",
    "payout_status": "not_requested"
  },
  "blockchain": null,
  "created_at": "2026-10-27T09:00:00Z"
}
```

`status`: `created` (chưa có mẫu), `in_transit` (đã có mẫu), `sensor_data_gap` (mẫu gần nhất quá ngưỡng mất tín hiệu), `insurance_triggered` (đã đủ điều kiện vi phạm). Khi hết tín hiệu, `sensor_data_gap` được tính lúc đọc API; `insurance.status` vẫn ghi nhớ `triggered` nếu đã kích hoạt. Một mẫu ngoài ngưỡng chưa đủ thời lượng vẫn giữ `in_transit` và được phản ánh qua event.

`insurance.status`: `active` hoặc `triggered` (Backend xác định đủ điều kiện). `payout_status`: `not_requested`, `evidence_pending`, `pending`, `paid`, `failed`. `evidence_pending` nghĩa là đã đủ điều kiện nhiệt độ nhưng chưa đủ signed/verified/anchored evidence để gọi Oracle. `paid` chỉ được đặt sau khi có xác nhận thành công từ chain.

`blockchain` là `null` trước khi gửi giao dịch. Khi có giao dịch, cấu trúc là:

```json
{
  "network": "localhost",
  "transaction_hash": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "confirmation_status": "pending"
}
```

`confirmation_status`: `pending`, `success`, `failed`. `transaction_hash` có thể `null` khi mới xếp hàng chờ RPC; khi có hash, giao dịch đã được ký và lưu trước lúc phát. `network` lấy từ cấu hình Backend. Chỉ đặt `confirmation_status: "success"` và `payout_status: "paid"` khi có receipt thành công **và** policy trên chain mang đúng `evidenceHash`/`detectedAt` của event. Hash đơn lẻ không chứng minh đã chi trả.

`GET /api/v1/shipments` → `200 OK`:

```json
{
  "items": [
    {
      "id": "8b4fb8a2-2996-4da2-90b9-35019517f56f",
  "shipment_id": "8b4fb8a2-2996-4da2-90b9-35019517f56f",
      "name": "Vaccine Cần Thơ - đợt 1",
      "cargo_type": "vaccine",
      "status": "created",
      "origin": {"name": "Kho A", "latitude": 10.03, "longitude": 105.77},
      "destination": {"name": "Điểm nhận B", "latitude": 10.05, "longitude": 105.81},
      "temp_min_c": 2.0,
      "temp_max_c": 8.0,
      "violation_duration_minutes": 15,
      "latest_telemetry": null,
      "location": null,
      "insurance": {
        "insured_amount_vnd": 10000000,
        "status": "active",
        "payout_status": "not_requested"
      },
      "blockchain": null,
      "created_at": "2026-10-27T09:00:00Z"
    }
  ],
  "total": 1
}
```

Mỗi phần tử `items` có cùng schema **ShipmentDetail**. Chưa có phân trang trong v1 MVP; `total` bằng số phần tử trả về.

`DELETE /api/v1/shipments/{id}` xóa lô hàng chưa sử dụng. Nếu còn device assignment active, API trả `409 SHIPMENT_HAS_ASSIGNED_DEVICES`; admin cần bỏ liên kết thiết bị bằng `active=false` trước. Nếu đã có telemetry, event, ingestion audit, integrity batch hoặc dữ liệu Blockchain, API trả `409 SHIPMENT_HAS_DATA` để bảo toàn lịch sử vận hành và bằng chứng bảo hiểm. Khi hợp lệ, Backend xóa các assignment inactive còn lại và trả `200 {"shipment_id":"<UUID>","deleted":true}`.

## Telemetry

`POST /api/v1/shipments/{shipment_id}/telemetry` → `201 Created` cho payload unsigned dưới đây chỉ là luồng mô phỏng khi `APP_ENV=development`; firmware thật không dùng payload này:

```json
{
  "device_id": "ESP32-01",
  "temperature_c": 9.2,
  "humidity_pct": 72.5,
  "recorded_at": "2026-10-27T09:01:00Z"
}
```

`recorded_at` có thể bỏ qua hoặc là `null`. `device_id` là chuỗi không rỗng, tối đa 100 ký tự. `temperature_c` phải hữu hạn; `humidity_pct` phải hữu hạn trong `[0, 100]`. Backend **từ chối các field không khai báo** trong payload này, gồm `latitude`, `longitude`, `location` và các trường GPS khác. Không chấp nhận `NaN`/`Infinity`.

Ví dụ **TelemetryRecord** sau khi Backend gắn thời gian và vị trí:

```json
{
  "id": "e39e4d2c-0ba1-4407-a647-afd026078963",
  "shipment_id": "8b4fb8a2-2996-4da2-90b9-35019517f56f",
  "device_id": "ESP32-01",
  "temperature_c": 9.2,
  "humidity_pct": 72.5,
  "recorded_at": "2026-10-27T09:01:00Z",
  "received_at": "2026-10-27T09:01:02Z",
  "location": {
    "latitude": 10.034,
    "longitude": 105.778,
    "location_source": "backend_simulated",
    "progress_pct": 20.0
  }
}
```

`recorded_at` là `null` nếu thiết bị không gửi. `location` được tính tại Backend, `progress_pct` trong `[0, 100]`. `latest_telemetry` trong ShipmentDetail gồm đúng các field `id`, `device_id`, `temperature_c`, `humidity_pct`, `recorded_at`, `received_at`; vị trí hiện tại nằm ở `location` cấp ShipmentDetail. Mẫu mới nhất xác định bằng `received_at`.

Ví dụ các field thay đổi trong ShipmentDetail sau mẫu trên:

```json
{
  "status": "in_transit",
  "latest_telemetry": {
    "id": "e39e4d2c-0ba1-4407-a647-afd026078963",
    "device_id": "ESP32-01",
    "temperature_c": 9.2,
    "humidity_pct": 72.5,
    "recorded_at": "2026-10-27T09:01:00Z",
    "received_at": "2026-10-27T09:01:02Z"
  },
  "location": {
    "latitude": 10.034,
    "longitude": 105.778,
    "location_source": "backend_simulated",
    "progress_pct": 20.0
  }
}
```

Đây là trích đoạn để chỉ ra field thay đổi, không phải toàn bộ response.

`GET /api/v1/shipments/{id}/telemetry` → `200 OK`:

```json
{"items": [{"id": "e39e4d2c-0ba1-4407-a647-afd026078963", "shipment_id": "8b4fb8a2-2996-4da2-90b9-35019517f56f", "device_id": "ESP32-01", "temperature_c": 9.2, "humidity_pct": 72.5, "recorded_at": "2026-10-27T09:01:00Z", "received_at": "2026-10-27T09:01:02Z", "location": {"latitude": 10.034, "longitude": 105.778, "location_source": "backend_simulated", "progress_pct": 20.0}}]}
```

`items` sắp xếp theo `received_at` tăng dần; nếu trùng thời gian, theo thứ tự ID. Chưa có phân trang trong v1 MVP.

## Sự kiện và luật vi phạm

`GET /api/v1/shipments/{id}/events` → `200 OK`:

```json
{
  "items": [
    {
      "id": "c3afece0-1668-4f96-aad6-58349f8f0a64",
      "shipment_id": "8b4fb8a2-2996-4da2-90b9-35019517f56f",
      "type": "TEMPERATURE_BREACH_STARTED",
      "occurred_at": "2026-10-27T09:01:02Z",
      "details": {"temperature_c": 9.2, "temp_min_c": 2.0, "temp_max_c": 8.0}
    }
  ]
}
```

`type`: `TEMPERATURE_BREACH_STARTED`, `TEMPERATURE_BREACH_ENDED`, `INSURANCE_TRIGGERED`, `SENSOR_DATA_GAP`, `DEVICE_OFFLINE`, `INTEGRITY_MISMATCH`. `details` là object JSON với các field theo loại:

| `type` | `details` |
|---|---|
| `TEMPERATURE_BREACH_STARTED` | `temperature_c`, `temp_min_c`, `temp_max_c` (số). |
| `TEMPERATURE_BREACH_ENDED` | `breach_ended_at`, `temperature_c`; mẫu đã trở lại trong ngưỡng. |
| `INSURANCE_TRIGGERED` | `breach_started_at`, `duration_minutes`, `consecutive_samples`, `device_id`, `violation_evidence_id`, `policy_version`, `first_received_at`, `last_received_at`, `telemetry_ids`, `batch_ids`, `batches`, `gap_status`, `evidence_status`, và `evidence_reason` khi chờ/từ chối. |
| `SENSOR_DATA_GAP` | `last_received_at` (ISO 8601 UTC), `gap_minutes` (số phút không có mẫu). |

Trong luồng **legacy development**, chỉ khi đặt rõ `PAYOUT_REQUIRES_ANCHORED_EVIDENCE=false`, event `INSURANCE_TRIGGERED.details` mới đi thẳng vào adapter cũ và có `blockchain_status`, `attempt_count`, `sent_at`, `last_error`. Mặc định gate bật nên telemetry chưa ký không được dispatch payout. Backend không trả raw signed transaction trong API; RPC tạm lỗi giữ trạng thái để retry cùng giao dịch.

`items` sắp xếp theo `occurred_at` tăng dần. Khi cùng thời điểm, thứ tự là `SENSOR_DATA_GAP` → `TEMPERATURE_BREACH_STARTED` → `INSURANCE_TRIGGERED`, rồi theo ID.

Mỗi mẫu được so với ngưỡng **bao gồm hai đầu mút** `[temp_min_c, temp_max_c]` của chính lô hàng. Mặc định cần ở ngoài ngưỡng liên tục **15 phút** (hoặc `violation_duration_minutes` của lô hàng), tính bằng `received_at` do Backend tạo; `recorded_at` của thiết bị không tham gia tính. Mẫu đầu tiên ngoài ngưỡng tạo `TEMPERATURE_BREACH_STARTED`. Mẫu về ngưỡng tạo `TEMPERATURE_BREACH_ENDED` và reset chuỗi đo. Khi đủ thời lượng, Backend tạo một `INSURANCE_TRIGGERED`; với evidence gate bật, payout chuyển `evidence_pending`, chưa gọi Oracle.

`MAX_SAMPLE_GAP_SECONDS` mặc định **300 giây** và sequence signed phải tăng liên tục trong evidence. Hai mẫu cách nhau hơn ngưỡng hoặc sequence gap không chứng minh được vi phạm liên tục: mẫu mới tạo `SENSOR_DATA_GAP`, rồi bắt đầu chuỗi mới nếu vẫn ngoài ngưỡng. `SENSOR_GAP_MINUTES` vẫn dùng cho trạng thái thiết bị/shipments offline trên API.

## Health và demo

`GET /api/v1/health` là **liveness** và luôn trả `200` khi process API còn phục vụ được. Endpoint kiểm tra `SELECT 1` trên database và RPC/chain ID khi Blockchain được bật, nhưng không trả URL, credential hay lỗi nội bộ:

```json
{"status":"ok","database":"ok","blockchain":"unavailable"}
```

`blockchain: "unavailable"` là trạng thái bình thường khi `BLOCKCHAIN_ENABLED=false`; khi Blockchain đã bật mà RPC lỗi, `status` chuyển thành `degraded`. `GET /api/v1/ready` trả cùng schema, nhưng trả `503` nếu database không sẵn sàng. RPC lỗi không làm readiness thất bại vì telemetry vẫn phải được ghi MySQL trước và giao dịch Blockchain được retry qua outbox.

## Lỗi chung

| Mã | Khi nào |
|---|---|
| `400` | JSON sai cú pháp. |
| `404` | Lô hàng không tồn tại. |
| `409` | Xung đột assignment hoặc sequence thiết bị. |
| `422` | Dữ liệu hợp lệ về JSON nhưng vi phạm schema/ràng buộc. |
| `500` | Lỗi nội bộ; response không chứa stack trace. |

Response lỗi thống nhất: `{"error":{"code":"VALIDATION_ERROR","message":"Dữ liệu không hợp lệ","details":[]}}`. `details` là mảng các lỗi theo field, có thể rỗng. Các `error.code` tối thiểu: `INVALID_JSON`, `VALIDATION_ERROR`, `SHIPMENT_NOT_FOUND`, `INTERNAL_ERROR`. Với lỗi 422, mỗi phần tử `details` có `field` và `message` dạng chuỗi.

## Bàn giao Blockchain cho Member 2

Backend gửi cho adapter khi tạo `INSURANCE_TRIGGERED`:

| Field phía Backend | Quy ước gửi/biến đổi |
|---|---|
| `shipment_id` | UUID v4 chuỗi chữ thường chuẩn ở trên. `shipmentKey` Solidity `bytes32` = `keccak256(UTF8(shipment_id))`; hash **chuỗi UUID có dấu gạch nối**, không hash 16 byte UUID nhị phân, không dùng SHA-256. |
| `event_id` | UUID v4 chuỗi chữ thường chuẩn của event `INSURANCE_TRIGGERED`. `evidenceHash` `bytes32` = `keccak256(UTF8(event_id))`. Đây là mã tham chiếu bản ghi off-chain, không phải hash toàn bộ telemetry. |
| `detected_at` | `occurred_at` của `INSURANCE_TRIGGERED` do Backend tạo, chuyển sang Unix timestamp **giây UTC** cho `detectedAt`. |
| `policy_key` | Một policy cho mỗi `shipmentKey`; khóa này dùng chống gửi/chi trả trùng. |

Backend giữ telemetry và event đầy đủ off-chain. Adapter đọc ABI từ Hardhat artifact, xác minh chain ID, contract và địa chỉ oracle trước khi ký `reportViolation`. Chỉ một event đủ điều kiện cho mỗi shipment; transaction đã ký và hash được lưu trước khi phát để retry cùng một giao dịch nếu RPC lỗi. Adapter đọc policy/receipt để tránh chi trả trùng. `insured_amount_vnd` không được tự động coi là lượng token; policy và số token do luồng của Member 2 tạo.

**Điểm cần hai thành viên xác nhận để đóng Phase 0:** Member 2 xác nhận quy tắc `shipmentKey`, `evidenceHash`, timestamp và policy ở bảng trên, rồi ghi lại trong `blockchain/INTEGRATION.md`. Member 3 xác nhận các field response/trạng thái cần cho Dashboard. Sau đó các thay đổi API phải được báo cả nhóm trước khi sửa code.

## Bộ thiết bị cố định và gán lô hàng

Chỉ có `ESP32-01` đến `ESP32-10`, mỗi thiết bị dùng `key-v1`. Backend ở chế độ local tạo cặp P-256 một lần vào file text JSON được Git bỏ qua (`backend/.local/esp32-private-keys.txt`), lưu **chỉ public key** trong MySQL. Khởi động lại dùng đúng khóa cũ; file mất/hỏng hoặc public key không khớp sẽ báo lỗi, không tự đổi khóa. Production dùng `DEVICE_PROVISIONING_MODE=manual`, đọc public key đã lưu trong database và không sinh private key.

`POST /devices`, `DELETE /devices/{device_id}` và `POST /devices/{device_id}/keys` đều trả `403 FIXED_DEVICE_REGISTRY` khi đã xác thực; thiếu JWT trả 401. Frontend không có nút đăng ký/xóa thiết bị. Bản ghi thiết bị cũ được giữ làm lịch sử nhưng không nằm trong catalog cố định.

`GET /devices` trả `{items, total}` với 10 thiết bị sau khi khởi tạo. `GET /devices/{device_id}` trả metadata dưới đây; không trả public/private PEM:

```json
{
  "device_id": "ESP32-01", "device_name": "ESP32-01", "status": "active",
  "has_public_key": true, "current_shipment_id": null,
  "last_sequence_number": 0, "last_seen_at": null,
  "keys": [{"key_id": "key-v1", "status": "active"}], "assignments": []
}
```

`POST /devices/{device_id}/assignments` yêu cầu JWT và body `{"shipment_id":"<UUID-v4>","active":true}`. Một thiết bị chỉ có một assignment active; nhiều thiết bị có thể cùng shipment. Gán lại cùng cặp idempotent. Đổi chuyến: bỏ gán bằng `active=false`, rồi gán UUID mới; nếu chưa bỏ gán, trả `409 DEVICE_ALREADY_ASSIGNED`. Không reset sequence hoặc thay dữ liệu chuyến cũ. ID ngoài bộ cố định trả `404 DEVICE_NOT_FOUND`.

Giữ `PATCH /devices/{device_id}` và `PATCH /devices/{device_id}/keys/key-v1`, body `{"status":"active"}` hoặc `{"status":"revoked"}`, để kích hoạt/thu hồi. Khởi động lại không tự kích hoạt khóa hoặc thiết bị đã thu hồi.

Migration `20261118_08` đổi cột `code` thành `name`, bỏ unique cho tên, giữ nguyên UUID và toàn bộ quan hệ. Xem [hướng dẫn local](../local-devices.md) để dùng simulator và ghi `config.h` từ khóa có sẵn, không truyền private key qua HTTP.

## Signed Telemetry v2 và Integrity

**Signed telemetry, API quản trị thiết bị, integrity batch và local-chain anchoring đã có trong OpenAPI.** Khi Blockchain chưa cấu hình, batch mới seal ở trạng thái `NOT_READY`; khi adapter được bật, durable outbox chuyển qua `BLOCKCHAIN_PENDING` và chỉ thành `DATA_ANCHORED` sau receipt đủ confirmations cùng on-chain readback khớp.

`POST /api/v1/devices/{device_id}/telemetry` nhận `payload_version=2`, `device_id`, `key_id`, `sequence_number`, `temperature_c`, `humidity_pct`, `temperature_milli_c`, `humidity_milli_pct`, `recorded_at`, `firmware_version`, `signature`. Payload **không nhận `shipment_id`**. Hai số hiển thị phải bằng chính xác integer đã scale ÷1000, tối đa ba chữ số thập phân. Chữ ký ECDSA P-256/SHA-256 trên projection cố định trong [data-integrity.md](../architecture/data-integrity.md), truyền DER/Base64.

Backend khóa device, xác minh public key/chữ ký, tra assignment active trong MySQL rồi dùng `assignment.shipment_id` để tạo telemetry và signed receipt. Backend gán `received_at`; không chấp nhận client gửi tọa độ, `received_at` hay `shipment_id`. Mẫu hợp lệ trả `201` cùng `shipment_id` đã resolve, `signature_status: "VALID"`, `sequence_number`, `completeness_status`, `missing_sequences`, `duplicate: false`; retry cùng canonical content trả `200`, `duplicate: true` và cùng telemetry ID.

Endpoint `POST /api/v1/shipments/{shipment_id}/telemetry` với `payload_version=1` được giữ để tương thích client cũ. Firmware/simulator mới không sử dụng endpoint này; gửi v2 vào endpoint cũ trả `422 DEVICE_ENDPOINT_REQUIRED`.

Trước khi nhận v2, Backend kiểm tra path/body cùng device, device active, key active, chữ ký hợp lệ, assignment active và sequence. Các lỗi chính: `403 DEVICE_NOT_ACTIVE`/`DEVICE_NOT_ASSIGNED`, `401 UNKNOWN_KEY`/`INVALID_SIGNATURE`, `422 DEVICE_MISMATCH`/`DEVICE_ENDPOINT_REQUIRED`, `409 SEQUENCE_CONFLICT`/`SEQUENCE_REPLAY`. Payload bị từ chối chỉ audit, không vào accepted telemetry/Merkle/evidence.
`GET /api/v1/shipments/{shipment_id}/devices` trả danh sách thiết bị đang được assignment, gồm `device_id`, `registration_status`, `last_sequence_number`, `last_seen_at` và `telemetry_status: UNKNOWN/ONLINE/OFFLINE`. Trạng thái này được tính từ mẫu signed hợp lệ cuối cùng và `SENSOR_GAP_MINUTES`; retry một mẫu cũ không cập nhật `last_seen_at`. Signed heartbeat riêng vẫn chưa triển khai. Mỗi response có header `X-Request-ID` để đối chiếu log. `data_status` tổng hợp vẫn là kế hoạch.

Idempotency hiện có: cùng `(device_id, sequence_number)` và cùng canonical signed content trả mẫu cũ với `duplicate=true`; cùng sequence nhưng content khác trả `409` và audit. Gap cắt chuỗi vi phạm 15 phút. `recorded_at` chỉ là metadata; thời lượng vi phạm dựa trên `received_at` của Backend. `BODY_TOO_LARGE` trả `413`, `RATE_LIMITED` trả `429` cho thiết bị đã đăng ký. Public history/detail hiển thị `signature_status`, `sequence_number`, `completeness_status` và `missing_sequences` ở mẫu đã ký; mẫu cũ không có các field này.

API integrity hiện có:

- `GET /api/v1/integrity/summary`: tổng số batch/record cùng trạng thái verification và anchoring toàn hệ thống (shipment_id là null).
- `GET /api/v1/batches`: danh sách toàn bộ Merkle batch đã seal trong hệ thống.
- `GET /api/v1/shipments/{shipment_id}/integrity`: tổng số batch/record cùng trạng thái verification và anchoring tổng hợp theo chuyến hàng.
- `GET /api/v1/shipments/{shipment_id}/batches`: danh sách batch đã seal theo chuyến hàng.
- `POST /api/v1/shipments/{shipment_id}/batches/seal`: đóng phần telemetry ký số chưa được batch; yêu cầu `Authorization: Bearer <access_token>`, body `{"device_id":"ESP32-01","force":true}`.
- `GET /api/v1/batches/{batch_id}`: metadata và Merkle root bất biến.
- `POST /api/v1/batches/{batch_id}/anchor`: yêu cầu `Authorization: Bearer <access_token>`; dispatch/retry đúng outbox và signed transaction đã lưu.
- `POST /api/v1/batches/{batch_id}/verify`: yêu cầu `Authorization: Bearer <access_token>`; tính lại leaf/root từ dữ liệu đang lưu; mismatch chuyển `verification_status` thành `DATA_INTEGRITY_FAILED` và tạo một event `INTEGRITY_MISMATCH`.
- `POST /api/v1/shipments/{shipment_id}/insurance/reconcile`: yêu cầu `Authorization: Bearer <access_token>`; tính lại evidence state và chỉ dispatch/retry payout khi toàn bộ gate đạt.

Backend tự seal khi một cặp shipment/device đạt `INTEGRITY_BATCH_MAX_RECORDS` (mặc định 100) hoặc khi có mẫu mới sau `INTEGRITY_BATCH_MAX_AGE_MINUTES` (mặc định 5 phút). Batch nhỏ có thể seal thủ công khi kết thúc chuyến/mất kết nối. Mỗi telemetry chỉ thuộc một batch; membership, leaf index, leaf hash và root được ghi trong cùng transaction. Cùng transaction đó tạo `integration_outbox` loại `ANCHOR_BATCH` với idempotency key `anchor:{batch_id}`.

Batch response gồm `batch_id`, cặp shipment/device, first/last sequence, record count, root `0x` + 64 hex, `hash_version: MERKLE-v1`, `verification_status` (`NOT_CHECKED`, `MATCHED`, `DATA_INTEGRITY_FAILED`) và `anchor_status` (`NOT_READY`, `BLOCKCHAIN_PENDING`, `DATA_ANCHORED`, `BLOCKCHAIN_FAILED`). `anchor_transaction` tách riêng, gồm network, transaction hash, outbox status (`PENDING/SUBMITTED/CONFIRMED/FAILED`), attempt count, lỗi cuối và thời điểm submitted/confirmed; không bao giờ trả raw signed transaction. Anchor transaction và insurance payout transaction là hai đối tượng riêng. `DATA_ANCHORED` chỉ được dùng khi receipt thành công, đủ `BLOCKCHAIN_CONFIRMATIONS` và toàn bộ metadata/root đọc lại từ `ColdChainDataIntegrity` khớp.

Nếu RPC timeout sau khi node có thể đã nhận giao dịch, Backend giữ nguyên transaction hash + raw signed transaction trong outbox và kiểm tra receipt/on-chain state trước khi broadcast lại. Cùng `batch_id` không tạo anchor thứ hai. Receipt revert hoặc readback sai chuyển `BLOCKCHAIN_FAILED`; RPC tạm lỗi giữ `BLOCKCHAIN_PENDING`. Lệnh vận hành tương đương API retry: `python -m app.cli retry-integrity --batch-id <UUID>`.

`PAYOUT_REQUIRES_ANCHORED_EVIDENCE=true` là mặc định. Backend chỉ gọi Insurance Oracle khi evidence gồm signed telemetry cùng thiết bị, đủ `violation_duration_minutes`, không có time/sequence gap nội bộ, mọi telemetry thuộc batch, mọi batch `verification_status=MATCHED`, `anchor_status=DATA_ANCHORED`, và readback Data Integrity Contract khớp. Trạng thái API dùng chữ thường `not_requested / evidence_pending / pending / paid / failed`; `evidence_status` chi tiết nằm trong event. Anchor pending/RPC lỗi giữ `evidence_pending`; tamper hoặc mismatch chuyển evidence thành `EVIDENCE_REJECTED` và không gửi payout. `ColdChainDataIntegrity` dùng `batchKey = keccak256(UTF8(batch_id))`, `shipmentKey = keccak256(UTF8(shipment_id))`, `deviceKey = keccak256(UTF8(device_id))` theo `blockchain/INTEGRATION.md`.
