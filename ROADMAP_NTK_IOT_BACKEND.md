# ROADMAP THÀNH VIÊN 1 — IoT, Backend và Điều phối hệ thống

> **Dự án:** `smart-coldchain-insurance`  
> **Thành viên:** NTK — Member 1: IoT & Backend, đầu mối tích hợp hệ thống  
> **Owner:** `device/`, `backend/`, `docs/contracts/api-v1.md`; chủ trì tài liệu kiến trúc dữ liệu và triển khai Backend  
> **Trạng thái:** Roadmap triển khai được đề xuất; **không** có nghĩa các tính năng đã được lập trình hoặc deploy.  
> **Mục tiêu nâng cấp:** **IoT Data Integrity + Blockchain Data Anchoring + Smart Contract Insurance + Public FastAPI Backend on Render**.

> **Cập nhật tiến độ 2026-11-05:** Phase 0 **IN_PROGRESS**. Đã kiểm tra repo/nhánh `feat/iot-backend`; đã triển khai và test thư viện `SIGNED-TELEMETRY-v1`/`MERKLE-v1`, golden vectors công khai và đặc tả byte-level tại `docs/architecture/data-integrity.md`. Chưa có ESP32 cross-test, Data Integrity Contract, Render URL hoặc xác nhận contract từ Member 2/3. Không đánh dấu Phase 0 hoàn tất trước các xác nhận đó.
> **Tiến độ Backend tiếp theo:** Phase 2 **IN_PROGRESS**. Đã có API admin đăng ký/revoke device key/assignment và tiếp nhận signed telemetry với duplicate/replay/gap audit; production từ chối payload chưa ký. Alembic revision `20261105_01` nâng schema trên DB nền hiện có; có body limit, rate limit theo thiết bị, request ID và device status suy ra từ `last_seen_at`. Chưa có signed heartbeat, giới hạn theo IP ở gateway, batch anchoring hoặc payout evidence gate; không dùng kết quả hiện tại để tuyên bố hoàn tất Phase 2.

---

## 1. Phạm vi và ranh giới sở hữu

### 1.1. Bạn chịu trách nhiệm

- **ESP32:** đọc nhiệt độ/độ ẩm, định danh thiết bị, quản lý khóa ký, đánh số thứ tự mẫu, ký telemetry, gửi HTTPS, retry/reconnect và bộ đệm khi offline.
- **FastAPI:** API quản lý lô hàng và thiết bị; đăng ký public key; xác minh chữ ký; phát hiện replay/duplicate, sequence gap, mất tín hiệu; lưu dữ liệu hợp lệ và audit sự kiện bị từ chối.
- **MySQL:** là **nguồn lưu trữ chính** cho telemetry, thiết bị, lô hàng, integrity batch, sự kiện vi phạm, bảo hiểm, giao dịch Blockchain; có migration, index và backup theo khả năng nhà cung cấp.
- **Data Integrity Service:** chuẩn hóa bản ghi, tạo batch, tính hash/Merkle root, lưu bằng chứng, đối chiếu dữ liệu với root trên Blockchain.
- **Blockchain Adapter:** tích hợp cả **Data Integrity Contract** và **Insurance Contract** do Member 2 sở hữu; Backend là Oracle và tác nhân gửi transaction được ủy quyền.
- **Luật nghiệp vụ bảo hiểm:** phát hiện vi phạm nhiệt độ liên tục theo policy, phân biệt dữ liệu đã xác minh / đã anchor / thiếu dữ liệu; không payout nếu không đủ bằng chứng.
- **GPS mô phỏng:** tạo vị trí tại Backend dựa trên điểm đi/đến; không yêu cầu ESP32 gắn GPS thật.
- **Public deployment:** deploy FastAPI lên Render Web Service, kết nối MySQL bên ngoài, quản lý secret, CORS, health check, theo dõi lỗi, xác minh URL hoạt động.
- **Điều phối:** công bố schema/API và dữ liệu thử từ sớm; giữ hợp đồng tích hợp thống nhất với Member 2 (Blockchain) và Member 3 (Frontend & QA).

### 1.2. Ranh giới không được vượt qua

- Không tự sửa `blockchain/` (Member 2), không tự sửa `frontend/` (Member 3), trừ khi có PR được owner chấp thuận.
- Không tự đổi ABI, event, hash rule, schema API đã chốt hoặc tên trường mà chưa có thỏa thuận của cả ba thành viên.
- Frontend **chỉ truy cập REST API**, không kết nối trực tiếp ESP32, không tự xử lý Oracle và không gọi Blockchain RPC để thực hiện nghiệp vụ.
- Blockchain chỉ ghi **batch root/hash và sự kiện bảo hiểm**, không lưu từng mẫu telemetry.
- Không đưa private key thiết bị, khóa Oracle, token, mật khẩu Wi-Fi/MySQL hay giá trị secret thật vào Git, tài liệu, screenshot hoặc Frontend.
- Chữ ký chỉ chứng minh mẫu được ký bằng khóa tương ứng; hash kiểm tra dữ liệu có bị đổi; Blockchain chứng minh cam kết hash trên chain. **Không cơ chế nào tự chứng minh cảm biến vật lý không bị can thiệp hoặc nhiệt độ đo thực sự chính xác.**

### 1.3. Cấu trúc thư mục mục tiêu (tham chiếu; không yêu cầu đổi cây đang hoạt động)

```text
smart-coldchain-insurance/
├── device/                           # Member 1
│   ├── esp32/
│   │   ├── cold_chain_device.ino
│   │   ├── config.example.h
│   │   └── README.md
│   ├── simulator/
│   │   ├── send_telemetry.py
│   │   └── fixtures/
│   └── README.md
├── backend/                          # Member 1
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── health.py
│   │   │   ├── devices.py
│   │   │   ├── telemetry.py
│   │   │   ├── integrity.py
│   │   │   ├── shipments.py
│   │   │   ├── insurance.py
│   │   │   └── demo.py
│   │   ├── services/
│   │   │   ├── telemetry_service.py
│   │   │   ├── signature_verification_service.py
│   │   │   ├── integrity_service.py
│   │   │   ├── batch_service.py
│   │   │   ├── violation_service.py
│   │   │   ├── route_simulator.py
│   │   │   └── device_health_service.py
│   │   ├── integrations/
│   │   │   └── blockchain_adapter.py
│   │   ├── models/
│   │   ├── schemas/
│   │   └── core/                     # settings, auth, database, logging, clock
│   ├── alembic/                      # MySQL migrations
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   ├── requirements.txt
│   └── .env.example                  # chỉ placeholder
├── blockchain/                       # Member 2; Member 1 chỉ tiêu thụ ABI
├── frontend/                         # Member 3; Member 1 cung cấp API
├── docs/
│   ├── contracts/
│   │   └── api-v1.md                 # Member 1 chủ trì, team review
│   ├── architecture/
│   │   └── data-integrity.md         # tạo nếu chưa có tài liệu tương đương
│   └── deployment/
│       └── render.md                 # tạo nếu chưa có tài liệu tương đương
└── README.md
```

**Nguyên tắc:** dùng cấu trúc hiện có của repository nếu đã được triển khai hợp lý. Tài liệu cấu trúc ở trên **không phải** kết quả kiểm tra repository: hiện chỉ có Roadmap NTK và prompt nâng cấp được cung cấp để sửa.

## 2. Kiến trúc và quy ước kỹ thuật bắt buộc

### 2.1. Luồng dữ liệu mục tiêu

```text
ESP32 + Temperature/Humidity Sensors
  └─ HTTPS + Signed Telemetry + device_id + sequence_number + recorded_at
      ↓
Public FastAPI Backend (Render)
  ├─ Authenticate device / lookup registered public key
  ├─ Verify ECDSA signature + payload + shipment assignment
  ├─ Detect duplicate / replay / sequence gap / offline
  ├─ Store received_at (authoritative) and accepted telemetry
  └─ Audit rejected attempts separately
      ↓
External MySQL (system of record)
  ├─ Devices, device keys, shipments, telemetry, gap/heartbeat
  ├─ Integrity batches, leaf hashes, anchor transactions, audit
  └─ Violation, insurance policy and payout metadata
      ↓
Backend Integrity Service
  ├─ Canonical records → SHA-256 leaves → Merkle root
  ├─ Freeze batch membership and store metadata
  ├─ Outbox → Blockchain adapter → Data Integrity Contract
  └─ Receipt / on-chain hash verification / tamper alerts
      ↓
Blockchain (batch commitments only)

Parallel insurance branch:
Verified telemetry + continuity rules + integrity evidence
  → violation detection (policy threshold for 15 continuous minutes)
  → evidence event / idempotency key
  → authorized Backend Oracle
  → Insurance Contract → demo-token payout after confirmed receipt

Frontend (Member 3) → REST/HTTPS → Public FastAPI Backend ONLY
```

### 2.2. Những nguyên tắc được giữ từ Roadmap gốc

1. **FastAPI + Python** cho Backend và **Arduino/C++ trên ESP32** cho thiết bị.
2. **MySQL** là database chính cho local integration và production; **không chuyển sang PostgreSQL** vì phiên bản Roadmap cũ có nhắc tới PostgreSQL. SQLite chỉ có thể dùng cho unit test độc lập, không dùng trên Render production.
3. `received_at` do Backend gán theo UTC là thời gian tiếp nhận authoritative; `recorded_at` do ESP32 cung cấp chỉ là metadata/thời gian quan sát, cần kiểm tra độ lệch đồng hồ, không thể thay `received_at` để kết luận 15 phút thực tế.
4. **Vị trí mô phỏng:** Backend tự tính, `location_source = "backend_simulated"`; ESP32 không gửi GPS, Frontend không gọi đây là GPS thật.
5. Nhiệt độ vi phạm phải nằm ngoài `[temp_min_c, temp_max_c]` **liên tục ít nhất 15 phút** theo `violation_duration_minutes` của policy mẫu; mỗi lô có ngưỡng riêng.
6. Mất telemetry, sequence gap hay dữ liệu ký sai **không tự động** tương đương vi phạm nhiệt độ hoặc đủ điều kiện payout.
7. Backend giữ vai trò **Oracle**; Smart Contract xác thực địa chỉ gọi và chống payout trùng.
8. Blockchain lỗi **không làm mất telemetry**; pending/failed được lưu và xử lý lại với idempotency.
9. Token trên local/testnet chỉ phục vụ mô phỏng, không phải tiền VND thực; `insured_amount_vnd` là giá trị hợp đồng nghiệp vụ được biểu diễn riêng, không đồng nghĩa số token chuyển.

### 2.3. Các quyết định kỹ thuật đề xuất phải khóa tại Phase 0

| Quyết định | Đề xuất thực thi (v1) | Chủ trì/chốt |
|---|---|---|
| Device signing | **ECDSA P-256 + SHA-256** qua mbedTLS do framework ESP32 hỗ trợ; **không tự viết thuật toán mật mã** | Member 1, kiểm tra phiên bản ESP32/Arduino |
| Signature encoding | ECDSA ASN.1 DER, Base64 chuẩn có padding; public key SPKI PEM/DER với `key_id` | Member 1 |
| Signed message | UTF-8 **canonical JSON projection** chứa các số nguyên đã scale, không ký raw JSON tùy thứ tự key | Member 1, chia sẻ fixture |
| Hash records | SHA-256, domain-separated, canonical JSON v1 | Member 1 ↔ Member 2 |
| Batch commitment | **Merkle root** từ leaf hash; Hash Chain chỉ là tùy chọn riêng cho audit-log, không dùng lẫn làm root | Member 1 ↔ Member 2 |
| Batching | Đề xuất theo **mỗi cặp `(shipment_id, device_id)`**, tối đa 100 bản ghi hoặc 5 phút; cấu hình được | Member 1 ↔ Member 2 |
| Blockchain key encoding | `batch_key` / `shipment_key` kiểu `bytes32` theo một quy tắc duy nhất ghi trong `blockchain/INTEGRATION.md` | Member 2 chốt, Member 1 áp dụng |
| Evidence policy | Đề xuất **không gọi payout khi bằng chứng cần thiết chưa được xác minh và anchor thành công**; chờ khi pending | Cả 3 thành viên xác nhận |
| Chain / contract | Tên network, chain ID, contract address, ABI, confirmations từ Member 2, không tự đoán | Member 2 |
| Render / MySQL | Render Web Service công khai + external managed MySQL; chọn nhà cung cấp MySQL thực tế trước Phase 7 | Member 1 |

Nếu thuật toán/thư viện ký số không phù hợp với ESP32 thật, phải mở quyết định kỹ thuật và cập nhật **cả** firmware, API, fixture, tài liệu; không âm thầm thay đổi giao thức.

### 2.4. Signed Telemetry v1 — định dạng cần dùng thống nhất

`POST /api/v1/shipments/{shipment_id}/telemetry`

```json
{
  "payload_version": 1,
  "shipment_id": "SHIP-001",
  "device_id": "ESP32-001",
  "key_id": "key-v1",
  "sequence_number": 1524,
  "temperature_c": 12.5,
  "humidity_pct": 80.0,
  "temperature_milli_c": 12500,
  "humidity_milli_pct": 80000,
  "recorded_at": "2026-11-04T10:30:00Z",
  "firmware_version": "1.0.0",
  "signature": "<base64-der-ecdsa-signature>"
}
```

- Hai trường `temperature_c` và `humidity_pct` vẫn giữ phục vụ giao diện/API cũ; các trường `*_milli_*` là **số nguyên** được ký để loại sai số khi biểu diễn float. Backend yêu cầu `temperature_c × 1000 == temperature_milli_c`, `humidity_pct × 1000 == humidity_milli_pct` bằng phép tính thập phân chính xác; chỉ cho phép tối đa 3 chữ số thập phân, không cho `NaN`, `Infinity` hay số mũ bất thường. Ví dụ cảm biến 12,5°C được scale thành `12500`.
- `shipment_id` ở body phải khớp path và ánh xạ thiết bị-lô hàng đang được cho phép. `sequence_number` tăng theo **device**, không reset khi đổi shipment hoặc reboot; trạng thái được lưu trong NVS/secure storage của ESP32.
- `recorded_at` dùng định dạng UTC `YYYY-MM-DDTHH:mm:ssZ` với đồng hồ đã đồng bộ nếu có thể; không cho thiết bị tự định nghĩa `received_at`. Backend tự ghi `received_at` và cảnh báo lệch giờ.
- `firmware_version`, `payload_version`, `key_id`, `shipment_id` **nằm trong nội dung được ký**, ngăn sửa ngữ cảnh sau khi ký.
- Device registration do API quản trị được xác thực thực hiện; **ESP32 không được tự đăng ký key mới tùy ý** khi đang gửi telemetry.

**Quy tắc canonicalization ký số — `SIGNED-TELEMETRY-v1`:**

1. Backend/ESP32 xây dựng một object **chỉ** có các field bên dưới, bỏ `signature`, các số float hiển thị và mọi field do server sinh.
2. Sử dụng thứ tự key ASCII **tăng dần**, UTF-8, JSON compact không whitespace, escape string theo JSON; IDs/key/firmware/timestamp giới hạn ASCII và pattern đã chốt để tránh khác biệt Unicode. Numeric **chỉ là integer thập phân**, không dấu `+`, không leading zero, không scientific notation.
3. Tạo đúng một byte sequence; dùng **SHA-256 của bytes** trong ECDSA P-256; truyền chữ ký ở `signature` (Base64 của DER). Backend **tạo lại bytes từ field chuẩn hóa**, không tin thứ tự key/body gốc.
4. Ghi golden fixture gồm canonical bytes (UTF-8/hex), public key, input request và expected verification result; **bắt buộc thử ký trên ESP32 và verify bằng Python** trước khi chốt.

Canonical JSON projection minh họa:

```json
{"device_id":"ESP32-001","firmware_version":"1.0.0","humidity_milli_pct":80000,"key_id":"key-v1","payload_version":1,"recorded_at":"2026-11-04T10:30:00Z","sequence_number":1524,"shipment_id":"SHIP-001","temperature_milli_c":12500}
```

> **Ghi chú triển khai:** profile canonical này là giao thức v1 của dự án (object cố định, không số thực), **không** tuyên bố là triển khai đầy đủ RFC 8785/JCS. Nếu muốn thay bằng JCS, phải chốt lại và cập nhật tất cả golden fixtures trước khi triển khai. Không được dùng `json.dumps()` mặc định trên mọi object tùy ý rồi cho là canonical.

**Chu trình tiếp nhận bắt buộc:** validate payload → kiểm tra thiết bị đang active / `key_id` hợp lệ / shipment assignment → verify chữ ký → kiểm tra `(device_id, sequence_number)` → phân loại duplicate/gap/replay → lưu accepted telemetry + `received_at` trong transaction → tạo sự kiện/outbox. Đầu vào bị từ chối chỉ được ghi **audit có kiểm soát**, không trở thành accepted/verified telemetry.

### 2.5. Chính sách sequence, offline và dữ liệu đáng tin cậy

- Unique constraint `(device_id, sequence_number)`. Retry cùng số thứ tự **và cùng canonical signed content** trả response idempotent (`duplicate=true`, không chèn mẫu mới). Cùng sequence nhưng payload khác → **409 conflict**, audit suspicious/replay.
- Sequence lớn hơn số đã nhận tạo **gap range**; đánh dấu `DATA_INCOMPLETE` cho khoảng liên quan và không tính liên tục nhiệt độ xuyên qua khoảng thiếu. Nếu nhận dữ liệu trễ, không tự viết lại kết luận/payout đã xác nhận; có quy trình đối soát rõ ràng và audit.
- ESP32 nên gửi hàng đợi theo sequence tăng dần; lưu tăng sequence vào NVS **trước khi dùng số đó** để giảm rủi ro tái sử dụng khi mất điện. Giới hạn dung lượng queue, tuổi dữ liệu và số lần retry; chấp nhận có gap nếu tràn queue, không âm thầm bỏ mất số.
- Offline được xác định theo thời gian từ **lần cuối Backend nhận telemetry/heartbeat hợp lệ** với ngưỡng cấu hình. Heartbeat dùng chữ ký/nonce hoặc bộ đếm **riêng**; không sử dụng cùng sequence telemetry khiến báo gap giả.
- Trạng thái offline khi service Render Free đang ngủ không đủ để suy luận chắc chắn thiết bị lỗi. UI cần phân biệt `last_seen_at`, `telemetry_gap`, và `backend_availability` khi đủ dữ liệu.
- **Không dùng `recorded_at` của gói đến trễ để tự bù thời lượng vi phạm 15 phút**; những gói đó có thể hữu ích cho phân tích/audit nhưng không tạo bằng chứng quan sát liên tục bởi Backend.
- Key rotation gắn `key_id`, ngày hiệu lực/thu hồi và audit. Khóa private ESP32 đặt trong vùng bảo vệ có thể có trên board; nếu chỉ lưu flash/NVS thông thường phải ghi nhận rủi ro trích xuất khi bị truy cập vật lý.

### 2.6. Data Integrity Batch / Merkle Tree v1

- **Đơn vị batch:** bản ghi `signature_valid = true` đã được chấp nhận cho một `(shipment_id, device_id)`; batch khóa bất biến sau khi `SEALED`. Bản ghi sai chữ ký chỉ vào audit riêng.
- **Sắp xếp:** `(sequence_number ASC)` trong batch, không dựa thứ tự trả về ngẫu nhiên từ MySQL.
- **Canonical record:** JSON projection có field version cố định: `payload_version`, `shipment_id`, `device_id`, `key_id`, `sequence_number`, `temperature_milli_c`, `humidity_milli_pct`, `recorded_at`, `received_at`, `firmware_version`, `signature` (Base64 chuẩn); key tăng dần, UTF-8 compact, số nguyên, timestamp UTC đã chuẩn hóa. Không chèn field có thể thay đổi như `anchoring_status`, `verification_status` vào record hash.
- **Leaf hash:** `SHA256(0x00 || canonical_record_utf8)`; **parent hash:** `SHA256(0x01 || left_hash_32bytes || right_hash_32bytes)`; với số leaf lẻ, **nhân đôi node cuối ở mỗi tầng**. Root của một leaf chính là leaf đó. Batch rỗng **không được anchor**.
- `merkle_root` lưu 32 bytes, hiển thị hex `0x` + 64 hex chars; hợp đồng nhận `bytes32` của **root đúng 32 bytes**, không hash chuỗi hex thêm lần nữa. Member 2 phải xác nhận việc `batch_key` chuyển sang `bytes32` theo `blockchain/INTEGRATION.md`.
- Bản ghi MySQL thay đổi sau khi anchor → tính lại root từ **toàn bộ membership đã đóng băng** và so với root đã lưu/on-chain → gắn `DATA_INTEGRITY_FAILED`, sinh audit/alert; không tự sửa root cũ và không ghi đè bằng chứng đã anchor.
- **Merkle Tree** được dùng để cam kết nội dung batch, có thể bổ sung inclusion proof cho từng leaf ở giai đoạn mở rộng. **Hash Chain**, nếu dùng, chỉ để nối audit-log hoặc root của batch theo thời gian; không cần cho MVP và không thay thế phép verify Merkle root.

Metadata tối thiểu của `IntegrityBatch`: `batch_id`, `shipment_id`, `device_id`, `batch_start_time`, `batch_end_time`, `record_count`, `first_sequence_number`, `last_sequence_number`, `merkle_root`, `hash_version`, `anchor_tx_hash`, `anchor_status`, `verification_status`, `anchored_at`, `last_verified_at`, `chain_id`, `contract_address`. Membership lưu riêng `(batch_id, telemetry_id, leaf_index, leaf_hash)`.

**Lưu ý về Smart Contract:** Contract không parse/chuẩn hóa JSON; nó lưu và đọc lại root `bytes32` đã được Backend tính. Việc “Backend và Contract thống nhất cách tính hash” được bảo đảm bằng tài liệu bit-level, golden fixture, test integration và tra cứu đúng root on-chain — không bằng việc giả định EVM tự kiểm tra sensor payload.

### 2.7. Trạng thái phải tách biệt (không gộp vào một boolean `verified`)

| Nhóm | Trường/schema gợi ý | Diễn giải |
|---|---|---|
| Device signature | `signature_status: VALID / INVALID / UNKNOWN_KEY` | Kiểm tra khóa và chữ ký, chỉ do Backend quyết định |
| Sequence/availability | `completeness_status: COMPLETE / DATA_INCOMPLETE / OFFLINE / UNKNOWN` | Không khẳng định liên tục nếu thiếu mẫu |
| Batch verification | `verification_status: NOT_CHECKED / MATCHED / DATA_INTEGRITY_FAILED` | Root tính lại khớp/không khớp |
| Blockchain anchoring | `anchor_status: NOT_READY / BLOCKCHAIN_PENDING / DATA_ANCHORED / BLOCKCHAIN_FAILED` | `DATA_ANCHORED` chỉ sau khi receipt thành công, root trên chain khớp và đủ confirmations theo cấu hình |
| Telemetry display | `data_status: DATA_VERIFIED / DATA_INCOMPLETE / INVALID` | `DATA_VERIFIED` nghĩa là chữ ký/format/sequence đã được xác minh; **không** đồng nghĩa on-chain anchored |
| Insurance | `payout_status: NOT_ELIGIBLE / EVIDENCE_PENDING / PENDING / CONFIRMED / FAILED` | `CONFIRMED` dựa trên receipt + event/on-chain state, không chỉ có transaction hash |

Các nhóm trạng thái có thể tồn tại đồng thời: batch **đã anchor** nhưng vẫn có **sequence gap** ở dữ liệu gốc. Frontend không được tự suy ra chữ ký hợp lệ, bằng chứng bất biến, hay payout từ một field đơn lẻ.

---

## 3. Hợp đồng REST API và dữ liệu dùng chung — khóa từ Phase 0

Member 1 cập nhật `docs/contracts/api-v1.md` với OpenAPI, request/response, lỗi và fixture. Các endpoint dưới đây là **contract đề xuất v1** cần thống nhất rồi mới implementation; giữ endpoint gốc khi còn cần.

### 3.1. Nhóm quản lý lô hàng và vị trí mô phỏng (giữ từ Roadmap cũ)

**`POST /api/v1/shipments`**

```json
{
  "code": "SHIP-001",
  "cargo_type": "vaccine",
  "origin": {"name": "Kho A", "latitude": 10.030, "longitude": 105.770},
  "destination": {"name": "Điểm nhận B", "latitude": 10.050, "longitude": 105.810},
  "temp_min_c": 2.0,
  "temp_max_c": 8.0,
  "violation_duration_minutes": 15,
  "insured_amount_vnd": 10000000
}
```

Backend validate min/max, thời lượng và số tiền; vị trí được nội suy xác định dựa trên tuyến điểm đầu/cuối, thời gian hoặc số mẫu hợp lệ. Chỉ sử dụng `location_source: "backend_simulated"`; nếu chưa có telemetry thì trả trạng thái chưa khởi hành, không tạo tọa độ cập nhật giả.

### 3.2. Danh sách endpoint chuẩn

| Method | Endpoint | Nguồn gọi / mục đích |
|---|---|---|
| `GET` | `/api/v1/health` | Liveness/API và dependency status an toàn; không lộ secret |
| `GET` | `/api/v1/ready` | (Khuyến nghị) readiness kiểm tra DB với timeout ngắn |
| `POST` | `/api/v1/shipments` | Admin tạo shipment + policy mẫu |
| `GET` | `/api/v1/shipments` | Danh sách shipment |
| `GET` | `/api/v1/shipments/{shipment_id}` | Chi tiết, tọa độ mô phỏng, trạng thái tổng hợp |
| `GET` | `/api/v1/shipments/{shipment_id}/telemetry` | Dữ liệu đo, thời gian server, integrity status |
| `POST` | `/api/v1/shipments/{shipment_id}/telemetry` | **ESP32:** gửi telemetry có chữ ký |
| `GET` | `/api/v1/shipments/{shipment_id}/events` | Cảnh báo, vi phạm, sự kiện bảo hiểm |
| `GET` | `/api/v1/shipments/{shipment_id}/insurance` | Policy, eligibility, payout status, tx receipt |
| `GET` | `/api/v1/shipments/{shipment_id}/integrity` | Tổng quan verified/invalid/missing + anchor |
| `GET` | `/api/v1/shipments/{shipment_id}/integrity/batches` | Danh sách batch và Merkle root/tx |
| `POST` | `/api/v1/devices` | **Admin:** đăng ký `device_id` + public key + assignment |
| `GET` | `/api/v1/devices` | Danh sách device/status |
| `GET` | `/api/v1/devices/{device_id}` | Metadata, key_id hiện hành, firmware version (không lộ secret) |
| `GET` | `/api/v1/devices/{device_id}/health` | Last seen, last seq, gap count, online/offline |
| `GET` | `/api/v1/devices/{device_id}/missing-sequences` | Dải sequence thiếu được Backend phát hiện |
| `POST` | `/api/v1/devices/{device_id}/heartbeat` | Device heartbeat có chữ ký/nonce riêng nếu triển khai |
| `POST` | `/api/v1/devices/{device_id}/keys/rotate` | **Admin:** luân chuyển/revoke public key, ghi audit |
| `GET` | `/api/v1/integrity/batches/{batch_id}` | Chi tiết metadata batch, on-chain status |
| `POST` | `/api/v1/integrity/batches/{batch_id}/verify` | **Admin:** tính lại root, đối chiếu on-chain, audit |
| `GET` | `/api/v1/integrity/audit` | **Admin:** nhật ký thay đổi và thất bại integrity |
| `GET` | `/api/v1/blockchain/transactions/{transaction_id}` | Trạng thái submission/receipt/confirmed/failed |
| `POST` | `/api/v1/demo/shipments/{shipment_id}/scenario` | **Dev/local only**; dùng service thật + virtual clock, tắt trên public production |

Với API public, các route ghi dữ liệu và route admin cần authentication, authorization, validation và rate limit thích hợp; **không coi CORS là cơ chế authentication**. Có phân trang và filter cho lịch sử telemetry/batches/audit.

### 3.3. Response thống nhất để Member 3 triển khai

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

Đây là **fixture minh họa**, không phải kết quả từ hệ thống đang chạy. Field thực tế, nullable behavior và enum phải được khóa trong `api-v1.md`, sinh/kiểm tra bằng OpenAPI và cung cấp type cho Frontend. `anchor_transaction_hash` phải tách khỏi `insurance_transaction_hash`.

**Quy tắc HTTP tối thiểu:** `201` cho mẫu được nhận mới; `200` cho cùng mẫu retry idempotent; `401/403` cho thiết bị chưa được phép/chữ ký sai theo chính sách bảo mật thống nhất; `409` cho cùng sequence nhưng payload khác; `422` validation lỗi; `503` khi dependency cần thiết không sẵn sàng. Error body có `code`, `message`, `request_id` nhưng không lộ stack trace/secret.

### 3.4. API demo an toàn

- Giữ tình huống gốc `normal` và `temperature_breach`, mở rộng `invalid_signature`, `duplicate`, `sequence_gap`, `offline`, `anchor_pending`, `tampering`, `hash_mismatch`.
- Simulator dùng **cùng chữ ký, cùng `telemetry_service`, cùng `violation_service`** như thiết bị thật (trừ bước giả lập lỗi có chủ ý). Virtual clock phải được inject trong test, **không sửa clock production**.
- Route demo tắt hoàn toàn tại `APP_ENV=production`; các demo tamper DB thực hiện trên database seed **riêng biệt**; rollback/reseed sau demo và không tác động dữ liệu người dùng thật.

### 3.5. Handoff contract phải xuất bản sớm

- `docs/contracts/api-v1.md`: endpoint, auth, model, enum, response ví dụ, pagination, error format, datetime UTC, versioning.
- `backend/openapi.json` hoặc URL `/openapi.json`: xuất bản/kiểm tra mỗi lần merge; Member 3 tạo types từ nguồn này nếu thuận tiện.
- `docs/architecture/data-integrity.md`: chi tiết chữ ký, canonicalization, leaf/Merkle, byte encoding, membership, sequence rules và golden test vectors.
- `blockchain/INTEGRATION.md` thuộc Member 2: ABI, address, chain ID, RPC, `batch_key`/`shipment_key`, event, contract permissions và xác nhận batch root.

---

## 4. Roadmap theo Phase (sắp xếp lại theo dependency)

> **Ước lượng:** 18–30 ngày công cho Member 1 tùy firmware thực tế, năng lực nhóm và tốc độ bàn giao smart contract. **Không phải lịch hẹn cố định**. Member 2/3 làm song song từ Phase 0 với mock API và golden fixtures; không chờ Member 1 làm xong toàn bộ.

| Phase | Nội dung | Ước lượng | Điều kiện để bắt đầu | Bàn giao sớm |
|---|---|---:|---|---|
| 0 | Architecture, API contract, crypto/hash contract | 2–3 ngày | Roadmap + repo hiện có | API v1 draft, golden fixture spec |
| 1 | ESP32 signed telemetry, simulator | 2–4 ngày | Phase 0 signed payload | Payload/firmware test vectors |
| 2 | FastAPI device verification, anti-replay | 2–3 ngày | Phase 0, firmware có thể mock | Device API, signed ingest |
| 3 | MySQL persistence + shipments + GPS mô phỏng | 2–3 ngày | Phase 2 baseline | OpenAPI + seed API cho Frontend |
| 4 | Integrity Service + Merkle batches | 2–4 ngày | Phase 3 dữ liệu ổn định | Batch hashing fixture cho Member 2 |
| 5 | Blockchain adapter + anchoring | 2–3 ngày | Phase 4 + Member 2 ABI/address | Anchor/verify API |
| 6 | Violation detection + Insurance integration | 2–3 ngày | Phase 3 + evidence/adapter; chuẩn ABI Member 2 | Event/payout state API |
| 7 | Render deployment + security hardening | 2–3 ngày | API/MySQL ổn định; có thể deploy skeleton từ Phase 3 | Public API URL cho Member 3 |
| 8 | E2E/QA/demo/release handoff | 2–4 ngày | Phases 1–7 + Member 2/3 đã tích hợp | Demo checklist, logs, runbook |

### Phase 0 — API Contract & Architecture

**Việc cần làm**

- [ ] Kiểm tra cấu trúc repo/những phần đã có trước khi sửa code. Tạo nhánh `feat/iot-backend`; giữ `device/`, `backend/`, `blockchain/`, `frontend/`, `docs/` và owner như cũ.
- [ ] Chốt stack **FastAPI + ESP32 + external MySQL + Web3 adapter + Render**; chọn phiên bản Python/Arduino core/mbedTLS/driver MySQL để đảm bảo chạy được.
- [ ] Khóa `SIGNED-TELEMETRY-v1`: các field, scaled integer, ECDSA P-256 SHA-256, DER/Base64, public key PEM, UTC timestamp, signed canonical projection.
- [ ] Khóa `MERKLE-v1`: canonical record, leaf/node prefixes, odd-node rule, root bytes32, batch membership, sort order, empty batch.
- [ ] Làm 2–3 golden fixtures: một mẫu ký đúng, một mẫu sai chữ ký, một batch 1/2/3 leaf kèm expected root. Chia sẻ Member 2.
- [ ] Tạo/cập nhật `docs/contracts/api-v1.md`, schema và enum; thống nhất `shipment_key`, `batch_key`, oracle/anchorer address cùng Member 2.
- [ ] Thỏa thuận CORS origin dự kiến và error/status mà Member 3 sẽ sử dụng; phát hành mock JSON/seed fixtures trước khi Backend hoàn chỉnh.
- [ ] Chốt xử lý sequence sau reboot, gap, offline, thời lượng vi phạm, anchoring pending và **policy có cần anchored evidence trước payout**; ghi thành quyết định kiến trúc.

**Definition of Done**

- [ ] Member 2 xác nhận hash bytes/ABI kỳ vọng; Member 3 xác nhận OpenAPI/schema v1.
- [ ] Golden fixture có expected canonical UTF-8/hex + SHA-256 + expected Merkle root; không còn chỗ mô tả mơ hồ về hash.
- [ ] Phân công owner và quy trình đổi contract được đồng thuận; không suy đoán schema từ các phía.

### Phase 1 — ESP32 Signed Telemetry & Simulator

**Việc cần làm**

- [ ] Xác nhận model ESP32 và cảm biến nhiệt độ/độ ẩm đang có; giữ chức năng đọc nhiệt độ/độ ẩm gốc, kiểm tra `NaN`, phạm vi, lỗi cảm biến.
- [ ] Tạo `device_id` ổn định và quy trình **provision public key**: sinh/import khóa trong môi trường kiểm soát, giữ private key trên thiết bị; backend chỉ nhận public key qua API admin.
- [ ] Thực hiện ECDSA P-256/SHA-256 bằng thư viện mbedTLS được hỗ trợ; tự kiểm bằng golden fixture với Python.
- [ ] Gắn `sequence_number` toàn cục theo device vào mẫu, lưu counter bền vững trước khi sử dụng; cấu hình `key_id`, `firmware_version`, `payload_version`.
- [ ] Đồng bộ thời gian NTP khi có mạng và phát `recorded_at` UTC; xử lý clock chưa đồng bộ rõ ràng, không giả giờ chính xác.
- [ ] Dựng signed canonical JSON từ scaled integers; gửi đúng payload đến REST API qua HTTPS/TLS với certificate validation (không dùng `setInsecure()` ở production).
- [ ] Thiết lập HTTP timeout, exponential backoff có giới hạn và jitter, reconnect Wi-Fi; queue có giới hạn khi offline, retry không đổi signed payload hoặc sequence.
- [ ] Viết `device/simulator/send_telemetry.py` có tạo chữ ký thật bằng **test key riêng**, hỗ trợ happy path, invalid signature, duplicate, replay, gap và reconnect; tuyệt đối không reuse private key production.
- [ ] Viết `device/README.md`, `config.example.h` dùng placeholder, quy trình key rotation/provisioning và cách nạp firmware.

**Definition of Done**

- [ ] ESP32 thật **hoặc simulator chuẩn giao thức** gửi được chuỗi mẫu đúng chữ ký; Backend Python verify được cùng canonical bytes.
- [ ] Sự cố reboot/retry không tạo sequence trùng làm thất thoát dữ liệu; queue đầy có cảnh báo/gap rõ ràng.
- [ ] Wi-Fi mật khẩu/private key không có trong Git; TLS/cert validation được kiểm tra.
- [ ] Không gửi GPS, không tự gửi `received_at`, có firmware version.

### Phase 2 — FastAPI Device Verification & Ingestion

**Việc cần làm**

- [ ] Dựng app FastAPI, dependency injection, settings, logging có request ID và `/api/v1/health`, OpenAPI `/docs` (quyền public docs theo policy).
- [ ] Tạo `devices.py`, `telemetry.py`, `signature_verification_service.py`, `telemetry_service.py`, `device_health_service.py`.
- [ ] Tạo API quản trị đăng ký thiết bị/public key, assignment, trạng thái active/revoked, key rotation; bảo vệ API admin bằng auth phù hợp.
- [ ] Triển khai validate payload/version/Decimal constraints/range và shipment association; xác minh DER/Base64 ECDSA trước khi accept.
- [ ] Chống duplicate và replay bằng unique key và transaction, xử lý HTTP retry idempotent; phát hiện sequence gap, signed heartbeat và last seen.
- [ ] Tách audit cho invalid signature, tampered payload, unknown/revoked device/key, timestamp sai lệch; không trộn vào accepted telemetry.
- [ ] Thiết kế phản hồi chuẩn cho Member 3: signature_status, last seq, gap, last heartbeat, online/offline, error code.
- [ ] Thêm API rate limit, giới hạn body size, request timeout; không log raw secret/khóa.

**Definition of Done**

- [ ] Test đúng signature được chấp nhận, sai signature bị từ chối, unknown device không thể tự tạo thiết bị.
- [ ] Retry cùng payload idempotent; cùng sequence nhưng nội dung khác trả conflict; gap/offline có chỉ báo đúng.
- [ ] `/docs` và `api-v1.md` phản ánh endpoint/enum thực tế; API trả 4xx/5xx có cấu trúc, không lộ stack trace.

### Phase 3 — MySQL Persistence, Shipments & Backend GPS Simulation

**Việc cần làm**

- [ ] Cấu hình SQLAlchemy/driver MySQL tương thích + Alembic; migration được quản lý theo phiên bản, không dựa `create_all()` để upgrade production.
- [ ] Xây dựng schema tối thiểu theo bảng dưới đây; dùng `UTC`, index/filter theo shipment/device/time, transaction và khóa unique chống race condition.
- [ ] Đảm bảo dữ liệu **accepted** được commit vào MySQL trước khi enqueue anchoring/insurance; không phụ thuộc RPC để ghi telemetry.
- [ ] Implement đầy đủ API `shipments`, `telemetry history`, `events`, `insurance status`; seed 2–3 shipment phục vụ Frontend.
- [ ] Giữ `route_simulator.py`: nội suy vị trí dự đoán được từ tọa độ gốc, gắn `backend_simulated` và `progress_pct`; không cho ESP32 ghi đè.
- [ ] Làm migration up/down an toàn, test index và kết nối lại DB khi timeout; cấu hình connection pool (`pool_pre_ping`, pool size hợp lý), TLS theo nhà cung cấp.
- [ ] Công bố API/seed trên local hoặc môi trường test cho Member 3; cập nhật README khởi tạo database một lệnh.

**Schema MySQL đề xuất**

| Bảng | Mục đích / khóa quan trọng |
|---|---|
| `devices` | `device_id` PK, status, firmware, last seen, current sequence |
| `device_keys` | `(device_id, key_id)` unique, **public key only**, effective/revoked time |
| `device_shipments` | assignment thiết bị ↔ shipment và khoảng hiệu lực |
| `shipments` | policy nhiệt độ, origin/destination, cargo, insured amount |
| `telemetry` | sample ID, `(device_id, sequence_number)` unique, signature, scaled values, `recorded_at`, authoritative `received_at`, raw/normalized payload |
| `telemetry_rejections` | audit lý do invalid, giới hạn PII/payload và retention |
| `device_heartbeats` | thời điểm nhận, heartbeat counter/nonce, xác minh |
| `sequence_gaps` | device, từ sequence nào đến sequence nào, detected/resolved status |
| `integrity_batches` | batch metadata, membership sealed, root, anchor/verification status |
| `integrity_batch_items` | `(batch_id, telemetry_id)` unique, `leaf_index`, `leaf_hash` |
| `blockchain_transactions` | kind, idempotency key, tx hash, nonce, chain ID, receipt, retry count |
| `shipment_events` | gap/violation/integrity/insurance events và audit timestamp |
| `insurance_policies` | policy, beneficiary/reference, trạng thái và liên kết contract |
| `insurance_triggers` | evidence ID unique, business event, payout status |
| `integration_outbox` | tác vụ anchor/insurance bền vững, retry/backoff, trạng thái |

**Index tối thiểu:** `(shipment_id, received_at)`, `(device_id, received_at)`, unique `(device_id, sequence_number)`, `(batch_id, leaf_index)`, `(anchor_status, created_at)`, `(kind, idempotency_key)`, `(shipment_id, event_type, created_at)`. Kiểu dữ liệu monetary/Decimal phải được xác định rõ; không dùng float cho số tiền.

**Definition of Done**

- [ ] MySQL local/test hoạt động với migration từ database rỗng; các bản ghi giữ nguyên khi restart Backend.
- [ ] Tạo/truy vấn shipment; telemetry có `received_at`, chữ ký và key_id; query có phân trang.
- [ ] GPS mô phỏng đi theo tuyến, không bị client override, có nhãn đúng nguồn dữ liệu.
- [ ] Member 3 nhận được seed data + OpenAPI để dựng Dashboard mà không cần Blockchain hoàn tất.

### Phase 4 — Integrity Service & Data Batch Hashing

**Việc cần làm**

- [ ] Implement `integrity_service.py`, `batch_service.py` theo `MERKLE-v1`: canonical record, leaf SHA-256, sort/index và Merkle root bất biến.
- [ ] Batch tối đa 100 mẫu hoặc 5 phút (cấu hình), không gộp nhiều device/shipment; xử lý batch nhỏ khi gián đoạn, không cần đủ 100 mẫu mới đóng.
- [ ] `SEALED` batch + membership + Merkle root lưu **atomically** tại DB; trạng thái `NOT_READY/PENDING` rõ ràng.
- [ ] Phát hành `BatchReadyToAnchor` vào durable `integration_outbox`, worker/dispatcher idempotent, không gửi giao dịch trực tiếp từ transaction DB chưa commit.
- [ ] API list/detail/verify batch; kiểm tra lại canonical bytes từ dữ liệu MySQL so với root đã sealed; nếu root đã anchor thì tiếp tục đối chiếu on-chain.
- [ ] Tạo tamper simulation có kiểm soát trên DB demo và phát `DATA_INTEGRITY_FAILED`/audit khi tính lại root khác.
- [ ] Xuất fixture 1, 2, 3 và số lẻ nhiều leaf cho Member 2; làm cross-language hash test.
- [ ] Chốt cơ chế lưu hash và metadata nếu root byte trùng ở batch khác: **batch identity riêng**, không coi root trùng là cùng batch hợp lệ.

**Definition of Done**

- [ ] Với cùng bản ghi và sort rule, tính lại root cho ra cùng 32 bytes; thay đổi temperature/sequence/signature/received_at làm root sai.
- [ ] Batches không thay đổi membership sau `SEALED`; batch rỗng không anchor; API trả đầy đủ metadata.
- [ ] Member 2 nhận được canonical fixtures và root để thử trên Contract; dữ liệu tamper được phát hiện.

### Phase 5 — Blockchain Adapter, Batch Anchoring & On-chain Verification

**Điều kiện bên ngoài:** Member 2 bàn giao **Data Integrity Contract ABI, Insurance Contract ABI, contract addresses, RPC, chain ID, event definitions, `batch_key`/`shipment_key` encoding, authorized anchorer/oracle, script deploy và `blockchain/INTEGRATION.md`**. Có thể viết mock adapter trước nhưng không gọi hợp đồng thật bằng tham số tự đoán.

**Việc cần làm**

- [ ] Viết `backend/app/integrations/blockchain_adapter.py` có interface tách `anchor_batch`, `get_batch`, `verify_batch`, `report_violation`, `get_tx_receipt`, `read_events`.
- [ ] Kết nối Data Integrity Contract để `anchorBatch(...)` và so sánh `bytes32` root; check sender role, chain ID/ABI/address đúng môi trường.
- [ ] Persist transaction lifecycle `PREPARED → SUBMITTED → MINED_SUCCESS/FAILED → CONFIRMED` và chuyển thành các `anchor_status` được publish qua API.
- [ ] Khi RPC timeout không rõ tx đã phát đi chưa, kiểm tra tx hash / nonce / trạng thái `batch_key` trên chain **trước khi gửi lại**. Đảm bảo 1 batch chỉ anchor một lần trên chain, tránh nonce race bằng queue/lock phù hợp.
- [ ] Chờ receipt `status=1` + đọc root/event contract + số confirmations được chốt; **không** coi `tx_hash != null` là `DATA_ANCHORED`.
- [ ] Bảo toàn outbox khi Render restart; retry exponential backoff, dead-letter/manual replay có auth, log lỗi không kèm private key.
- [ ] Khi đã anchor, endpoint verify đối chiếu root tính lại, stored root và root lấy on-chain; sinh cảnh báo nếu bất kỳ bước kiểm tra nào không khớp.
- [ ] Cho phép `BLOCKCHAIN_ENABLED=false` khi local dev, nhưng chỉ đánh dấu `BLOCKCHAIN_PENDING/NOT_READY`, **không** giả anchored.

**Definition of Done**

- [ ] Dùng local chain/testnet, tạo một batch → tx được xác nhận → root đọc lại khớp → `DATA_ANCHORED`.
- [ ] Cùng `batch_id` retry không sinh nhiều anchor; RPC failure/restart không mất telemetry/outbox.
- [ ] Pending/reverted/failed được thể hiện riêng; tamper sau anchor tạo `DATA_INTEGRITY_FAILED`.

### Phase 6 — Violation Detection & Insurance Contract Integration

**Việc cần làm**

- [ ] Giữ `violation_service.py` và logic ngưỡng riêng của mỗi shipment; dùng **`received_at`** theo Backend để xác định thời gian quan sát vi phạm.
- [ ] Cấu hình `max_sample_gap_seconds` và độ liên tục bằng policy; đề xuất demo 30 giây/mẫu, ngưỡng gap 90 giây, **chỉ có hiệu lực sau khi được team chốt**. Gap, offline, invalid/replay cắt mạch bằng chứng.
- [ ] Không kích hoạt trước `violation_duration_minutes = 15`; nếu nhiệt độ quay về ngưỡng trước đủ 15 phút thì reset chuỗi; tránh tạo nhiều event cho cùng một đợt vi phạm.
- [ ] Event tối thiểu: `TEMPERATURE_BREACH_STARTED`, `TEMPERATURE_BREACH_ENDED`, `SENSOR_DATA_GAP`, `DEVICE_OFFLINE`, `INSURANCE_TRIGGERED`, `INTEGRITY_MISMATCH`.
- [ ] Gắn `violation_evidence_id`, khoảng `first/last received_at`, telemetry IDs, relevant batch IDs/root/tx, tình trạng gap và policy version vào evidence.
- [ ] Đề xuất **`PAYOUT_REQUIRES_ANCHORED_EVIDENCE=true`**: nếu có bằng chứng đủ 15 phút nhưng batch còn pending, ghi `EVIDENCE_PENDING`, tiếp tục chờ/check chain, **không reportViolation/payout vội**. Nếu team chọn policy khác, phải nêu rõ hậu quả và version hóa.
- [ ] Chỉ authorized Backend Oracle gọi `reportViolation`/phương thức do Member 2 xác nhận; kiểm tra đúng beneficiary/policy, idempotent event/policy key và trạng thái đã payout.
- [ ] Phân biệt `INSURANCE_TRIGGERED` (đủ điều kiện nghiệp vụ), `PENDING` (giao dịch đã nộp), `CONFIRMED` (receipt + event/state khẳng định payout), `FAILED` (on-chain thất bại).
- [ ] Chạy virtual clock ở local/test để minh họa 15 phút **mà không gian lận điều kiện trên production**; test có ký số và batch giống pipeline thật.

**Definition of Done**

- [ ] 14 phút vi phạm không payout; 15 phút với dữ liệu liên tục + evidence đúng điều kiện chỉ trigger một lần.
- [ ] Sample bình thường, thiếu chuỗi, chữ ký sai, data tamper hoặc anchor pending không tự động payout.
- [ ] Testnet payout demo chỉ được ghi `CONFIRMED` khi transaction thực sự thành công và contract state/event khớp; có tx metadata đầy đủ.

### Phase 7 — Public FastAPI Deployment on Render

**Việc cần làm**

- [ ] Deploy **Render Web Service** từ `backend/` bằng Python runtime (hoặc Docker nếu repo phù hợp). Với layout đề xuất, **Root Directory = `backend`**, build `pip install -r requirements.txt` và start:

  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```

- [ ] Khóa phiên bản Python/dependencies; kiểm thử bằng đúng build/start command; lưu hướng dẫn vào `docs/deployment/render.md`.
- [ ] Tạo `/api/v1/health` trả `status`, `database`/`blockchain` ở mức `ok/degraded/unavailable` (không lộ connection string); cân nhắc `/api/v1/ready` cho DB-readiness. Cấu hình HTTP health check path thực tế trong Render.
- [ ] Cấu hình **external managed MySQL** bằng `DATABASE_URL`, connection pool nhỏ hợp lý, TLS/SSL theo provider, timeout/reconnect, migration trước khi bật phiên bản mới, backup/restore test theo gói dịch vụ.
- [ ] Secret trong **Render Environment Variables** hoặc secret management: Oracle/anchorer private key, DB credential, RPC key, admin auth secret. `.env.example` chỉ chứa placeholder; kiểm tra Git history không lộ secret.
- [ ] CORS whitelist **đúng** origin Frontend local/production, không wildcard với credentials; `APP_ENV` tách local/test/production; tắt `/api/v1/demo/*` trên public production.
- [ ] Gắn `PUBLIC_API_BASE_URL` từ URL **Render thực tế đã được cấp sau deploy**; cập nhật tài liệu + cung cấp cho Member 3. Không hardcode URL ví dụ trong build/README như thể đó là môi trường thật.
- [ ] Kiểm tra HTTPS (bao gồm ESP32 TLS), OpenAPI nếu được cho phép, health, DB migrations và ít nhất một request từ ESP32/simulator **qua URL public**.
- [ ] Kiểm tra vận hành outbox/retry khi instance restart; với Render Free, không dựa vào process memory hoặc timer sống liên tục để bảo đảm anchoring/payout. Cần đường manual retry khi demo, hoặc worker/scheduler trả phí phù hợp nếu muốn SLA.
- [ ] Đọc log deploy/khởi động/RPC/MySQL, phân biệt cold start với device offline và tránh lưu credential trong log.

**Ví dụ `.env.example` — placeholder, không chứa secret thật:**

```dotenv
APP_ENV=development
DATABASE_URL=mysql+pymysql://<user>:<password>@<host>:3306/<database>
CORS_ORIGINS=http://localhost:5173,https://<your-frontend-domain>
BLOCKCHAIN_ENABLED=false
BLOCKCHAIN_RPC_URL=<testnet-rpc-url>
BLOCKCHAIN_CHAIN_ID=<chain-id>
DATA_INTEGRITY_CONTRACT_ADDRESS=<data-integrity-address>
INSURANCE_CONTRACT_ADDRESS=<insurance-contract-address>
BACKEND_ANCHORER_PRIVATE_KEY=<set-as-secret-in-environment>
BACKEND_ORACLE_PRIVATE_KEY=<set-as-secret-in-environment>
DEVICE_REGISTRY_CONFIG=<optional-configuration-reference>
PUBLIC_API_BASE_URL=https://<your-render-service>.onrender.com/api/v1
```

> Đừng commit `.env` chứa giá trị thật. `PUBLIC_API_BASE_URL` trong ví dụ **không phải URL thực**. Tên cấu hình cuối cùng phải khớp code; tránh nhầm Oracle private key và ESP32 device key.

**Handoff cho Member 3:**

```dotenv
# frontend/.env.production — chỉ thêm sau khi có URL public thực tế
VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api/v1
```

**Giới hạn Render Free cần ghi trong tài liệu demo:** web service có thể spin down sau khoảng 15 phút không có traffic và request đầu có cold start; filesystem ephemeral, restart/deploy có thể xóa local data; không chạy 24/7 với SLA hoặc giám sát real-time nghiêm túc. **Không** dùng local SQLite/JSON file để lưu telemetry lâu dài, không dựng heartbeat giả/ping liên tục để né chính sách gói Free.

**Definition of Done**

- [ ] Có **URL public thật** do Render cấp, HTTPS hợp lệ, API health qua Internet và kết nối MySQL ngoài Render hoạt động.
- [ ] Sau deploy/restart, shipment/telemetry vẫn còn trong MySQL; không lộ secret trong response/log/git.
- [ ] Member 3 gọi được API public với CORS origin production hợp lệ và `VITE_API_BASE_URL` đúng.
- [ ] Tài liệu `render.md` ghi rõ build/start, environment, migration, health, logs, cold start và quy trình hồi phục khi RPC/DB lỗi.

### Phase 8 — End-to-End Testing, Security Review & Demo

**Việc cần làm**

- [ ] Unit test: canonicalization, signature verification, gap/replay, Merkle root, timestamp, route simulation, 15-minute policy, idempotency.
- [ ] API integration test: device registration/revocation, signed ingestion, MySQL migrations, batch membership, verify endpoint, CORS/auth/rate limit.
- [ ] Local chain/testnet test: anchor receipt + root verify, chain pending/revert/reorg nếu testnet hỗ trợ, no double payout, insurance paid event check.
- [ ] E2E cùng Member 3: toàn bộ trạng thái thiết bị, batch, anchoring, payout và cảnh báo hiện đúng; Frontend không tự suy ra verified/confirmed.
- [ ] Rehearse trên public URL và DB/demo seed riêng; có fallback simulator đã ký khi ESP32 mất mạng.
- [ ] Kiểm tra negative flows (invalid sig, duplicate, gap, offline, MySQL tamper, hash mismatch, RPC down, chain pending).
- [ ] Cập nhật README/runbook: khởi chạy local, migrate MySQL, cấu hình ESP32, deploy Render, smart contract handoff, các giới hạn demo.
- [ ] Scan repository và Git history cho `.env`, device/oracle keys, DB passwords; có quy trình thu hồi/đổi key nếu lộ.

**Definition of Done**

- [ ] Bảng test ở mục 6 chạy được và có log/screenshot hoặc output kiểm chứng; trường hợp chưa chạy phải gắn `NOT_TESTED`, không đánh dấu `PASS` tượng trưng.
- [ ] End-to-end: signed telemetry → MySQL → batch root → confirmed anchor → violation 15 phút → confirmed demo payout (trên môi trường test thích hợp).
- [ ] Repo có lệnh chạy, config mẫu, API contract, fixtures, test report và quy trình rollback/troubleshooting.

---

## 5. Thứ tự phụ thuộc và hợp đồng bàn giao với hai thành viên còn lại

### 5.1. Member 1 → Member 2 (Blockchain & Smart Contract)

Bàn giao **trước khi Member 2 chốt/triển khai contract interface**:

- [ ] Canonical signed payload v1, device identity, key format, signature verification assumptions và sequence policy.
- [ ] Canonical record/leaf hash/Merkle root **byte-level** + golden fixtures + batch metadata, `batch_id`, first/last sequence, batch membership.
- [ ] Dự thảo `anchorBatch` request, `verifyBatch/getBatch` lookup expectations và idempotency key.
- [ ] `shipment_id` / `batch_id` identity và yêu cầu encode thành `bytes32` (cần Member 2 xác nhận rule).
- [ ] Violation evidence schema, thời điểm Backend phát hiện, policy/beneficiary/oracle requirements, payout event uniqueness.
- [ ] RPC retries / receipt-confirmation semantics kỳ vọng.

**Không được** tự chọn tên method/ABI nếu Member 2 chưa xác nhận. Nếu ABI chưa có, mock adapter theo interface đã thỏa thuận.

### 5.2. Member 2 → Member 1

Yêu cầu bàn giao để mở khóa **Phase 5 và Phase 6 on-chain**:

- [ ] Data Integrity ABI, Insurance ABI, địa chỉ hai contract, network/chain ID, RPC endpoint, số confirmations/testnet.
- [ ] `anchorBatch(...)`, `getBatch/verifyBatch(...)`, `reportViolation(...)` method signature **chính xác**, tham số/ABI encode và examples.
- [ ] Quy tắc `batch_key`, `shipment_key`, `BatchAnchored`, `InsurancePaid` event schemas, role/permission của anchorer và Oracle.
- [ ] Sample tx, cách đọc receipt/event/on-chain state, replay/duplicate protection và các failure cases.
- [ ] Deployment scripts, Hardhat tests, fixtures kiểm tra root và `blockchain/INTEGRATION.md`.

**Acceptance gate:** Member 1 chạy ít nhất một anchor + readback root và một insurance flow trên local chain trước khi phụ thuộc testnet/public.

### 5.3. Member 1 → Member 3 (Frontend & QA)

Bàn giao **ngay từ Phase 0/3**, không chờ Blockchain:

- [ ] `docs/contracts/api-v1.md`, OpenAPI URL/export, example request/response/seed data.
- [ ] Type/schema cho device status, signed telemetry public view, missing sequences, integrity summary/batches và audit alerts.
- [ ] Các trạng thái `DATA_VERIFIED`, `DATA_INCOMPLETE`, `DATA_ANCHORED`, `DATA_INTEGRITY_FAILED`, `BLOCKCHAIN_PENDING`, `BLOCKCHAIN_FAILED` và payout riêng.
- [ ] Blockchain tx schema **tách anchoring tx và insurance payout tx**, kèm receipt/confirmation semantics.
- [ ] Error schema, pagination, filter, auth requirements, demo scenario matrix.
- [ ] **Render production URL thật** và CORS whitelist khi deploy thành công.

### 5.4. Member 3 → Member 1

- [ ] Feedback API/TypeScript schema khi mock và backend thực tế không khớp.
- [ ] Local/production origin cần whitelist CORS và yêu cầu Frontend environment variables.
- [ ] Trường loading/timeout/retry để UI hiển thị khi Render cold start hoặc RPC pending.
- [ ] Các kịch bản demo cần API/seed và kỳ vọng hiển thị verification/alerts.
- [ ] QA report theo test case, không sửa trực tiếp Backend nếu chưa có PR/owner review.

### 5.5. Quy tắc tránh conflict khi làm song song

- Quyền sở hữu thư mục: **Member 1: `device/`, `backend/`, `docs/contracts/api-v1.md`**; **Member 2: `blockchain/`**; **Member 3: `frontend/`**. Tài liệu chung chỉnh qua PR review.
- Thống nhất **một** source of truth về API/enums là `docs/contracts/api-v1.md` + OpenAPI, về Blockchain contract là `blockchain/INTEGRATION.md`.
- Khi schema/ABI/hash thay đổi: mở issue/PR → thông báo 2 owner còn lại → cập nhật doc/fixtures/tests trước → merge theo dependency; thay đổi breaking tăng version.
- Mỗi merge cần chạy tối thiểu lint/test phù hợp, không commit secrets và không thay sửa thư mục của người khác để “chữa cháy”.

---

## 6. Ma trận kiểm thử bắt buộc và Demo Checklist

### 6.1. Test cases: Member 1 là owner Backend, Member 3 xác nhận UI

| ID | Kịch bản | Kết quả Backend/Blockchain kỳ vọng |
|---|---|---|
| T01 | Signed telemetry hợp lệ | Signature `VALID`, lưu một mẫu MySQL, `DATA_VERIFIED`; có `received_at` |
| T02 | Sai chữ ký/unknown key | Bị từ chối; ghi audit; **không** đếm vào verified telemetry |
| T03 | Gửi lại payload đã nhận | Response idempotent; MySQL vẫn 1 sample; không nhân đôi leaf/payout |
| T04 | Cùng sequence nhưng payload khác | `409` + audit suspicious/replay; không ghi đè dữ liệu gốc |
| T05 | Sequence gap | `DATA_INCOMPLETE`, ghi missing range; không tính thời lượng vi phạm xuyên gap |
| T06 | Device offline / heartbeat timeout | Cảnh báo offline có `last_seen_at`, không suy ra nhiệt độ sai |
| T07 | Batch seal + anchor | Merkle root reproducible, receipt thành công và root trên chain khớp → `DATA_ANCHORED` |
| T08 | Batch verification | Recompute root khớp → `MATCHED`; không sửa evidence đã seal |
| T09 | Tamper bản ghi MySQL sau anchor | Recompute root lệch → `DATA_INTEGRITY_FAILED`, audit/alert |
| T10 | On-chain root khác root tính lại | Integrity mismatch; cấm dùng batch làm payout evidence hợp lệ |
| T11 | Nhiệt độ sai ngưỡng **14 phút** | Không tạo insurance trigger đủ điều kiện |
| T12 | Nhiệt độ sai ngưỡng **15 phút liên tục**, đầy đủ evidence | Một trigger hợp lệ, khi đủ policy/anchor và tx confirmed thì demo payout |
| T13 | Pending RPC / anchor transaction | `BLOCKCHAIN_PENDING`; telemetry giữ nguyên, không giả anchored/payout |
| T14 | Blockchain tx failed/reverted | `BLOCKCHAIN_FAILED`; retry có kiểm soát, không tạo duplicate |
| T15 | Retry Oracle / một breach nhiều lần | Một evidence ID/policy event, không double payout |
| T16 | ESP32 mất Wi-Fi rồi reconnect | Queue gửi lại theo sequence, duplicate idempotent, gap thể hiện nếu thiếu |
| T17 | Render restart/cold start | API có thể khởi động chậm nhưng dữ liệu MySQL còn, status không giả lập |
| T18 | Frontend CORS + public URL | Chỉ origin được cho phép; không dùng localhost trong production build |

### 6.2. Demo theo thứ tự nên trình bày

- [ ] **Mở Dashboard:** shipment hiện vị trí `backend_simulated`, policy nhiệt độ, trạng thái cảm biến và public Backend URL đang hoạt động.
- [ ] **Gửi signed telemetry:** ESP32/simulator gửi HTTPS; API trả signature hợp lệ, timestamp server, sequence tăng.
- [ ] **Chữ ký sai / duplicate / gap / offline:** hiện số liệu xác thực và cảnh báo khác nhau; không tạo payout từ dữ liệu thiếu.
- [ ] **Integrity batch:** seal batch, hiện leaf count/Merkle root, gửi anchor và trạng thái `BLOCKCHAIN_PENDING` trước receipt.
- [ ] **On-chain verify:** receipt confirmed, tra root từ contract, chuyển `DATA_ANCHORED`, verify `MATCHED`.
- [ ] **Tampering:** sửa một bản ghi trên **database demo**, tính lại root → `DATA_INTEGRITY_FAILED`, UI hiển thị alert.
- [ ] **Insurance:** phục hồi/reseed DB demo, phát chuỗi nhiệt độ vi phạm liên tục 15 phút bằng virtual clock trong test, tạo evidence được xác minh/anchor rồi gọi Oracle và xác nhận demo-token payout.
- [ ] **Giao dịch chưa thành công:** minh họa tx pending/failed khác với confirmed; explorer link chỉ lấy từ network/tx thật.
- [ ] **Khả năng phục hồi:** RPC ngắt hoặc Render restart không làm mất accepted telemetry, pending outbox còn để xử lý tiếp.

### 6.3. Điều kiện kết thúc demo

- Không dùng dữ liệu giả có nhãn “real sensor” nếu đang chạy simulator; không dùng blockchain hash để tuyên bố độ chính xác vật lý của nhiệt độ.
- Không đánh dấu `InsurancePaid` nếu chưa có receipt và bằng chứng contract thực thi payout; không sử dụng token demo như VND thật.
- Chụp kết quả ở local chain/testnet và bản ghi MySQL/API để người xem có thể đối chiếu evidence từng bước.
- Nếu một bước chưa tích hợp, trình bày minh bạch là **mock/pending** thay vì mô tả như đã chạy thực tế.

---

## 7. Security, Reliability và vận hành

### 7.1. Security checklist

- [ ] ECDSA P-256/mbedTLS chuẩn, secure RNG, không tự phát minh chữ ký/hashing; golden cross-platform tests.
- [ ] Chỉ public key ở Backend; ESP32 private key và Oracle/anchorer private key tách biệt; quản lý rotation/revocation.
- [ ] HTTPS + certificate verification trên ESP32 và Frontend; không dùng HTTP public, không disable SSL validation.
- [ ] Admin auth, permissions, validation, rate limit/body limit, CORS allowlist, hạn chế request log dữ liệu nhạy cảm.
- [ ] Unique sequence/idempotency, anomaly audit, time skew check, anti-replay, last-seen monitoring.
- [ ] Parameterized SQL/ORM, migration versioning, least-privilege DB user, connection TLS/backup/restore.
- [ ] Block explorer/event/receipt verification thay vì tin `transaction_hash` tồn tại.
- [ ] `.env.example` placeholder, secret trên Render env, `.gitignore`, key-leak review.

### 7.2. Reliability checklist

- [ ] Telemetry transaction commit trước outbox submission; không mất dữ liệu khi Blockchain/RPC lỗi.
- [ ] Database và blockchain retry tách biệt, timeout/backoff, status persisted, idempotency key, dead-letter/admin retry.
- [ ] Với Render Free không giả định in-process background worker hoạt động đều khi instance sleeping; khi cần payout tự động với độ trễ cam kết thì xem xét worker/paid service thích hợp.
- [ ] Health liveness tách khỏi readiness của MySQL; lỗi DB/RPC được giám sát nhưng không làm lộ cấu hình.
- [ ] Batch sealing/reverification có transaction và concurrency control; chống nhiều worker cùng anchor một batch.
- [ ] Log correlation IDs theo `device_id`, `shipment_id`, `batch_id`, `evidence_id`, `tx_hash` (không log secret).

---

## 8. Danh sách deliverables và trạng thái thực hiện

| Deliverable | Owner | Hoàn thành khi |
|---|---|---|
| Firmware signed telemetry + provision guide | Member 1 | Test trên board/simulator, signed fixture verified |
| Simulator nhiều kịch bản có ký số | Member 1 | Chạy T01–T06 và T16 không cần ESP32 |
| FastAPI device/shipments/telemetry API | Member 1 | OpenAPI, auth, validation, persistence và test |
| External MySQL schema + Alembic migrations | Member 1 | Fresh DB migrate/restart/restore thành công |
| Canonicalization/Merkle Service | Member 1 | Golden fixtures cùng Member 2, tamper detection |
| Blockchain Adapter 2 contract | Member 1 | On-chain anchor, verify, insurance gọi đúng ABI |
| Data Integrity Contract + Insurance Contract | **Member 2** | ABI/address/events/tests trong `blockchain/INTEGRATION.md` |
| Dashboard device/data integrity + insurance | **Member 3** | Dùng đúng REST API, QA các trạng thái |
| Public Backend Render deployment | Member 1 | URL thật/health/MySQL/CORS/HTTPS xác thực được |
| `docs/contracts/api-v1.md` | Member 1, team review | Request/response/schema/enum/failure cases khớp code |
| `docs/architecture/data-integrity.md` | Member 1, Member 2 review | Bit-level rules + Merkle fixtures + evidence policy |
| `docs/deployment/render.md` | Member 1 | Build/start/env/migration/troubleshooting/cold start |
| E2E test + demo runbook | Members 1–3 | Test matrix có minh chứng và checklist chạy lại |

**Chưa thể đánh dấu hoàn tất khi chỉ có Roadmap:** chưa có xác nhận trạng thái code/repository, board/Arduino core, hợp đồng Smart Contract thực tế, MySQL provider, URL Render và Frontend origin. Không đưa ví dụ placeholder vào tài liệu như thành tích đã triển khai.

## 9. Các quyết định còn cần xác nhận / blockers trước khi thực thi

1. **Phần cứng:** model ESP32, Arduino core/mbedTLS version, cảm biến nào là nguồn `temperature_c`/`humidity_pct`, có NVS/secure element/flash encryption hay không.
2. **Crypto:** fixture P-256 DER/Base64 trên firmware thật đã verify được với Python hay chưa; key provisioning và thời điểm revoke/rotate.
3. **Canonicalization/Hash:** Members 1–2 xác nhận `SIGNED-TELEMETRY-v1`, `MERKLE-v1`, `bytes32` `batch_key` và danh sách field được hash; không cho thay đổi ngầm.
4. **Insurance evidence:** cả nhóm chốt `PAYOUT_REQUIRES_ANCHORED_EVIDENCE`, cách xử lý nếu vi phạm 15 phút nhưng một batch chưa anchor/verify được, max allowed gap.
5. **Chain:** Member 2 cung cấp 2 ABI, address, event, RPC, chain ID, oracle/anchorer role, confirmations và giá trị demo token.
6. **Production:** chọn external MySQL provider, vùng triển khai, TLS, backup, budget Render, domain thực tế/CORS; Free chỉ phù hợp demo, không phải monitoring SLA.
7. **Repository:** sau khi có đủ 3 Roadmap và cây code, kiểm tra xung đột/giao diện thực tế trước khi merge. Roadmap NTK này không tự khẳng định đã được đồng bộ với hai Roadmap chưa cung cấp trong lượt chỉnh sửa.

---

## 10. Quy tắc làm việc và nghiệm thu chung

- Chỉ sửa phần mình sở hữu; đề xuất thay đổi contract/UI qua issue/PR cho đúng owner.
- Commit nhỏ theo Phase; mỗi Phase chỉ kết thúc khi **Definition of Done** được chạy thử và minh chứng được lưu lại.
- Version hóa protocol ký, canonicalization, hash, ABI và API; thay đổi breaking phải có migration/compatibility plan.
- Duy trì seed fixtures, test records và deployment runbook; tách `local`, `testnet/demo` và `production`.
- Mọi báo cáo trạng thái phải phân biệt rõ **PLANNED / IN_PROGRESS / TESTED / DEPLOYED / BLOCKED**; không đồng nhất “viết xong Roadmap” với “đã triển khai”.

### Tài liệu tham khảo triển khai Render

- Render — Deploy a FastAPI App: https://render.com/docs/deploy-fastapi
- Render — Health Checks: https://render.com/docs/health-checks
- Render — Deploy for Free / ephemeral filesystem / cold start: https://render.com/docs/free

*Roadmap này cập nhật nội dung gốc của NTK theo prompt kiến trúc mới, giữ nguyên phân công Member 1 và các yêu cầu cốt lõi. Chỉ tạo/chỉnh sửa **một file Markdown Roadmap** trong lượt này; những file tài liệu và mã nguồn được nêu là deliverables cho giai đoạn triển khai sau.*
