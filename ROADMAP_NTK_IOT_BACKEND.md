# ROADMAP THÀNH VIÊN 1 — IoT, Backend và Điều phối hệ thống

> **Dự án:** `smart-coldchain-insurance`  
> **Thành viên:** NTK — Member 1: IoT & Backend, đầu mối tích hợp hệ thống  
> **Owner:** `device/`, `backend/`, `docs/contracts/api-v1.md`; chủ trì tài liệu kiến trúc dữ liệu và triển khai Backend  
> **Trạng thái:** Roadmap triển khai được đề xuất; **không** có nghĩa các tính năng đã được lập trình hoặc deploy.  
> **Mục tiêu nâng cấp:** **IoT Data Integrity + Blockchain Data Anchoring + Smart Contract Insurance + Public FastAPI Backend on Render**.

> **Cập nhật kiến trúc 2026-11-18:** Firmware dùng `SIGNED-TELEMETRY-v2` không chứa `shipment_id`; Backend resolve assignment active trong MySQL. Decoder v1 và golden vector v1 được giữ để tương thích dữ liệu/client cũ; `MERKLE-v1` không đổi.
> **Tiến độ Backend tiếp theo:** Phase 2 **IN_PROGRESS**. Đã có API admin đăng ký/revoke device key/assignment và tiếp nhận signed telemetry với duplicate/replay/gap audit; production từ chối payload chưa ký. Alembic revision `20261105_01` nâng schema trên DB nền hiện có; có body limit, rate limit theo thiết bị, request ID và device status suy ra từ `last_seen_at`. Chưa có signed heartbeat, giới hạn theo IP ở gateway, batch anchoring hoặc payout evidence gate; không dùng kết quả hiện tại để tuyên bố hoàn tất Phase 2.
> **Cập nhật 2026-11-08 — Phase 1 IN_PROGRESS:** Đã bổ sung simulator ký P-256 thật với các kịch bản happy/invalid/duplicate/replay/gap/reconnect; test tương thích với Backend pass. Sketch đã chuyển Wi-Fi/private key/CA sang `config.h` bị Git bỏ qua và dùng `setCACert()` thay `setInsecure()`. Chưa cross-test trên board ESP32, chưa có queue bền vững khi mất mạng. Credential/key từng được commit phải được đổi/revoke; xóa khỏi bản hiện tại không xóa Git history. Không đánh dấu Phase 1 hoàn tất.
> **Cập nhật 2026-11-09 — Phase 4 IN_PROGRESS/LOCAL_TESTED:** Đã thêm Alembic `20261109_02`, bảng batch/item/outbox, auto/manual sealing theo cặp shipment/device, membership bất biến, API summary/list/detail/verify và tamper alert `INTEGRITY_MISMATCH`. Bộ Backend pass `63`, Hardhat pass `66` gồm golden vector/E2E contract. Chưa áp dụng migration lên MySQL production và chưa dispatch outbox tới `ColdChainDataIntegrity`; anchoring/readback thuộc Phase 5 nên chưa đánh dấu Phase 4/5 hoàn tất trên môi trường deploy.
> **Cập nhật 2026-11-11 — Phase 5 LOCAL_TESTED:** Backend đã có adapter `ColdChainDataIntegrity`, signer anchorer riêng, dispatcher outbox idempotent, persist signed transaction trước broadcast, receipt/confirmation handling, on-chain metadata readback và API admin retry. E2E local Hardhat `signed telemetry → sealed batch → anchorBatch → receipt → getBatch/verify` pass; RPC-timeout reconciliation và mismatch fail-closed có test. Chưa deploy contract/address/signer lên testnet/Render và chưa chạy migration Phase 4 trên MySQL production, nên Phase 5 chưa `DEPLOYED`.
> **Cập nhật 2026-11-13 — Phase 6 LOCAL_TESTED:** Đã nối evidence gate mặc định `PAYOUT_REQUIRES_ANCHORED_EVIDENCE=true`: signed telemetry liên tục theo `received_at`, không gap, đủ thời lượng, toàn bộ batch `MATCHED + DATA_ANCHORED` và on-chain readback khớp mới được gọi Insurance Oracle. Event lưu evidence ID, telemetry IDs, batch/root/anchor tx, policy/gap/status; có admin/CLI reconcile idempotent. Unit test chặn payout ở 14 phút, anchor pending và tamper; E2E Hardhat `signed telemetry → multi-batch anchors → evidence verify → reportViolation → paid` pass. Chưa chạy testnet/Render/MySQL production và chưa có worker định kỳ cho offline/retry, nên Phase 6 chưa `DEPLOYED`.
> **Cập nhật 2026-11-15 — Phase 7 DEPLOYMENT_READY/LOCAL_TESTED:** Backend đã hỗ trợ `DATABASE_URL` MySQL ưu tiên, pool/timeout/TLS, production guard cho admin secret và CORS, tắt demo theo `APP_ENV`, liveness `/health` và DB-readiness `/ready` không lộ cấu hình. Dependency trực tiếp đã khóa phiên bản; Blueprint chạy migration idempotent trước Uvicorn và runbook Render đã được cập nhật theo giới hạn Free service. Bộ Backend pass `71`, skip `3` trên Python 3.13 với đúng requirements đã khóa. Chưa có external MySQL credential, URL Render thật, public HTTPS/simulator smoke test, restart-persistence/CORS test hoặc testnet contract, nên Phase 7 chưa `DEPLOYED`.

> **Điều chỉnh thiết kế demo 2026-11-15:** Đồng bộ với [roadmap NTD](ROADMAP_NTD_BLOCKCHAIN_SMART_CONTRACT.md) và [roadmap TTDK](ROADMAP_TTDK_FRONTEND_QA.md). Tách đăng ký thiết bị, tạo chuyến hàng, gán chuyến và cấp khóa thành các bước độc lập. Đây là **công việc đề xuất bổ sung**, chưa triển khai trong lượt sửa tài liệu; giữ nguyên tiến độ và checkbox đã có. Các kết quả test ở trên là lịch sử được giữ lại, không phải kết quả chạy lại lần này.

> **Thiết kế mục tiêu 2026-11-15 — PLANNED, chưa triển khai:** **Remix IDE → Ethereum Sepolia (`11155111`) ← Alchemy HTTPS RPC ← Python Web3.py**, cùng **một Admin trong Backend environment → login → JWT Bearer**. Hardhat/chain `31337`, scripts và kết quả local ở các cập nhật/checkbox lịch sử chỉ là **legacy**, không phải quy trình chạy mới hoặc bằng chứng Sepolia. Không xóa source/tests/artifacts cũ; không tăng trạng thái hoàn thành từ việc sửa roadmap. Phạm vi lượt này chỉ là ba roadmap; `.env`, runtime settings, API/client, dependencies và runbook thực thi cần được NTK/NTD/TTDK cập nhật theo các Phase bên dưới.

**Stack thống nhất:** ESP32 + DHT22 / Arduino C++ → REST/HTTPS → FastAPI trên Render → MySQL → SHA-256 / `MERKLE-v1` → Web3.py → Alchemy RPC → Ethereum Sepolia; Solidity được compile/test/deploy bằng Remix. React Vite chỉ gọi FastAPI. Alchemy là RPC provider, không lưu telemetry và không phải một blockchain riêng. Không cần Node.js cho công việc Smart Contract; Node.js vẫn dùng cho React Vite.

### Quy trình demo thống nhất giữa ba thành viên

**Admin đăng nhập → nhận JWT → đăng ký thiết bị → đăng ký chuyến hàng → liên kết thiết bị với chuyến hàng → cấp khóa cho ESP32 → ESP32 ký và gửi dữ liệu → Backend xác minh bằng Public Key → MySQL → Merkle Root → Web3.py → Alchemy RPC → Ethereum Sepolia → Insurance.**

- **Device ID:** `device_id = "ESP32-001"`; thêm `device_name = "Cold Chain Sensor 01"`. Đăng ký chỉ cần hai trường này, chưa cần khóa hoặc chuyến hàng.
- **Shipment ID trên giao diện:** mã người dùng nhập `SHIP-001` ánh xạ vào trường **`code`** hiện có. Backend tiếp tục tạo **`id` UUID v4 chữ thường**; UUID này là `shipment_id` trong path, assignment, firmware, signed payload và `shipmentKey`. Không đổi giao thức ký để đưa `SHIP-001` vào trường UUID.
- **Quan hệ:** mỗi thiết bị có tối đa **một assignment `active=true`**, một chuyến được gán nhiều thiết bị. Muốn đổi chuyến, bỏ gán cũ (`active=false`) rồi gán mới; không tự sửa dữ liệu lịch sử hay reset sequence.
- **Cấp khóa:** script Python trên máy tin cậy tạo một cặp **ECDSA P-256 + SHA-256** riêng cho mỗi thiết bị, ghi private key vào `device/cold_chain_device/config.h`, nạp USB; chỉ gửi public key SPKI PEM và `key_id` tới API admin. Không có PKI, chứng chỉ thiết bị, OTA hay cấp khóa từ xa trong demo.
- **Điều kiện gửi hợp lệ:** device đã đăng ký và `active`, shipment tồn tại, assignment tương ứng đang active, `key_id` thuộc device và còn active, chữ ký/format đúng, sequence hợp lệ. Có public key trong DB chưa chứng minh ESP32 đã được nạp đúng khóa; cần một mẫu ký thật được Backend xác minh.
- **Giữ nguyên:** DHT22 → HTTPS → FastAPI → MySQL → `MERKLE-v1` → Data Integrity Contract; Backend là Oracle/Blockchain Adapter và Insurance Contract xử lý bảo hiểm. Khóa ESP32 và từng mẫu cảm biến không lên Blockchain.

### Đối chiếu code hiện có và phần cần làm

Kiểm tra tĩnh tại `backend/app/api/routes.py`, `schemas/api.py`, `models/entities.py`, `services/signed_ingestion.py`, `services/telemetry_protocol.py` và `device/`; **không xác nhận môi trường deploy bằng việc đọc code**.

| Hạng mục | Code hiện có | Thay đổi đề xuất trong roadmap |
|---|---|---|
| Đăng ký device | `POST /devices` đã nhận `device_id` + `device_name` | Giữ DTO và các bước key/assignment độc lập; chuyển dependency sang JWT |
| Danh sách device | Đã có `GET /devices`, gồm tên/key status/chuyến hiện gán | Giữ view; xác minh với MySQL và JWT, không suy ra đã deploy |
| Cấp public key | Có `POST /devices/{device_id}/keys`, body `key_id`, `public_key_pem`; auth API key là baseline cũ | Tái sử dụng endpoint, thay auth bằng JWT; không thêm `/public-key` hoặc `/keys/rotate` |
| Liên kết | Có `/assignments`, khóa dòng và xử lý `DEVICE_ALREADY_ASSIGNED` | Giữ transaction/constraint, thay auth; không thêm `/assign` |
| Shipment | Có create/list/detail, `code` unique và `id` UUID; create đã dùng `AdminSession` | Thay nội dung dependency sang JWT; mở rộng bảo vệ cả monitoring Admin |
| MySQL | Đã có tên device và migration `20261115_03` với unique active assignment | Tái sử dụng migration, kiểm chứng trên MySQL; không thêm bảng user chỉ để lưu Admin |
| Firmware/simulator | Có `config.example.h`, `.gitignore` cho `config.h`, P-256 signed simulator; README tạo khóa bằng đoạn Python thủ công | Bổ sung script provisioning tái sử dụng và hướng dẫn theo trình tự mới; board cross-test vẫn chưa được xác nhận |
| Auth / Blockchain | Settings vẫn đọc `ADMIN_API_KEY`/`X-Admin-Key`, mặc định localhost/`31337`; chưa có login JWT | Chuyển đồng bộ settings/routes/tests/client/runbook sang JWT + Sepolia/Alchemy; giữ lịch sử local |

Request/response và lỗi mục tiêu nằm ở **§3**; migration nằm ở **Phase 3**. Tài liệu `api-v1.md` hiện có một số đoạn tiến độ cũ, nên khi triển khai phải cập nhật cùng OpenAPI theo code thực tế, không coi mọi endpoint trong roadmap đã chạy.

---

## 1. Phạm vi và ranh giới sở hữu

### 1.1. Bạn chịu trách nhiệm

- **ESP32:** đọc nhiệt độ/độ ẩm, định danh thiết bị, quản lý khóa ký, đánh số thứ tự mẫu, ký telemetry, gửi HTTPS, retry/reconnect và bộ đệm khi offline.
- **FastAPI:** API admin đăng ký thiết bị bằng ID/tên, tạo chuyến bằng mã nghiệp vụ, gán thiết bị và đăng ký public key riêng; xác minh chữ ký và quan hệ Device–Shipment; phát hiện replay/duplicate, sequence gap, mất tín hiệu; lưu dữ liệu hợp lệ và audit sự kiện bị từ chối.
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
│   ├── cold_chain_device/
│   │   ├── cold_chain_device.ino
│   │   └── config.example.h
│   ├── provisioning/
│   │   └── provision_device.py       # Đề xuất mới: sinh khóa local + đăng ký public key
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

**Nguyên tắc:** dùng cấu trúc hiện có, không tách lại các module Backend chỉ để giống cây tham chiếu. Sketch thực tế ở `device/cold_chain_device/`; `provisioning/provision_device.py` là deliverable đề xuất chưa có trong repo. Cây trên không phải danh sách tính năng đã triển khai.

## 2. Kiến trúc và quy ước kỹ thuật bắt buộc

### 2.1. Luồng dữ liệu mục tiêu

```text
Admin → POST /auth/login → JWT Bearer → register device (ID/name) → create shipment (code → UUID)
  → assign device to shipment → trusted Python provisioning → USB flash ESP32
  → register public key only in MySQL via admin API

ESP32 + DHT22
  └─ HTTPS + Signed Telemetry + device_id + shipment_id (UUID) + key_id + sequence_number + recorded_at
      ↓
Public FastAPI Backend (Render)
  ├─ Find registered active device / check active shipment assignment
  ├─ Lookup active public key / verify ECDSA signature + payload
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
  ├─ Outbox → Python Web3.py → Alchemy HTTPS RPC → Data Integrity Contract on Sepolia
  └─ Receipt / on-chain hash verification / tamper alerts
      ↓
Ethereum Sepolia, chain ID 11155111 (batch commitments only; deploy bằng Remix + MetaMask)

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
| Chain / contract | Ethereum Sepolia `11155111`, Alchemy HTTPS RPC; ABI/address từ deployment Remix đã xác nhận, confirmations cấu hình rõ | Member 2 bàn giao; Member 1 tạo Alchemy app |
| Admin auth | Một Admin từ `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET_KEY`; JWT Access Token, không bảng users/roles/refresh session | Member 1, Member 3 tích hợp |
| Render / MySQL | Render Web Service công khai + external managed MySQL; chọn nhà cung cấp MySQL thực tế trước Phase 7 | Member 1 |

Nếu thuật toán/thư viện ký số không phù hợp với ESP32 thật, phải mở quyết định kỹ thuật và cập nhật **cả** firmware, API, fixture, tài liệu; không âm thầm thay đổi giao thức.

### 2.4. Signed Telemetry v2 — định dạng hiện tại

`POST /api/v1/devices/{device_id}/telemetry`

```json
{
  "payload_version": 2,
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
- Payload không có `shipment_id`. `sequence_number` tăng theo **device**, không reset khi đổi shipment hoặc reboot; trạng thái được lưu trong NVS/secure storage của ESP32.
- `recorded_at` dùng định dạng UTC `YYYY-MM-DDTHH:mm:ssZ` với đồng hồ đã đồng bộ nếu có thể; không cho thiết bị tự định nghĩa `received_at`. Backend tự ghi `received_at` và cảnh báo lệch giờ.
- `firmware_version`, `payload_version`, `key_id` **nằm trong nội dung được ký**. Backend khóa device, xác minh chữ ký rồi lấy assignment active từ MySQL và gắn `shipment_id` vào accepted record.
- Device registration do API quản trị được xác thực thực hiện; **ESP32 không được tự đăng ký key mới tùy ý** khi đang gửi telemetry.

**Quy tắc canonicalization ký số — `SIGNED-TELEMETRY-v2`:**

1. Backend/ESP32 xây dựng một object **chỉ** có các field bên dưới, bỏ `signature`, các số float hiển thị và mọi field do server sinh.
2. Sử dụng thứ tự key ASCII **tăng dần**, UTF-8, JSON compact không whitespace, escape string theo JSON; IDs/key/firmware/timestamp giới hạn ASCII và pattern đã chốt để tránh khác biệt Unicode. Numeric **chỉ là integer thập phân**, không dấu `+`, không leading zero, không scientific notation.
3. Tạo đúng một byte sequence; dùng **SHA-256 của bytes** trong ECDSA P-256; truyền chữ ký ở `signature` (Base64 của DER). Backend **tạo lại bytes từ field chuẩn hóa**, không tin thứ tự key/body gốc.
4. Ghi golden fixture gồm canonical bytes (UTF-8/hex), public key, input request và expected verification result; **bắt buộc thử ký trên ESP32 và verify bằng Python** trước khi chốt.

Canonical JSON projection minh họa:

```json
{"device_id":"ESP32-001","firmware_version":"1.0.0","humidity_milli_pct":80000,"key_id":"key-v1","payload_version":2,"recorded_at":"2026-11-04T10:30:00Z","sequence_number":1524,"temperature_milli_c":12500}
```

> **Ghi chú triển khai:** profile canonical này là giao thức v2 của dự án (object cố định, không số thực), **không** tuyên bố là triển khai đầy đủ RFC 8785/JCS. Backend vẫn đọc v1 ở endpoint shipment cũ để tương thích. Nếu muốn thay bằng JCS, phải chốt lại và cập nhật tất cả golden fixtures trước khi triển khai.

**Chu trình tiếp nhận bắt buộc:** validate payload/path → kiểm tra thiết bị đang active / `key_id` hợp lệ → verify chữ ký → khóa và đọc assignment active → kiểm tra `(device_id, sequence_number)` → phân loại duplicate/gap/replay → gắn `shipment_id`, lưu accepted telemetry + `received_at` trong transaction → tạo sự kiện/outbox. Đầu vào bị từ chối chỉ được ghi **audit có kiểm soát**, không trở thành accepted/verified telemetry.

### 2.5. Chính sách sequence, offline và dữ liệu đáng tin cậy

- Unique constraint `(device_id, sequence_number)`. Retry cùng số thứ tự **và cùng canonical signed content** trả response idempotent (`duplicate=true`, không chèn mẫu mới). Cùng sequence nhưng payload khác → **409 conflict**, audit suspicious/replay.
- Sequence lớn hơn số đã nhận tạo **gap range**; đánh dấu `DATA_INCOMPLETE` cho khoảng liên quan và không tính liên tục nhiệt độ xuyên qua khoảng thiếu. Nếu nhận dữ liệu trễ, không tự viết lại kết luận/payout đã xác nhận; có quy trình đối soát rõ ràng và audit.
- ESP32 nên gửi hàng đợi theo sequence tăng dần; lưu tăng sequence vào NVS **trước khi dùng số đó** để giảm rủi ro tái sử dụng khi mất điện. Giới hạn dung lượng queue, tuổi dữ liệu và số lần retry; chấp nhận có gap nếu tràn queue, không âm thầm bỏ mất số.
- Offline được xác định theo thời gian từ **lần cuối Backend nhận telemetry/heartbeat hợp lệ** với ngưỡng cấu hình. Heartbeat dùng chữ ký/nonce hoặc bộ đếm **riêng**; không sử dụng cùng sequence telemetry khiến báo gap giả.
- Trạng thái offline khi service Render Free đang ngủ không đủ để suy luận chắc chắn thiết bị lỗi. UI cần phân biệt `last_seen_at`, `telemetry_gap`, và `backend_availability` khi đủ dữ liệu.
- **Không dùng `recorded_at` của gói đến trễ để tự bù thời lượng vi phạm 15 phút**; những gói đó có thể hữu ích cho phân tích/audit nhưng không tạo bằng chứng quan sát liên tục bởi Backend.
- Giữ `key_id` bắt buộc như protocol hiện có; demo chỉ cần một key active cho mỗi thiết bị. Tái sử dụng API revoke/add key hiện có khi khóa lộ, không cần màn hình rotation hoặc dịch vụ quản lý vòng đời khóa. Private key được nạp qua `config.h`/USB; flash/NVS thông thường vẫn có rủi ro bị trích xuất khi truy cập vật lý.

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

Đây là nhóm ý nghĩa/nhãn UI, không yêu cầu đổi enum API hiện có. `completeness_status` trên telemetry hiện chỉ `COMPLETE/DATA_INCOMPLETE`; `UNKNOWN/ONLINE/OFFLINE` lấy từ `telemetry_status` ở health theo shipment. `DATA_VERIFIED` là nhãn cho mẫu được Backend chấp nhận với chữ ký hợp lệ, không phải field bắt buộc mới. Payout wire enum/mapping và nguồn transaction hiện có xem §3.3.

---

## 3. Hợp đồng REST API và dữ liệu dùng chung — khóa từ Phase 0

Member 1 cập nhật `docs/contracts/api-v1.md` và OpenAPI khi triển khai. Bảng dưới phân biệt **route đã có trong code** với **thay đổi đề xuất**, chưa xác nhận deploy. API dùng prefix `/api/v1`; request/response tối thiểu cho quy trình mới ở §3.6 là contract mục tiêu chung cho ba roadmap.

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

Admin nhập **mã chuyến `SHIP-001` vào `code`**, không truyền `id`. Backend trả `201` cùng ShipmentDetail với `id` UUID v4; ví dụ `8b4fb8a2-2996-4da2-90b9-35019517f56f`. Dùng UUID trả về cho mọi path/assignment/firmware/telemetry và `shipmentKey`; UI luôn hiển thị `code` dễ đọc. Tạo shipment chỉ lưu policy nghiệp vụ trong MySQL, **không tự tạo policy đã fund trên chain**; NTD/NTK tiếp tục dùng seed/quy trình `createPolicy` hiện có với cùng UUID.

Backend validate min/max, thời lượng và số tiền; giữ `cargo_type` và origin/destination có tọa độ theo DTO hiện có. UI có thể cung cấp lựa chọn điểm đi/đến mẫu để giảm nhập liệu, vẫn gửi đủ DTO, không thêm dịch vụ bản đồ mới. Chỉ sử dụng `location_source: "backend_simulated"`; chưa có telemetry thì `latest_telemetry` và `location` là `null`.

### 3.2. Danh sách endpoint chuẩn

| Method | Endpoint | Nguồn gọi / mục đích | Hiện trạng → công việc đề xuất |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Username/password của duy nhất Admin | **API mới, PLANNED**, trả JWT; giới hạn thử đăng nhập |
| `POST` | `/api/v1/devices` | **Admin UI:** `device_id`, `device_name` | Có DTO độc lập; chuyển auth sang JWT |
| `GET` | `/api/v1/devices` | **Admin UI:** mọi device, tên, trạng thái key và chuyến hiện gán | Đã có trong code; chuyển auth sang JWT |
| `POST` | `/api/v1/shipments` | **Admin UI:** `code` + thông tin/policy, trả `id` UUID | Có `AdminSession`; thay API-key dependency bằng JWT |
| `GET` | `/api/v1/shipments` | Danh sách chuyến `{items, total}` | Có; giữ nguyên |
| `POST` | `/api/v1/devices/{device_id}/assignments` | **Admin UI:** `{shipment_id, active}` | Có; chặn nhiều assignment active, bảo đảm idempotent |
| `POST` | `/api/v1/devices/{device_id}/keys` | **Script trên máy tin cậy:** `{key_id, public_key_pem}` | Có; dùng cho cấp khóa ban đầu sau đăng ký |
| `POST` | `/api/v1/devices/{device_id}/telemetry` | **ESP32/simulator:** signed payload v2 không có shipment ID | Backend tự resolve assignment active rồi kiểm tra sequence |
| `GET` | `/api/v1/devices/{device_id}` | **Admin:** metadata device, keys, assignments | Có; mở rộng cùng DeviceView §3.6 |
| `PATCH` | `/api/v1/devices/{device_id}` | **Admin:** active/revoked | Có; giữ để xử lý sự cố, không bắt buộc thêm UI |
| `PATCH` | `/api/v1/devices/{device_id}/keys/{key_id}` | **Admin:** active/revoked key | Có; giữ để thu hồi key, không tạo `/keys/rotate` |
| `GET` | `/api/v1/shipments/{shipment_id}` | Chi tiết, vị trí mô phỏng, insurance/blockchain payout metadata | Có; dùng luôn thay endpoint `/insurance` riêng |
| `GET` | `/api/v1/shipments/{shipment_id}/devices` | Device health theo chuyến: last seen, sequence, online/offline | Có; dùng thay các route `/health` theo device chưa có |
| `GET` | `/api/v1/shipments/{shipment_id}/telemetry` | Nhiệt độ/độ ẩm, signed status và missing range khi có | Có |
| `GET` | `/api/v1/shipments/{shipment_id}/events` | Timeline vi phạm, evidence, integrity alerts | Có; dùng cho audit nghiệp vụ hiện có |
| `GET` | `/api/v1/shipments/{shipment_id}/integrity` | Tổng quan batch/root/anchor/verification | Có; không giả có counters chưa được DTO trả |
| `GET` | `/api/v1/shipments/{shipment_id}/batches` | Danh sách Merkle batch | Có; giữ path, không thêm `/integrity/batches` |
| `GET` | `/api/v1/batches/{batch_id}` | Chi tiết batch, anchor transaction | Có |
| `POST` | `/api/v1/batches/{batch_id}/verify` | **Admin:** tính lại root, đối chiếu on-chain | Đã dùng `AdminSession`; chuyển dependency sang JWT |
| `POST` | `/api/v1/shipments/{shipment_id}/batches/seal` | **Admin:** seal batch khi demo/reconcile | Có; giữ nguyên |
| `POST` | `/api/v1/batches/{batch_id}/anchor` | **Admin:** dispatch/retry anchor | Có; giữ nguyên |
| `POST` | `/api/v1/shipments/{shipment_id}/insurance/reconcile` | **Admin:** đối soát evidence/payout | Có; giữ nguyên |
| `GET` | `/api/v1/health`, `/api/v1/ready` | Health/readiness không lộ secret | Có |
| `POST` | `/api/v1/demo/shipments/{shipment_id}/scenario` | **Đã xóa ở Issue #50** | Endpoint kịch bản demo đã được loại bỏ hoàn toàn khỏi hệ thống |

**Auth mục tiêu — chưa triển khai:** một dependency FastAPI chung `require_admin` xác minh `Authorization: Bearer <jwt_token>`; có thể giữ tên `AdminSession` để ghép session DB với dependency đó. Bảo vệ **mọi API quản trị và monitoring**: device/key/assignment, create/list/detail shipment, đọc telemetry/events/device health/integrity/batch, verify/seal/anchor retry, insurance reconcile và demo khi development. Health/readiness tối thiểu và login được public; POST signed telemetry dùng ECDSA riêng, không yêu cầu JWT Admin. Route demo vẫn tắt ở production dù JWT hợp lệ. Script provisioning đăng nhập rồi dùng Bearer Token ngắn hạn để upload public key; không ghi password/JWT vào `config.h`. CORS cho phép `Authorization` và `Content-Type`, không thay xác thực. Baseline API key phải bị loại bỏ hoàn toàn khỏi runtime mới, không có fallback cho header cũ.

### 3.2.1. Login của duy nhất Admin — contract mới, PLANNED

`POST /api/v1/auth/login`, JSON request (chỉ là placeholder):

```json
{"username":"admin","password":"<your-demo-password>"}
```

Thành công `200`:

```json
{"access_token":"<jwt_token>","token_type":"bearer"}
```

- Đọc `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET_KEY` từ Backend environment; không tài khoản thứ hai, register/sign up, nhiều vai trò hoặc bảng `users`. So sánh credential an toàn, không log password/token và không trả config secret qua API.
- Dùng **PyJWT**, khóa phiên bản sau khi kiểm tra tương thích requirements; không tự viết JWT. Đề xuất HS256 cố định phía server, secret ngẫu nhiên đủ mạnh (ít nhất 32 byte), claims bắt buộc `sub` bằng Admin đã cấu hình, `iat`, `exp`; Access Token 30 phút theo `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` mới. Khi decode phải xác minh chữ ký, allowlist thuật toán và bắt buộc các claims/thời hạn, không tin `alg` do client chọn. Xem [PyJWT usage](https://pyjwt.readthedocs.io/en/stable/usage.html).
- Sai credential hoặc Bearer thiếu/sai chữ ký/hết hạn/sai subject trả `401` với lỗi chung, header `WWW-Authenticate: Bearer`; body validation trả `422`. Rate limit đề xuất 5 lần/phút/IP, vượt trả `429` và `Retry-After`; cấu hình IP/proxy tin cậy trên Render, test không giả mạo được qua header tùy ý.
- Cấu hình auth thiếu/rỗng/placeholder phải fail closed khi khởi động; không có chế độ bỏ auth khi secret rỗng, kể cả development. HTTPS trên Render; không ghi raw login body hoặc Authorization vào request/error log.
- Chỉ Access Token; hết hạn thì đăng nhập lại. Không refresh token, OAuth bên thứ ba, MFA, quên/đổi mật khẩu hoặc session DB. Logout là xóa token ở Frontend; token đã cấp còn hiệu lực tới `exp`, không xây revocation/session service trong demo.
- JWT Admin chỉ cho FastAPI; không cấp quyền Owner/Oracle/anchorer của Solidity. ESP32 giữ cặp P-256 riêng và `SIGNED-TELEMETRY-v2`, không đăng nhập username/password hay dùng JWT Admin.
- Admin được quản lý device (metadata, active/revoked, public key, gán/bỏ gán), shipment/policy khi quy tắc cho phép, monitoring/audit, verify và retry/reconcile đã hỗ trợ; không nhập thêm API key. Nếu thiếu API sửa metadata/shipment thì ghi task/schema cần bổ sung và review trong Phase 2/3, không tự coi route chưa có đã chạy, không cho sửa evidence/policy đã khóa trái luật nghiệp vụ.

Không thêm alias `/assign`, `/public-key`, device registry contract hoặc dịch vụ provisioning riêng. Pagination/filter là mở rộng khi cần, không giả đã có trong v1; demo có thể dùng `{items, total}` hiện tại.

### 3.3. Response thống nhất để Member 3 triển khai

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
  "created_at": "2026-11-15T03:00:00Z"
}
```

Đây là **fixture theo ShipmentDetail hiện có khi vừa tạo chuyến**, không phải kết quả gọi API trong lượt sửa tài liệu. Sau khi có signed telemetry, giữ `latest_telemetry.signature_status`, `sequence_number`, `completeness_status`/missing range theo DTO thực; không cần thêm object `device_integrity` hoặc counters mới chỉ cho đăng ký demo. Device health lấy từ `/shipments/{shipment_id}/devices`, integrity từ `/shipments/{shipment_id}/integrity`.

API hiện có trả `insurance.payout_status = not_requested / evidence_pending / pending / paid / failed`; UI ánh xạ lần lượt sang nhãn `NOT_ELIGIBLE / EVIDENCE_PENDING / PENDING / CONFIRMED / FAILED`. Anchor tx lấy từ `GET /batches/{batch_id}` → `anchor_transaction.transaction_hash`; insurance tx lấy từ ShipmentDetail → `blockchain.transaction_hash`. Giữ hai nguồn này tách biệt, không bắt buộc đổi field API thành `anchor_transaction_hash`/`insurance_transaction_hash`. Các counters/trường chưa có phải hiện `N/A` hoặc dùng fixture có nhãn mock.

**Quy tắc HTTP tối thiểu:** `201` cho mẫu được nhận mới; `200` cho cùng mẫu retry idempotent; `401/403` cho thiết bị chưa được phép/chữ ký sai; `409` cho cùng sequence nhưng payload khác; `422` validation lỗi; `503` khi dependency cần thiết không sẵn sàng. Giữ error envelope hiện có `{"error":{"code":"...","message":"...","details":[]}}` và correlation header `X-Request-ID`; không yêu cầu `request_id` trong body khi code chưa trả.

### 3.4. API demo an toàn

- Giữ tình huống gốc `normal` và `temperature_breach`, mở rộng `invalid_signature`, `duplicate`, `sequence_gap`, `offline`, `anchor_pending`, `tampering`, `hash_mismatch`.
- Simulator dùng **cùng chữ ký, cùng `telemetry_service`, cùng `violation_service`** như thiết bị thật (trừ bước giả lập lỗi có chủ ý). Virtual clock phải được inject trong test, **không sửa clock production**.
- Route demo tắt hoàn toàn tại `APP_ENV=production`; các demo tamper DB thực hiện trên database seed **riêng biệt**; rollback/reseed sau demo và không tác động dữ liệu người dùng thật.

### 3.5. Handoff contract phải xuất bản sớm

- `docs/contracts/api-v1.md`: endpoint, auth, model, enum, response ví dụ, pagination, error format, datetime UTC, versioning.
- `backend/openapi.json` hoặc URL `/openapi.json`: xuất bản/kiểm tra mỗi lần merge; Member 3 tạo types từ nguồn này nếu thuận tiện.
- `docs/architecture/data-integrity.md`: chi tiết chữ ký, canonicalization, leaf/Merkle, byte encoding, membership, sequence rules và golden test vectors.
- `blockchain/INTEGRATION.md` thuộc Member 2: ABI, address, chain ID, RPC, `batch_key`/`shipment_key`, event, contract permissions và xác nhận batch root.

### 3.6. Contract mục tiêu cho đăng ký, gán chuyến và cấp khóa — JWT chưa triển khai

DTO ID/tên, DeviceOut/list và constraint assignment đã có code khi đối chiếu tĩnh; giữ contract nghiệp vụ dưới đây để các caller dùng chung. **Phần mới chưa triển khai** là login/JWT, caller/provisioning migration và kiểm chứng MySQL/public deployment, không phải yêu cầu viết lại DTO đã có. Mọi thao tác admin trong §3.6 dùng JWT Bearer theo §3.2.1.

**A. Đăng ký thiết bị độc lập:** `POST /api/v1/devices`, auth admin:

```json
{"device_id":"ESP32-001","device_name":"Cold Chain Sensor 01"}
```

`device_id` giữ pattern `[A-Za-z0-9_-]{1,100}`, phân biệt hoa/thường; tên trim, không rỗng, tối đa 100 ký tự. Trùng ID trả `409 DEVICE_EXISTS`; không sửa device có sẵn. Không bắt buộc `key_id`, PEM hay shipment. Tái sử dụng DTO độc lập hiện có, cập nhật caller còn dùng DTO gộp và auth cùng OpenAPI; không thêm endpoint đăng ký thứ hai. `201` trả **DeviceView**:

```json
{
  "device_id": "ESP32-001",
  "device_name": "Cold Chain Sensor 01",
  "status": "active",
  "has_public_key": false,
  "current_shipment_id": null,
  "last_sequence_number": 0,
  "last_seen_at": null,
  "keys": [],
  "assignments": []
}
```

`has_public_key` suy ra từ key active, `current_shipment_id` suy ra từ assignment active (`null` nếu chưa gán); không thêm cột boolean dễ lệch. Giữ `keys` metadata (`key_id`, `status`), `assignments` (`shipment_id`, `active`), không trả PEM cho UI. `GET /devices/{device_id}` và thao tác key/assignment dùng cùng DeviceView; `GET /devices` trả `{"items":[DeviceView],"total":1}` (ký hiệu schema, không phải JSON), danh sách rỗng `{"items":[],"total":0}`. List thấy cả device chưa key/chưa gán. Các field đã có trong `DeviceOut`; cần regression với JWT và deployment thực tế.

**B. Tạo chuyến hàng:** request §3.1, response ShipmentDetail hiện có với `id` UUID, `code = "SHIP-001"`, policy tại `insurance`, trạng thái mới `created`, telemetry/location `null`. Trùng code trả `409 DUPLICATE_SHIPMENT_CODE`. UI lưu UUID từ response để gán/gửi, không dùng chuỗi `SHIP-001` thay UUID. Shipments list tiếp tục `{items, total}`.

**C. Gán thiết bị:** giữ `POST /api/v1/devices/ESP32-001/assignments`, auth admin, body:

```json
{"shipment_id":"8b4fb8a2-2996-4da2-90b9-35019517f56f","active":true}
```

- `200` trả DeviceView với `current_shipment_id` bằng UUID trên và assignment tương ứng active. Gán lại cùng cặp là idempotent, không tạo dòng trùng.
- Cho phép gán khi chưa có public key; telemetry vẫn bị chặn đến khi cấp key hợp lệ. Device phải tồn tại/active, shipment phải tồn tại; không tìm thấy trả `404 DEVICE_NOT_FOUND`/`SHIPMENT_NOT_FOUND`.
- Nếu đã có assignment active tới UUID khác, trả **`409 DEVICE_ALREADY_ASSIGNED` (đã có code)** và giữ quan hệ cũ. Bỏ gán bằng cùng endpoint với `active=false` rồi gán mới; không ngầm chuyển chuyến.
- Giữ khóa dòng device trong transaction, cùng thứ tự khóa với ingestion và unique active assignment ở Phase 3 để chặn hai request đồng thời của cùng Admin. Không thêm state machine chuyến chỉ cho mục đích gán.
- Một shipment nhận nhiều device. Telemetry/batch vẫn tách theo device, không trộn sequence giữa thiết bị; giữ logic evidence theo policy hiện có. Khi đổi chuyến chỉ cập nhật assignment trên Frontend/MySQL; ESP32 không chứa `SHIPMENT_ID` và không cần nạp lại firmware.

**D. Cấp public key:** giữ `POST /api/v1/devices/ESP32-001/keys`, auth admin, do script gọi:

```json
{"key_id":"key-v1","public_key_pem":"<SPKI PEM của public key P-256 do script tạo>"}
```

PEM trên là placeholder, phải thay bằng public key thật khi gọi. `201` trả DeviceView với `has_public_key=true`, `keys=[{"key_id":"key-v1","status":"active"}]`; assignment giữ nguyên. Device chưa đăng ký trả `404 DEVICE_NOT_FOUND`; public key sai định dạng/curve hoặc PEM private key trả `422 INVALID_PUBLIC_KEY`; key ID đã có trả `409 KEY_EXISTS`. Không ghi đè key khi retry; kiểm tra key đã đăng ký trước khi chạy lại, không tự sinh key mới vì request upload bị timeout. Demo vận hành một key active mỗi device; thu hồi key cũ qua PATCH hiện có nếu thay khóa. Không thêm endpoint nhận private key.

**E. Nhận telemetry:** request §2.4 giữ `key_id` bắt buộc, DER/Base64, integer scaling và canonical fields nhưng không có shipment UUID. Kiểm tra tuần tự: device/path → key active từ MySQL → chữ ký → assignment active → duplicate/replay/gap → Backend gắn shipment và lưu MySQL. Giữ mã lỗi: `403 DEVICE_NOT_ACTIVE`, `403 DEVICE_NOT_ASSIGNED`, `401 UNKNOWN_KEY`, `401 INVALID_SIGNATURE`, `422 DEVICE_MISMATCH`, `409 SEQUENCE_CONFLICT`/`SEQUENCE_REPLAY`. Unknown device không tự tạo registry/key/assignment.

---

## 4. Roadmap theo Phase (sắp xếp lại theo dependency)

> **Ước lượng:** 18–30 ngày công cho Member 1 tùy firmware thực tế, năng lực nhóm và tốc độ bàn giao smart contract. **Không phải lịch hẹn cố định**. Member 2/3 làm song song từ Phase 0 với mock API và golden fixtures; không chờ Member 1 làm xong toàn bộ.

| Phase | Nội dung | Ước lượng | Điều kiện để bắt đầu | Bàn giao sớm |
|---|---|---:|---|---|
| 0 | Architecture, API contract, crypto/hash contract | 2–3 ngày | Roadmap + repo hiện có | API v1 draft, golden fixture spec |
| 1 | ESP32/DHT22, provisioning local/USB, signed simulator | 2–4 ngày | Phase 0 protocol; dùng fixture trước khi API mới sẵn sàng | Script cấp khóa, config mẫu, payload/firmware vectors |
| 2 | Login một Admin/JWT, API đăng ký/gán/key, verification, anti-replay | 2–3 ngày, ước lượng lại cho JWT | Phase 0; làm cùng migration Phase 3 | Login contract, Bearer dependency, DeviceView, signed ingest |
| 3 | MySQL migration device/assignment + shipments + GPS mô phỏng | 2–3 ngày | Phase 2 baseline; mở schema song song Phase 2 | Migration, OpenAPI + seed cho Frontend |
| 4 | Integrity Service + Merkle batches | 2–4 ngày | Phase 3 dữ liệu ổn định | Batch hashing fixture cho Member 2 |
| 5 | Web3.py + Alchemy/Sepolia anchoring | 2–3 ngày | Phase 4 + ABI/address từ deployment Remix của Member 2 | Receipt/readback Sepolia, anchor/verify API |
| 6 | Violation detection + Insurance integration | 2–3 ngày | Phase 3 + evidence/adapter; chuẩn ABI Member 2 | Event/payout state API |
| 7 | Render deployment + security hardening | 2–3 ngày | API/MySQL ổn định; có thể deploy skeleton từ Phase 3 | Public API URL cho Member 3 |
| 8 | E2E/QA/demo/release handoff | 2–4 ngày | Phases 1–7 + Member 2/3 đã tích hợp | Demo checklist, logs, runbook |

### Phase 0 — API Contract & Architecture

**Việc cần làm**

- [x] Kiểm tra cấu trúc repo/những phần đã có trước khi sửa code. Tạo nhánh `feat/iot-backend`; giữ `device/`, `backend/`, `blockchain/`, `frontend/`, `docs/` và owner như cũ.
- [x] Chốt stack **FastAPI + ESP32 + external MySQL + Web3.py + Alchemy + Ethereum Sepolia + Remix + Render**; chọn phiên bản Python/Arduino core/mbedTLS/driver MySQL. Không cần Hardhat Node hoặc chain `31337` để chạy Backend mới.
- [ ] Khóa login §3.2.1, danh sách route Admin dùng JWT, TTL và rate limit với TTDK; không Register/User table/đa vai trò. Lập checklist đổi settings, routes, OpenAPI, tests, CLI/provisioning, frontend client và runbook cùng lần chuyển đổi; không bỏ bảo vệ API trong lúc gỡ API key.
- [x] Chốt quy trình demo và contract §3.6 với NTD/TTDK: ID/tên device riêng, `code` chuyến ánh xạ UUID, một assignment active/device, cấp key bằng script; giữ `/keys` và `/assignments` đang có. Lập danh sách caller cần đổi DTO đăng ký.
- [x] Khóa `SIGNED-TELEMETRY-v2`: bỏ shipment khỏi payload ký; giữ scaled integer, ECDSA P-256 SHA-256, DER/Base64, public key PEM, UTC timestamp và decoder v1 tương thích.
- [x] Khóa `MERKLE-v1`: canonical record, leaf/node prefixes, odd-node rule, root bytes32, batch membership, sort order, empty batch.
- [x] Làm 2–3 golden fixtures: một mẫu ký đúng, một mẫu sai chữ ký, một batch 1/2/3 leaf kèm expected root. Chia sẻ Member 2.
- [x] Tạo/cập nhật `docs/contracts/api-v1.md`, schema và enum; thống nhất `shipment_key`, `batch_key`, oracle/anchorer address cùng Member 2.
- [x] Thỏa thuận CORS origin dự kiến và error/status mà Member 3 sẽ sử dụng; phát hành mock JSON/seed fixtures trước khi Backend hoàn chỉnh.
- [x] Chốt xử lý sequence sau reboot, gap, offline, thời lượng vi phạm, anchoring pending và **policy có cần anchored evidence trước payout**; ghi thành quyết định kiến trúc.

**Definition of Done**

- [x] Member 2 xác nhận hash bytes/ABI kỳ vọng; Member 3 xác nhận OpenAPI/schema v1.
- [x] Golden fixture có expected canonical UTF-8/hex + SHA-256 + expected Merkle root; không còn chỗ mô tả mơ hồ về hash.
- [x] Phân công owner và quy trình đổi contract được đồng thuận; không suy đoán schema từ các phía.
- [x] Ba roadmap thống nhất request/DeviceView/lỗi §3.6, schema Phase 3, trách nhiệm script/UI và điều kiện device được gửi; phần thiết kế chưa có code được đánh dấu rõ.

### Phase 1 — ESP32/DHT22, Provisioning bằng Python & Signed Simulator

**Việc cần làm**

- [x] Giữ cảm biến **DHT22** và sketch thực tế `device/cold_chain_device/cold_chain_device.ino` (GPIO 27 theo cấu hình hiện có); kiểm tra `NaN`, phạm vi và lỗi cảm biến, không tạo sketch trùng ở đường dẫn khác.
- [ ] Thêm script đề xuất `device/provisioning/provision_device.py`, dùng Python `cryptography` sẵn có trên máy tin cậy: chọn device đã đăng ký, sinh cặp P-256 riêng bằng secure RNG, xuất private key vào `device/cold_chain_device/config.h` và public key SPKI PEM local. Không ghi đè key/config đã có, không in private key ra terminal/log.
- [ ] Script/hướng dẫn đăng nhập `POST /auth/login` trên máy tin cậy rồi đăng ký **public key đã sinh** qua `POST /devices/{device_id}/keys` với JWT Bearer, sau khi nạp `config.h` bằng USB. Token ngắn hạn ở bộ nhớ tiến trình, hết hạn thì đăng nhập lại; không log hay ghi token/password vào firmware. Tách bước tạo file và upload; lỗi mạng không làm sinh lại cặp khóa. Private key không đi qua Frontend, HTTP API hoặc Backend/MySQL.
- [x] `config.example.h` chỉ placeholder cho `API_BASE_URL`, Wi-Fi, `DEVICE_ID`, `KEY_ID`, `DEVICE_PRIVATE_KEY_PEM`; không có `SHIPMENT_ID`. `.gitignore` tiếp tục loại `config.h`, `*.pem`, `*.key`.
- [x] Thực hiện ECDSA P-256/SHA-256 bằng thư viện mbedTLS được hỗ trợ; tự kiểm bằng golden fixture với Python.
- [x] Gắn `sequence_number` toàn cục theo device vào mẫu, lưu counter bền vững trước khi sử dụng; cấu hình `key_id`, `firmware_version`, `payload_version`.
- [x] Đồng bộ thời gian NTP khi có mạng và phát `recorded_at` UTC; xử lý clock chưa đồng bộ rõ ràng, không giả giờ chính xác.
- [x] Dựng signed canonical JSON từ scaled integers; gửi đúng payload đến REST API qua HTTPS/TLS với certificate validation (không dùng `setInsecure()` ở production).
- [x] Thiết lập HTTP timeout, exponential backoff có giới hạn và jitter, reconnect Wi-Fi; queue có giới hạn khi offline, retry không đổi signed payload hoặc sequence.
- [x] Tái sử dụng `device/simulator/send_telemetry.py`: đăng ký một device thử riêng (ví dụ `SIM-001`), tạo shipment, gán active, cấp public key tương ứng rồi dùng PEM private key local qua `--private-key`; hỗ trợ happy/invalid/duplicate/replay/gap/reconnect như hiện có. Simulator không tự đăng ký hoặc tự cấp key khi ingestion thất bại.
- [x] Bước tạo khóa cho simulator có thể xuất thêm PEM private key vào đường dẫn ngoài Git; chỉ dùng trên máy tin cậy và không dùng chung cặp khóa với ESP32 thật. Giữ `--sequence` là số chưa dùng vì simulator hiện chưa lưu counter; không chạy simulator và board cùng identity đồng thời.
- [x] Cập nhật `device/README.md`, `backend/README.md` theo thứ tự đăng ký device → tạo shipment → gán → script cấp khóa → USB → upload public key → kiểm chứng signed telemetry; hướng dẫn revoke/add key hiện có khi lộ khóa. Không thêm PKI, OTA hoặc remote provisioning.

**Definition of Done**

- [x] ESP32 thật **hoặc simulator chuẩn giao thức** gửi được chuỗi mẫu đúng chữ ký; Backend Python verify được cùng canonical bytes.
- [ ] Sự cố reboot/retry không tạo sequence trùng làm thất thoát dữ liệu; queue đầy có cảnh báo/gap rõ ràng.
- [x] Wi-Fi mật khẩu/private key không có trong Git; TLS/cert validation được kiểm tra.
- [x] Không gửi GPS, không tự gửi `received_at`, có firmware version.
- [ ] Tạo hai thiết bị cho ra hai public key khác nhau; file private key/config thật không được Git theo dõi và không xuất hiện trong request/log/UI/DB. Upload nhầm PEM private key bị từ chối.
- [x] Simulator chuẩn giao thức đại diện cho device đã đăng ký/gán/cấp key; bỏ từng điều kiện sẽ bị từ chối. Hoàn tất bằng simulator không đồng nghĩa đã cross-test board ESP32/USB.

### Phase 2 — FastAPI Device Verification & Ingestion

**Việc cần làm**

- [x] Dựng app FastAPI, dependency injection, settings, logging có request ID và `/api/v1/health`, OpenAPI `/docs` (quyền public docs theo policy).
- [ ] **Mới, PLANNED:** thêm `POST /api/v1/auth/login` theo §3.2.1 bằng PyJWT; settings mới cho duy nhất Admin, secret/TTL validation, giới hạn thử đăng nhập, 401/429 chuẩn và redaction password/JWT.
- [ ] Thay dependency API-key hiện có bằng `require_admin`/JWT chung; xóa đọc `ADMIN_API_KEY`/`X-Admin-Key` trong runtime, OpenAPI, test fixtures và hướng dẫn mới. Chặn toàn bộ route Admin/monitoring nêu §3.2; không fallback credential cũ. Tách signed ingestion khỏi JWT và giữ health/readiness public tối thiểu.
- [x] Mở rộng `api/routes.py`, `schemas/api.py`, `services/signed_ingestion.py`, `device_health_service.py` hiện có; không tách/viết lại module chỉ theo tên cây tham chiếu.
- [x] Đối chiếu/tái sử dụng `DeviceRegister(device_id, device_name)`, `GET /devices` và DeviceView §3.6 đã có trong code; cho device chưa key/assignment tồn tại. Cập nhật caller còn dùng DTO gộp và auth JWT, regression create/list/detail/assignment/key; không thêm endpoint trùng.
- [x] Tái sử dụng `/devices/{device_id}/keys`, `/assignments`, các PATCH revoke và shipment DTO; `AdminSession` dùng JWT thay API key. Cả Admin đọc/ghi, verify/retry/reconcile và demo dev đều kiểm tra token ở Backend; không tạo alias API.
- [x] Khi gán active, khóa dòng device trong transaction, từ chối active sang chuyến khác với `409 DEVICE_ALREADY_ASSIGNED`; cùng cặp retry idempotent. Bỏ gán bằng `active=false`, không reset sequence và không đổi telemetry/batch lịch sử. Hoàn tất cùng migration Phase 3 trước nghiệm thu API.
- [x] Triển khai validate payload/version/Decimal constraints/range và shipment association; xác minh DER/Base64 ECDSA trước khi accept.
- [x] Chống duplicate và replay bằng unique key và transaction, xử lý HTTP retry idempotent; phát hiện sequence gap và last seen từ telemetry hợp lệ. Signed heartbeat là mở rộng riêng nếu cần, không phải điều kiện thêm cho demo đăng ký/gửi dữ liệu.
- [x] Tách audit cho invalid signature, tampered payload, unknown/revoked device/key, timestamp sai lệch; không trộn vào accepted telemetry.
- [x] Thiết kế phản hồi chuẩn cho Member 3: signature_status, last seq, gap, last heartbeat, online/offline, error code.
- [x] Thêm API rate limit, giới hạn body size, request timeout; không log raw secret/khóa.

**Definition of Done**

- [x] Test đúng signature được chấp nhận, sai signature bị từ chối, unknown device không thể tự tạo thiết bị.
- [ ] Login đúng trả JWT có hạn; login sai trả 401, vượt ngưỡng trả 429. Token thiếu/hết hạn/sửa chữ ký/sai subject/không có `exp` hoặc sai thuật toán đều bị chặn; header API key cũ không cấp quyền. Thiếu cấu hình không mở public API; password/JWT không có trong log/response lỗi.
- [ ] Ma trận route chứng minh mọi API Admin/monitoring được bảo vệ cả GET và POST/PATCH; signed telemetry hợp lệ không cần JWT, JWT Admin không thay thế chữ ký P-256; health/readiness vẫn hoạt động không có token. Không có bảng users/route đăng ký/thêm Admin.
- [x] Retry cùng payload idempotent; cùng sequence nhưng nội dung khác trả conflict; gap/offline có chỉ báo đúng.
- [x] `/docs` và `api-v1.md` phản ánh endpoint/enum thực tế; API trả 4xx/5xx có cấu trúc, không lộ stack trace.
- [x] Đăng ký được device trước shipment/key, list thấy `has_public_key=false`, `current_shipment_id=null`; không nhận telemetry khi thiếu assignment hoặc key. Sau cấp key đúng, cùng device gửi được mẫu signed v1.
- [x] Hai request của cùng Admin gán đồng thời một device sang hai chuyến chỉ có một request thành công, request còn lại `409`; nhiều device gán cùng shipment được phép. JWT thiếu/sai bị chặn ở Backend; không chỉ ẩn nút UI.

### Phase 3 — MySQL Persistence, Shipments & Backend GPS Simulation

**Việc cần làm**

- [x] Cấu hình SQLAlchemy/driver MySQL tương thích + Alembic; migration được quản lý theo phiên bản, không dựa `create_all()` để upgrade production.
- [x] Xây dựng schema tối thiểu theo bảng dưới đây; dùng `UTC`, index/filter theo shipment/device/time, transaction và khóa unique chống race condition.
- [x] Tái sử dụng revision **`20261115_03_device_registration.py`** đã có sau `20261109_02`, không sửa revision đã áp dụng: kiểm chứng backfill `device_name`, bảo toàn ID/key/receipt/batch và xử lý nhiều assignment active cũ có kiểm soát. Thay JWT không cần migration tài khoản/users hoặc session DB; chỉ tạo revision tiếp nếu phát hiện nhu cầu schema thực tế.
- [x] Kiểm chứng generated nullable column `active_device_id = CASE WHEN active THEN device_id ELSE NULL END` và UNIQUE trong revision `20261115_03`/model hiện có trên MySQL: một dòng active/device, nhiều dòng inactive. Giữ khóa dòng service và map unique violation thành `409 DEVICE_ALREADY_ASSIGNED`; không thêm migration/UNIQUE trực tiếp lên `device_id` làm mất lịch sử. SQLite test không thay kiểm chứng MySQL.
- [x] Đảm bảo dữ liệu **accepted** được commit vào MySQL trước khi enqueue anchoring/insurance; không phụ thuộc RPC để ghi telemetry.
- [x] Implement đầy đủ API `shipments`, `telemetry history`, `events`, `insurance status`; seed 2–3 shipment phục vụ Frontend.
- [x] Giữ `route_simulator.py`: nội suy vị trí dự đoán được từ tọa độ gốc, gắn `backend_simulated` và `progress_pct`; không cho ESP32 ghi đè.
- [x] Làm migration up/down an toàn, test index và kết nối lại DB khi timeout; cấu hình connection pool (`pool_pre_ping`, pool size hợp lý), TLS theo nhà cung cấp.
- [x] Công bố API/seed trên local hoặc môi trường test cho Member 3; cập nhật README khởi tạo database một lệnh.

**Schema MySQL dùng lại và phần bổ sung đề xuất**

| Bảng | Mục đích / khóa quan trọng |
|---|---|
| `devices` | PK **`id` hiện có** (API gọi `device_id`), status, last seen, last sequence; **thêm `device_name`**. Không có key/assignment vẫn tạo được device |
| `device_keys` | PK `(device_id, key_id)`, FK `devices.id`, `public_key_pem` SPKI P-256, status, created_at; **public key only**, không tạo cột private key |
| `device_assignments` | PK `(device_id, shipment_id)`, FK device và `shipments.id`, `active`; **thêm constraint một dòng active/device**. Dùng bảng hiện có, không thêm `device_shipments` |
| `shipments` | PK `id` UUID, `code` unique (`SHIP-001`), origin/destination, cargo, ngưỡng/thời lượng, `insured_amount_vnd` và insurance/payout metadata hiện có |
| `telemetry` | Sample ID, shipment UUID, device ID, nhiệt độ/độ ẩm, `recorded_at`, authoritative `received_at`, vị trí Backend mô phỏng; không di chuyển dữ liệu cũ |
| `signed_telemetry_receipts` | FK telemetry, device/shipment/key IDs, signature/scaled values/canonical digest; UNIQUE `(device_id, sequence_number)`; missing range nằm ở `missing_from`/`missing_to` hiện có |
| `ingestion_audit` | Lý do reject, device/shipment/sequence, timestamp; giữ bảng audit hiện có |
| `integrity_batches` | batch metadata, membership sealed, root, anchor/verification status |
| `integrity_batch_items` | `(batch_id, telemetry_id)` unique, `leaf_index`, `leaf_hash` |
| `shipment_events` | Gap/violation/integrity/insurance events, evidence references và audit timestamp hiện có |
| `integration_outbox` | Tác vụ anchor/insurance bền vững, idempotency key unique, payload transaction, retry/backoff; giữ cách lưu hiện tại |

Tái sử dụng schema/revision đăng ký đã có tên device và ràng buộc assignment; `has_public_key`/`current_shipment_id` suy ra trong view. JWT không cần users/session table. Heartbeat, gap lifecycle hoặc bảng insurance/transaction riêng chỉ bổ sung khi có nhu cầu thực tế ở phase tương ứng; không dựng lại cho đăng ký demo. Giữ monetary integer VND, không float cho số tiền.

**Index:** giữ UNIQUE sequence ở `signed_telemetry_receipts`, `shipments.code`, batch leaf/membership và outbox idempotency hiện có; bổ sung unique assignment active như trên. Tối ưu `(shipment_id, received_at)`, `(device_id, received_at)` theo query thực tế; dùng tên cột `sealed_at`/`occurred_at` đúng model thay vì đặt index vào cột không có.

**Definition of Done**

- [x] MySQL local/test hoạt động với migration từ database rỗng; các bản ghi giữ nguyên khi restart Backend.
- [x] Tạo/truy vấn shipment; telemetry có `received_at`, chữ ký và key_id; query/list đúng DTO hiện có, bổ sung phân trang khi dữ liệu demo thực sự cần.
- [x] GPS mô phỏng đi theo tuyến, không bị client override, có nhãn đúng nguồn dữ liệu.
- [x] Member 3 nhận được seed data + OpenAPI để dựng Dashboard mà không cần Blockchain hoàn tất.
- [x] Migration từ DB hiện có bảo toàn keys, sequence, telemetry, batch và evidence; từ DB nền sạch lên head chạy được. Trường hợp nhiều assignment active cũ được giải quyết có kiểm soát trước khi UNIQUE có hiệu lực; kiểm thử race trên MySQL, không chỉ SQLite.

### Phase 4 — Integrity Service & Data Batch Hashing

**Việc cần làm**

- [x] Implement `integrity_service.py`, `batch_service.py` theo `MERKLE-v1`: canonical record, leaf SHA-256, sort/index và Merkle root bất biến.
- [x] Batch tối đa 100 mẫu hoặc 5 phút (cấu hình), không gộp nhiều device/shipment; xử lý batch nhỏ khi gián đoạn, không cần đủ 100 mẫu mới đóng.
- [x] `SEALED` batch + membership + Merkle root lưu **atomically** tại DB; trạng thái `NOT_READY/PENDING` rõ ràng.
- [x] Phát hành `BatchReadyToAnchor` vào durable `integration_outbox`, worker/dispatcher idempotent, không gửi giao dịch trực tiếp từ transaction DB chưa commit.
- [x] API list/detail/verify batch; kiểm tra lại canonical bytes từ dữ liệu MySQL so với root đã sealed; nếu root đã anchor thì tiếp tục đối chiếu on-chain.
- [x] Tạo tamper simulation có kiểm soát trên DB demo và phát `DATA_INTEGRITY_FAILED`/audit khi tính lại root khác.
- [x] Xuất fixture 1, 2, 3 và số lẻ nhiều leaf cho Member 2; làm cross-language hash test.
- [x] Chốt cơ chế lưu hash và metadata nếu root byte trùng ở batch khác: **batch identity riêng**, không coi root trùng là cùng batch hợp lệ.

**Definition of Done**

- [x] Với cùng bản ghi và sort rule, tính lại root cho ra cùng 32 bytes; thay đổi temperature/sequence/signature/received_at làm root sai.
- [x] Batches không thay đổi membership sau `SEALED`; batch rỗng không anchor; API trả đầy đủ metadata.
- [x] Member 2 nhận được canonical fixtures và root để thử trên Contract; dữ liệu tamper được phát hiện.

### Phase 5 — Blockchain Adapter, Batch Anchoring & On-chain Verification

**Điều kiện bên ngoài:** Member 2 bàn giao **ABI xuất từ Remix đúng source đã deploy, hai contract addresses Sepolia, token address/ABI nếu dùng, chain ID `11155111`, receipt/tx hash deployment, compiler/dependency settings, constructor args, events, ID encoding, authorized anchorer/Oracle, confirmations và manifest/runbook Remix**. NTK tạo Alchemy app Ethereum Sepolia, giữ RPC URL thật trong Backend secret. Không cần script deploy hay node local; mock adapter mở khóa unit test trước khi có deployment thật.

**Việc cần làm**

- [x] Viết `backend/app/integrations/blockchain_adapter.py` có interface tách `anchor_batch`, `get_batch`, `verify_batch`, `report_violation`, `get_tx_receipt`, `read_events`.
- [x] Tái sử dụng Web3.py hiện có, kết nối `Web3(Web3.HTTPProvider(settings.blockchain_rpc_url))`; kiểm tra `w3.eth.chain_id == 11155111`, bytecode và signer roles trên đúng addresses. Cập nhật defaults/`.env.example`/runbook khỏi localhost; không tự bật gửi tx khi chưa đủ cấu hình. Giữ tên `BLOCKCHAIN_CONTRACT_ADDRESS`, `BLOCKCHAIN_ORACLE_PRIVATE_KEY`, `BACKEND_ANCHORER_PRIVATE_KEY` đang được code đọc.
- [x] Kết nối Data Integrity Contract để `anchorBatch(...)` và so sánh `bytes32` root; check sender role, chain ID/ABI/address đúng môi trường.
- [x] Persist transaction lifecycle `PREPARED → SUBMITTED → MINED_SUCCESS/FAILED → CONFIRMED` và chuyển thành các `anchor_status` được publish qua API.
- [x] Khi RPC timeout không rõ tx đã phát đi chưa, kiểm tra tx hash / nonce / trạng thái `batch_key` trên chain **trước khi gửi lại**. Đảm bảo 1 batch chỉ anchor một lần trên chain, tránh nonce race bằng queue/lock phù hợp.
- [x] Chờ receipt `status=1` + đọc root/event contract + số confirmations được chốt; **không** coi `tx_hash != null` là `DATA_ANCHORED`.
- [x] Bảo toàn outbox khi Render restart; retry exponential backoff, dead-letter/manual replay có auth, log lỗi không kèm private key.
- [x] Khi đã anchor, endpoint verify đối chiếu root tính lại, stored root và root lấy on-chain; sinh cảnh báo nếu bất kỳ bước kiểm tra nào không khớp.
- [x] Cho phép `BLOCKCHAIN_ENABLED=false` khi local dev, nhưng chỉ đánh dấu `BLOCKCHAIN_PENDING/NOT_READY`, **không** giả anchored.

**Definition of Done**

- [ ] Trên **Sepolia qua Alchemy**, batch Python → `anchorBatch` → receipt `status=1` + event + đủ confirmations → `getBatch/verifyBatch` khớp root/metadata → `DATA_ANCHORED`; lưu tx hash và link `https://sepolia.etherscan.io/tx/<tx_hash>` thật. Test mock/local lịch sử không thay gate này.
- [x] Cùng `batch_id` retry không sinh nhiều anchor; RPC failure/restart không mất telemetry/outbox.
- [x] Pending/reverted/failed được thể hiện riêng; tamper sau anchor tạo `DATA_INTEGRITY_FAILED`.

### Phase 6 — Violation Detection & Insurance Contract Integration

**Việc cần làm**

- [x] Giữ logic ngưỡng riêng của mỗi shipment; dùng **`received_at`** theo Backend để xác định thời gian quan sát vi phạm.
- [x] Cấu hình `MAX_SAMPLE_GAP_SECONDS` (local mặc định 300 giây; có thể đổi sau khi team chốt). Time gap, sequence gap, invalid/replay cắt mạch bằng chứng.
- [x] Không kích hoạt trước `violation_duration_minutes = 15`; nếu nhiệt độ quay về ngưỡng trước đủ 15 phút thì reset chuỗi; tránh tạo nhiều event cho cùng một đợt vi phạm.
- [x] Event tối thiểu: `TEMPERATURE_BREACH_STARTED`, `TEMPERATURE_BREACH_ENDED`, `SENSOR_DATA_GAP`, `DEVICE_OFFLINE`, `INSURANCE_TRIGGERED`, `INTEGRITY_MISMATCH`.
- [x] Gắn `violation_evidence_id`, khoảng `first/last received_at`, telemetry IDs, relevant batch IDs/root/tx, tình trạng gap và policy version vào evidence.
- [x] Bật mặc định **`PAYOUT_REQUIRES_ANCHORED_EVIDENCE=true`**: batch còn pending ghi `EVIDENCE_PENDING`, tiếp tục chờ/check chain và không reportViolation/payout vội.
- [x] Chỉ authorized Backend Oracle gọi `reportViolation`; adapter kiểm tra policy, idempotent event/policy key và trạng thái đã payout.
- [x] Phân biệt `INSURANCE_TRIGGERED`, `EVIDENCE_PENDING`, payout `pending`, `paid/confirmed` và `failed` trong shipment/event metadata.
- [x] Chạy virtual clock ở local/test để minh họa 15 phút; E2E dùng signed telemetry, Merkle batch và hai contract thật trên Hardhat.

> Các checkbox đã tick trong Phase 6 là kết quả **local/Hardhat lịch sử**, giữ nguyên; không xác nhận payout Sepolia hay luồng JWT mới.

- [ ] **Mới:** chạy lại evidence → Oracle → payout trên Sepolia bằng pytest/Web3.py opt-in; giữ liên tục 15 phút, `received_at`, gate `MATCHED + DATA_ANCHORED`, không gap và idempotency. Virtual clock chỉ dùng dev/test; không dùng RPC time-travel trên Sepolia hoặc sửa clock production.

**Definition of Done**

- [x] 14 phút vi phạm không payout; 15 phút với dữ liệu liên tục + evidence đúng điều kiện chỉ trigger một lần.
- [x] Sample bình thường, thiếu chuỗi, chữ ký sai, data tamper hoặc anchor pending không tự động payout.
- [ ] **Sepolia** payout demo chỉ ghi `CONFIRMED` khi receipt thực sự thành công, `InsurancePaid`/policy state/balance khớp; có tx/Etherscan metadata riêng, không dùng checkbox Hardhat phía trên làm bằng chứng.

### Phase 7 — Public FastAPI Deployment on Render

**Việc cần làm**

- [ ] Deploy **Render Web Service** từ `backend/` bằng Python runtime (hoặc Docker nếu repo phù hợp). Với layout đề xuất, **Root Directory = `backend`**, build `pip install -r requirements.txt` và start:

  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```

- [x] Khóa phiên bản Python/dependencies; kiểm thử bằng đúng build/start command; lưu hướng dẫn vào `docs/deployment/render.md`.
- [x] Tạo `/api/v1/health` trả `status`, `database`/`blockchain` ở mức `ok/degraded/unavailable` (không lộ connection string); có `/api/v1/ready` cho DB-readiness. Blueprint dùng `/api/v1/health` làm HTTP health check.
- [x] Cấu hình **external managed MySQL** bằng `DATABASE_URL`, connection pool nhỏ hợp lý, TLS/SSL theo provider, timeout/reconnect, migration trước khi bật phiên bản mới, backup/restore test theo gói dịch vụ.
- [ ] Secret trong **Render Environment Variables**: Oracle/anchorer private key, DB credential, Alchemy RPC URL, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET_KEY`; TTL cấu hình rõ. Thay production guard API key cũ bằng guard JWT/credential; bỏ biến Admin API key trong Render/Blueprint/`.env.example` khi triển khai auth mới. Không ghi secret vào logs, docs hoặc frontend.
- [x] CORS dùng explicit allowlist, không wildcard/credentials; `APP_ENV` tách local/test/production và `/api/v1/demo/*` không được đăng ký trong production.
- [ ] Gắn `PUBLIC_API_BASE_URL` từ URL **Render thực tế đã được cấp sau deploy**; cập nhật tài liệu + cung cấp cho Member 3. Không hardcode URL ví dụ trong build/README như thể đó là môi trường thật.
- [ ] Kiểm tra HTTPS (bao gồm ESP32 TLS), OpenAPI nếu được cho phép, health, DB migrations và ít nhất một request từ ESP32/simulator **qua URL public**.
- [x] Kiểm tra vận hành outbox/retry khi instance restart; với Render Free, không dựa vào process memory hoặc timer sống liên tục để bảo đảm anchoring/payout. Cần đường manual retry khi demo, hoặc worker/scheduler trả phí phù hợp nếu muốn SLA.
- [x] Đọc log deploy/khởi động/RPC/MySQL, phân biệt cold start với device offline và tránh lưu credential trong log.

**Ví dụ `.env.example` — placeholder, không chứa secret thật:**

```dotenv
APP_ENV=development
DATABASE_URL=mysql+pymysql://<user>:<password>@<host>:3306/<database>
CORS_ORIGINS=http://localhost:5173,https://<your-frontend-domain>
ADMIN_USERNAME=<single-admin-username>
ADMIN_PASSWORD=<set-as-secret-in-environment>
JWT_SECRET_KEY=<random-secret-at-least-32-bytes>
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
# Bật true sau khi nhận deployment/roles/ABI thật và vượt preflight; local mock dùng false.
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_NETWORK=sepolia
BLOCKCHAIN_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
BLOCKCHAIN_CHAIN_ID=11155111
DATA_INTEGRITY_CONTRACT_ADDRESS=<data-integrity-address>
BLOCKCHAIN_CONTRACT_ADDRESS=<insurance-contract-address>
BACKEND_ANCHORER_PRIVATE_KEY=<set-as-secret-in-environment>
BLOCKCHAIN_ORACLE_PRIVATE_KEY=<set-as-secret-in-environment>
BLOCKCHAIN_ABI_PATH=backend/app/integrations/abi/ColdChainInsurance.json
DATA_INTEGRITY_ABI_PATH=backend/app/integrations/abi/ColdChainDataIntegrity.json
BLOCKCHAIN_CONFIRMATIONS=2
BLOCKCHAIN_RECEIPT_TIMEOUT_SECONDS=120
PUBLIC_API_BASE_URL=https://<your-render-service>.onrender.com/api/v1
```

> Mẫu **thiết kế mới**, không phải `.env` đã chạy: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET_KEY`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` cần thêm vào settings. Các tên Blockchain còn lại đã khớp `config.py`; 2 confirmations/120 giây là mức demo đề xuất, NTK/NTD xác minh rồi khóa trước smoke test. Không đổi sang alias `INSURANCE_CONTRACT_ADDRESS`/`BACKEND_ORACLE_PRIVATE_KEY` vì Backend chưa đọc chúng. Token address/ABI ghi trong manifest Sepolia của NTD; runtime hiện không đọc `DEMO_TOKEN_CONTRACT_ADDRESS`, chỉ thêm nếu có consumer cụ thể cùng config/test. Alchemy API key vẫn cần, chỉ bỏ credential Admin API key. Private key ví Ethereum tách khỏi P-256 thiết bị. Không commit `.env`; URL public/address/secret trên đều là placeholder.

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
- [x] Tài liệu `render.md` ghi rõ build/start, environment, migration, health, logs, cold start và quy trình hồi phục khi RPC/DB lỗi.

### Phase 8 — End-to-End Testing, Security Review & Demo

**Việc cần làm**

- [x] Unit test: canonicalization, signature verification, gap/replay, Merkle root, timestamp, route simulation, 15-minute policy, idempotency.
- [x] API integration test: device registration/revocation, signed ingestion, MySQL migrations, batch membership, verify endpoint, CORS/auth/rate limit.
- [x] Test luồng §3.6: đăng ký ID/tên → tạo shipment/code/UUID → gán → script cấp key → signed ingest; kiểm tra trùng ID/code, sai UUID, thiếu/khác assignment, thiếu/revoked/sai curve key và gán đồng thời. Không làm lại module Merkle/Oracle; dùng test regression hiện có để phát hiện tác động tích hợp.
- [x] Pytest/Web3.py integration với contract đã deploy Remix trên Sepolia: anchor + root verify, roles, duplicate batch/payout, expiry/funding và receipt/events/balance. Port scenario từ `test_blockchain_local.py`/`test_integrity_anchor_local.py` sang suite opt-in Sepolia; giữ file local cũ là legacy, không yêu cầu chạy node để chạy suite mới.
- [x] Default unit/API tests dùng mock RPC/contract, không mạng/khóa ví/gas. Đề xuất marker `sepolia` cùng cờ `RUN_SEPOLIA_TESTS=1` (chưa có): mặc định skip, kiểm tra chain/address/key/balance trước, isolated IDs/policy mỗi lần; chạy tường minh `python -m pytest -m sepolia` sau khi thêm marker. Giao dịch thật chỉ trong đợt smoke/E2E có chủ đích; mock timeout/429/pending/reorg/revert và restart, không cố ép testnet xảy ra lỗi.
- [ ] E2E cùng Member 3: toàn bộ trạng thái thiết bị, batch, anchoring, payout và cảnh báo hiện đúng; Frontend không tự suy ra verified/confirmed.
- [ ] Rehearse trên public URL và DB/demo seed riêng; có fallback simulator đã ký khi ESP32 mất mạng.
- [x] Kiểm tra negative flows (invalid sig, duplicate, gap, offline, MySQL tamper, hash mismatch, RPC down, chain pending).
- [x] Cập nhật README/runbook: khởi chạy local, migrate MySQL, cấu hình ESP32, deploy Render, smart contract handoff, các giới hạn demo.
- [x] Scan repository và Git history cho `.env`, device/oracle keys, DB passwords; có quy trình thu hồi/đổi key nếu lộ.

**Definition of Done**

- [ ] Bảng test ở mục 6 chạy được và có log/screenshot hoặc output kiểm chứng; trường hợp chưa chạy phải gắn `NOT_TESTED`, không đánh dấu `PASS` tượng trưng.
- [ ] End-to-end: signed telemetry → MySQL → batch root → confirmed anchor → violation 15 phút → confirmed demo payout (trên môi trường test thích hợp).
- [x] Repo có lệnh chạy, config mẫu, API contract, fixtures, test report và quy trình rollback/troubleshooting.

---

## 5. Thứ tự phụ thuộc và hợp đồng bàn giao với hai thành viên còn lại

### 5.1. Member 1 → Member 2 (Blockchain & Smart Contract)

Bàn giao **trước khi Member 2 chốt/triển khai contract interface**:

- [x] Canonical signed payload v1, device identity, key format, signature verification assumptions và sequence policy.
- [x] Canonical record/leaf hash/Merkle root **byte-level** + golden fixtures + batch metadata, `batch_id`, first/last sequence, batch membership.
- [x] Dự thảo `anchorBatch` request, `verifyBatch/getBatch` lookup expectations và idempotency key.
- [x] `shipment_id` / `batch_id` identity và yêu cầu encode thành `bytes32` (cần Member 2 xác nhận rule).
- [x] Bảng ánh xạ `code=SHIP-001` → UUID và `shipmentKey=keccak256(UTF8(UUID))`; provisioning/Device–Shipment ở MySQL, không yêu cầu contract đăng ký device/key. Tạo shipment off-chain không đồng nghĩa policy đã fund trên chain.
- [x] Violation evidence schema, thời điểm Backend phát hiện, policy/beneficiary/oracle requirements, payout event uniqueness.
- [x] RPC retries / receipt-confirmation semantics kỳ vọng.

**Không được** tự chọn tên method/ABI nếu Member 2 chưa xác nhận. Nếu ABI chưa có, mock adapter theo interface đã thỏa thuận.

### 5.2. Member 2 → Member 1

Yêu cầu bàn giao để mở khóa **Phase 5 và Phase 6 on-chain**:

- [x] Data Integrity ABI, Insurance ABI, địa chỉ hai contract, network/chain ID, RPC endpoint, số confirmations/testnet.
- [x] `anchorBatch(...)`, `getBatch/verifyBatch(...)`, `reportViolation(...)` method signature **chính xác**, tham số/ABI encode và examples.
- [x] Quy tắc `batch_key`, `shipment_key`, `BatchAnchored`, `InsurancePaid` event schemas, role/permission của anchorer và Oracle.
- [x] Sample tx, cách đọc receipt/event/on-chain state, replay/duplicate protection và các failure cases.
- [ ] Hồ sơ compile/deploy Remix: Solidity full version, optimizer/runs, EVM target, dependency versions, constructor args, source revision/checksum, manifest `deployments/sepolia.json` chỉ sau deploy thật; Remix test suite + pytest/Web3.py scenario map, fixtures root và `blockchain/INTEGRATION.md` cập nhật.

**Acceptance gate mới:** Member 1 chạy ít nhất một anchor + receipt/event + root readback và một insurance payout/balance check **trên Sepolia qua Alchemy** với ABI từ Remix. Mock tests mở khóa phát triển, không thay bằng chứng demo chính thức; Hardhat local chỉ là lịch sử.

### 5.3. Member 1 → Member 3 (Frontend & QA)

Bàn giao **ngay từ Phase 0/3**, không chờ Blockchain:

- [x] `docs/contracts/api-v1.md`, OpenAPI URL/export, example request/response/seed data.
- [x] Type/schema cho device status, signed telemetry public view, missing sequences, integrity summary/batches và audit alerts.
- [x] Contract §3.6 cho form ID/tên device, tạo chuyến theo `code`, DeviceView/list/key status, dropdown gán bằng UUID và lỗi `DEVICE_ALREADY_ASSIGNED`; chỉ script cấp public key, UI không nhập khóa.
- [x] Các trạng thái `DATA_VERIFIED`, `DATA_INCOMPLETE`, `DATA_ANCHORED`, `DATA_INTEGRITY_FAILED`, `BLOCKCHAIN_PENDING`, `BLOCKCHAIN_FAILED` và payout riêng.
- [x] Blockchain tx schema **tách anchoring tx và insurance payout tx**, kèm receipt/confirmation semantics.
- [x] Error schema, pagination, filter, auth requirements, demo scenario matrix.
- [ ] **Render production URL thật** và CORS whitelist khi deploy thành công.

### 5.4. Member 3 → Member 1

- [x] Feedback API/TypeScript schema khi mock và backend thực tế không khớp.
- [x] Local/production origin cần whitelist CORS và yêu cầu Frontend environment variables.
- [x] Trường loading/timeout/retry để UI hiển thị khi Render cold start hoặc RPC pending.
- [x] Các kịch bản demo cần API/seed và kỳ vọng hiển thị verification/alerts.
- [x] QA report theo test case, không sửa trực tiếp Backend nếu chưa có PR/owner review.

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
| T19 | Đăng ký device chưa key/chưa chuyến | `201`, tên được lưu, list/detail có `has_public_key=false`, `current_shipment_id=null`; signed ingest bị chặn |
| T20 | Tạo code `SHIP-001`, gán UUID trả về, cấp public key | Mỗi bước độc lập; `has_public_key=true`; mẫu P-256 đúng được lưu, không tự tạo policy funded trên chain |
| T21 | Device lạ, chưa gán, gán sang chuyến khác hoặc key thiếu/revoked | Từ chối theo §3.6, không accepted record/Merkle/evidence |
| T22 | Gán một device sang hai chuyến, cả khi concurrent | Tối đa một dòng active; request xung đột `409`; nhiều device cùng chuyến hợp lệ |
| T23 | Bỏ gán rồi đổi chuyến | History/batch cũ không đổi, counter tiếp tục; payload chuyến cũ bị chặn khi assignment không còn active |
| T24 | Provisioning hai device, nhầm private PEM, retry upload | Hai cặp key khác nhau, private PEM bị từ chối, upload retry không tự sinh/ghi đè khóa; không secret trong Git/UI/DB/log |
| T25 | Trùng device ID/code và admin credential sai | `409 DEVICE_EXISTS`/`DUPLICATE_SHIPMENT_CODE`; thao tác admin không đủ quyền bị chặn |
| T26 | Login đúng/sai, brute force và auth config thiếu | JWT có TTL/subject đúng; sai 401, rate limit 429; thiếu cấu hình fail closed, không log password/token |
| T27 | Bearer thiếu/expired/tampered/sai subject/alg/thiếu exp, chỉ gửi header API key cũ | Mọi API Admin đọc/ghi/verify/retry/reconcile bị chặn; không fallback auth cũ |
| T28 | ESP32 không có JWT / Admin chỉ có JWT | Signed telemetry hợp lệ vẫn nhận; JWT không thay ECDSA hoặc cấp role contract; không register/thêm Admin |
| T29 | Alchemy lỗi 429/timeout, tx pending/revert, sai chain/address/ABI, thiếu gas | Mock RPC kiểm tra outbox/reconcile/nonce; Sepolia opt-in đối chiếu receipt/event/state, không success chỉ từ hash |

### 6.2. Demo theo thứ tự nên trình bày

- [ ] **Đăng nhập rồi mở Dashboard:** duy nhất Admin login nhận JWT; shipment hiện vị trí `backend_simulated`, policy nhiệt độ, trạng thái cảm biến và public Backend URL đang hoạt động. Hết hạn đăng nhập lại; Logout xóa token ở UI.
- [ ] **Chuẩn bị bằng Admin UI:** đăng ký `ESP32-001`/tên → tạo mã chuyến `SHIP-001` (lưu UUID trả về) → chọn device/chuyến và gán. UI thấy "Chưa cấp public key". Trên máy tin cậy chạy script, nạp `config.h` qua USB, đăng ký public key qua `/keys`; UI refetch thấy "Đã có public key", không hiển thị private key.
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
- Chụp kết quả **Sepolia `11155111`**, receipt/events và bản ghi MySQL/API; ảnh local/Hardhat trước đây phải có nhãn lịch sử, không dùng làm bằng chứng deploy mới.
- Nếu một bước chưa tích hợp, trình bày minh bạch là **mock/pending** thay vì mô tả như đã chạy thực tế.

---

## 7. Security, Reliability và vận hành

### 7.1. Security checklist

- [x] ECDSA P-256/mbedTLS chuẩn, secure RNG, không tự phát minh chữ ký/hashing; golden cross-platform tests.
- [x] Chỉ public key ở Backend; ESP32 private key và Oracle/anchorer private key tách biệt; quản lý rotation/revocation.
- [x] Mỗi ESP32 có cặp khóa riêng; script tạo key local không overwrite; `config.h` chứa khóa thật bị Git bỏ qua. Không có private key trong React, API request/response, MySQL, Blockchain, screenshot hay log; xử lý cấp khóa bằng USB, không cần PKI/OTA.
- [x] HTTPS + certificate verification trên ESP32 và Frontend; không dùng HTTP public, không disable SSL validation.
- [x] Admin auth, permissions, validation, rate limit/body limit, CORS allowlist, hạn chế request log dữ liệu nhạy cảm.
- [ ] Một Admin qua env/JWT, fail closed, chữ ký/expiry/subject/alg được kiểm tra; không Admin API key/header cũ, không user/role/session table; login rate limit và HTTPS. CORS cho phép Bearer nhưng không cấp quyền.
- [x] Unique sequence/idempotency, anomaly audit, time skew check, anti-replay, last-seen monitoring.
- [x] Parameterized SQL/ORM, migration versioning, least-privilege DB user, connection TLS/backup/restore.
- [x] Block explorer/event/receipt verification thay vì tin `transaction_hash` tồn tại.
- [x] `.env.example` placeholder, secret trên Render env, `.gitignore`, key-leak review.

### 7.2. Reliability checklist

- [x] Telemetry transaction commit trước outbox submission; không mất dữ liệu khi Blockchain/RPC lỗi.
- [x] Database và blockchain retry tách biệt, timeout/backoff, status persisted, idempotency key, dead-letter/admin retry.
- [x] Với Render Free không giả định in-process background worker hoạt động đều khi instance sleeping; khi cần payout tự động với độ trễ cam kết thì xem xét worker/paid service thích hợp.
- [x] Health liveness tách khỏi readiness của MySQL; lỗi DB/RPC được giám sát nhưng không làm lộ cấu hình.
- [x] Batch sealing/reverification có transaction và concurrency control; chống nhiều worker cùng anchor một batch.
- [x] Log correlation IDs theo `device_id`, `shipment_id`, `batch_id`, `evidence_id`, `tx_hash` (không log secret).

Tóm tắt workflow thay thế, package NTD → NTK, công việc Sepolia và rủi ro/test: [NTD §12](ROADMAP_NTD_BLOCKCHAIN_SMART_CONTRACT.md#12-tóm-tắt-chuyển-đổi-và-rủi-ro-cần-kiểm-thử--dùng-chung-ba-roadmap).

---

## 8. Danh sách deliverables và trạng thái thực hiện

| Deliverable | Owner | Hoàn thành khi |
|---|---|---|
| Firmware DHT22 + `config.example.h` + provisioning Python/USB guide | Member 1 | Cặp key riêng/device, chỉ public key qua API, file thật gitignored, signed fixture verified |
| Simulator nhiều kịch bản có ký số | Member 1 | Chạy T01–T06 và T16 không cần ESP32 |
| FastAPI register/list/assign/key + shipments/telemetry API | Member 1 | Contract §3.6, auth, bước độc lập, một assignment active và signed ingest có test |
| Login + JWT dependency + config/runbook chuyển đổi | Member 1 | §3.2.1, T26–T28, không API key Admin/fallback, không users table, monitoring và Admin routes đều được bảo vệ |
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

**Chưa thể đánh dấu hoàn tất từ thay đổi tài liệu:** tiến độ/checkbox lịch sử được giữ nguyên. Đối chiếu tĩnh hiện thấy DTO ID/tên, GET device list, DeviceOut/key status, `AdminSession` cho create/verify và revision `20261115_03` đã có code; không tự tick nhiệm vụ hoặc suy ra đã kiểm thử/deploy. Provisioning script, JWT và chuyển runtime sang Remix/Sepolia/Alchemy vẫn cần thực hiện; board, MySQL production và URL Render/Frontend cần bằng chứng riêng.

## 9. Các quyết định còn cần xác nhận / blockers trước khi thực thi

1. **Phần cứng:** xác nhận board/Arduino core/mbedTLS và cross-test DHT22 GPIO 27; tiếp tục dùng Preferences/NVS hiện có, không bắt buộc thêm secure element cho demo.
2. **Crypto/provisioning:** P-256 + SHA-256, DER/Base64 và `key_id` đã có code; cần script local/USB, kiểm chứng key trên board thật, quy trình revoke/add key khi lộ.
3. **Canonicalization/Hash:** Members 1–2 xác nhận `SIGNED-TELEMETRY-v2`, compatibility v1, `MERKLE-v1`, `bytes32` `batch_key` và danh sách field được hash; không cho thay đổi ngầm.
4. **Insurance evidence:** cả nhóm chốt `PAYOUT_REQUIRES_ANCHORED_EVIDENCE`, cách xử lý nếu vi phạm 15 phút nhưng một batch chưa anchor/verify được, max allowed gap.
5. **Chain đã chọn:** Ethereum Sepolia `11155111`, Remix + MetaMask deploy, Alchemy RPC do NTK tạo. Còn thiếu deployment thật, ABI/settings/manifest, addresses/roles, confirmations và funding; không mở lại lựa chọn local Hardhat làm gate.
6. **Production:** chọn external MySQL provider, vùng triển khai, TLS, backup, budget Render, domain thực tế/CORS; Free chỉ phù hợp demo, không phải monitoring SLA.
7. **Tích hợp đăng ký:** triển khai DTO/view/migration §3.6 và cập nhật caller cùng lúc; cả ba roadmap đã được sửa đồng bộ trong lượt này, nhưng thay đổi tài liệu không thay thế kiểm thử code, MySQL hoặc xác nhận của từng owner.
8. **Auth đã chọn:** một Admin/JWT §3.2.1; còn triển khai dependency/settings/login/limiter và client/script migration. `api-v1.md`, `backend/README.md`, `.env.example`, Render Blueprint và `docs/deployment/render.md`/`render-wokwi.md` phải bỏ yêu cầu API key Admin/local chain ở quy trình mới; các link đó hiện còn baseline cũ, không dùng làm chỉ dẫn auth/chain mục tiêu cho tới khi owner cập nhật.

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

*Lượt cập nhật này chỉ sửa **ba roadmap**, giữ phân công, tiến độ, checkbox và bằng chứng Hardhat lịch sử. Thiết kế mới là một Admin/JWT và Remix + Sepolia + Alchemy + Web3.py; các nhiệm vụ chuyển đổi đều chưa được tự đánh dấu hoàn thành. Không sửa `.env`, source, ABI, migration, API/client thực thi hoặc deploy. Giữ `SIGNED-TELEMETRY-v1`, `MERKLE-v1`, quy tắc 15 phút, evidence, anti-replay và chống payout trùng.*
