# Hợp đồng REST API v1 — Smart Cold Chain Insurance

Tài liệu này là bản chốt **phía Backend** cho Phase 0. Member 2 dùng mục "Bàn giao Blockchain" để viết adapter/contract; Member 3 dùng các response bên dưới cho Dashboard. Mọi thay đổi tên field hoặc trạng thái sau khi cả nhóm xác nhận cần được cập nhật ở đây trước khi sửa code.

## Quy ước chung

- Stack: FastAPI + Python; SQLite khi phát triển, model có thể chuyển sang PostgreSQL. Frontend chỉ gọi REST API của Backend. ESP32 chỉ gửi dữ liệu cảm biến.
- Base path: `/api/v1`. JSON dùng `snake_case`, UTF-8, `Content-Type: application/json`.
- `shipment_id` và mọi `id` trong response là **UUID v4 dạng chuỗi chữ thường chuẩn** (ví dụ `8b4fb8a2-2996-4da2-90b9-35019517f56f`). Backend tạo ID; client không truyền ID khi tạo lô hàng. Path `{id}` và `{shipment_id}` là cùng ID này. `code` là mã nghiệp vụ do người tạo nhập, duy nhất trong hệ thống, không dùng làm khóa Blockchain.
- Mọi timestamp trong REST API là ISO 8601 UTC, dạng `YYYY-MM-DDTHH:mm:ssZ` (có thể có phần giây thập phân). Input timestamp phải có múi giờ; Backend chuẩn hóa về UTC. `received_at`/`occurred_at` do Backend tạo. `recorded_at` là thời gian tùy chọn từ thiết bị, chỉ để đối chiếu, không dùng tính thời gian vi phạm.
- Tọa độ trong response là **mô phỏng ở Backend**, nội suy đường thẳng từ `origin` đến `destination` theo số mẫu telemetry đã nhận: mẫu đầu tiên ở 5%, mẫu thứ 20 ở 100%, các mẫu sau giữ vị trí đích. Đây không phải GPS hoặc đường giao thông thực. Mọi vị trí telemetry có `location_source: "backend_simulated"`. Khi chưa có telemetry, `status` là `created`, `latest_telemetry` và `location` là `null`.
- `insured_amount_vnd` là số tiền mô tả chính sách demo bằng VND, **không phải** số token được chuyển trên chain. Việc cấu hình token demo do Member 2 thống nhất riêng.
- Các endpoint chưa được triển khai trong Phase 0. Tài liệu này là hợp đồng để triển khai ở các Phase sau.

## Tạo lô hàng

`POST /api/v1/shipments` → `201 Created`, body là **ShipmentDetail** bên dưới.

```json
{
  "code": "SHIP-001",
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
| `code` | Chuỗi không rỗng sau khi bỏ khoảng trắng đầu/cuối, tối đa 64 ký tự; duy nhất. |
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
  "code": "SHIP-001",
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

`insurance.status`: `active` hoặc `triggered` (Backend xác định đủ điều kiện). `payout_status`: `not_requested`, `pending`, `paid`, `failed`. `paid` chỉ được đặt sau khi có xác nhận thành công từ chain; khi tắt Blockchain, sự kiện có thể `triggered` nhưng `payout_status` vẫn là `not_requested`.

`blockchain` là `null` trước khi gửi giao dịch. Khi có giao dịch, cấu trúc là:

```json
{
  "network": "localhost",
  "transaction_hash": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "confirmation_status": "pending"
}
```

`confirmation_status`: `pending`, `success`, `failed`. `transaction_hash` có thể `null` khi mới xếp hàng chờ RPC; `network` lấy từ cấu hình Backend. Không suy diễn trạng thái `paid` từ việc chỉ có hash.

`GET /api/v1/shipments` → `200 OK`:

```json
{
  "items": [
    {
      "id": "8b4fb8a2-2996-4da2-90b9-35019517f56f",
      "code": "SHIP-001",
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

## Telemetry

`POST /api/v1/shipments/{shipment_id}/telemetry` → `201 Created`, body là **TelemetryRecord**. Thiết bị gửi:

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

`type`: `TEMPERATURE_BREACH_STARTED`, `INSURANCE_TRIGGERED`, `SENSOR_DATA_GAP`. `details` là object JSON với các field theo loại:

| `type` | `details` |
|---|---|
| `TEMPERATURE_BREACH_STARTED` | `temperature_c`, `temp_min_c`, `temp_max_c` (số). |
| `INSURANCE_TRIGGERED` | `breach_started_at` (ISO 8601 UTC), `duration_minutes` (số phút đã quan sát), `consecutive_samples` (số mẫu liên tục ngoài ngưỡng). |
| `SENSOR_DATA_GAP` | `last_received_at` (ISO 8601 UTC), `gap_minutes` (số phút không có mẫu). |

`items` sắp xếp theo `occurred_at` tăng dần, rồi theo ID.

Mỗi mẫu được so với ngưỡng **bao gồm hai đầu mút** `[temp_min_c, temp_max_c]` của chính lô hàng. Mặc định cần ở ngoài ngưỡng liên tục **15 phút** (hoặc `violation_duration_minutes` của lô hàng), tính bằng `received_at` do Backend tạo; `recorded_at` của thiết bị không tham gia tính. Mẫu đầu tiên ngoài ngưỡng tạo `TEMPERATURE_BREACH_STARTED`. Mẫu về ngưỡng reset chuỗi đo; lần vi phạm sau tạo event bắt đầu mới. Khi đủ thời lượng, Backend tạo `INSURANCE_TRIGGERED` và đặt `insurance.status: "triggered"`, `status: "insurance_triggered"`. Một lô hàng chỉ kích hoạt bảo hiểm một lần; `payout_status` vẫn là `not_requested` cho tới Phase 5.

`SENSOR_GAP_MINUTES` mặc định **5 phút** (số nguyên dương). Hai mẫu cách nhau **hơn** ngưỡng này không chứng minh được vi phạm liên tục: mẫu mới tạo `SENSOR_DATA_GAP`, rồi bắt đầu chuỗi mới nếu vẫn ngoài ngưỡng. Khi đang chờ mẫu mới, `GET` shipment trả `status: "sensor_data_gap"` nếu mẫu gần nhất đã quá hạn; event gap được ghi khi mẫu kế tiếp đến. Không tự suy diễn nhiệt độ hoặc kích hoạt bảo hiểm trong khoảng mất dữ liệu.

## Health và demo

`GET /api/v1/health` → `200 OK`: `{"status":"ok"}`.

`POST /api/v1/demo/shipments/{id}/scenario` chỉ tồn tại trong môi trường development, nhận `{"scenario":"normal"}` hoặc `{"scenario":"temperature_breach"}`. Trả `200 OK`:

```json
{"shipment_id":"8b4fb8a2-2996-4da2-90b9-35019517f56f","scenario":"temperature_breach","generated_samples":4,"shipment_status":"insurance_triggered"}
```

Demo gọi cùng service đánh giá như telemetry thật. `normal` tạo một mẫu trong ngưỡng; `temperature_breach` tạo các mẫu ngoài ngưỡng cách nhau tối đa `SENSOR_GAP_MINUTES`, dùng đồng hồ ảo để đạt đủ thời lượng chính sách mà không chờ thực tế. Với mặc định 15/5 phút, kịch bản tạo bốn mẫu. Nên dùng lô hàng demo riêng: đồng hồ ảo có thể tạo `received_at` trong tương lai, nhưng không trước `created_at` của lô hàng. Một kịch bản vượt 100 mẫu bị từ chối `422`. Production trả `404` và không liệt kê endpoint này trong OpenAPI.

## Lỗi chung

| Mã | Khi nào |
|---|---|
| `400` | JSON sai cú pháp. |
| `404` | Lô hàng không tồn tại hoặc endpoint demo bị tắt. |
| `409` | `code` lô hàng đã tồn tại. |
| `422` | Dữ liệu hợp lệ về JSON nhưng vi phạm schema/ràng buộc. |
| `500` | Lỗi nội bộ; response không chứa stack trace. |

Response lỗi thống nhất: `{"error":{"code":"VALIDATION_ERROR","message":"Dữ liệu không hợp lệ","details":[]}}`. `details` là mảng các lỗi theo field, có thể rỗng. Các `error.code` tối thiểu: `INVALID_JSON`, `VALIDATION_ERROR`, `SHIPMENT_NOT_FOUND`, `DUPLICATE_SHIPMENT_CODE`, `INTERNAL_ERROR`. Với lỗi 422, mỗi phần tử `details` có `field` và `message` dạng chuỗi.

## Bàn giao Blockchain cho Member 2

Backend gửi cho adapter khi tạo `INSURANCE_TRIGGERED`:

| Field phía Backend | Quy ước gửi/biến đổi |
|---|---|
| `shipment_id` | UUID v4 chuỗi chữ thường chuẩn ở trên. `shipmentKey` Solidity `bytes32` = `keccak256(UTF8(shipment_id))`; hash **chuỗi UUID có dấu gạch nối**, không hash 16 byte UUID nhị phân, không dùng SHA-256. |
| `event_id` | UUID v4 chuỗi chữ thường chuẩn của event `INSURANCE_TRIGGERED`. `evidenceHash` `bytes32` = `keccak256(UTF8(event_id))`. Đây là mã tham chiếu bản ghi off-chain, không phải hash toàn bộ telemetry. |
| `detected_at` | `occurred_at` của `INSURANCE_TRIGGERED` do Backend tạo, chuyển sang Unix timestamp **giây UTC** cho `detectedAt`. |
| `policy_key` | Một policy cho mỗi `shipmentKey`; khóa này dùng chống gửi/chi trả trùng. |

Backend giữ telemetry và event đầy đủ off-chain. Địa chỉ oracle, chain ID, ABI, contract address, cách đăng ký policy, token demo và số token chi trả phải do Member 2 cung cấp trong `blockchain/INTEGRATION.md` trước Phase 5. `insured_amount_vnd` không được tự động coi là lượng token. Nếu RPC lỗi, Backend vẫn lưu telemetry/event và giữ trạng thái chờ để retry có kiểm soát.

**Điểm cần hai thành viên xác nhận để đóng Phase 0:** Member 2 xác nhận quy tắc `shipmentKey`, `evidenceHash`, timestamp và policy ở bảng trên, rồi ghi lại trong `blockchain/INTEGRATION.md`. Member 3 xác nhận các field response/trạng thái cần cho Dashboard. Sau đó các thay đổi API phải được báo cả nhóm trước khi sửa code.
