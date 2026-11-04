# ROADMAP THÀNH VIÊN 3 — Frontend, Dashboard và Kiểm thử giao diện

> **Dự án:** `smart-coldchain-insurance`  
> **Thành viên:** TTDK — Member 3: **Frontend & QA**  
> **Quyền sở hữu:** `frontend/`; phối hợp nghiệm thu hợp đồng API do NTK quản lý.  
> **Mục tiêu:** Xây dựng Dashboard responsive quan sát lô hàng lạnh, telemetry ESP32 đã được Backend xác minh, tình trạng thiết bị, tính toàn vẹn dữ liệu/Merkle batch, bằng chứng anchoring trên Blockchain và trạng thái chi trả bảo hiểm demo.  
> **Kiến trúc nâng cấp:** **IoT Data Integrity + Blockchain Data Anchoring + Smart Contract Insurance + Public FastAPI Backend on Render**.  
> **Trạng thái tài liệu:** Roadmap triển khai; **không** có nghĩa các tính năng, API, contract hoặc URL public đã được triển khai.

---

## 1. Phạm vi và ranh giới sở hữu

### 1.1. Bạn chịu trách nhiệm

- Xây dựng **Frontend React + Vite + TypeScript**, responsive desktop và mobile; điều hướng, layout, accessibility và UI states.
- Xây dựng **Dashboard tổng quan**, danh sách/chi tiết lô hàng, biểu đồ nhiệt độ/độ ẩm, timeline cảnh báo và bản đồ vị trí **mô phỏng từ Backend**.
- Bổ sung màn hình **Device Integrity**: nhận dạng thiết bị, trạng thái xác thực chữ ký, sequence, missing ranges, heartbeat, online/offline và firmware version nếu API có trả.
- Bổ sung màn hình **Data Integrity**: thống kê verified/invalid/missing records, danh sách batch, Merkle root, trạng thái anchor, kết quả đối chiếu và cảnh báo dữ liệu bị thay đổi.
- Bổ sung khu vực **Blockchain & Insurance** phân biệt transaction **Data Anchoring**, **Violation/Oracle** và **Demo Payout**.
- Gọi **REST API duy nhất qua Backend FastAPI**; thiết kế API client, typed DTO, error handling, polling/refetch hợp lý.
- Kết nối với **URL public thực tế của FastAPI trên Render**, tách cấu hình local/mock/production; kiểm tra CORS và tình huống cold start.
- Làm **Frontend QA**, mock/contract tests, smoke test, E2E test và kịch bản demo 12 tình huống tối thiểu theo prompt nâng cấp.
- Bàn giao wireframe/screenshots, `frontend/README.md`, hướng dẫn build/deploy, test report và checklist trình diễn cho cả nhóm.

### 1.2. Ranh giới không được vượt qua

- **Không** sửa `device/`, `backend/` hoặc `docs/contracts/api-v1.md` (NTK — Member 1 sở hữu); thay đổi contract phải đề xuất qua issue/PR và được NTK chốt.
- **Không** sửa `blockchain/`, ABI, access control hoặc logic Solidity (NTD — Member 2 sở hữu).
- **Không** giao tiếp trực tiếp ESP32, MySQL, Blockchain RPC hay contract từ trình duyệt để thực hiện nghiệp vụ. Frontend chỉ sử dụng REST API do NTK công bố.
- **Không** tự xác minh ECDSA, tự suy ra `DATA_VERIFIED` từ payload thô, tự tính Merkle root để thay kết luận của Backend, tự ghi trạng thái anchor/payout thành công.
- **Không** đặt private key, seed phrase, RPC admin secret, database credential hay API key bí mật vào mã Frontend, `.env` dùng Vite hoặc browser local storage.
- **Không** tự sinh GPS thật, lịch sử đo thật, transaction hash thật hay kết quả thanh toán thật khi API không có dữ liệu.
- **Không** bật các thao tác gây thay đổi dữ liệu bảo hiểm hoặc demo tampering trên public production; demo sử dụng Backend dev/demo và dữ liệu thử nghiệm riêng.

### 1.3. Thư mục được phép sở hữu (gợi ý, giữ repo hiện có nếu đang phù hợp)

```text
frontend/
├── public/
├── src/
│   ├── api/
│   │   ├── client.ts                   # Base URL, HTTP/error, timeout
│   │   ├── devices.ts                  # Devices, health, missing sequences
│   │   ├── shipments.ts                # Shipment CRUD/read
│   │   ├── telemetry.ts                # Telemetry history
│   │   ├── integrity.ts                # Summary, batches, verification
│   │   ├── insurance.ts                # Policy/payout read-only
│   │   ├── blockchain.ts               # Transaction status read-only
│   │   └── demo.ts                     # Chỉ dùng khi Backend cho phép
│   ├── components/
│   │   ├── layout/
│   │   ├── status/
│   │   ├── charts/
│   │   └── feedback/
│   ├── features/
│   │   ├── dashboard/
│   │   ├── shipments/
│   │   ├── telemetry/
│   │   ├── devices/
│   │   ├── integrity/
│   │   ├── blockchain/
│   │   ├── insurance/
│   │   └── demo/
│   ├── pages/
│   ├── types/                         # DTO theo OpenAPI / api-v1.md
│   ├── mocks/                         # Fixtures chỉ dùng khi bật mock
│   ├── hooks/                         # Polling/query hooks
│   ├── utils/
│   └── main.tsx
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example                      # Placeholder, không chứa secret
├── README.md
└── package.json
```

- Không bắt buộc tạo mọi file ngay Phase 0; chỉ tạo khi bắt đầu sử dụng.
- Tách `api/` (network/DTO) khỏi `features/` (UI/logic trình bày), tránh component gọi `fetch()` tùy ý.
- **Member 3 chỉ sở hữu `frontend/`;** các tài liệu kiến trúc/tích hợp dùng chung được NTK/NTD cập nhật theo quyền sở hữu đã thống nhất.

---

## 2. Kiến trúc, quy ước kỹ thuật và hợp đồng dữ liệu

### 2.1. Sơ đồ tích hợp Frontend trong kiến trúc mới

```text
ESP32 + Sensors
    │ Signed telemetry (ECDSA P-256), sequence_number, timestamp
    ▼
FastAPI Backend — NTK (local / Render public)
    ├─ Xác minh device signature, sequence, replay/gap/offline
    ├─ Ghi toàn bộ accepted telemetry + metadata vào external MySQL
    ├─ Seal canonical Merkle batch và lưu integrity/audit metadata
    ├─ Blockchain adapter ─► Data Integrity Contract — NTD
    └─ Violation detection (15 phút liên tục)
          └─ Authorized Oracle ─► Insurance Contract — NTD

Frontend — TTDK
    └─ HTTPS REST /api/v1 ─► FastAPI Backend
          ├─ Shipments + temperature/humidity + vị trí mô phỏng
          ├─ Devices + signature/sequence/availability
          ├─ Integrity batches + on-chain verification status
          └─ Insurance eligibility + payout receipt/status
```

**Nhiệm vụ của Frontend là thể hiện bằng chứng và trạng thái mà Backend đã xác minh**, không biến Web Browser thành Oracle hoặc dịch vụ kiểm tra chữ ký song song.

### 2.2. Công nghệ và nguyên tắc giữ từ Roadmap gốc

1. **Stack:** React + Vite + TypeScript, router theo nhu cầu, Leaflet cho bản đồ; có thể dùng thư viện biểu đồ phù hợp sau khi thống nhất dependency, không bắt buộc đổi stack hiện có.
2. **Backend API:** một API client tập trung, `VITE_API_BASE_URL` chứa prefix `/api/v1` nếu chốt theo NTK; **không nhân đôi `/api/v1`** khi gọi endpoint.
3. **Source of truth:** `docs/contracts/api-v1.md` + OpenAPI do NTK cung cấp; TypeScript DTO, enums, pagination và error response phải khớp phiên bản đã chốt. Không tự chốt schema mới chỉ vì mock cần nó.
4. **Vị trí:** chỉ dùng `latitude`, `longitude`, `location_source`, `progress_pct` do Backend cung cấp; `location_source === "backend_simulated"` phải gắn nhãn **“Vị trí mô phỏng từ Backend”**. Không tuyên bố GPS thực.
5. **Thời gian:** `received_at` do Backend tạo là mốc thời gian authoritative để tính 15 phút vi phạm; `recorded_at` từ thiết bị chỉ để tham khảo/đối chiếu, có thể lệch giờ hoặc gói đến trễ.
6. **Bảo hiểm:** threshold và `violation_duration_minutes` thuộc từng shipment; demo mặc định **15 phút liên tục có dữ liệu đủ điều kiện**, không phải cứ nhiệt độ vượt ngưỡng một mẫu là được chi trả.
7. **Blockchain:** không ghi từng telemetry lên chain; chỉ lưu commitment theo batch và nghiệp vụ bảo hiểm. `insured_amount_vnd` không tương đương số token demo chuyển trên local/testnet.
8. **Không giả thành công:** `transaction_hash` chỉ chứng tỏ có tham chiếu đến một giao dịch; status payout thành công phải dựa vào Backend đã đối chiếu receipt, event/state và confirmations theo quy tắc NTK/NTD.
9. **Mock:** chỉ dùng trong môi trường được bật rõ `VITE_USE_MOCKS=true` (tên biến là **đề xuất**, chốt theo code); hiển thị nhãn `MOCK DATA`, không âm thầm fallback khi API thực mất kết nối.
10. **Độ tin cậy:** khi RPC lỗi, anchor pending, Render spin down hoặc MySQL tạm mất kết nối thì UI phải phân biệt nguồn lỗi và không tự đổi kết luận về dữ liệu cảm biến.

### 2.3. Định nghĩa trạng thái — nhất quán với NTK và NTD

| Nhóm | Trường API đề xuất | Giá trị / cách thể hiện |
|---|---|---|
| Chữ ký thiết bị | `signature_status` | `VALID`, `INVALID`, `UNKNOWN_KEY` — chỉ Backend xác định |
| Dữ liệu telemetry | `data_status` | `DATA_VERIFIED`, `DATA_INCOMPLETE`, `INVALID` |
| Độ đầy đủ | `completeness_status` | `COMPLETE`, `DATA_INCOMPLETE`, `OFFLINE`, `UNKNOWN` |
| Đối chiếu batch | `verification_status` | `NOT_CHECKED`, `MATCHED`, `DATA_INTEGRITY_FAILED` |
| Anchoring | `anchor_status` | `NOT_READY`, `BLOCKCHAIN_PENDING`, `DATA_ANCHORED`, `BLOCKCHAIN_FAILED` |
| Eligibility bảo hiểm | Thuộc `insurance` | `EVIDENCE_PENDING` khi breach đủ điều kiện nhưng evidence chờ integrity/anchor |
| Thanh toán demo | `payout_status` | `NOT_ELIGIBLE`, `EVIDENCE_PENDING`, `PENDING`, `CONFIRMED`, `FAILED` |
| Khả dụng Backend | Kết quả request/health | `ONLINE`, `UNAVAILABLE`, `DEGRADED` **chỉ là state trình bày**, không tự đưa vào enum API nếu chưa chốt |

**Quy tắc hiển thị bắt buộc:**

- `DATA_VERIFIED` = Backend đã kiểm tra chữ ký và chấp nhận dữ liệu theo protocol; **không phải** `DATA_ANCHORED`.
- `DATA_ANCHORED` = batch root được ghi nhận on-chain **sau** receipt thành công, đối chiếu root và số confirmations yêu cầu; **không phải** bằng chứng cảm biến vật lý chắc chắn đúng.
- `MATCHED` = root của batch tính lại khớp root đã sealed/on-chain tại lần xác minh; **khác** với `DATA_ANCHORED` và không thay thế `signature_status`.
- `DATA_INTEGRITY_FAILED` = Merkle root tính lại không khớp; hiển thị cảnh báo nổi bật, thời điểm verify, batch liên quan, hạn chế dùng làm bằng chứng bảo hiểm.
- `DATA_INCOMPLETE` = có gap hoặc thiếu dữ liệu; **không** tự coi là temperature violation, không tự payout.
- `BLOCKCHAIN_PENDING`/`BLOCKCHAIN_FAILED` = riêng cho luồng anchor. Giao dịch insurance có trường/trạng thái payout riêng; không gộp 2 transaction vào một nút “đã xác nhận”.
- Một batch có thể `DATA_ANCHORED` **đồng thời** shipment có `DATA_INCOMPLETE` vì một đoạn sequence bị thiếu; UI phải hiển thị **hai trục độc lập**.
- Hiển thị `UNKNOWN` hoặc `N/A` khi Backend chưa có đủ bằng chứng; không ép giá trị null thành `VALID`, `COMPLETE`, `0 missing`, `CONFIRMED` hay `ONLINE`.

### 2.4. Ví dụ response để dựng UI (fixture minh họa từ kế hoạch NTK, chưa phải API đã chạy)

```json
{
  "id": "SHIP-001",
  "code": "SHIP-001",
  "cargo_type": "vaccine",
  "status": "in_transit",
  "temp_min_c": 2.0,
  "temp_max_c": 8.0,
  "violation_duration_minutes": 15,
  "latest_telemetry": {
    "device_id": "ESP32-001",
    "sequence_number": 1524,
    "temperature_c": 12.5,
    "humidity_pct": 80.0,
    "recorded_at": "2026-11-04T10:30:00Z",
    "received_at": "2026-11-04T10:30:03Z",
    "signature_status": "VALID",
    "data_status": "DATA_VERIFIED"
  },
  "device_integrity": {
    "last_sequence_number": 1524,
    "missing_sequence_count": 0,
    "last_heartbeat_at": null,
    "online_status": "ONLINE",
    "firmware_version": "1.0.0"
  },
  "location": {
    "latitude": 10.03,
    "longitude": 105.77,
    "location_source": "backend_simulated",
    "progress_pct": 25.0
  },
  "integrity": {
    "verified_records": 1,
    "invalid_records": 0,
    "missing_records": 0,
    "latest_batch_id": "<batch-id-or-null>",
    "anchor_status": "BLOCKCHAIN_PENDING",
    "verification_status": "NOT_CHECKED"
  },
  "insurance": {
    "insured_amount_vnd": 10000000,
    "status": "active",
    "payout_status": "NOT_ELIGIBLE"
  },
  "blockchain": {
    "network": "<configured-testnet>",
    "anchor_transaction_hash": null,
    "insurance_transaction_hash": null,
    "confirmation_status": "NOT_SUBMITTED"
  }
}
```

- Đây là **mock fixture**, không phải dữ liệu real-time, ABI hay kết quả deployment.
- `device_integrity`, `integrity`, `blockchain` có thể là object riêng hoặc endpoint riêng tùy bản `api-v1.md` cuối. **Không** giả định mọi object luôn có đủ trường.
- Data Integrity API có thể báo `invalid_records` từ audit, nhưng **bản ghi sai chữ ký không được hiển thị như accepted telemetry**.
- Thống nhất format date/time, pagination, số thập phân, nullable và HTTP error schema với NTK **trước khi code các type cố định**.

### 2.5. Các REST endpoint mà Frontend cần (đề xuất — chỉ NTK khóa API)

| Method | Endpoint | Tính năng / quyền |
|---|---|---|
| `GET` | `/api/v1/health` | Hiển thị kết nối API; trả dependency status an toàn |
| `GET` | `/api/v1/shipments` | Dashboard/danh sách, filter, pagination |
| `POST` | `/api/v1/shipments` | Tạo shipment nếu Backend cho phép, yêu cầu auth |
| `GET` | `/api/v1/shipments/{shipment_id}` | Chi tiết shipment, vị trí, tóm tắt latest telemetry |
| `GET` | `/api/v1/shipments/{shipment_id}/telemetry` | Chart lịch sử với `received_at` |
| `GET` | `/api/v1/shipments/{shipment_id}/events` | Timeline cảnh báo/violation |
| `GET` | `/api/v1/shipments/{shipment_id}/insurance` | Policy, evidence và payout status |
| `GET` | `/api/v1/shipments/{shipment_id}/integrity` | Thống kê verified/invalid/missing |
| `GET` | `/api/v1/shipments/{shipment_id}/integrity/batches` | Danh sách batch thuộc shipment |
| `GET` | `/api/v1/devices` | Danh sách device, status tổng quan |
| `GET` | `/api/v1/devices/{device_id}` | Identity, auth metadata công khai, firmware |
| `GET` | `/api/v1/devices/{device_id}/health` | Last sequence, heartbeat, offline status |
| `GET` | `/api/v1/devices/{device_id}/missing-sequences` | Gap ranges do Backend phát hiện |
| `GET` | `/api/v1/integrity/batches/{batch_id}` | Root, record count, tx, verification info |
| `POST` | `/api/v1/integrity/batches/{batch_id}/verify` | **Admin-only** nếu có thao tác xác minh theo yêu cầu; không tự gọi thường xuyên |
| `GET` | `/api/v1/integrity/audit` | **Admin-only**; read-only UI cho integrity audit |
| `GET` | `/api/v1/blockchain/transactions/{transaction_id}` | Tx status, receipt/confirmation đã được Backend đối chiếu |
| `POST` | `/api/v1/demo/shipments/{shipment_id}/scenario` | **Dev/local only**, tắt trong public production |

**Không đưa vào client browser:** `POST /api/v1/shipments/{shipment_id}/telemetry` dành cho ESP32 có private key; device registration/key rotation/heartbeat ingestion cũng chỉ dành đúng actor đã được xác thực/ủy quyền, không tự biến chúng thành nút trên Dashboard public.

**Quy ước xử lý API:** `401/403` báo không có quyền; `404` không thấy object; `409` conflict; `422` validation; `429` rate limit; `500/503` lỗi dịch vụ. Dùng error body `code`, `message`, `request_id` khi đã chốt. Phân biệt lỗi CORS, timeout/cold start và Backend trả lỗi; không tự gán `BLOCKCHAIN_FAILED` khi browser chỉ bị timeout HTTP.

---

## 3. Màn hình MVP và quy tắc UI/UX

### 3.1. Dashboard tổng quan — giữ chức năng gốc và bổ sung integrity

- Các thẻ KPI: tổng lô hàng, đang vận chuyển, đang vi phạm, đang chờ xử lý bảo hiểm, đã chi trả demo theo kết quả Backend.
- Các thẻ Integrity: thiết bị online/offline, **Verified Records**, **Invalid Records**, **Missing Records**, batch đang pending, batch đã anchored, batch phát hiện `DATA_INTEGRITY_FAILED`.
- Timeline cảnh báo gần nhất: nhiệt độ vượt ngưỡng, sensor gap, unknown key/signature invalid (chỉ theo audit được phân quyền), anchoring failed, payout pending/confirmed.
- Bộ lọc thời gian, shipment và trạng thái nếu API hỗ trợ; không dùng số KPI tính từ **một trang kết quả phân trang** như thể toàn hệ thống.
- Banner trạng thái kết nối Backend, thời điểm cập nhật dữ liệu gần nhất; không nhầm kết nối Backend với thiết bị đang online.

**Empty/error:** chưa có shipment, chưa có batch, chưa có heartbeat, API chậm/cold start, API không khả dụng đều phải có thông báo riêng, không hiển thị KPI 0 sai ngữ nghĩa.

### 3.2. Danh sách và chi tiết lô hàng — giữ từ Roadmap gốc

- Danh sách: mã lô hàng, loại hàng, trạng thái, nhiệt độ gần nhất, khoảng cho phép, tiến độ vận chuyển, integrity/insurance badge, tìm kiếm/lọc, pagination.
- Chi tiết: thông tin nơi đi/đến, nhiệt độ/độ ẩm, `recorded_at` và `received_at` tách rõ, thời điểm cuối, trạng thái dữ liệu và các sự kiện liên quan.
- Biểu đồ telemetry: đường nhiệt độ, độ ẩm, dải nhiệt độ cho phép; đánh dấu khoảng gián đoạn thay vì nối đường liên tục qua **gap** làm người xem hiểu nhầm có quan sát liên tục.
- Bản đồ Leaflet: route/marker từ API, `progress_pct`, vị trí mới nhất; nhãn **“Vị trí mô phỏng từ Backend”** khi `location_source = "backend_simulated"`. Không nội suy GPS ở Frontend khi thiếu tọa độ.
- Timeline nghiệp vụ: telemetry được nhận → cảnh báo → đủ điều kiện vi phạm **liên tục 15 phút** → bằng chứng đủ điều kiện/đang chờ → gửi Insurance tx → receipt/chi trả (nếu có).
- Hiển thị giá trị hợp đồng `insured_amount_vnd` riêng với số **demo token** nếu Backend có cung cấp; không đổi hoặc gắn tỷ giá không có trong contract.

### 3.3. Device Integrity — màn hình/bảng mới

**Hiển thị tối thiểu khi có API:**

- `device_id`, shipment hiện gán, firmware version, `key_id`/registration status **không kèm private key**.
- `signature_status`: `VALID`/`INVALID`/`UNKNOWN_KEY` và thời điểm/nguồn kết luận Backend; chú ý trạng thái invalid có thể chỉ hiển thị trong audit thay vì latest accepted telemetry.
- `last_sequence_number`, `missing_sequence_count`, danh sách gap ranges (nếu endpoint có), `last_seen_at`, `last_heartbeat_at` và online/offline.
- Phân biệt **device offline**, **telemetry gap** và **Backend unreachable/Render cold start**; không gán lỗi thiết bị khi máy chủ không phản hồi.
- Tooltip ngắn: "Chữ ký hợp lệ không chứng minh cảm biến vật lý chưa bị can thiệp".
- Không thêm nút "Đã xác minh" tự thay đổi field; chỉ hiển thị kết luận của NTK.

**Hành vi cảnh báo:** khi phát hiện gap, hiển thị dải sequence bị thiếu và mức độ ảnh hưởng đến điều kiện 15 phút; không tự coi đây là bồi thường. Khi API trả null/unknown, dùng "Chưa xác định".

### 3.4. Data Integrity — màn hình/bảng mới

- Tổng `total_records` (nếu Backend trả), `verified_records`, `invalid_records`, `missing_records`; ghi rõ **missing** là số sequence kỳ vọng thiếu, không nhất thiết là các dòng MySQL đã lưu.
- Bảng batch có `batch_id`, `shipment_id`, `device_id`, `batch_start_time`, `batch_end_time`, `record_count`, `first_sequence_number`, `last_sequence_number`, `hash_version`, `merkle_root`, `anchor_status`, `verification_status`.
- Chi tiết batch hiển thị **Merkle root dạng `0x` + 64 ký tự hex** (nếu đã có), copy hash, network, contract address đã cấu hình, `anchor_tx_hash`, `anchored_at` và `last_verified_at` theo API.
- Hiển thị `NOT_READY`, `BLOCKCHAIN_PENDING`, `DATA_ANCHORED`, `BLOCKCHAIN_FAILED` theo trục **anchoring**; `NOT_CHECKED`, `MATCHED`, `DATA_INTEGRITY_FAILED` theo trục **verification**.
- Với quyền phù hợp, nút "Kiểm tra lại tính toàn vẹn" **chỉ** gọi `POST /api/v1/integrity/batches/{batch_id}/verify`; có xác nhận, loading, thông báo kết quả, xử lý `401/403/409/429/503`. Nếu không có quyền thì ẩn/disable có giải thích; **không** tự hash lại dữ liệu trong browser và tuyên bố kết quả Backend.
- `DATA_INTEGRITY_FAILED`: cảnh báo có batch, thời điểm, lý do/nguồn đối chiếu được Backend cung cấp, link sang audit nếu được cấp quyền; không tự đưa ra kết luận cảm biến bị phá hoại.
- Nếu anchor chưa có transaction, hiển thị "Chưa gửi"/"Đang chờ" đúng state; không render explorer link từ `null` hoặc dummy hash.

**Giới hạn kỹ thuật cần ghi trong tooltip:** `MERKLE-v1` của NTK dùng canonical record SHA-256, leaf/node domain separation; Smart Contract chỉ lưu root `bytes32`, không xác nhận nhiệt độ thực tế. Frontend **không** thực hiện Merkle proof hoặc tuyên bố "đã verify từng leaf on-chain" nếu Backend/Contract chưa hỗ trợ.

### 3.5. Blockchain & Insurance — phân biệt ba luồng

| Luồng | Trigger và thông tin UI | Điều kiện hiển thị thành công |
|---|---|---|
| **Data Anchoring** | `BatchAnchored` / `anchor_transaction_hash`, Merkle root, `batch_id`, chain/network | `DATA_ANCHORED` từ Backend (receipt + on-chain root + confirmations) |
| **Violation/Oracle** | Event vi phạm, evidence/policy reference, Oracle submission nếu có | Backend xác nhận oracle transaction/event đúng; **không** đồng nghĩa tiền đã chuyển |
| **Insurance Payout** | Policy, beneficiary public reference, demo token amount, `insurance_transaction_hash`, `payout_status` | `CONFIRMED` chỉ sau receipt + `InsurancePaid`/contract state và kiểm chứng chống payout trùng |

- Hai hash transaction **bắt buộc tách biệt**: `anchor_transaction_hash` và `insurance_transaction_hash` (hoặc mapping chuẩn sau khi API chốt). Không hiển thị chung một "Blockchain tx" dễ gây nhầm.
- Mỗi giao dịch hiển thị: loại, status, network/chain ID, submitted/confirmed time nếu có, transaction hash và số confirmations theo API; explorer link chỉ khi network có **explorer URL được cấu hình và xác thực**, còn không chỉ cho copy.
- `PENDING` ≠ `CONFIRMED`; tx hash hoặc explorer page tồn tại **không** đủ kết luận payout.
- Ghi nhãn rõ **Local/Testnet Token — không phải tiền thật**. Không gọi Smart Contract trực tiếp hoặc để frontend ký transaction.
- Khi `DATA_INCOMPLETE`/`DATA_INTEGRITY_FAILED`/`EVIDENCE_PENDING`, UI phải cho thấy lý do không tự payout và chính sách cần có evidence hợp lệ; không suy diễn thiếu dữ liệu là nhiệt độ sai ngưỡng.

### 3.6. Demo Control Panel — giữ và mở rộng có kiểm soát

- Giữ hai kịch bản cũ: `normal`, `temperature_breach`.
- Bổ sung **kịch bản kiểm thử hiển thị**: chữ ký sai, duplicate, sequence gap, offline, seal/anchor batch, integrity verify, tamper trên **DB demo**, blockchain hash mismatch, payout, tx pending/failed.
- **Không tự phát minh `scenario` string mới.** NTK phải công bố trong `api-v1.md` endpoint, danh sách scenario cho phép, quyền gọi và môi trường. Khi chưa có API demo thì chỉ chạy **mock fixtures có nhãn**, không giả gọi API thành công.
- Chỉ bật điều khiển demo nếu Backend xác nhận `APP_ENV=development`/môi trường demo riêng và actor có quyền. `APP_ENV=production` public phải tắt endpoint demo; frontend production phải ẩn điều khiển kể cả người dùng đoán được URL.
- Khi kịch bản đang chạy: disable button chống bấm trùng, có progress và trạng thái thất bại/trùng lặp; reset/seed lại DB demo bằng **Backend** theo tài liệu, không cho browser tác động thẳng database.
- Trình diễn 15 phút liên tục bằng **virtual clock trong backend dev/test**, không thay đổi luật tính bằng `received_at` của production.
- Cảnh báo rằng demo sửa đổi record/bằng chứng chỉ được thực hiện trên **môi trường và dữ liệu cô lập**; không chạy tampering trên production.

### 3.7. Quy chuẩn UI/UX, responsive và accessibility

- Bố cục desktop: sidebar/navigation + bảng, biểu đồ, bản đồ và panel integrity; mobile: điều hướng gọn, KPI dạng card, bảng chuyển sang danh sách/scroll ngang có chủ đích.
- Hiển thị trạng thái bằng **icon + chữ + màu**; không phụ thuộc màu sắc duy nhất. Badge màu chỉ dành cho trạng thái mang ý nghĩa, tránh mọi trường đều có badge rực rỡ.
- Trạng thái cần thiết cho mọi screen: `loading`, `success`, `empty`, `offline`, `error`, `permission_denied`, `unknown`, `mock`.
- Dùng UTC ISO 8601 trong API và chuyển sang giờ địa phương khi hiển thị **kèm nhãn múi giờ**; không lấy client clock thay cho `received_at` để suy ra breach duration.
- Tooltip giải thích khác nhau giữa signature verified, record hash, anchored, verification result và insurance paid; nội dung rõ ràng với người xem không chuyên blockchain.
- Chống tràn hash/ID dài, hỗ trợ copy, keyboard navigation, focus-visible, aria-label cho nút icon, contrast cơ bản; kiểm thử bảng/data chart với dữ liệu nhiều và data null.

---

## 4. Roadmap theo Phase — điều chỉnh theo dependency kỹ thuật

> **Ước lượng là ngày công tham khảo, không phải cam kết lịch bàn giao.** Phần lớn UI có thể làm bằng mock contract từ Phase 0/1; **không chờ Blockchain hoàn thành** rồi mới phát triển. Tuy nhiên chỉ nghiệm thu tích hợp thật khi NTK/NTD đã bàn giao tương ứng.

| Phase | Phần việc | Ước lượng | Điều kiện bắt đầu | Bàn giao |
|---|---|---:|---|---|
| **0** | Frontend Architecture & API Contract | 1–2 ngày | Roadmap/Repo/NTK draft API | Layout, routes, API mapping, wireframe |
| **1** | TypeScript API Contract & Mock Fixtures | 2–3 ngày | API v1 draft từ NTK | Typed client, mock adapter, status fixtures |
| **2** | Dashboard, Shipments, Telemetry & Map | 3–5 ngày | Phase 1 | Dashboard, shipment list/detail, charts/Leaflet |
| **3** | Device Integrity UI | 2–3 ngày | Device schema/fixtures từ NTK | Device status/sequence/offline UI |
| **4** | Data Integrity & Merkle Batch UI | 2–4 ngày | Batch/verification schema từ NTK | Batch list/detail, verification/alerts |
| **5** | Blockchain, Insurance & Demo UI | 2–4 ngày | Event/status schema NTK; NTD ABI handoff qua NTK | Separate transaction/payout views, demo panel |
| **6** | Render Public API Integration & Hardening | 2–3 ngày | NTK Phase 7 public URL thực, external MySQL/CORS | Frontend production config, live smoke test |
| **7** | E2E Testing, Security & Demo | 2–4 ngày | Các luồng API/chain đã sẵn sàng | Test report, screenshots, demo checklist |

### Phase 0 — Frontend Architecture & API Contract

**Việc cần làm**

- [ ] Kiểm tra cây `frontend/` hiện có, package/lockfile, thư viện đang dùng trước khi tạo thêm file; không tự tuyên bố repo đã có module nào.
- [ ] Tạo/tiếp tục nhánh `feat/frontend-dashboard`; thống nhất cách PR và ownership với NTK/NTD.
- [ ] Nhận `docs/contracts/api-v1.md` draft và OpenAPI từ NTK; ghi bảng endpoint → màn hình → field → error → quyền truy cập.
- [ ] Đọc mô tả `SIGNED-TELEMETRY-v1`, `MERKLE-v1`, status schema của NTK và ABI/event semantics của NTD **qua Backend contract**, không tự tạo một chuỗi trạng thái mới.
- [ ] Chốt các màn hình: Dashboard, Shipments, Shipment Detail, Devices, Integrity Batches/Details, Blockchain/Insurance, Demo Panel (dev-only).
- [ ] Khởi tạo/kiểm tra React + Vite + TypeScript, route layout, design tokens/responsive structure, loading/error/empty skeleton.
- [ ] Chốt cách phân biệt `signature_status`, `data_status`, `completeness_status`, `verification_status`, `anchor_status`, `payout_status` trong UI.
- [ ] Viết wireframe nhanh và xác nhận trải nghiệm chính với nhóm; giữ sẵn vị trí cho trạng thái backend/Render.
- [ ] Viết `.env.example` placeholder và `frontend/README.md` bước chạy local cơ bản.

**Definition of Done**

- [ ] Frontend chạy được từ README trên máy sạch; routing và layout responsive hoạt động.
- [ ] Có mapping endpoint/schema v1 và mock contract; không còn field nào được **âm thầm tự đặt** thay cho API.
- [ ] NTK xác nhận field/status hoặc ghi issue TBC; NTD biết frontend chỉ đọc state qua Backend.
- [ ] Mock và production được cấu hình tách, không dùng URL Render giả như URL thật.

### Phase 1 — TypeScript API Contract, Client & Mock Fixtures

**Việc cần làm**

- [ ] Tạo `types/` cho `Shipment`, `Telemetry`, `Location`, `ShipmentEvent`, `DeviceIntegrity`, `IntegrityBatch`, `IntegritySummary`, `InsuranceStatus`, `BlockchainTransaction`, `ApiError` theo OpenAPI/`api-v1.md`.
- [ ] Nếu dùng công cụ sinh types từ OpenAPI, ghi command và version; không sửa types sinh tự động mà không cập nhật source contract.
- [ ] API client đọc `VITE_API_BASE_URL`, áp dụng đúng prefix, timeout/abort, error normalization, pagination/filter, retry an toàn cho GET; **không** retry POST tác động nghiệp vụ khi chưa có idempotency contract.
- [ ] Tách API modules `devices`, `shipments`, `telemetry`, `integrity`, `insurance`, `blockchain`, `demo` theo endpoint đã chốt.
- [ ] Tạo fixtures cho: normal, temperature breach chưa đủ 15 phút, continuous 15 phút đủ evidence, invalid signature, duplicate, sequence gap, device offline, anchored/matched, tampered batch, pending/failed anchor, pending/confirmed payout.
- [ ] `VITE_USE_MOCKS=true` chỉ là gợi ý cấu hình; mock adapter phải được bật tường minh, UI hiển thị `MOCK DATA` và **không fallback ngầm** khi API thật lỗi.
- [ ] Viết unit test mapping status, date formatting, missing/null field và xử lý error code.

**Definition of Done**

- [ ] Tất cả sample JSON đã công bố deserialize được sang types phù hợp và không bỏ qua lỗi schema quan trọng.
- [ ] Mock UI chạy được khi Backend/Blockchain chưa sẵn sàng; có nhãn rõ nguồn dữ liệu.
- [ ] Có error component/tách `401/403/404/409/422/429/503`, timeout và network error.
- [ ] TypeScript build/typecheck pass; danh sách enum/schema chờ NTK chốt được ghi issue công khai.

### Phase 2 — Dashboard, Shipments, Telemetry & Backend-simulated Map

**Việc cần làm**

- [ ] Xây layout tổng quan, navigation, connection banner, KPI, filter và danh sách shipment có loading/empty/error/retry.
- [ ] Trang shipment detail: hiển thị threshold, loại hàng, nguồn/đích, lịch sử và latest temperature/humidity với `received_at`/`recorded_at` tách biệt.
- [ ] Chart nhiệt độ/độ ẩm theo API; đánh dấu đường ngưỡng min/max, khoảng thiếu dữ liệu, thời điểm cảnh báo; không nối liền gap như dữ liệu liên tục.
- [ ] Leaflet hiển thị vị trí/trạng thái **từ Backend**; `location_source = backend_simulated` bắt buộc gắn nhãn. Không nhận GPS từ ESP32 hoặc client tự nội suy vị trí nguồn chân lý.
- [ ] Timeline từ `ShipmentEvent` phân biệt cảnh báo, đủ điều kiện, giao dịch pending và payout confirmed; 15 phút liên tục do Backend kết luận.
- [ ] Hiển thị số tiền bảo hiểm VND riêng với demo-token payout; không gắn tỷ giá tự tạo.
- [ ] Tách component và hooks; kiểm thử responsive desktop/mobile, long text, missing data, nhiều events.

**Definition of Done**

- [ ] Dashboard, list, detail, charts, map chạy với fixtures đã ký kết với NTK.
- [ ] Không có nhãn "GPS thực" khi vị trí mô phỏng; không có payout success giả.
- [ ] Ở shipment chưa có telemetry/position, UI hiển thị trạng thái chưa có dữ liệu hợp lý.
- [ ] Không phải sửa component lớn khi chuyển mock sang API client thật.

### Phase 3 — Device Integrity UI & Missing Sequence Monitoring

**Việc cần làm**

- [ ] Kết nối fixtures/API cho `GET /devices`, `GET /devices/{id}`, `GET /devices/{id}/health`, `GET /devices/{id}/missing-sequences` nếu đã chốt.
- [ ] Thể hiện `device_id`, key registration/public metadata, `signature_status`, firmware version, last sequence, gap count, last seen/heartbeat và online/offline.
- [ ] Dùng riêng nhãn status thiết bị và status Backend; khi Render cold start, **không** đánh dấu tất cả thiết bị offline do request lỗi.
- [ ] Lập bảng/list các dải missing sequence và giải thích ảnh hưởng đến bằng chứng tính thời lượng breach; dữ liệu đến muộn có thể phục vụ audit nhưng không được UI tự sửa lại kết luận policy.
- [ ] Khi signature invalid/unknown key chỉ có trong audit được bảo vệ, phân quyền đúng; nếu không có quyền thì hiển thị trạng thái không khả dụng, **không** giả có accepted telemetry.
- [ ] Test thiết bị mất mạng, thiếu heartbeat, không có firmware version, nhiều thiết bị cùng shipment, sequence gap/trễ, 401/403.

**Definition of Done**

- [ ] Device Integrity UI phân biệt chữ ký, tính đầy đủ dữ liệu và khả dụng kết nối.
- [ ] Không giả mạo `DATA_VERIFIED`, không tự giải mã private key/verify chữ ký ở Frontend.
- [ ] Missing sequence hiển thị dựa trên Backend, không tự đoán từ các trang history không đầy đủ.
- [ ] Responsive và error states được test ở các trường hợp kể trên.

### Phase 4 — Data Integrity & Merkle Batch UI

**Việc cần làm**

- [ ] Xây shipment integrity summary từ `GET /shipments/{id}/integrity`: total, verified, invalid, missing, batch status và integrity alerts.
- [ ] Bảng batches có filter/pagination nếu Backend hỗ trợ; chi tiết batch hiển thị `batch_id`, device/shipment, time range, count, first/last sequence, `merkle_root`, `hash_version`.
- [ ] Xây **hai nhóm hiển thị độc lập**: `anchor_status` (`BLOCKCHAIN_PENDING`/`DATA_ANCHORED`/...) và `verification_status` (`NOT_CHECKED`/`MATCHED`/`DATA_INTEGRITY_FAILED`).
- [ ] Nếu phù hợp quyền, tạo nút verify gọi Backend endpoint; không hash JSON trong Frontend, không gửi blockchain tx trực tiếp.
- [ ] Hiển thị tx hash anchor, chain/network, on-chain verification result và audit trail khi API đã trả, có copy và link explorer chỉ khi provider config cho phép.
- [ ] `DATA_INTEGRITY_FAILED` hiển thị lý do, batch affected và thời điểm xác minh; nếu batch chưa anchor, phân biệt mismatch với missing on-chain state.
- [ ] Test batch rỗng/chưa seal/chưa anchor/anchor pending/failed, one-leaf, batch có gap, root mismatch, thiếu quyền verify và timeout request.

**Definition of Done**

- [ ] UI thể hiện đúng tính toàn vẹn batch, không tuyên bố Blockchain xác nhận độ chính xác vật lý của sensor.
- [ ] Hash và Merkle root được copy nguyên vẹn, không tính lại ở client và không đổi byte encoding.
- [ ] `DATA_ANCHORED` không xuất hiện chỉ vì có `anchor_tx_hash`; `DATA_INTEGRITY_FAILED` không bị badge thành công che khuất.
- [ ] Có ít nhất một fixture có batch anchored nhưng shipment vẫn `DATA_INCOMPLETE` để chứng minh các trạng thái độc lập.

### Phase 5 — Blockchain, Insurance Event & Demo Panel

**Việc cần làm**

- [ ] Kết nối event/transaction DTO của NTK sau khi NTD bàn giao ABI/address/chain ID cho **Backend**, không kéo ABI/Web3 signer vào Frontend.
- [ ] Thiết kế view/tab phân biệt **Data Anchoring**, **Oracle/Violation**, **Insurance Payout** và tương ứng transaction hashes.
- [ ] Hiển thị `EVIDENCE_PENDING` khi bằng chứng có thể đủ nhiệt độ 15 phút nhưng chưa hoàn tất integrity/anchoring theo policy được nhóm xác nhận.
- [ ] Hiển thị `payout_status=CONFIRMED` chỉ theo kết luận Backend sau receipt/state/event; kiểm thử tx pending, reverted, duplicated, unauthorized Oracle và unknown policy.
- [ ] Giữ nút `normal`/`temperature_breach` ở môi trường dev/demo; thêm các scenario mới **chỉ** khi NTK xuất bản endpoint/enum thực tế.
- [ ] Panel demo hiển thị tiến độ từng bước, reset dựa trên server API dev được cấp quyền, message rõ khi scenario không được hỗ trợ.
- [ ] Kiểm tra link explorer theo đúng network và loại giao dịch; không dùng hash mồi hoặc token demo thành tiền thật.

**Definition of Done**

- [ ] Không có giao dịch blockchain trực tiếp từ browser và không chứa private key trong bundle.
- [ ] Anchor success, insurance evidence accepted và payout confirmed được hiển thị là **ba kết luận khác nhau**.
- [ ] Demo 15 phút dùng Backend virtual clock trong dev/test, không hack frontend clock.
- [ ] Khi Blockchain thất bại, telemetry vẫn hiển thị từ MySQL và trạng thái nghiệp vụ không bị "success" giả.

### Phase 6 — Render Public API Integration, CORS & Production Build

**Việc cần làm**

- [ ] Nhận **URL Render thật** của NTK sau deployment, không dùng URL minh họa `https://smart-coldchain-api.onrender.com` như thể đã tồn tại.
- [ ] Cấu hình local `VITE_API_BASE_URL=http://localhost:8000/api/v1` và production `VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api/v1` **với placeholder thay bằng URL thật lúc triển khai**.
- [ ] Kiểm tra build frontend qua `npm run build` (hoặc script thực tế), kiểm tra bundle không chứa bí mật và không hardcode `localhost` ở production.
- [ ] Cung cấp **Frontend production origin** cho NTK cấu hình `CORS_ORIGINS` whitelist; test preflight/method/header với Browser. CORS **không phải auth**, admin/verify/demo route vẫn phải có auth.
- [ ] Gọi `GET /api/v1/health` qua HTTPS công khai, thử list/shipments/telemetry/integrity/insurance endpoints theo quyền; kiểm thử đúng error schema.
- [ ] Kiểm tra external MySQL còn dữ liệu khi Render restart/redeploy; frontend không được kỳ vọng SQLite file/ephemeral filesystem làm nguồn lưu telemetry.
- [ ] Render Free (nếu dùng) có thể spin down/cold start: UI cần loading, timeout thông minh, nút retry và mô tả "Backend đang khởi động" khi đủ cơ sở; **không** tạo ping/heartbeat giả liên tục để né giới hạn gói dịch vụ.
- [ ] Dùng polling có giới hạn theo nhu cầu và tab visibility nếu thư viện hỗ trợ; hủy polling khi unmount/tab ẩn, không request bão hòa, không mặc định production là realtime 24/7.
- [ ] Đảm bảo demo endpoint không xuất hiện ở production build (và Backend tắt thật), không lộ lỗi stack trace/token/API keys từ console/log.
- [ ] Nếu deploy frontend lên static hosting riêng, ghi rõ domain thực tế và quy trình cập nhật env/bundle; việc deploy frontend **không thay thế** yêu cầu Backend chạy public trên Render.

**Definition of Done**

- [ ] Mở **frontend production URL thật** và truy cập được **FastAPI Render URL thật** qua HTTPS.
- [ ] CORS đúng origin, không lỗi mixed content; một shipment và integrity status hiển thị bằng dữ liệu API thật.
- [ ] Tắt mock hoàn toàn trong build production; khi API lỗi UI thể hiện lỗi thật, không âm thầm hiển thị mock.
- [ ] Render restart/cold start không biến device thành offline sai hoặc làm dữ liệu đã lưu biến mất khỏi UI sau khi API phục hồi.

### Phase 7 — E2E QA, Security Review & Demo Handoff

**Việc cần làm**

- [ ] Xây test plan từ ma trận tại §6; kết hợp unit test UI, mock API integration, browser E2E (ví dụ Playwright nếu nhóm chốt).
- [ ] Xác nhận các flow với NTK: chữ ký hợp lệ/sai, replay/duplicate, sequence gap, offline, root verify/mismatch, mất Backend, 15-minute breach, payout pending/confirmed.
- [ ] Xác nhận các flow với NTD **qua Backend**: `BatchAnchored`, duplicate batch, `InsurancePaid`, reverted/failed tx, one policy-one payout.
- [ ] Test accessible/responsive desktop-mobile, keyboard, màu/chữ, long hash, timezone, pagination/filter, null telemetry, 401/403/404/409/422/429/503.
- [ ] Rà network requests/console để tránh duplicate polling, memory leak, stale request, CORS, private data leak, secret nằm trong bundle.
- [ ] Diễn tập demo trên **local/dev/testnet** và URL public đúng kế hoạch, với seed data riêng; có screenshot/test evidence khi cần viết báo cáo.
- [ ] Viết `frontend/README.md` cuối: cài đặt, env local/prod, mock flag, API URL, chạy test, build, troubleshooting, demo limits và những điều không chứng minh được.
- [ ] Gửi bug list có bước tái hiện, request/response đã lọc secret, severity và owner; không tự sửa Backend/Blockchain nếu không có PR được duyệt.

**Definition of Done**

- [ ] Tất cả test case bắt buộc có kết quả `PASS` hoặc `BLOCKED` kèm lý do/owner; **không** báo `PASS` nếu thiếu API/contract thật.
- [ ] Có màn hình thể hiện riêng `DATA_VERIFIED`, `DATA_INCOMPLETE`, `DATA_ANCHORED`, `DATA_INTEGRITY_FAILED`, `BLOCKCHAIN_PENDING`, `BLOCKCHAIN_FAILED` và payout `CONFIRMED`.
- [ ] Demo end-to-end: signed telemetry → MySQL → Merkle batch → anchor confirmed → verified breach 15 phút → insurance tx confirmed (theo chính sách được chốt).
- [ ] Không có sai lệch ngôn ngữ về GPS mô phỏng, dữ liệu on-chain, tính liên tục vi phạm, payout demo/token thật hoặc public deployment.

---

## 5. Cross-Team Integration Contract & bàn giao theo mốc

### 5.1. NTK (Member 1) → TTDK (Member 3)

| Deliverable | Dùng vào việc gì | Phải có trước |
|---|---|---|
| `docs/contracts/api-v1.md` + OpenAPI | Sinh/check types, endpoints, error enum/auth | TTDK Phase 1 |
| Shipment + telemetry/route response | Dashboard, chart, simulated map | TTDK Phase 2 |
| Device registration metadata, health, missing sequences | Device Integrity UI | TTDK Phase 3 |
| Integrity summary + batch + audit + verify response | Batch UI, tamper alert | TTDK Phase 4 |
| Anchor vs insurance tx schema, receipt/confirmation | Blockchain & Insurance UI | TTDK Phase 5 |
| `payout_status` / `EVIDENCE_PENDING` semantics | Tránh payout success giả | TTDK Phase 5 |
| Demo scenarios, auth/capability flags và seed fixtures | Demo Panel đúng quyền | TTDK Phase 5/7 |
| **Public Render API URL thật** + `CORS_ORIGINS` đã mở đúng | Production integration | TTDK Phase 6 |
| Error/pagination/filter/timeout/health semantics | QA và reliability | Trước TTDK Phase 7 |

**NTK chịu trách nhiệm API và kết luận nghiệp vụ.** Không dùng API schema tạm làm nguồn chân lý sau khi đã chốt v1.

### 5.2. NTD (Member 2) → NTK (Member 1) → TTDK (Member 3)

NTD bàn giao cho **NTK** `ColdChainDataIntegrity` ABI, `ColdChainInsurance` ABI, addresses, chain ID/RPC, `BatchAnchored`/`InsurancePaid` events, quy tắc `MERKLE-v1`, `batchKey`/`shipmentKey`, receipt/confirmations và `blockchain/INTEGRATION.md`. NTK đưa các thông tin **cần hiển thị** sang API/response cho TTDK, không chuyển private key hoặc quyền ký giao dịch cho Frontend.

- [ ] NTK xác nhận `anchor_transaction_hash` khác `insurance_transaction_hash`.
- [ ] NTK định nghĩa `anchor_status`, `verification_status`, `payout_status` và `EVIDENCE_PENDING` chính xác; TTDK không tự gom thành `SUCCESS` chung.
- [ ] Explorer base URL, chain label và xác nhận tx nếu có được Backend trả hoặc cấu hình public an toàn; browser không tự dùng RPC để tra state nghiệp vụ.
- [ ] Khi NTD đổi ABI/role/event, NTD cập nhật `blockchain/INTEGRATION.md` → NTK cập nhật adapter/API (nếu bị ảnh hưởng) → TTDK cập nhật types/UI, tests sau khi contract được approve.

### 5.3. TTDK (Member 3) → NTK (Member 1)

- [ ] Báo field/status nào thiếu trong API: `signature_status`, `last_sequence_number`, missing sequence, integrity counters, Merkle root, `anchor_status`, `verification_status`, payout/tx.
- [ ] Cung cấp **Frontend local + production origins** để whitelist CORS; yêu cầu auth/permission cho admin read/verify và demo control.
- [ ] Gửi đề xuất pagination/filter/sorting cho list telemetry, batch, audit khi volume lớn.
- [ ] Gửi UI error requirements: `request_id`, HTTP status, retryable, timeout/cold start, failed receipt, nullable fields.
- [ ] Gửi kịch bản QA/demo cần simulator/signed fixtures, virtual clock, sealed batch, tamper demo riêng và Blockchain failure flags.
- [ ] Gửi bug report và proof (network console đã ẩn secret, screenshots, expected/actual) qua issue/PR.

### 5.4. Mốc làm song song để tránh chờ nhau

1. **Khi NTK Phase 0:** TTDK Phase 0–1 làm API client + mock UI dựa trên draft; NTD Phase 0 khóa event/hash integration.
2. **Khi NTK Phase 2–3:** TTDK Phase 2–3 nối shipment/telemetry/device API thật; Member 2 triển khai contracts độc lập.
3. **Khi NTK Phase 4–5 + NTD Phase 1–5:** TTDK Phase 4 xây integrity UI bằng fixtures rồi nối batch/verify endpoints khi sẵn sàng.
4. **Khi NTK Phase 6 + NTD Phase 3–6:** TTDK Phase 5 hiển thị `EVIDENCE_PENDING`, oracle/insurance tx/payout theo response Backend.
5. **Khi NTK Phase 7:** TTDK Phase 6 kết nối Render public, xác minh CORS/env và cold start; NTD xác minh đúng network/contract deploy.
6. **Khi cả nhóm đủ chức năng:** TTDK Phase 7 chạy E2E, phân loại lỗi đúng owner. Không bắt frontend chạy blockchain RPC hoặc ép NTD sửa code frontend.

---

## 6. Ma trận QA và kịch bản trình diễn End-to-End

### 6.1. Các test case bắt buộc

| ID | Kịch bản | Kỳ vọng hiển thị ở Frontend | Phụ thuộc/owner bằng chứng |
|---|---|---|---|
| UI-01 | Signed telemetry hợp lệ | `signature_status=VALID`, `DATA_VERIFIED`, nhiệt độ/độ ẩm và `received_at` từ Backend | NTK verify/DB |
| UI-02 | Chữ ký sai | Thông báo/audit `INVALID` hoặc ingestion rejected; **không** xuất hiện như accepted telemetry | NTK verification/audit |
| UI-03 | Duplicate telemetry đúng nội dung | Không tăng accepted record count; có thể báo duplicate/idempotent theo API | NTK ingestion |
| UI-04 | Replay/cùng sequence nhưng nội dung khác | Error/alert conflict, không cập nhật latest verified sai | NTK anti-replay |
| UI-05 | Sequence gap | `DATA_INCOMPLETE`, missing sequence count/range; chart có khoảng thiếu | NTK sequence logic |
| UI-06 | Device offline | Hiển thị last seen/heartbeat và offline; không mặc định là temperature breach | NTK device health |
| UI-07 | Batch sealed + anchoring | Batch root + `BLOCKCHAIN_PENDING` → `DATA_ANCHORED` **chỉ khi confirm** | NTK adapter, NTD contract |
| UI-08 | Integrity verification khớp | `verification_status=MATCHED`, có thời điểm verify; không nói sensor vật lý chắc chắn đúng | NTK verify, NTD getBatch |
| UI-09 | Tamper bản ghi MySQL demo sau anchor | `DATA_INTEGRITY_FAILED` + audit alert; giữ original root hiển thị | NTK seed DB demo |
| UI-10 | Blockchain hash mismatch | Alert root mismatch/verification failed; không coi `DATA_ANCHORED` đủ chứng minh dữ liệu hiện tại nguyên vẹn | NTK/NTD verify |
| UI-11 | Nhiệt độ vượt ngưỡng **chưa đủ 15 phút** | Violation warning nhưng `payout_status=NOT_ELIGIBLE` (hoặc đúng enum NTK) | NTK violation service |
| UI-12 | Nhiệt độ vượt ngưỡng **15 phút liên tục và evidence hợp lệ** | Eligibility → `EVIDENCE_PENDING` (nếu chờ anchor) → tx payout → `CONFIRMED` sau receipt | NTK/NTD |
| UI-13 | Blockchain anchor tx pending | `BLOCKCHAIN_PENDING`, telemetry vẫn tồn tại và không hiển thị anchored thành công | NTK tx monitor |
| UI-14 | Blockchain tx reverted/failed | `BLOCKCHAIN_FAILED` hoặc insurance `FAILED` đúng loại tx; không báo payout | NTK/NTD |
| UI-15 | Trùng payout / reportViolation lặp | Chỉ một payout confirmed, event/tx không nhân đôi chi trả | NTD contract, NTK idempotency |
| UI-16 | Mất API/DB hoặc trả 503 | Hiển thị network/service error, retry; không tự hiển thị mock hoặc sửa status device | NTK deployment/DB |
| UI-17 | Render Free cold start/restart | Loading/retry phù hợp; phục hồi giữ dữ liệu từ MySQL, không suy diễn device lỗi | NTK Render + MySQL |
| UI-18 | Production demo endpoint bị khóa | Không hiển thị/nút không gọi được demo scenario; Backend vẫn từ chối truy cập | NTK env/auth, TTDK |
| UI-19 | Batch anchored nhưng có sequence gap | Cùng hiển thị `DATA_ANCHORED` và `DATA_INCOMPLETE`, không tô xanh toàn bộ shipment | NTK fixtures |
| UI-20 | Admin verify/audit không đủ quyền | 401/403 và thông báo rõ, không lộ dữ liệu audit hoặc nút admin hoạt động trái phép | NTK auth |
| UI-21 | Chưa có telemetry/batch/position | Empty state, không hardcode latest temperature, GPS, transaction hash | TTDK mock/E2E |
| UI-22 | Responsive + accessibility | Desktop/mobile không vỡ layout; icon có tên, badge có text, hash copy đúng | TTDK |

**Quy trình QA:** Với mỗi test ghi `test_id`, môi trường (`mock`, `local`, `testnet`, `render_public`), dataset, steps, expected, actual, screenshot/log đã lọc secret, status `PASS/FAIL/BLOCKED`, bug owner và link issue. Test `mock=PASS` **không** thay thế bằng chứng `E2E=PASS`.

### 6.2. Checklist demo đề xuất (12 tình huống theo prompt)

- [ ] **1. Valid telemetry:** ESP32 hoặc simulator có chữ ký hợp lệ; Dashboard hiển thị mẫu được Backend chấp nhận.
- [ ] **2. Invalid signature:** Backend từ chối, UI/audit thể hiện sai chữ ký; mẫu không xuất hiện như verified.
- [ ] **3. Duplicate telemetry:** gửi lại cùng sequence/payload; thống kê accepted không tăng hai lần.
- [ ] **4. Sequence gap:** bỏ một số sequence có chủ đích; UI hiển thị missing count/range, không tính liên tục xuyên gap.
- [ ] **5. Device offline:** ngừng heartbeat/telemetry trong môi trường test; UI thể hiện last seen và offline riêng với tình trạng API.
- [ ] **6. Batch anchoring:** tạo/seal batch, root SHA-256/Merkle `MERKLE-v1`, pending → anchored sau receipt đúng.
- [ ] **7. Integrity verification:** verify batch và hiển thị `MATCHED`.
- [ ] **8. DB record tampering:** chỉnh dữ liệu **DB demo cô lập** sau anchor → `DATA_INTEGRITY_FAILED`; không sửa DB production.
- [ ] **9. Blockchain root mismatch:** tạo fixture root mismatch/đối chiếu sai đã kiểm soát; giao diện cảnh báo đúng nguyên nhân.
- [ ] **10. Temperature violation:** phát chuỗi vượt ngưỡng 15 phút **liên tục** theo virtual clock của Backend dev/test; không dùng gói thiếu/invalid làm bằng chứng.
- [ ] **11. Insurance payout:** Backend/Oracle báo event hợp lệ, testnet token được chuyển **chỉ** khi contract/receipt xác nhận; hiện `CONFIRMED`.
- [ ] **12. Pending Blockchain transaction:** giả lập/ngắt RPC theo test plan, hiển thị pending và telemetry vẫn còn MySQL; không tự báo thanh toán.

**Thứ tự trình diễn 3–5 phút (bản rút gọn):** normal signed telemetry → gap hoặc invalid → tạo batch/anchor → verify/tamper alert → 15-minute breach → evidence pending/confirmed payout → minh họa RPC pending → nhắc giới hạn Render/testnet. Nếu thời lượng không đủ, chuẩn bị ảnh/video kết quả **đã chạy trên môi trường test**, không dán ảnh mock như bằng chứng giao dịch thật.

### 6.3. Điều kiện kết thúc demo

- Có đường đi nhất quán: **ESP32 signed telemetry → FastAPI verify → external MySQL → canonical Merkle batch → on-chain anchor → integrity check → breach 15 phút → Insurance Contract demo-token payout**.
- Không có `InsurancePaid` thành công giả và không lấy `anchor tx` làm `payout tx`.
- Người xem phân biệt được **verified signature**, **anchored hash**, **integrity matched**, **complete data** và **insurance paid**.
- UI nhắc rõ **GPS mô phỏng**, **Blockchain không chứng minh cảm biến không bị can thiệp**, **local/testnet token không đại diện tiền thật**, **Render Free không bảo đảm realtime/SLA**.

---

## 7. Cấu hình môi trường, triển khai và vận hành UI

### 7.1. Biến môi trường Frontend (đề xuất, phải khớp code thực tế)

**`frontend/.env.example` — chỉ placeholder, không điền secret thật:**

```dotenv
# Development / local FastAPI
VITE_API_BASE_URL=http://localhost:8000/api/v1

# Mock phải bật tường minh; production luôn false
VITE_USE_MOCKS=false

# Nếu thêm cờ hiển thị panel demo, Backend vẫn phải tự chặn demo ở production
VITE_ENABLE_DEMO_UI=false
```

**Production (chỉ cấu hình sau khi NTK cung cấp URL thực tế):**

```dotenv
VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api/v1
VITE_USE_MOCKS=false
VITE_ENABLE_DEMO_UI=false
```

- Dòng URL trên chỉ là **placeholder**, không phải URL Render đã hoạt động; phải thay bằng domain NTK bàn giao.
- Biến `VITE_*` được Vite đưa vào **browser bundle**, vì vậy **chỉ chứa cấu hình công khai**. Không bao giờ đặt `BACKEND_ORACLE_PRIVATE_KEY`, `BACKEND_ANCHORER_PRIVATE_KEY`, `DATABASE_URL`, RPC credentials hoặc device private key vào đây.
- Nếu ứng dụng đang dùng công cụ config khác, điều chỉnh tên biến cho đúng code và cập nhật README; không tạo song song nhiều biến base URL có ý nghĩa khác nhau.
- Không hardcode `http://localhost:8000` vào production build; phân biệt local, demo và production.

### 7.2. CORS, authentication và API safety

- NTK cấu hình whitelist `CORS_ORIGINS` theo đúng domain/frontend origin thực tế. Preflight `OPTIONS`, allowed methods/headers/credentials phải khớp cơ chế auth đã thống nhất.
- CORS không thay authentication/authorization. Các endpoint admin/audit/verify và demo phải được bảo vệ ở Backend, không dựa vào việc ẩn nút Frontend.
- Client không tự lưu session token nhạy cảm trong local storage nếu team chưa đánh giá XSS/CSRF; tuân thủ chiến lược auth do NTK chốt, HTTPS trong production.
- Render API public không đồng nghĩa mọi endpoint đều public. Khi gọi không đủ quyền, giao diện phải hiển thị 401/403 đúng thay vì cố lấy dữ liệu khác.

### 7.3. Render Free và xử lý trạng thái dịch vụ

- Backend chạy **Render Web Service** kết nối **MySQL external**; filesystem Render có thể ephemeral, không dùng SQLite trên Render production cho dữ liệu dài hạn.
- Nếu dùng Free Tier, instance có thể spin down lúc idle và request đầu sau idle có thể chậm. UI hiển thị progress/cold-start hint phù hợp, retry có giới hạn và không gửi hàng loạt request đồng thời.
- Có thể cache dữ liệu hiển thị theo chiến lược an toàn nhưng phải ghi "Cập nhật lần cuối ..." và phân biệt **stale** với **live**; không báo sai online/offline khi Backend chưa xác minh.
- Với polling: áp dụng interval hợp lý (do nhóm chốt), exponential backoff khi 429/503, cancel khi unmount, tránh poll API verify admin hoặc demo repeatedly; **không** dùng browser ping để cố giữ Render Free luôn thức.
- Luồng giao dịch Blockchain pending có thể mất thời gian; UI phản ánh status do Backend polling/worker/outbox cung cấp, không đợi HTTP request vô hạn.

### 7.4. Bước smoke test production tối thiểu

1. Kiểm tra `VITE_API_BASE_URL` là **URL Render thật + `/api/v1`**; mở `/health` bằng HTTPS.
2. Mở frontend từ **domain thật**, xem Network: không CORS/preflight error, không mixed content và không request localhost.
3. Đọc ít nhất một shipment từ API thật, chart từ telemetry MySQL, device/integrity state và blockchain status.
4. Xác nhận `BLOCKCHAIN_PENDING`, `DATA_ANCHORED`, `DATA_INTEGRITY_FAILED` và payout states hiển thị từ Backend, không từ fixture.
5. Kiểm tra khi Backend restart/cold start và khi API tạm trả lỗi; retry không thay data thành mock.
6. Bảo đảm production không mở demo/tamper/verify admin trái quyền, không lộ private key hay credential trong bundle và browser console.

---

## 8. Security, Reliability, QA automation và quy tắc làm việc

### 8.1. Security checklist của TTDK

- [ ] TypeScript strict mode và validate dữ liệu API tại boundary khi cần (không chỉ tin types compile-time).
- [ ] Escape/sanitize output an toàn theo framework, tránh chèn HTML chưa kiểm soát; không render raw error stack.
- [ ] Không đưa private keys, blockchain signer, device credentials, DB URL hoặc secret vào repo/build/log/issue.
- [ ] Không gọi ESP32/DB/RPC/contract từ Frontend; mọi action nằm sau Backend auth/rate limit.
- [ ] Không cho frontend bấm retry POST quan trọng nhiều lần không có idempotency contract.
- [ ] Admin-only action bảo vệ ở Backend; UI kiểm tra quyền để hiển thị, nhưng không coi đó là security boundary.
- [ ] Audit/verification error message không lộ private device key hoặc raw secret; mask theo schema public.
- [ ] CORS origins/dev/production không wildcard tùy tiện khi credentials; HTTPS production và dependency audit phù hợp.

### 8.2. Reliability & UX checklist

- [ ] `loading`, `empty`, `error`, `stale`, `offline`, `permission_denied` và `unknown` được thiết kế nhất quán.
- [ ] Phân biệt Backend `unavailable` với device `OFFLINE` và blockchain `BLOCKCHAIN_FAILED`.
- [ ] Dữ liệu thiếu/invalid không nối thành một đường đo liên tục trên biểu đồ hoặc đủ điều kiện bảo hiểm.
- [ ] Mỗi key/enum status mới có mapping UI hoặc fallback "Trạng thái chưa hỗ trợ"; không default về success.
- [ ] Pagination/query/fetch dùng abort/cancel; không gây race update khi đổi shipment/filter.
- [ ] Transaction hash và Merkle root giữ nguyên exact bytes/hex trong copy; link explorer có whitelist cấu hình, không nối URL tùy tiện từ input không tin cậy.
- [ ] Có request ID/log context (nếu API trả), không ghi full telemetry nhạy cảm vào console production nếu không cần.
- [ ] Trình duyệt trên máy yếu/mobile vẫn đáp ứng khi telemetry nhiều (phân trang/downsampling từ Backend nếu cần; không tải vô hạn).

### 8.3. Quy tắc tránh xung đột code và contract

- Chỉ **TTDK** sửa `frontend/`; chỉ **NTK** sửa `device/`, `backend/`, `docs/contracts/api-v1.md`; chỉ **NTD** sửa `blockchain/` và `blockchain/INTEGRATION.md`.
- Commit theo Phase/feature nhỏ, PR có screenshot/test; không commit thẳng `main` hoặc các bản `.env` chứa secret.
- Với thay đổi API: tạo issue → NTK chỉnh `api-v1.md` + OpenAPI → TTDK update types/client/fixtures/tests → merge sau review. Không silently break schema.
- Với thay đổi ABI/hash/event: NTD cập nhật INTEGRATION → NTK adapter/API → TTDK UI mapping **nếu API thay đổi**; TTDK không sửa contract hoặc tự lấy ABI vào browser.
- Không đánh dấu Phase `DONE` chỉ vì mock UI đẹp; phải có DoD/Test evidence tương ứng.

---

## 9. Deliverables, quản lý tiến độ và tiêu chí nghiệm thu toàn bộ

### 9.1. Danh sách deliverables của TTDK

| Deliverable | Bắt buộc | Kiểm chứng |
|---|---|---|
| `frontend/` React + Vite + TypeScript | Có | Build/typecheck/lint hoạt động theo scripts đã chốt |
| `src/api/` typed REST client | Có | Đúng `api-v1.md`, xử lý timeout/error/auth |
| Dashboard + shipment list/detail | Có | API/mock đúng, responsive, empty/error |
| Telemetry chart + Leaflet route mô phỏng | Có | Không dùng GPS thật/đường tự suy diễn khi API thiếu |
| Device Integrity UI | Có | Signature/sequence/gap/offline tách biệt |
| Data Integrity Batch UI | Có | Merkle root, anchor, verification và alerts rõ ràng |
| Blockchain + Insurance UI | Có | Anchor tx khác insurance tx; payout confirmed theo Backend |
| Demo Panel có điều kiện | Có cho local/dev | Ẩn khi production, chỉ gọi scenario Backend công bố |
| `.env.example` + `frontend/README.md` | Có | Không secret, local/prod config rõ |
| Mock fixtures + status mapping tests | Có | Chứng minh các trạng thái chính xác |
| Responsive/UI QA/E2E test report | Có | PASS/FAIL/BLOCKED + evidence/owner |
| Render API public integration | Có khi NTK deploy | Domain thật, CORS/HTTPS/health/smoke test |
| Demo checklist/screenshot/limitations | Có | Người khác chạy lại được theo runbook |

### 9.2. Definition of Done — cuối Roadmap

- [ ] TTDK đã triển khai Frontend UI đầy đủ theo APIs được **NTK chốt**, không có field tự phát không đồng nhất.
- [ ] Chức năng cũ được giữ: Dashboard, danh sách/chi tiết shipment, nhiệt độ/độ ẩm, bản đồ mô phỏng, timeline, chính sách 15 phút, demo token payout.
- [ ] Chức năng mới có: Device Integrity, signed telemetry status, sequence gap/heartbeat/offline, Data Integrity batches/Merkle, anchoring verify, tamper/mismatch alerts, UI trạng thái tx riêng.
- [ ] Có production build kết nối **public FastAPI Render thật** dùng **external MySQL**, không hardcode localhost/URL giả.
- [ ] Browser chỉ dùng Backend REST API, không private key, không ký blockchain tx, không truy cập ESP32/DB/RPC trực tiếp.
- [ ] Có test results cho ít nhất 12 demo scenarios nêu trong prompt; những case chưa có Backend/contract phải đánh dấu `BLOCKED`, không giả `PASS`.
- [ ] Không có payout thành công chỉ dựa vào `transaction_hash`; không tự coi data gap là vi phạm nhiệt độ.
- [ ] Không giới thiệu Blockchain là chứng minh nhiệt độ thực tế, vị trí mô phỏng là GPS thật hoặc token demo là tiền thật.
- [ ] README, screenshot, demo checklist, bug log và bàn giao cho nhóm hoàn chỉnh.

---

## 10. Các quyết định kỹ thuật còn cần xác nhận / blockers

| Nội dung | Ai chốt | Tại sao chưa thể coi là đã xong |
|---|---|---|
| API schema cuối, auth, pagination, nullability, enum names | **NTK** | Roadmap chỉ nêu contract v1 đề xuất, chưa có OpenAPI thực thi được xác minh |
| Danh sách demo scenarios và quyền gọi | **NTK** | Backend production phải tắt demo; không được tự tạo scenario trong UI |
| Signed telemetry/sequence/offline rules | **NTK** | UI chỉ hiển thị kết luận Backend, không tự suy ra chữ ký/gap |
| `MERKLE-v1`, batch membership, root, integrity verification semantics | **NTK + NTD** | Cần golden fixtures và API thực tế trước khi nghiệm thu cross-language |
| Network, chain ID, contract addresses, receipt/confirmations | **NTD → NTK** | Không dùng URL/contract ví dụ như deployment thật |
| Evidence policy `PAYOUT_REQUIRES_ANCHORED_EVIDENCE` | **Cả nhóm, NTK chủ trì** | Nếu chốt true, `EVIDENCE_PENDING` chờ anchor trước khi gửi payout |
| Render service URL, MySQL provider, CORS frontend origin | **NTK + TTDK** | Không được giả định Render URL hoặc DB/Frontend domain đã có |
| UI library/chart library, client cache/polling, E2E framework | **TTDK**, thông báo nhóm | Ưu tiên stack đang có; chỉ bổ sung dependency sau đánh giá |
| Frontend hosting/public URL và auth strategy | **TTDK + NTK** | Phải có domain origin thật và phương án bảo mật trước production smoke test |
| Bằng chứng kiểm thử E2E thực tế | **Cả nhóm** | Mock screenshots không chứng minh giao dịch, deployment hoặc firmware đã hoạt động |

**Hành động đầu tiên:** xin NTK bản draft `docs/contracts/api-v1.md` + OpenAPI và ví dụ `device_integrity`/`integrity`/`insurance`, xác nhận với NTD rằng mọi blockchain states đi qua Backend, rồi triển khai **Phase 0 và Phase 1 song song với NTK/NTD**.

---

> **Ghi chú cập nhật:** Roadmap này chỉnh sửa trực tiếp từ Roadmap TTDK gốc (giữ `frontend/`, React/Vite/TypeScript, Dashboard, Leaflet, simulated GPS, luật 15 phút, insurance demo, mock/API client, demo và QA). Các phần được **bổ sung và sắp xếp lại theo dependency** là Device Integrity, Merkle Batch/Blockchain Anchoring, payout state semantics, Render public integration, cross-team handoff, ma trận QA, demo checklist và DoD từng Phase. Không khẳng định đã chỉnh sửa repository hay chạy test ngoài việc cập nhật chính file Roadmap.
