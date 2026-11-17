# ROADMAP THÀNH VIÊN 2 — Blockchain và Smart Contract

> **Dự án:** `smart-coldchain-insurance`  
> **Phụ trách:** Member 2 — NTD, **owner của `blockchain/`**  
> **Mục tiêu nâng cấp:** triển khai **Data Integrity Contract** để neo Merkle Root của telemetry lên Blockchain, đồng thời **giữ và hoàn thiện Insurance Contract** để tiếp nhận bằng chứng vi phạm, kiểm soát Oracle và chi trả token demo an toàn.  
> **Kết quả mong đợi:** hai contract giữ ABI/nghiệp vụ hiện có, compile/test bằng Remix, deploy bằng Remix + MetaMask lên **Ethereum Sepolia `11155111`**, có ABI/manifest/receipt và `blockchain/INTEGRATION.md` để NTK kết nối bằng **Python Web3.py qua Alchemy HTTPS RPC**.
> **Trạng thái tài liệu:** KẾ HOẠCH CẬP NHẬT — không ngụ ý source code, hợp đồng, deployment hay test đã được thực hiện.

> **Điều chỉnh thiết kế demo 2026-11-15:** Đồng bộ [roadmap NTK](ROADMAP_NTK_IOT_BACKEND.md) và [roadmap TTDK](ROADMAP_TTDK_FRONTEND_QA.md); chỉ điều chỉnh tích hợp bị ảnh hưởng bởi đăng ký/gán/cấp khóa. Repo đã có hai contract, ABI/adapter và `blockchain/INTEGRATION.md`; phần thiết kế bên dưới dùng để đối chiếu/tái sử dụng, **không yêu cầu viết lại contract**. Giữ nguyên checkbox/tiến độ lịch sử; lượt này không chạy lại test, deploy hoặc sửa Solidity.

> **Chuyển đổi 2026-11-15 — PLANNED, chưa triển khai:** Quy trình mới **Solidity → Remix Compiler → Remix Solidity Unit Testing → Remix + MetaMask deploy → Sepolia → Alchemy RPC → Python Web3.py**. Không dùng Hardhat setup/config/node/tests/deployment scripts/Ignition hoặc localhost `31337` làm dependency/gate nghiệm thu mới. Mọi checkbox đã tick và kết quả local bên dưới là **lịch sử legacy**; giữ nguyên source/tests/artifacts và bằng chứng, không coi chúng là Sepolia `DEPLOYED`. Node.js chỉ còn cần cho React Vite, không yêu cầu cài để làm Smart Contract. Tài liệu này và hai roadmap liên quan là phạm vi chỉnh sửa; việc port tests/cập nhật runtime/runbook vẫn chưa thực hiện.

**Auth thống nhất:** một Admin được NTK cấu hình qua `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET_KEY` → `POST /api/v1/auth/login` → JWT Bearer cho FastAPI. Không Register/thêm Admin/đa vai trò/bảng users/refresh session, không `ADMIN_API_KEY`/`X-Admin-Key` trong thiết kế mới. JWT không cấp quyền Owner/Oracle/anchorer và không đi vào calldata; không lưu username/password/JWT lên Blockchain hay thêm Admin Contract. ESP32 vẫn ký P-256 riêng, không dùng JWT Admin. Chi tiết [NTK §3.2.1](ROADMAP_NTK_IOT_BACKEND.md#321-login-của-duy-nhất-admin--contract-mới-planned).

### Quy trình demo và định danh dùng chung

**Admin login/JWT → đăng ký thiết bị → đăng ký chuyến hàng → liên kết thiết bị với chuyến hàng → cấp khóa cho ESP32 → ESP32 ký và gửi dữ liệu → Backend xác minh Public Key → MySQL → Merkle Root → Web3.py → Alchemy RPC → Ethereum Sepolia → Insurance.**

- Device đăng ký bằng `device_id = "ESP32-001"`, `device_name = "Cold Chain Sensor 01"`, chưa cần key/chuyến. Mỗi device có tối đa một assignment active; nhiều device có thể cùng một shipment. Bỏ gán cũ rồi mới đổi chuyến, giữ sequence và dữ liệu lịch sử.
- Mã chuyến Admin nhập `SHIP-001` là **`shipments.code`**, còn `shipments.id` là **UUID v4 chữ thường do Backend tạo**. UUID là `shipment_id` trong path, signed payload, assignment và input cho `shipmentKey`; không hash `code` thay UUID. Frontend hiển thị mã dễ đọc, Backend/adapter dùng ID chuẩn.
- NTK quản lý registry, tên, public key và assignment hoàn toàn ở **Backend/MySQL**. Script Python trên máy tin cậy tạo một cặp ECDSA P-256 riêng/device, private key vào `config.h` rồi nạp USB, public key SPKI PEM qua API admin. Không PKI/OTA/remote provisioning và không có UI nhận private key.
- Chỉ device đăng ký/active, đúng assignment, có key active, ký đúng **ECDSA P-256 + SHA-256 / SIGNED-TELEMETRY-v1**, sequence hợp lệ mới tạo accepted telemetry. Payload không hợp lệ chỉ audit, không vào Merkle batch/evidence.
- **Không đăng ký ESP32 trên Blockchain, không đưa public/private key hoặc từng record lên chain, không thêm Device Registry Contract.** `deviceKey = keccak256(UTF8(device_id))` trong batch metadata chỉ là hash định danh, **không phải khóa mật mã ESP32**.
- `ColdChainDataIntegrity` tiếp tục lưu root/batch commitment; `ColdChainInsurance` xử lý policy/payout; Backend tiếp tục là Oracle và Blockchain Adapter. Tạo shipment trong MySQL chưa đồng nghĩa policy đã được tạo/fund trên chain.

Chi tiết request/response, lỗi và schema dùng chung: [NTK §3.6 và Phase 3](ROADMAP_NTK_IOT_BACKEND.md#36-contract-mục-tiêu-cho-đăng-ký-gán-chuyến-và-cấp-khóa--jwt-chưa-triển-khai). Phần JWT/Sepolia mới vẫn là thiết kế, chưa tự được nghiệm thu.

---

## 1. Phạm vi và ranh giới sở hữu

### 1.1. Bạn chịu trách nhiệm

- Thiết kế, viết, kiểm thử và triển khai **Data Integrity Smart Contract** (module A): neo batch hash/Merkle Root, metadata tối thiểu, phân quyền anchor, chống đăng ký lặp, bất biến sau khi neo, truy vấn/đối chiếu và phát event.
- Tiếp tục xây dựng **Insurance Smart Contract** (module B): quản lý policy, beneficiary, quỹ token demo, Oracle, ghi nhận vi phạm, chống payout trùng và phát `InsurancePaid`.
- Quản lý Solidity/Remix IDE, compiler/dependency settings, Remix Unit Testing, pytest/Web3.py contract scenarios, deployment Sepolia bằng MetaMask và ABI/manifest. Tái sử dụng contract hiện có, không đổi constructor/events/access control/logic chỉ vì đổi công cụ.
- Xác định và tài liệu hóa chính xác các quy tắc **`shipmentKey`, `batchKey`, `deviceKey`, Merkle Root, `evidenceHash`, event/transaction receipt** cùng NTK.
- Cung cấp ABI, contract address, RPC configuration, chain ID, quyền `ANCHORER`/`ORACLE`, error codes, events và ví dụ giao dịch đã test cho NTK.
- Hỗ trợ Member 1 xác minh giao dịch từ Backend adapter, hỗ trợ Member 3 hiểu ý nghĩa status thông qua REST API (không để frontend gọi Blockchain trực tiếp).
- Kiểm thử các failure mode: gửi trùng, thiếu quyền, revert, RPC lỗi, pending transaction, timeout và payout lặp.

### 1.2. Ranh giới không được vượt qua

- **Không sửa** `device/` hoặc `backend/` của Member 1; không đưa logic Web3 vào Backend thay NTK.
- **Không sửa** `frontend/` của Member 3; không yêu cầu Frontend giữ private key, ký giao dịch hoặc truy cập RPC cho nghiệp vụ.
- **Không tự đổi** `docs/contracts/api-v1.md` hay schema của Backend; mở issue/PR đề xuất cho Member 1 chốt khi cần.
- Không triển khai tính năng blockchain để thay thế MySQL; không đưa raw telemetry, private key, PII hoặc payload cảm biến lên chain.
- Public key ESP32 cũng chỉ nằm trong MySQL; NTD không sở hữu cấp khóa/assignment và không yêu cầu certificate hay đăng ký key on-chain để mở khóa anchoring.
- Không tự khẳng định dữ liệu cảm biến đúng vật lý chỉ vì chữ ký hợp lệ hoặc Merkle Root đã anchor.

### 1.3. Cấu trúc thư mục mục tiêu

```text
blockchain/
├── contracts/
│   ├── ColdChainDataIntegrity.sol       # Module A: anchoring và lookup
│   ├── ColdChainInsurance.sol           # Module B: policy, oracle, payout
│   └── MockInsuranceToken.sol           # ERC-20 demo (nếu dùng)
├── remix-tests/                         # Đề xuất mới: Solidity Unit Testing
│   ├── DataIntegrity_test.sol
│   └── Insurance_test.sol
├── python-tests/                        # Đề xuất mới: pytest/Web3.py opt-in Sepolia
│   ├── test_data_integrity_sepolia.py
│   ├── test_insurance_sepolia.py
│   └── fixtures/                        # Dùng golden vectors NTK, không tạo protocol khác
├── compiler-settings.json               # Đề xuất: full solc/OZ/optimizer/EVM/source metadata
├── deployments/
│   ├── localhost.json                   # Nếu có: bằng chứng legacy, không dùng trên Sepolia
│   ├── sepolia.json                     # Chỉ tạo sau receipt deploy thật
│   └── abi/                             # ABI Remix đúng source/settings deploy
├── scripts/, test/, artifacts/          # Hardhat cũ: giữ nguyên như legacy, không gate mới
├── hardhat.config.ts, package*.json     # Baseline legacy; không yêu cầu npm install
├── .env.example                        # Chỉ placeholder
├── README.md
└── INTEGRATION.md                       # Source of truth Blockchain ↔ Backend
```

Cây trên là **kế hoạch**, không khẳng định các file Remix/Python/manifest đã có. Giữ nguyên source và các đường dẫn legacy hiện có; không di chuyển/xóa tests/artifacts lịch sử trong lượt này. README/INTEGRATION cần chỉ rõ legacy và hướng dẫn mới không đòi Hardhat.

---

## 2. Kiến trúc và quy ước kỹ thuật bắt buộc

### 2.1. Luồng dữ liệu mới — hai module hợp đồng, một Backend Oracle

```text
Admin → register device (ID/name) → create shipment (code → UUID) → assign in MySQL
    → trusted Python provisioning → config.h / USB → public key registration via admin API

ESP32 + DHT22
    │  Signed Telemetry (ECDSA P-256, sequence_number, timestamp)
    ▼
FastAPI Backend (Member 1; chạy public trên Render khi deploy)
    │  Check registered active device / shipment assignment / public key in MySQL
    │  Verify signature / sequence / gap / replay
    ▼
External MySQL (toàn bộ accepted telemetry và audit)
    │
    ├──► Integrity Service (Member 1)
    │       ├─ Canonical record, SHA-256 leaf hashes
    │       ├─ MERKLE-v1 root theo batch đã SEALED
    │       └─ Python Web3.py → Alchemy HTTPS RPC → anchorBatch(...) on Sepolia 11155111
    │                              ▼
    │                 Data Integrity Contract (Member 2)
    │                   └─ batchKey → immutable root + event
    │
    └──► Violation Service (Member 1)
            ├─ ≥15 phút liên tục theo received_at, đủ dữ liệu
            ├─ Chữ ký / sequence / data integrity được chấp nhận
            ├─ Kiểm tra policy và anchor evidence (theo policy đã chốt)
            └─ Authorized Backend Oracle → reportViolation(...)
                                         ▼
                              Insurance Contract (Member 2)
                                ├─ Verify caller/policy/anti-duplicate
                                └─ Demo ERC-20 payout + InsurancePaid

Frontend (Member 3) ── REST API ──► FastAPI Backend
```

- **MySQL** lưu telemetry, chữ ký, device metadata, batch membership, root, integrity status, tx metadata, vi phạm và insurance records; **Blockchain** lưu commitment tối thiểu và giao dịch bảo hiểm.
- **Data Integrity Contract** không đọc JSON telemetry, không xác minh trực tiếp ECDSA chữ ký của ESP32 và không phát hiện sample bị mất. Backend thực hiện các kiểm tra đó; contract ghi và trả về root bất biến sau khi được authorized anchorer gửi.
- **Insurance Contract** không kết nối cảm biến/HTTP và không tự tính 15 phút; Backend là **Oracle có trách nhiệm** đối với dữ liệu nghiệp vụ, contract kiểm soát quyền gọi, policy và việc chuyển token.
- **Blockchain failure** phải độc lập với persistence telemetry: khi RPC lỗi, Backend lưu trạng thái pending/failed ở MySQL và retry theo cơ chế durable outbox, không bỏ mẫu cảm biến.
- **Public Backend** trên Render là trách nhiệm NTK; NTK tạo Alchemy Ethereum Sepolia app và giữ RPC URL thật trong Backend env. NTD bàn giao ABI/address/chain/roles; Alchemy chỉ là RPC provider, không lưu telemetry hoặc blockchain riêng. Không để frontend/ESP32 trực tiếp điều khiển contract.

### 2.2. Giữ nguyên các nguyên tắc từ Roadmap gốc

1. Backend là **Oracle**, không đưa private key Oracle vào frontend; Member 1 sở hữu adapter.
2. Mỗi policy chỉ được chi trả **một lần** theo luật demo, kể cả khi request lặp.
3. Vi phạm nhiệt độ được xác định theo ngưỡng riêng từng shipment và thời gian **liên tục 15 phút**; dùng `received_at` do Backend tạo để đánh giá quan sát. Contract không tự suy luận khi thiếu dữ liệu.
4. GPS/vị trí được Backend mô phỏng (`location_source = "backend_simulated"`) nếu chưa có GPS thực, **không** dùng để chứng minh hành trình vật lý hoặc kích hoạt bảo hiểm.
5. Token demo trên local/testnet không phải tiền thật; `insured_amount_vnd` không phải mặc nhiên số token payout.
6. Mọi tx `pending` hoặc `failed/reverted` không được hiển thị thành công; phải có receipt + đối chiếu on-chain/event.
7. Không ghi từng telemetry thành một Blockchain transaction; mỗi batch chứa nhiều bản ghi và có một root đại diện.
8. API dùng chung thuộc `docs/contracts/api-v1.md` do Member 1 quản lý; giao diện contract nguồn chuẩn là `blockchain/INTEGRATION.md` do Member 2 quản lý.

### 2.3. Quy ước trạng thái xuyên 3 Roadmap

| Nhóm | Trạng thái | Ý nghĩa đối với Module Blockchain |
|---|---|---|
| Dữ liệu | `DATA_VERIFIED` | Backend đã chấp nhận signed telemetry theo quy tắc chữ ký/sequence; **không** đồng nghĩa đã anchor. |
| Độ đầy đủ | `DATA_INCOMPLETE` | Mất sequence / gap / không đủ mẫu; **không** tự suy ra temperature breach. |
| Batch | `BLOCKCHAIN_PENDING` | Giao dịch anchor chưa được xác nhận theo số confirmations đã chốt. |
| Batch | `DATA_ANCHORED` | Tx anchor receipt thành công, đọc lại root đúng và confirmations đạt yêu cầu. |
| Batch | `BLOCKCHAIN_FAILED` | Anchor thất bại/revert hoặc không thể xác nhận; cần kiểm tra trạng thái chain trước retry. |
| Xác minh | `DATA_INTEGRITY_FAILED` | Backend tính lại root khác root đã SEALED/on-chain; phải cảnh báo, không ghi đè commitment. |
| Insurance | `EVIDENCE_PENDING` | Đủ điều kiện nhiệt độ nhưng bằng chứng còn chờ integrity/anchor theo chính sách. |
| Payout | `PENDING` / `CONFIRMED` / `FAILED` | Tách riêng trạng thái giao dịch bảo hiểm, không dùng trạng thái anchor làm payout. |

**Lưu ý:** `DATA_ANCHORED` và `DATA_INCOMPLETE` có thể đồng thời đúng (batch đã anchor nhưng số sequence có gap). Hệ thống không nên gộp mọi trạng thái thành boolean `verified=true`.

### 2.4. Stack và bảo mật

- Stack mục tiêu: **Solidity + Remix IDE + MetaMask + Ethereum Sepolia + Alchemy + Python Web3.py/pytest**. Remix VM dùng cho unit tests không tốn gas; demo chính thức trên Sepolia. Pin compiler đầy đủ, optimizer/runs, EVM target và dependency trước compile/deploy; không yêu cầu node local, Hardhat hoặc Node.js cho NTD.
- Ưu tiên thư viện phổ biến đã được kiểm thử như **OpenZeppelin** cho access control, ERC-20, SafeERC20 và reentrancy protection (nếu cần); không tự viết token/kiểm soát quyền thiếu kiểm thử.
- Chỉ tài khoản **local/testnet demo**; không kết nối ví nắm giữ tài sản thật. Tách quyền deploy/admin, anchorer, oracle và token funder nếu thực tế phù hợp.
- Secret nằm trong `.env` local được gitignore hoặc secret manager của môi trường chạy; **`.env.example` chỉ placeholder**. Không ghi private key/mnemonic vào `deployments/*.json`, log, README hay repo.
- Event và metadata dùng dữ liệu tối thiểu; on-chain public và gần như không thể xóa, tránh lưu telemetry, thông tin cá nhân hoặc tọa độ chi tiết.

---

## 3. Cross-Team Integration Contract — phải khóa trước khi triển khai

### 3.1. Member 1 → Member 2: input/hồ sơ quy tắc

NTK chịu trách nhiệm cung cấp trước khi NTD chốt ABI:

- [ ] `SIGNED-TELEMETRY-v1`: payload, `device_id`, `key_id`, ECDSA P-256 + SHA-256, chữ ký DER/Base64, thứ tự canonical JSON, quy tắc tăng `sequence_number` theo device, `received_at` do server tạo.
- [ ] `MERKLE-v1`: canonical accepted record **theo byte**, các field được hash, leaf/parent hash, sort order, odd-leaf rule, golden fixtures 1/2/3/5 mẫu.
- [ ] Quy tắc batch: mỗi `(shipment_id, device_id)`, tối đa 100 bản ghi hoặc 5 phút (đề xuất cấu hình), batch membership không đổi sau `SEALED`.
- [ ] Batch metadata (`batch_id`, `shipment_id`, `device_id`, `first/last_sequence_number`, `record_count`, start/end time, `merkle_root`, `hash_version`).
- [ ] Dự thảo anchor payload, lookup/verify expectations, idempotency key và cách xử lý pending/failed.
- [ ] Insurance evidence: `violation_evidence_id`, `shipment_id`, `detectedAt`, telemetry/batch references, policy, rule 15 phút, điều kiện xử lý gap và trạng thái integrity.
- [ ] Yêu cầu backend Oracle, authorized anchorer, nhận tx receipts/events và data để Frontend hiển thị.
- [ ] Ánh xạ `code=SHIP-001` → UUID `shipments.id`; snapshot request/DeviceView §3.6 NTK và quan hệ `device_assignments` một active/device. Hồ sơ chỉ mô tả public metadata/giả định kiểm chứng, **không bàn giao khóa ESP32 cho contract/NTD**.

**Điểm khóa:** NTD **không** đoán cách canonicalize telemetry từ tên field; phải nhận fixture do NTK xuất và tính được expected root giống nhau. Các thông số chưa thống nhất phải đánh dấu `TBD` thay vì triển khai ngầm.

### 3.2. Member 2 → Member 1: package bàn giao

- [ ] **ABI** cho `ColdChainDataIntegrity` và `ColdChainInsurance`, và `MockInsuranceToken` khi sử dụng.
- [ ] Contract **addresses thực** theo network tương ứng, RPC URL không chứa secret, `chainId`, deployment transaction hash và version ABI.
- [ ] Exact function signatures, Solidity type order, return values, custom errors và event definitions.
- [ ] Công thức/fixtures cho `shipmentKey`, `batchKey`, `deviceKey`, `evidenceHash`, bytes32 encoding/decoding.
- [ ] Ví dụ `anchorBatch`, `getBatch`, `verifyBatch`, `createPolicy`, `reportViolation`, event/receipt, cả success lẫn revert.
- [ ] Quyền `ANCHORER` và `ORACLE`, cách cấp/thu hồi quyền và cấu hình address; **không** chuyển private key qua Git/tài liệu.
- [ ] Quy tắc finality/confirmations, tx status, duplicate, nonce/retry sau RPC timeout và cách phân loại thất bại.
- [ ] Hồ sơ compile/deploy Remix (full compiler version, optimizer/runs/EVM, dependency, source revision/checksum, constructor args), manifest Sepolia/receipt thật, Remix test + pytest/Web3.py scenario map, fixtures và `blockchain/INTEGRATION.md`. Không bàn giao script Hardhat như điều kiện chạy mới.

**Acceptance gate:** NTK tự làm được tối thiểu 1 anchor → receipt/event → đọc root khớp Python và 1 payout demo → event/state/balance delta **trên Sepolia qua Alchemy**, dùng ABI từ Remix. Mock/legacy pass không thay gate Sepolia; NTD không phải sửa Backend.

### 3.3. Member 1 ↔ Member 3; Member 2 hỗ trợ gì?

- Member 1 cung cấp `docs/contracts/api-v1.md`, OpenAPI, device/telemetry/integrity/batch/transaction schemas, status enums, Render public URL sau khi deploy; Member 3 tích hợp **chỉ qua REST API**.
- Member 3 phản hồi CORS origins, API types, loading/error states, Blockchain pending, integrity warning và demo acceptance; không quyết định trực tiếp ABI.
- NTD cung cấp **event semantics** và explorer/network metadata **thông qua NTK**; giúp QA kiểm tra `BatchAnchored`, `InsurancePaid`, không yêu cầu frontend đọc RPC/contract hoặc tự suy luận thành công chỉ từ `tx_hash`.
- Khi thay ABI/hash/rule: tạo PR cập nhật `blockchain/INTEGRATION.md` và tests/fixtures → gửi NTK duyệt adapter/API impact → thông báo Member 3 → mới merge; breaking change cần version/migration plan.

### 3.4. API và schema đăng ký demo — tác động tới Blockchain

Prefix `/api/v1`; ba roadmap dùng cùng contract mục tiêu ở NTK §3.6:

| Method | Endpoint | Request / response cần biết | Hiện trạng |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | `{username, password}` → `{access_token, token_type: "bearer"}` | **Mới, chưa triển khai**, thuộc NTK; không liên quan ABI |
| `POST` | `/api/v1/devices` | `{device_id, device_name}` → `201 DeviceView`, chưa key/chuyến | Đã có DTO độc lập; cần JWT, chưa xác nhận deploy |
| `GET` | `/api/v1/devices` | `{items: DeviceView[], total}`, gồm device chưa key/chưa gán | Đã có trong code; cần JWT |
| `POST` | `/api/v1/shipments` | `code`, cargo, origin/destination, ngưỡng/thời lượng, VND → `201 ShipmentDetail` có `id` UUID | Đã có `AdminSession`; thay API key bằng JWT |
| `GET` | `/api/v1/shipments` | `{items: ShipmentDetail[], total}` | Có; giữ nguyên |
| `POST` | `/api/v1/devices/{device_id}/assignments` | `{shipment_id: UUID, active: true/false}` → `200 DeviceView` | Có; **cần chặn gán active sang chuyến khác**, cùng cặp idempotent |
| `POST` | `/api/v1/devices/{device_id}/keys` | Script gửi `{key_id, public_key_pem}` → `201 DeviceView` | Có; tái sử dụng sau đăng ký, không thêm `/public-key` |
| `POST` | `/api/v1/shipments/{shipment_id}/telemetry` | Signed v1 với UUID và `key_id` bắt buộc → `201`, duplicate hợp lệ `200` | Có; giữ protocol/anti-replay |

- `DeviceView` giữ `device_id`, `status`, `last_sequence_number`, `last_seen_at`, `keys`, `assignments`, `device_name`, `has_public_key`, `current_shipment_id` (UUID hoặc `null`). Đối chiếu tĩnh `DeviceOut` đã có các field; hai trường tổng hợp suy ra từ key/assignment active. Không coi việc đọc code là test/deploy và không tạo transaction on-chain cho view này.
- Các thao tác quản trị/monitoring dùng **JWT Bearer** sau login một Admin; provisioning script cũng login rồi upload public key, không đặt token/password trong ESP32. Không thêm alias `/assign`. Đăng ký/gán/cấp key độc lập; `has_public_key=true` chỉ nói có key active trong DB, không chứng minh board đã flash đúng khóa. Ingestion vẫn ECDSA riêng. API key hiện có là baseline cần loại bỏ, không fallback.
- Giữ lỗi `409 DEVICE_EXISTS`, `DUPLICATE_SHIPMENT_CODE`, `KEY_EXISTS`; thêm `409 DEVICE_ALREADY_ASSIGNED` khi gán sang chuyến khác. Unknown/unassigned/key missing/invalid signature bị Backend chặn theo NTK §3.6. Không nhận telemetry thì không có leaf, anchor hoặc payout evidence tương ứng.
- MySQL dùng lại `devices.id` (API `device_id`), `device_keys` (public PEM, PK device/key), `device_assignments` (device/shipment, active), `shipments.id` UUID và `code` unique, `telemetry` + `signed_telemetry_receipts` (unique device/sequence), `ingestion_audit`. NTK thêm `devices.device_name` và constraint một assignment active/device bằng migration mới; không tạo bảng registry/policy on-chain để thay DB.
- Tạo shipment off-chain trước, rồi tiếp tục quy trình seed/`createPolicy(shipmentKey, ...)` hiện có khi cần demo bảo hiểm. **Không đổi ABI, event, logic payout hoặc evidence hash vì thao tác đăng ký mới.** Cùng UUID phải đi xuyên MySQL → canonical signed record → batch → policy/Oracle.
- Anchor/status đọc bằng các API có sẵn: `/shipments/{shipment_id}/batches`, `/batches/{batch_id}`, `/shipments/{shipment_id}/integrity`; insurance tx từ ShipmentDetail `blockchain.transaction_hash`, anchor tx từ `anchor_transaction.transaction_hash` của batch. Backend trả payout `not_requested/evidence_pending/pending/paid/failed`; `CONFIRMED` ở roadmap/UI là nhãn của `paid` sau xác nhận chain, không phải enum mới bắt buộc.

**Kết luận tác động:** thay đổi chính nằm ở NTK (DTO/view/auth/migration/provisioning) và TTDK (form/dropdown/QA); NTD đối chiếu ID/hash và regression hai contract. Không phát sinh module Smart Contract thứ ba.

---

## 4. Thiết kế Data Integrity Contract và quy tắc hash

### 4.1. Phân biệt chữ ký số, Merkle Root và on-chain anchoring

| Cơ chế | Chủ trì | Có thể chứng minh | Không tự chứng minh |
|---|---|---|---|
| ECDSA P-256 ký telemetry | ESP32 + NTK verify | Payload được ký bởi private key tương ứng key thiết bị đã đăng ký | Cảm biến vật lý đo đúng, thiết bị chưa bị chiếm quyền |
| Merkle Tree + SHA-256 | NTK | Nội dung batch canonical chưa bị thay so với root đã đóng | Không có gap, dữ liệu gốc chính xác thực tế |
| Data Integrity Contract | NTD | Root nào đã được anchor bởi tài khoản được cấp quyền trên chain | Các mẫu trong batch đều hợp lệ nếu Backend ký/verify sai |
| Insurance Contract | NTD | Authorized Oracle báo vi phạm, contract đã xử lý policy/payout theo logic on-chain | Vi phạm cảm biến là thật nếu Oracle không đáng tin |

### 4.2. Quy tắc `MERKLE-v1` khớp Roadmap NTK

**Quy tắc chung giữa Python (NTK), pytest/Web3.py và fixture Remix (NTD), không phải logic dựng tree chạy trong Solidity:**

1. Chỉ batch những **accepted telemetry đã verify chữ ký**; mỗi batch cho đúng một `(shipment_id, device_id)` và đã khóa membership (`SEALED`).
2. Sắp xếp record theo `sequence_number` **tăng dần**; Backend phải lưu `leaf_index`/membership, không phụ thuộc thứ tự SELECT mặc định.
3. Canonical record là compact UTF-8 JSON với key **ASCII ascending**, timestamp UTC chuẩn hóa, số đã scale dạng integer (không float), các field đã thống nhất chính xác: `payload_version`, `shipment_id`, `device_id`, `key_id`, `sequence_number`, `temperature_milli_c`, `humidity_milli_pct`, `recorded_at`, `received_at`, `firmware_version`, `signature` (Base64 chuẩn). **Không hash các trường status thay đổi theo thời gian**.
4. `leaf = SHA256(0x00 || canonical_record_utf8)`.
5. `parent = SHA256(0x01 || left_hash_32bytes || right_hash_32bytes)`.
6. Nếu tầng có số node lẻ, **nhân đôi node cuối tại tầng đó**; với 1 leaf thì root chính là leaf; **batch rỗng không được anchor**.
7. `merkleRoot` là **đúng 32 byte**; Solidity nhận `bytes32`; chuỗi hex `0x` + 64 hex chỉ là biểu diễn. **Không** `keccak256(hex-string)` lại, không đổi sang SHA-3, không encode cả JSON thành ABI để thay root.
8. `hash_version = "MERKLE-v1"` lưu ở MySQL/API/INTEGRATION; nếu đổi quy tắc phải tăng phiên bản và đối chiếu fixture trước khi thay code.

> **Yêu cầu kiểm thử byte-level:** fixture 1/2/3/5 leaf ghi `canonical_record_utf8_hex`, `leaf_hash_hex`, `merkle_root_hex`. Pytest tính lại đúng Python root rồi Web3.py anchor/readback trên Sepolia; Remix tests dùng cùng expected bytes32. Giữ golden vectors và mọi scenario TypeScript cũ trong bảng đối chiếu port test, không xóa case khi bỏ công cụ. Smart Contract **chỉ lưu/check** `bytes32`, không tự dựng tree từ raw telemetry.

**Hash Chain:** chỉ tùy chọn để nối audit log hoặc các batch theo thời gian, phải có domain/version riêng. Không dùng Hash Chain làm tên gọi khác của Merkle root, không bắt buộc triển khai trong MVP.

### 4.3. Quy tắc định danh `bytes32` — giữ INTEGRATION hiện có

Giữ quy tắc đã có trong `blockchain/INTEGRATION.md` và adapter; thao tác đăng ký mới không thay đổi các byte đầu vào:

```text
shipmentKey = keccak256(UTF8(shipment_id))
batchKey    = keccak256(UTF8(batch_id))
deviceKey   = keccak256(UTF8(device_id))
```

- Dùng bytes UTF-8 của **ID đúng như được Backend phát hành**, không tự trim, lowercase, chuẩn hóa Unicode hay encode UUID theo dạng nhị phân. Nên giới hạn ID ở ASCII có pattern/version rõ ràng để tránh nhập mơ hồ.
- `keccak256` **chỉ dùng cho chuyển ID sang `bytes32`**; **Merkle hash vẫn là SHA-256** như §4.2. Không đánh đồng hai hash function.
- `batchKey` là **định danh duy nhất của batch**, không dùng `merkleRoot` làm key (hai batch khác nhau được phép có root giống nhau nếu nội dung trùng).
- `shipment_id` là UUID `shipments.id`, **không** phải mã `SHIP-001`; đổi tên device hoặc mã hiển thị không được đổi key của batch/policy đã tồn tại. `deviceKey` là hash định danh, không phải public key P-256.
- Giữ **`evidenceHash = keccak256(UTF8(event_id))`** như `blockchain/INTEGRATION.md`/adapter hiện có; `event_id` là UUID của sự kiện `INSURANCE_TRIGGERED`. Evidence chi tiết vẫn do Backend lưu/verify. Không tạo thêm giao thức `EVIDENCE-v1` hoặc hash JSON mới cho yêu cầu đăng ký.
- Sau khi thống nhất, viết bảng vectors bằng input string, UTF-8 hex, expected bytes32 vào `blockchain/INTEGRATION.md`. Một giao thức đã chốt **không tự đổi** khi triển khai.

### 4.4. Module A — `ColdChainDataIntegrity.sol`

**Mục tiêu:** lưu root bất biến cho mỗi batch đã khóa và cho Backend tra cứu/đối chiếu. Contract không cần lưu toàn bộ metadata telemetry có trong MySQL.

**Giao diện tham chiếu v1:** đối chiếu ABI/source/`INTEGRATION.md` hiện có khi tích hợp, không sinh contract registry hay đổi signature do thay đổi đăng ký.

```solidity
function anchorBatch(
    bytes32 batchKey,
    bytes32 shipmentKey,
    bytes32 deviceKey,
    bytes32 merkleRoot,
    uint64 firstSequence,
    uint64 lastSequence,
    uint32 recordCount
) external;

function getBatch(bytes32 batchKey) external view returns (Batch memory);
function verifyBatch(bytes32 batchKey, bytes32 candidateRoot)
    external view returns (bool);

// Event đề xuất, chốt chữ ký cụ thể trước khi viết adapter:
event BatchAnchored(
    bytes32 indexed batchKey,
    bytes32 indexed shipmentKey,
    bytes32 indexed deviceKey,
    bytes32 merkleRoot,
    uint32 recordCount,
    address anchoredBy
);
```

**Quy tắc contract:**

- [ ] Chỉ địa chỉ **`anchorer` được cấp quyền** theo contract hiện có có thể gọi `anchorBatch`; owner quản lý bằng `setAnchorer`. `ANCHORER` trong roadmap chỉ vai trò nghiệp vụ, không bắt buộc thêm `ANCHORER_ROLE`/đổi access-control ABI.
- [ ] Từ chối `batchKey == 0`, `merkleRoot == 0`, `recordCount == 0`, và `firstSequence > lastSequence`; validate input/phạm vi type phù hợp.
- [ ] Từ chối **batchKey đã tồn tại** bằng custom error; **không overwrite** root/metadata của một batch đã anchor, kể cả owner. Không có setter đổi root.
- [ ] Root/metadata đã lưu chỉ đọc; `verifyBatch`/`getBatch` phải báo rõ **unknown batch** khác **root mismatch**. Nếu `verifyBatch` trả `false` cho unknown batch thì API phải gọi `getBatch` để phân biệt.
- [ ] `recordCount` **không bị ép bằng** `lastSequence - firstSequence + 1`, bởi telemetry có thể có sequence gap. Gap validation thuộc Backend.
- [ ] Không đưa danh sách samples, signed payload, tọa độ, `received_at` từng record hoặc public/private key lên chain.
- [ ] Emit `BatchAnchored` sau khi state anchor được ghi thành công; cung cấp `batchKey`, root và metadata cần đối chiếu từ state/event.
- [ ] Contract không tự xử lý network retry; **NTK** quản lý retry/receipt/outbox. Contract bảo đảm duplicate prevention nếu request gửi lặp.

**Metadata bắt buộc giữ bên MySQL:** `batch_id`, `shipment_id`, `device_id`, `batch_start_time`, `batch_end_time`, `record_count`, `first_sequence_number`, `last_sequence_number`, `merkle_root`, `anchor_tx_hash`, `anchor_status`, `verification_status`, `chain_id`, `contract_address`. Blockchain chỉ cần commitment + các ID/sequence/count đã thống nhất; không dùng on-chain storage để thay DB.

**Optional hậu MVP:** Merkle inclusion proof cho một telemetry cụ thể. Nếu thêm `verifyProof`, đặc tả rõ leaf orientation/index và odd-leaf handling; không quảng bá có proof khi mới chỉ có `verifyBatch` so root.

### 4.5. Giao dịch anchoring và trạng thái Backend cần đọc

1. Backend seal batch và persist outbox trong MySQL, tạo `batchKey`, `merkleRoot` theo `MERKLE-v1`.
2. Backend adapter gửi `anchorBatch` bằng **authorized anchorer** đúng chain ID, address, ABI; nhận `tx_hash` thì mới chỉ là **`BLOCKCHAIN_PENDING`**.
3. Đọc receipt, yêu cầu `status = 1`; đọc `BatchAnchored` và `getBatch(batchKey)`/`verifyBatch(batchKey, root)`; chờ số confirmations đã thống nhất.
4. Chỉ sau khi **receipt + root on-chain + confirmations** đều đúng mới chuyển `DATA_ANCHORED`. `tx_hash` tồn tại không chứng minh thành công.
5. Nếu timeout RPC mà không chắc transaction đã nộp, **tra tx hash, nonce/contract state theo batchKey trước khi retry**; không tạo giao dịch đè nonce ngẫu nhiên hoặc gửi mãi.
6. Nếu reorg/revert/khác root/khác network, giữ trạng thái pending/failed phù hợp; có audit/log và cơ chế đối soát. Không tự sửa root đã seal trong DB để cho khớp chain.
7. Khi Backend tính lại record Merkle Root và phát hiện lệch, gắn `DATA_INTEGRITY_FAILED` và ngăn dùng batch đó làm bằng chứng hợp lệ cho payout theo policy. **Không xóa hay thay on-chain root cũ**.

Định nghĩa confirmations/polling phải khóa cho **Sepolia** với NTK; đề xuất demo `BLOCKCHAIN_CONFIRMATIONS=2`, receipt timeout 120 giây, chưa phải kết quả kiểm thử/finality tuyệt đối. Pending quá HTTP timeout vẫn cần đối soát receipt/state; không đánh dấu thành công/thất bại chỉ vì hết thời gian chờ.

---

## 5. Thiết kế Insurance Contract — giữ chức năng gốc

### 5.1. Module B — `ColdChainInsurance.sol`

**Chức năng bắt buộc giữ:**

- Quản lý policy theo `shipmentKey`; chống tạo policy trùng, có `beneficiary`, demo `payoutAmount`, thời hạn và trạng thái đã chi trả.
- Funding/escrow **token demo** (ví dụ ERC-20), bảo đảm contract có đủ nguồn để chi trả khi policy hợp lệ; thiết kế funding minh bạch.
- Chỉ authorized `ORACLE` của Backend được gọi `reportViolation`; owner/admin quản trị/rotate Oracle với access control, có events.
- `reportViolation` kiểm tra policy tồn tại, đã fund, điều kiện thời gian/hiệu lực, chưa payout, `evidenceHash` hợp lệ theo interface và caller được ủy quyền.
- Chặn double payout theo **policy** và evidence/event key đã chốt; ghi state **trước** external token transfer; dùng `SafeERC20`, cân nhắc `ReentrancyGuard`.
- Giao dịch thành công phát event `InsurancePaid` có đủ trường đối soát beneficiary, amount, shipmentKey, evidenceHash và timestamp.
- Revert rõ với `UnauthorizedOracle`, `UnknownPolicy`, `DuplicatePolicy`, `ExpiredPolicy`, `UnfundedPolicy`, `AlreadyPaid`, `InvalidEvidence` (tên cuối cùng do implementation quyết định).
- **Không** dùng token demo để khẳng định hợp đồng bảo hiểm hợp pháp hoặc thanh toán VND thật.

**Interface tham chiếu từ contract/INTEGRATION hiện có:** giữ kiểu ABI khi tái sử dụng.

```solidity
function createPolicy(
    bytes32 shipmentKey,
    address beneficiary,
    uint256 payoutAmount,
    uint256 expiry
) external;

function reportViolation(
    bytes32 shipmentKey,
    bytes32 evidenceHash,
    uint256 detectedAt
) external;

function setOracle(address newOracle) external;
function getPolicy(bytes32 shipmentKey) external view returns (Policy memory);

// Events tối thiểu:
event PolicyCreated(...);
event InsurancePaid(...);
event OracleUpdated(...);
```

- Source/ABI và `blockchain/INTEGRATION.md` quyết định chữ ký thực tế; snippet không phải bằng chứng deploy. Yêu cầu đăng ký mới **không cần thêm** `violationEvidenceId`, `batchKey`, `policyVersion` vào `reportViolation`; giữ ABI đã dùng bởi adapter.
- `detectedAt` là thời gian Backend xác lập sự kiện, thường là Unix seconds từ `received_at`; contract có thể kiểm tra reasonable bounds nhưng **không tự xác thực độ chính xác** của event time do Oracle gửi.
- **Giữ expiry hiện có:** `reportViolation` từ chối nếu `block.timestamp > policy.expiry`, kể cả khi `detectedAt` trước expiry. Không có reporting grace period trong đợt chuyển công cụ; test độ trễ anchor, chọn expiry demo đủ dài và không backdate/đổi clock để vượt điều kiện.

### 5.2. Quan hệ giữa Data Integrity và Insurance

MVP đề xuất **hai contract độc lập** để trách nhiệm rõ ràng:

1. Member 1 verify telemetry, sequence, gap và tính khoảng vi phạm **liên tục ít nhất 15 phút** bằng `received_at` và policy của shipment.
2. Backend tạo evidence đã version hóa, gắn các `batchKey`/Merkle Root liên quan, xác minh trạng thái data integrity.
3. **Giữ `PAYOUT_REQUIRES_ANCHORED_EVIDENCE=true` mặc định ở Backend hiện có:** chỉ gửi `reportViolation` khi các batch bằng chứng cần thiết đã `DATA_ANCHORED`, root tính lại khớp on-chain, không có gap khiến chuỗi 15 phút không đủ tin cậy. Nếu chưa đủ → API `evidence_pending` (nhãn `EVIDENCE_PENDING`), **không** payout.
4. Insurance Contract kiểm tra caller **ORACLE**, policy và anti-duplicate; contract **không** tự xác minh 15 phút hoặc proof nếu chưa được thiết kế thêm một interface on-chain rõ ràng.
5. Khi anchor thành công muộn, Backend đối soát lại bằng chứng và policy/reporting window rồi mới gửi Oracle transaction; không coi pending là payout.
6. Nếu data tamper/chain mismatch/gap/offline → Backend chặn hoặc cần review theo policy, không mặc định `INSURANCE_TRIGGERED` hay thanh toán.
7. Nếu cần chứng minh trực tiếp trên chain rằng `batchKey` đã tồn tại, có thể bổ sung `DataIntegrityContract` reference trong Insurance Contract; **việc này chỉ chứng minh batch đã anchor**, không chứng minh các mẫu trong batch đủ điều kiện nhiệt độ. Phải tránh tạo phụ thuộc chu kỳ hoặc giả vờ có verifiable off-chain computation.

### 5.3. Funding và payout token demo

- Chỉ định rõ issuer/funder, token contract address, decimals, lượng token cho mỗi policy và cách cấp vốn (`approve` + `transferFrom` hoặc transfer vào vault theo mô hình đã chọn).
- Tránh nhầm lẫn `insured_amount_vnd` trong API với đơn vị token demo: API có thể hiển thị riêng `payout_amount_token_raw`, `token_symbol`, `token_decimals`.
- Đảm bảo token funded được quản lý nhất quán, không tạo nhiều policy cùng tiêu quỹ đã cam kết vượt khả năng chi trả; test insolvency/insufficient balance.
- Xử lý ERC-20 không tuân chuẩn/transfer failure bằng thư viện kiểm thử phù hợp; transaction revert không được để status thành công.
- Không cần marketplace, DAO, NFT, token thật hay hệ thống giám định pháp lý trong MVP.

---

## 6. Roadmap theo Phase (điều chỉnh theo dependency kỹ thuật)

> Quy ước: checkbox `- [ ]` là **chưa xác nhận hoàn thành**. Các phase được phép **làm song song có kiểm soát** khi đã có contract mock/fixture; không tự coi dependencies hoàn tất. Mỗi phase có Definition of Done (DoD) cụ thể.

### Phase 0 — Contract Integration Design & Architecture

**Phụ thuộc:** NTK công bố dự thảo `docs/contracts/api-v1.md`, protocol ký và Merkle/violation fixtures; vẫn có thể dựng prototype trước khi ABI khóa.

**Việc cần làm**

- [ ] Xác nhận sở hữu `blockchain/`, tiếp tục nhánh phù hợp repo; đọc source/ABI/constructor và hồ sơ compiler/dependency hiện có để tái sử dụng. Đánh dấu toolchain Hardhat cũ là legacy trong README/INTEGRATION, không xóa code/tests/artifacts.
- [ ] Thống nhất **2 module**: `ColdChainDataIntegrity` và `ColdChainInsurance`, `MockInsuranceToken` tùy chọn; liệt kê rõ ai deploy/admin/anchor/oracle/fund.
- [ ] Chốt `shipmentKey`, `batchKey`, `deviceKey` và `evidenceHash` mapping với NTK, bao gồm input bytes/encoding, domain/version, expected hex vectors.
- [ ] Chốt `MERKLE-v1` byte-level từ NTK (SHA-256, prefix `0x00/0x01`, odd leaf duplicate) và nguồn fixture cross-language.
- [ ] Dự thảo `anchorBatch/getBatch/verifyBatch`, `createPolicy/reportViolation`, events, errors, payout funding/expiry và duplicate rules.
- [ ] Giữ `PAYOUT_REQUIRES_ANCHORED_EVIDENCE=true`, rule 15 phút/gap/anti-replay và policy expiry hiện có; khóa confirmations/polling Sepolia với NTK. Không thêm grace period hoặc sửa logic chỉ vì đổi IDE.
- [ ] Xác nhận auth một Admin/JWT thuộc NTK/TTDK: không JWT/password trong Solidity, không đổi Owner/Oracle/anchorer, ABI/events/constructor do thay đăng nhập. NTK tạo Alchemy app; NTD nhận public signer addresses để deploy/đặt quyền.
- [ ] Tạo bản đầu `blockchain/INTEGRATION.md` có interface proposal **gắn trạng thái PROPOSED/APPROVED**, gửi cho Member 1 và nhận phản hồi; thông báo requirements UI qua NTK cho Member 3.
- [ ] Ghi rõ địa chỉ deploy/RPC chưa có nếu chưa deploy thực tế, không sử dụng địa chỉ ví dụ như thông số production.
- [ ] Đánh giá contract impact của §3.4 cùng NTK: registry/key/assignment ở MySQL, dùng UUID cho shipmentKey; lập kết luận không cần ABI mới hoặc Device Registry Contract. Giữ `SIGNED-TELEMETRY-v1`, `MERKLE-v1`, evidence hash và logic insurance hiện có.

**Definition of Done**

- [ ] Có interface specification đã được NTK xác nhận hoặc blocker list ngắn gọn; không còn hash method do Member 1 phải tự đoán.
- [ ] Có golden fixture/plan nhận fixture, data types, roles, enum transaction/event và acceptance criteria.
- [ ] Không có breaking schema change chưa thông báo cả nhóm.
- [ ] NTK/TTDK hiểu cùng một ánh xạ `SHIP-001` (`code`) → UUID (`shipment_id`) → `shipmentKey`; không có yêu cầu đăng ký ESP32 hoặc public key on-chain.

### Phase 1 — Remix Setup & Contract Compilation

**Phụ thuộc:** Phase 0 khóa ID/root encoding; có source Solidity và browser với MetaMask. **Thiết kế mới, chưa nghiệm thu.**

**Việc cần làm**

- [x] Mở [Remix IDE](https://remix.ethereum.org/), import nguyên source `ColdChainDataIntegrity.sol`, `ColdChainInsurance.sol`, `MockInsuranceToken.sol` (nếu dùng); không viết lại contract. Không cần npm/Hardhat/Node.js cho compile/deploy.
- [x] Đối chiếu baseline & chọn compiler trên Remix: `0.8.36+commit.8a079791`, optimizer bật `200` runs, EVM target `osaka`, `viaIR: false`, OpenZeppelin `5.6.1`; lưu snapshot tại `blockchain/compiler-settings.json` và hướng dẫn tại `blockchain/REMIX_SETUP.md`.
- [x] Pin OpenZeppelin `5.6.1` theo `compiler-settings.json` mà không sửa import trong `.sol` ở Git.
- [x] Compile cả 3 contract trên Remix sạch lỗi, lưu ABI vào `blockchain/ABI.md` và đối chiếu 100% signature parity với Backend bằng `blockchain/scripts_py/validate_remix_abi.py`.
- [ ] Đối chiếu quyền owner/anchorer và `setAnchorer` hiện có; giữ quyền cấp/thu hồi, event và test permission. Không chuyển sang `DEFAULT_ADMIN_ROLE`/`ANCHORER_ROLE` chỉ vì quy trình đăng ký mới.
- [ ] Tái sử dụng `ColdChainDataIntegrity.sol`: `Batch` metadata, immutable `batchKey`/`merkleRoot`, duplicate prevention/custom errors; chỉ sửa khi có lỗi nghiệp vụ đã chứng minh, không do đổi toolchain.
- [ ] Kiểm tra `anchorBatch/getBatch/verifyBatch`, `BatchAnchored` đúng source/ABI hiện có; không ghi raw telemetry.
- [ ] Kiểm thử `bytes32` roundtrip và root bắt nguồn SHA-256; lưu đơn vị test dùng fixture thay vì tính hash theo Solidity khác quy tắc.
- [ ] Viết test từ account có quyền/không quyền, batch rỗng, zero IDs/root, duplicate key, root immutable và retrieval.
- [ ] Không đưa claim "on-chain validates sensor" vào docs hoặc UI metadata.
- [ ] Đối chiếu/tái sử dụng `ColdChainDataIntegrity.sol` đã có, giữ mô hình owner/anchorer hiện tại nếu đáp ứng quyền; không bắt buộc chuyển sang AccessControl chỉ để phục vụ đăng ký demo. `deviceKey` chỉ là hash ID, không cần contract quản lý public key.

**Definition of Done**

- [ ] Cả ba source compile bằng Remix với settings/dependency cố định; có hồ sơ tái lập và ABI khớp interface cũ. Test Module A qua Remix ở Phase 4, không dùng Hardhat pass làm DoD mới.
- [ ] `batchKey` chưa có → anchor được; cùng key gửi lại → revert; batch cũ không sửa được.
- [ ] `getBatch`/`verifyBatch` trả đúng root byte-for-byte từ golden fixture NTK.

### Phase 2 — Batch Anchoring, Verification & Python/Web3.py Fixtures

**Phụ thuộc:** Module A có ABI; NTK cung cấp canonical batch fixtures.

**Thứ tự nghiệm thu:** fixtures và Remix/mock assertions là DoD phát triển trước deploy. Anchor/readback/event **Sepolia** được kiểm chứng sau Phase 5 trong Phase 6, không chặn chính bước deploy để tránh dependency vòng.

**Việc cần làm**

- [ ] Port fixture reader/hash assertions sang **Python pytest** dùng golden vectors NTK cho 1/2/3/5 record; so canonical bytes/leaf/root từng byte. Remix tests dùng expected root, không viết lại Merkle bằng Solidity. Giữ TypeScript fixture/tests cũ trong legacy để đối chiếu coverage scenario.
- [ ] Dựng test anchor một batch đã seal, query root by `batchKey`, xác minh match và mismatch; test hai batch khác key nhưng cùng root vẫn hợp lệ.
- [ ] Chạy thử event `BatchAnchored`: topic/indexed args, field order và giải mã từ ABI; cung cấp ví dụ cho Backend.
- [ ] Test batch có gap: `recordCount` thấp hơn khoảng first/last sequence **không bị Contract suy ra thành thông tin nhiệt độ**; Backend giữ trạng thái `DATA_INCOMPLETE`.
- [ ] Test pending/duplicate/reorg assumptions ở mức mock adapter/integration test phù hợp; contract revert gửi trùng theo đúng error.
- [ ] Tài liệu hóa vòng đời `SUBMITTED → MINED → CONFIRMED` và cách Backend lấy receipt, check `status=1`, `getBatch` và số confirmations.
- [ ] Nếu Solidity không expose proof-of-inclusion, ghi rõ `verifyBatch` **chỉ so root được cung cấp với root lưu**, không verify từng telemetry.
- [ ] Regression ID mapping: shipment có `code=SHIP-001` vẫn anchor bằng `keccak256(UTF8(UUID))`; nhiều device cùng shipment tạo batch riêng, đổi assignment không sửa batch/policy đã neo. Sample bị NTK từ chối vì chưa đăng ký/gán/cấp key không được có trong fixture batch hợp lệ.

**Definition of Done**

- [ ] NTK và NTD tạo **cùng 32-byte root** trên cùng fixture; có bằng chứng test.
- [ ] Pytest offline/mock chạy không RPC/khóa ví/gas; anchor/readback thật chạy opt-in sau Phase 5 trên Sepolia qua Alchemy và dùng ABI export từ Remix.
- [ ] Anchor + readback + decoded event khớp; mismatch trả false hoặc custom error đúng contract.
- [ ] `blockchain/INTEGRATION.md` đủ thông tin cho Backend tích hợp batch anchoring.
- [ ] Đường đi đăng ký mới không đòi hỏi thay đổi calldata/ABI/events; on-chain không có PEM/private key/từng telemetry, chỉ giữ commitment và metadata tối thiểu như cũ.

### Phase 3 — Insurance Contract, Policy Funding & Demo Payout

**Phụ thuộc:** Phase 0 đã khóa `shipmentKey`, `evidenceHash`, Oracle role, reporting window và token scheme; có thể phát triển song song với Phase 1/2.

**Lịch sử đã thực hiện — giữ nguyên checkbox local, không xác nhận Sepolia:**

- [x] Giữ và hoàn thiện `ColdChainInsurance.sol` theo chức năng gốc: policy, beneficiary, payout amount, expiry, trạng thái và event.
- [x] Tạo/điều chỉnh `MockInsuranceToken.sol` nếu chọn ERC-20 demo; sử dụng thư viện tiêu chuẩn và khởi tạo funding trong seed script.
- [x] Implement `createPolicy(...)`; ngăn duplicate shipment, policy invalid/zero beneficiary/zero amount và xử lý quỹ demo nhất quán.
- [x] Implement `reportViolation(...)` chỉ cho authorized Oracle; kiểm tra policy status, expiry/reporting window, đủ quỹ và chống double payout.
- [x] Kiểm soát `setOracle(...)` hoặc AccessControl role rotation chỉ owner/admin; emit `OracleUpdated`/role events.
- [x] Áp dụng checks-effects-interactions, SafeERC20, guard phù hợp; tránh reentrancy hoặc state không nhất quán khi transfer lỗi.
- [x] Emit `PolicyCreated`, `InsurancePaid` gồm `shipmentKey`, `evidenceHash`, `detectedAt`, beneficiary và amount theo interface đã duyệt.
- [x] Định nghĩa hành vi khi evidence pending: **Backend không gửi transaction**, contract không tự chấp nhận sự thiếu dữ liệu như vi phạm.

**Definition of Done**

- [x] Tạo policy được fund; authorized Oracle report hợp lệ → chuyển đúng token demo và emit event.
- [x] Unauthorized/expired/unfunded/duplicate đều revert đúng; không có double payout khi gửi lại.
- [x] Payout amount và beneficiary trong on-chain state/event khớp token transfer thực tế.

**Công việc/DoD mới — chưa triển khai:**

- [ ] Compile/test lại `ColdChainInsurance`/token hiện có trong Remix, giữ constructor `(payoutToken, oracle)` và `MockInsuranceToken(initialSupply)`, ABI/events/Owner/Oracle, rule expiry và anti-double-payout.
- [ ] Với token hiện có, insurer phải có đủ MINS và gọi `approve(insuranceAddress, payoutAmount)` rồi `createPolicy(shipmentKey, beneficiary, payoutAmount, expiry)`; contract `safeTransferFrom` khóa vốn ngay lúc tạo policy. Transfer token trực tiếp vào vault không thay bước approve/createPolicy. Ghi raw units/18 decimals, insurer/beneficiary và expiry UTC.
- [ ] Sau Phase 5, kiểm tra funding/Oracle/payout trên Sepolia: receipt success, `InsurancePaid`, `getPolicy`/balance delta đúng; expiry/thiếu quỹ/transfer fail/duplicate không trả paid. Contract hiện kiểm tra `block.timestamp > expiry`; không thêm grace period hoặc mock time-travel lên Sepolia. Negative cases khó dựng trên testnet dùng Remix/mock và có nhãn bằng chứng.

### Phase 4 — Remix Contract Testing, Security & Python Failure Scenarios

**Phụ thuộc:** Module A và B có implementation đủ kiểm thử. Viết test song song mỗi khi có function mới.

**Lịch sử Hardhat đã thực hiện — giữ nguyên bằng chứng, không thay test suite mới:**

- [x] Test role admin/anchorer/oracle: account trái quyền không anchor/payout/rotate được, revocation có hiệu lực.
- [x] Test unknown batch, zero root, duplicate `batchKey`, mismatch root, immutable root, cùng root/khác ID.
- [x] Test policies: tạo thành công, duplicate, insufficient funding, expired/reporting delay, transfer failure, double report/payout.
- [x] Test trạng thái trước/sau transaction revert: contract state/balance không ở trạng thái "đã chi trả" nếu chuyển token fail.
- [x] Test event args, `bytes32` encoding, hashing fixture và chain ID/deployment configuration.
- [x] Test malicious or nonstandard token trong môi trường kiểm thử (nếu token/flow thực tế có external calls), check reentrancy.
- [x] Test một vi phạm liên tục 15 phút **qua Backend mock/fixture** tạo đúng một eligible event; Contract không tự cộng sample hoặc tự chứng thực 15 phút.
- [x] Test RPC unavailable / receipt pending / reverted ở adapter mock integration theo phân công: NTD cung cấp tình huống và error matrix, NTK triển khai retry/persistence.
- [x] Chạy coverage nếu được hỗ trợ; ưu tiên critical branches hơn con số coverage hình thức. Fix mọi test fail trước merge.

**Definition of Done**

- [x] Test suite pass sạch; các case anchoring duplicate, unauthorized Oracle và double payout có test riêng.
- [x] Có bảng đối chiếu test cases với requirement, ghi rõ những case cần Backend/E2E mới kiểm chứng được.
- [x] Không còn secret/production token trong repo hoặc test fixtures.

**Việc cần làm mới — PLANNED:**

- [ ] Bật [Solidity Unit Testing plugin](https://remix-ide.readthedocs.io/en/latest/unittesting.html); tạo `*_test.sol` cho Module A/B, dùng cùng compiler/optimizer/EVM của Phase 1. Chạy trong môi trường unit test Remix; deploy demo thật vẫn Sepolia.
- [ ] Lập bảng từng scenario từ `DataIntegrity.test.ts`, `ColdChainInsurance.test.ts`, `IntegrationFlow.test.ts`, `SecurityAndFailureScenarios.test.ts`, `DeploymentWorkflow.test.ts`, `Phase6IntegrationScenarios.test.ts` → test Remix/pytest mới → output minh chứng. Không bỏ coverage vì khác công cụ.
- [ ] Remix kiểm tra owner/anchorer/Oracle grant/revoke, unauthorized, batch zero/duplicate/immutable, unknown/get/verify match/mismatch, events/bytes32, policy/funding/expiry/transfer fail/reentrancy/double payout. Khi Remix không diễn đạt tốt, chuyển chính scenario sang pytest/Web3.py hoặc mock đúng tầng; không bỏ case.
- [ ] Pytest/Web3.py Sepolia opt-in kiểm tra transactions/receipt/events/balance và root Python ↔ chain; NTK phối hợp FastAPI/adapter/evidence tests. Mock RPC/contract cho timeout, 429, receipt pending/revert, reorg, connection loss, nonce reconciliation và restart, không cần ép lỗi hạ tầng thật.
- [ ] Default unit tests không gửi tx và không yêu cầu ví/RPC; suite có marker/cờ opt-in Sepolia, preflight chain `11155111`, code/address/roles, đủ gas, dataset riêng. Ghi lệnh chạy mới cùng dependencies Python; các file/marker mới là đề xuất chưa tồn tại.

**Definition of Done mới:**

- [ ] Mọi scenario lịch sử có mapping sang Remix/Python với kết quả hoặc `NOT_TESTED/BLOCKED` và owner; không dùng tổng số Hardhat pass để chứng minh suite mới đã pass.
- [ ] Quyền anchor/Oracle, duplicate batch/payout, root immutability, retrieval/verify, expiry/funding/failed tx và mismatch/tamper có test riêng; mặc định offline, Sepolia smoke có bằng chứng riêng.

### Phase 5 — Sepolia Deployment bằng Remix & ABI Handoff

**Phụ thuộc:** Phase 1–4 đã đạt **compile + test Remix/offline**; các smoke giao dịch thật ghi ở Phase 2/3/4 thực hiện **sau deploy**, tại Phase 6. MetaMask chọn Ethereum Sepolia `11155111`, deployer/anchorer/Oracle có Sepolia ETH; NTK tạo Alchemy HTTPS RPC. Không cần node localhost/deployment scripts và không yêu cầu smoke Sepolia trước khi có contract address.

**Lịch sử deploy/local handoff — giữ nguyên, không phải hướng dẫn chạy mới:**

- [x] Viết `deploy.ts` deploy Data Integrity Contract, token demo (nếu dùng), Insurance Contract; cấu hình role, funding, oracle/anchorer addresses đúng environment.
- [x] Viết `seed-demo.ts` tạo policy/fixtures; giữ seed deterministic, tránh yêu cầu cài nhiều thứ ngoài hướng dẫn.
- [x] Viết `verify-deployment.ts` kiểm tra chain ID, bytecode tồn tại, contract address, admin, anchorer, Oracle, mock-token balance.
- [x] Với **local chain** ghi network config và deployed addresses trong `blockchain/deployments/localhost.json` (không chứa key).
- [x] Với **testnet**, chỉ tạo `deployments/<network>.json` sau khi thực sự deploy; không copy address local sang network khác. (Trạng thái: `BLOCKED` theo quy tắc DoD — ưu tiên môi trường Local EVM Node 31337 ổn định cho demo nhóm; chưa cấu hình public testnet faucet/RPC).
- [x] Bàn giao ABI đúng artifact, chain ID, addresses, RPC URL/endpoint, exact signatures, event schemas, role configuration và cách lấy receipt/log.
- [x] Hướng dẫn `npx hardhat ...` **phù hợp phiên bản đang dùng** trong `blockchain/README.md`, tránh lệnh copy từ phiên bản Hardhat khác.
- [x] Xác định số confirmations và explorer URL nếu có; ghi giới hạn local/testnet.
- [x] Tạo `blockchain/INTEGRATION.md` có ví dụ end-to-end: `shipmentKey`, `batchKey`, one anchor, `getBatch/verifyBatch`, policy creation, Oracle violation, payout receipt.
- [x] NTK thử import ABI qua adapter và báo back compatibility issue; NTD sửa đúng thư mục `blockchain/`.
- [ ] Cập nhật ví dụ seed/handoff để nhận UUID từ shipment do Admin tạo; `code` chỉ để hiển thị. Không tạo policy bằng `keccak256("SHIP-001")` trong khi Backend dùng UUID; hướng dẫn rõ tạo shipment MySQL chưa đồng nghĩa token đã fund.

**Definition of Done**

- [x] Deploy script chạy lặp lại trên local môi trường sạch; được xác minh addresses/roles/chain ID.
- [x] ABI + examples đủ để NTK gọi cả 2 contract mà không phải đoán argument order, byte encoding hay event names.
- [x] Nếu testnet chưa triển khai được, ghi `BLOCKED` và nguyên nhân; **không** trình bày URL/address placeholder như deployment thành công.

**Quy trình mới — tất cả chưa hoàn thành:**

- [x] 1. Import/compile bằng Remix (`0.8.36+commit.8a079791`, `osaka`, optimizer `200`), trong Deploy & Run dùng `Browser Extension` (MetaMask) trên Sepolia `11155111`.
- [x] 2. Deploy `MockInsuranceToken`: `0x33D620C26f045d2C60C8A29F41e987875aAEbC93` (tx `0xfae9e7...8b3711`, block `12145165`, `1,000,000 MINS`).
- [x] 3. Deploy `ColdChainDataIntegrity(0xd2D62EB2cd0731383b9F49A7e8DdD7cdD54b355E)`: `0xE04F6f1bb80C438D356E0547ec10337F33ecD81f` (tx `0x669df6...50b3f0`, block `12145351`).
- [x] 4. Deploy `ColdChainInsurance(0x33D620C26f045d2C60C8A29F41e987875aAEbC93, 0x7747f2c48C0D9562c311BbeBE4F822aE372C54bb)`: `0xeD8266444aF3506C5FceB556cA00Bf4305De1cA8` (tx `0x30ade7...16ebf0`, block `12145343`).
- [x] 5. Tách 3 ví Sepolia (`Owner: 0x66077Ef...`, `Anchorer: 0xd2D62EB...`, `Oracle: 0x7747f2c...`), đã nạp sẵn SepoliaETH (>2 ETH mỗi ví).
- [ ] 6. Cấp token demo cho insurer; approve → createPolicy như Phase 3, dùng `shipmentKey` từ UUID shipment NTK cấp, expiry còn đủ cho độ trễ anchor. Xác minh escrow balance, policy và quyền sai bị từ chối. *(Chờ Shipment UUID từ NTK).*
- [x] 7. Xác minh receipt `status=1`, bytecode và `owner()`/`anchorer()`/`oracle()`/`payoutToken()` trực tiếp trên Sepolia qua `blockchain/scripts_py/preflight_sepolia.py`.
- [x] 8. Export ABI từ Remix (`blockchain/ABI.md`), kiểm tra parity bằng `validate_remix_abi.py` và đóng gói dạng `{"contractName": ..., "abi": [...]}` tại `blockchain/deployments/abi/*.json`.
- [x] 9. Ghi manifest chính thức `blockchain/deployments/sepolia.json` (addresses, `deployTxHash`, `deployBlockNumber`, roles public, compiler settings; không chứa secrets).
- [ ] 10. Bàn giao package §3.2/§7.3 (đã viết `blockchain/HANDOFF_SEPOLIA.md`), chờ NTK cấu hình Alchemy + private keys vào Backend `.env` và xác nhận anchor/readback/payout smoke trên Sepolia.

**Definition of Done mới:**

- [x] Hai contracts và `MockInsuranceToken` có receipt `status=1`, bytecode và roles đúng trên Sepolia `11155111` tại `deployments/sepolia.json` *(bước `createPolicy` cho shipment demo chờ UUID từ NTK)*.
- [ ] NTK import ABI và chạy smoke Phase 6 bằng Web3.py/Alchemy; có tx/Etherscan/root/balance evidence. Chưa có smoke thật thì giữ trạng thái chờ NTK, không quay lại local chain làm gate nghiệm thu chính.

### Phase 6 — Python Backend Integration, Oracle & Integrity

**Phụ thuộc:** Member 1 Phase 4/5 hoàn thành canonical batch + adapter; Phase 5 của NTD đã bàn giao ABI/addresses. Insurance integration dựa trên Member 1 Phase 6.

> **Trạng thái lịch sử (`COMPLETED ON LOCAL HARDHAT NODE` — không áp dụng Sepolia):**
> - Backend PR `#27` (`7d8c823`, `d4a7fef`) đã hoàn thành `Web3IntegrityAdapter`, `IntegrityAnchorCoordinator`, `InsuranceEvidenceCoordinator` (`ANCHORED-EVIDENCE-v1`) và `backend/tests/test_blockchain_local.py`.
> - Đã kiểm chứng E2E giữa Backend thực (`FastAPI` + SQLAlchemy ORM + `Web3IntegrityAdapter` Account `#2` + `Web3BlockchainAdapter` Account `#1`) và 3 contract trong `deployments/localhost.json` trên local Hardhat node (`chainId: 31337`): signed telemetry $\rightarrow$ sealed `MERKLE-v1` batches $\rightarrow$ `anchorBatch` + `BatchAnchored` $\rightarrow$ DB tamper & co-tamper detection (`DATA_INTEGRITY_FAILED`) $\rightarrow$ 15-minute sustained breach payout (`InsurancePaid`, `1000.0 MINS`, beneficiary balance verified) $\rightarrow$ duplicate anchor/payout guards (`BATCH_ALREADY_ANCHORED`, `POLICY_ALREADY_PAID`), wrong signer (`ORACLE_MISMATCH`, `ANCHORER_MISMATCH`), wrong chain ID/contract address, insufficient funding (`E17b`), unseeded/expired policy. (Kiểm thử E2E DB tamper chạy qua SQLAlchemy trên SQLite do môi trường local không bật MySQL server; logic kiểm toán Merkle & `verify_batch` dùng chung cho cả MySQL/SQLite.)

> Kết quả local trên thuộc luồng Blockchain đã tích hợp trước thay đổi đăng ký demo. Các nhiệm vụ bổ sung về ID/tên device, gán chuyến và provisioning bên dưới vẫn chưa hoàn thành; chưa xác nhận E2E trên MySQL production, testnet hoặc Render.

**Việc cần làm**

- [x] Nhận một batch đã `SEALED` từ NTK, đối chiếu `merkleRoot`, `batchKey`, metadata; gọi `anchorBatch` **từ Backend** (NTK thực hiện adapter).
- [x] Backend kiểm tra receipt thành công và root on-chain trước khi đưa `DATA_ANCHORED`; NTD đối chiếu event/contract state/log.
- [x] Kiểm tra một batch được thay đổi record trong DB demo: recomputed root lệch dẫn đến `DATA_INTEGRITY_FAILED`, không tạo root on-chain mới để che lỗi.
- [x] Kiểm tra block RPC/timeouts: Backend ghi outbox pending, khôi phục và không gửi duplicate anchor; NTD kiểm tra contract chống duplicate.
- [x] Tạo policy test đúng `shipmentKey`, cấp quỹ token; Backend chỉ báo violation sau **15 phút liên tục** và bằng chứng integrity đủ theo policy.
- [x] Xác minh `reportViolation` do Oracle authorized gọi, receipt status, beneficiary token balance và `InsurancePaid` event; API không đánh dấu thành công khi tx pending/reverted.
- [x] Test wrong Oracle/contract address/chain ID, expired policy, insufficient funding và double request với NTK.
- [ ] Chạy đầu luồng mới cùng NTK/TTDK: đăng ký device ID/tên → tạo shipment → gán → cấp key local/USB/API public key → signed ingest; NTD chỉ nhận batch/evidence đã được Backend chấp nhận. Thiếu assignment/key phải dừng trước bước anchor/payout, không tạo workaround on-chain.
- [x] Không sửa Backend để "chữa cháy"; nếu muốn thay payload/ABI, đề xuất PR, cập nhật `INTEGRATION.md` và thông báo Member 3.

**Definition of Done**

- [x] Có 1 flow signed telemetry → DB (`MERKLE-v1`) → Merkle Root → on-chain anchor → verify root → đủ điều kiện vi phạm → Insurance payout demo.
- [x] Lỗi Blockchain không làm mất accepted telemetry; pending không hiển thị như thành công.
- [x] Mọi tx dùng chain đúng, receipt/state/event khớp; không double anchor hoặc payout ngoài mong đợi.
- [ ] Policy, anchor và evidence dùng cùng UUID shipment; không thêm transaction đăng ký device hay upload ESP32 key và không đổi logic bảo hiểm do đổi form Admin.

**Công việc/DoD mới — Python Backend Integration trên Sepolia, chưa thực hiện:**

- [ ] Bàn giao ABI/address/chain/roles từ Remix cho NTK; thống nhất thứ tự `anchorBatch`, `getBatch`, `verifyBatch`, `createPolicy`, `reportViolation`, `bytes32` ID/root, Unix seconds và units token theo ABI hiện có.
- [ ] FastAPI Admin login/JWT bảo vệ setup/verify/retry/reconcile; ESP32 gửi signed telemetry độc lập. NTK seal/tính Python root và Web3.py ký bằng anchorer → Alchemy → Sepolia; receipt/event/readback metadata + root khớp rồi mới `DATA_ANCHORED`.
- [ ] Tạo policy từ cùng UUID, cấp vốn qua approve/createPolicy; evidence liên tục ≥15 phút theo `received_at`, không gap, batch `MATCHED + DATA_ANCHORED` mới gọi Oracle. Receipt success/`InsurancePaid`/policy state/balance delta khớp mới ghi paid.
- [ ] Kiểm tra duplicate/revert/unauthorized/expired/insufficient funding; mock timeout/pending/nonce/restart với NTK. JWT Admin không cấp quyền owner/anchorer/Oracle; không sửa access control để làm smoke pass.
- [ ] Lưu output pytest/Web3.py Sepolia, receipt/tx/Etherscan và API/MySQL evidence riêng; chạy offline regression mặc định không tx. Hoàn tất các gate này mới nghiệm thu Phase 6 Sepolia; toàn bộ checked local phía trên vẫn chỉ là lịch sử.

### Phase 7 — End-to-End Blockchain Demo, Documentation & Safety Review

**Phụ thuộc:** demo chính thức cần Remix deployment Sepolia + NTK Render/external MySQL/JWT + TTDK REST client. Có thể phát triển/test Remix/mock trước Render; không dùng localhost deployment thay điều kiện nghiệm thu cuối.

**Việc cần làm**

- [ ] Hoàn thiện `blockchain/README.md`: import source/dependency → compiler settings → Remix tests/Python tests → MetaMask Sepolia deploy → roles/funding/policy → ABI/manifest → Web3.py smoke → dataset mới khi demo lại. Đánh dấu toàn bộ lệnh `npx hardhat`/npm blockchain cũ **legacy**, không yêu cầu đọc/chạy để theo flow mới; không xóa file/test lịch sử.
- [x] Hoàn thiện `blockchain/INTEGRATION.md`: cập nhật cấu hình Sepolia `11155111`, `deployBlockNumber`, wrapped ABI `deployments/abi/*.json`, ranh giới `code=SHIP-001 → UUID → shipmentKey`, và Auth JWT/MySQL ngoài chain.
- [ ] Demo minh họa **12 kịch bản bắt buộc** ở §8, phân rõ những kịch bản thuộc NTK, NTD, TTDK và cần phối hợp.
- [ ] Kiểm tra `Render public API → external MySQL → Blockchain RPC` theo pipeline Backend; nếu dùng Render Free, công bố cold start/idle limitation (không ping giả để né giới hạn).
- [ ] Rà soát secrets: demo keys chỉ nằm local env/Render env phù hợp; frontend không giữ khóa; deployment JSON không chứa mnemonic/password/RPC key.
- [ ] Tái lập workspace/compile settings và quy trình Remix trên máy khác, import ABI và xác minh Sepolia root/payout bằng Python/Web3.py; không yêu cầu cài Node.js cho blockchain.
- [ ] Đối chiếu UI với Backend: `DATA_VERIFIED`, `DATA_ANCHORED`, `DATA_INTEGRITY_FAILED`, `DATA_INCOMPLETE`, `BLOCKCHAIN_PENDING`, `BLOCKCHAIN_FAILED` và payout status không bị gộp.
- [ ] Ghi giới hạn bảo mật: Blockchain không chứng minh nhiệt độ thực, không bù được sensor tampering/compromised private key/Oracle sai, không thay thế hệ thống bảo hiểm thật.
- [ ] Chốt changelog, quyết định kỹ thuật đã duyệt, vấn đề còn pending và rollback/redeploy hướng dẫn.
- [ ] Trong `blockchain/INTEGRATION.md`/README ghi ranh giới MySQL registry/provisioning, phân biệt `deviceKey` với P-256 key, API thực tế `/keys`/`assignments` và ví dụ `code`/UUID; chỉ cập nhật mục tích hợp bị ảnh hưởng.

**Definition of Done**

- [ ] Có demo script thực thi, evidence snapshots/tx receipts + dữ liệu API và đầu ra test kiểm tra được.
- [ ] Thành viên khác có thể chạy theo README; không cần NTD trực tiếp thao tác thủ công khi demo cơ bản.
- [ ] Thông tin chain, contract, ABI, roles, test result và giới hạn được ghi trung thực; không báo `DEPLOYED` nếu chưa deploy thật.

---

## 7. Handoff, dependency và quy tắc làm việc song song

### 7.1. Bảng dependency quan trọng

| Mốc/phần việc | NTD cần nhận | NTD phải bàn giao | Người dùng đầu ra |
|---|---|---|---|
| Phase 0 → 1 | Canonical hash proposal, batch IDs, telemetry/sequence policy | `INTEGRATION.md` bản đề xuất, ABI draft, role model | NTK, TTDK qua NTK |
| Đăng ký demo | UUID trả về từ shipment, registry/key/assignment chỉ ở MySQL | Xác nhận ID mapping và không cần ABI/contract registry mới | NTK, TTDK |
| Phase 1 → 2 | `MERKLE-v1` fixtures từ NTK | Root cross-language tests + Data Integrity ABI | NTK |
| Phase 0 → 3 | `shipmentKey`, evidence/policy requirements | Insurance ABI + Oracle/payout semantics | NTK |
| Phase 4 → 5 | Contracts/test passing | Artifacts, deployed addresses, chain ID, RPC info | NTK |
| NTK Phase 5 | Backend adapter, sealed batches/outbox | Anchor event/receipt/error examples | NTK |
| NTK Phase 6 | Verified breach + anchored evidence | Payout transaction/state/event examples | NTK, TTDK qua API |
| NTK Phase 7 → demo | Render real URL, external MySQL/config, Frontend origin | Correct RPC/network config + known limits | Cả nhóm |

### 7.2. Quy tắc thay đổi và ownership

- Chỉ Member 2 trực tiếp sửa `blockchain/`. Member 1 sở hữu `device/`, `backend/`, `docs/contracts/api-v1.md`; Member 3 sở hữu `frontend/`. Tài liệu shared chỉ sửa qua PR/approval.
- Chỉ có **một nguồn chân lý**: `blockchain/INTEGRATION.md` cho ABI/hash/events/roles/deploy; `docs/contracts/api-v1.md`/OpenAPI cho REST API/enums.
- Mỗi thay đổi ABI/hash/status → issue/PR → mô tả compatibility → update tests/fixtures/docs → nhận duyệt từ NTK → thông báo TTDK; **không silently break** adapter hoặc UI.
- Được triển khai Module A và B song song sau Phase 0, nhưng **không** khai báo Phase 5/6 hoàn thành nếu ABI/hash chưa thống nhất.
- Commit/PR nhỏ theo phase, không commit private keys hoặc test wallet có thật; test pass trước merge.

### 7.3. Checklist package bàn giao cho NTK

**Package local lịch sử — giữ nguyên checkbox, không phải Sepolia handoff:**

- [x] `blockchain/INTEGRATION.md` ghi đúng **version giao thức, compiler/chain, contract addresses**.
- [x] ABI JSON của cả hai contracts + (nếu có) MockInsuranceToken.
- [x] `deployments/localhost.json` và testnet manifest **chỉ sau khi deploy**.
- [x] `batchKey` / `shipmentKey` / `deviceKey` / `evidenceHash` vector chính xác.
- [x] One successful `anchorBatch` receipt + `BatchAnchored` event + `getBatch` root.
- [x] One duplicate `anchorBatch` revert + error decode.
- [x] One successful authorized `reportViolation` receipt + `InsurancePaid` + token balance delta.
- [x] One unauthorized/reverted payout response.
- [x] Oracle/anchorer role grant/revoke scripts and documented confirmation count.
- [x] Hardhat tests và command chạy được từ môi trường sạch.
- [ ] Ví dụ `code=SHIP-001` → UUID → `shipmentKey`, xác nhận registry/key/assignment không lên chain; request/response quản trị dẫn chiếu NTK §3.6, không chốt API riêng ở Blockchain.

**Package mục tiêu Remix/Sepolia — đã bàn giao phần deploy & ABI; chờ smoke Phase 6:**

- [x] ABI JSON đóng gói sẵn `{"contractName": ..., "abi": [...]}` tại `blockchain/deployments/abi/*.json`; hồ sơ compiler `0.8.36+commit.8a079791` / `osaka` / OZ `5.6.1` và SHA-256 source trong `blockchain/compiler-settings.json`.
- [x] `deployments/sepolia.json` sau deploy thật trên `11155111` (addresses, `deployTxHash`, `deployBlockNumber`, roles `Owner`/`Anchorer`/`Oracle` đã verify on-chain; không chứa secret).
- [ ] Exact function signatures/order/types/returns/errors/events, UUID→bytes32 và golden root vectors; sample success/unauthorized/duplicate Sepolia payout receipts và policy/funding thực tế *(chờ smoke cùng NTK)*.
- [ ] Hướng dẫn Remix deploy/config roles/approve/createPolicy và pytest/Web3.py mới; scenario mapping legacy→Remix/Python không mất test. *(Đã có `REMIX_SETUP.md`, `preflight_sepolia.py`; bỏ qua phần port test case theo quyết định nhóm)*.
- [x] Environment mapping cho NTK tại `blockchain/HANDOFF_SEPOLIA.md`: phân rõ `BACKEND_ANCHORER_PRIVATE_KEY` (`0xd2D6...`) và `BLOCKCHAIN_ORACLE_PRIVATE_KEY` (`0x7747...`), `BLOCKCHAIN_CHAIN_ID=11155111`, `BLOCKCHAIN_CONFIRMATIONS=2`, `BLOCKCHAIN_RECEIPT_TIMEOUT_SECONDS=120`.

---

## 8. Ma trận kiểm thử và Demo Checklist

### 8.1. Ma trận E2E bắt buộc (NTD phối hợp NTK/TTDK)

| ID | Kịch bản | Vai trò NTD | Kết quả chấp nhận |
|---|---|---|---|
| E01 | Telemetry ký hợp lệ | Đối chiếu fixture root khi batch tạo | Backend `DATA_VERIFIED`; chưa suy ra anchored. |
| E02 | Chữ ký ESP32 sai / unknown key | Không anchor rejected sample | Backend từ chối, audit; không tạo payout. |
| E03 | Duplicate telemetry cùng payload | Đảm bảo batch membership không bị nhân đôi | Backend idempotent; không thêm leaf/anchor/payout. |
| E04 | Sequence gap | Không biến root thành lời đảm bảo không gap | `DATA_INCOMPLETE`, không tính liên tục 15 phút xuyên gap. |
| E05 | Device offline | Không coi offline là temperature breach | Cảnh báo riêng, không tự payout. |
| E06 | Batch anchoring | Tx anchor confirmed + root readback | `DATA_ANCHORED` khi receipt và confirmations đủ. |
| E07 | Data integrity verification | `getBatch/verifyBatch` trả root đúng | Backend recompute khớp `MERKLE-v1`. |
| E08 | Database tampering simulation | Root on-chain giữ nguyên | Backend `DATA_INTEGRITY_FAILED`, evidence bị chặn. |
| E09 | Blockchain root mismatch | Contract trả root khác candidate | Mismatch được báo, không sửa root đã anchor. |
| E10 | Temperature violation <15 phút | Contract không tự trigger | Không tạo eligible event/payout. |
| E11 | Temperature violation ≥15 phút | Verify đúng policy, Oracle được cấp quyền | Một eligible event; một payout sau khi evidence hợp lệ. |
| E12 | Anchor/payout tx pending | Backend nhận tx hash nhưng chưa confirmed | UI chưa báo anchored/paid; telemetry vẫn còn MySQL. |

**Các test bổ sung không thể bỏ:**

- [ ] `E13` Wrong `ANCHORER` → contract anchor revert.
- [ ] `E14` Same batchKey retry → revert/known existing state; không overwrite root.
- [ ] `E15` Wrong Oracle → reportViolation revert; không chuyển token.
- [ ] `E16` Same policy/event retry → zero additional token payout.
- [ ] `E17` Insufficient token balance/expired policy → revert, transaction failed reflected correctly.
- [ ] `E18` RPC down + Backend restart/Render cold start → telemetry/outbox still persisted, chain status retry safe.
- [ ] `E19` Tampered signature/record but unchanged `batchKey` → Backend recomputed root mismatches; chain root remains immutable.
- [ ] `E20` Chain ID/contract address mismatch → Adapter must reject or flag error, no fabricated success.
- [ ] `E21` Admin tạo device trước key/chuyến → chỉ có dòng MySQL, chưa có transaction/registry ESP32 on-chain.
- [ ] `E22` Device chưa gán/gán sai/thiếu public key → Backend reject, không có accepted leaf/batch/evidence/payout từ mẫu đó.
- [ ] `E23` `SHIP-001` là code, UUID từ response làm ID → policy và batch dùng đúng một `shipmentKey`; đổi tên device không đổi `deviceKey`.
- [ ] `E24` Gán nhiều device vào cùng shipment → các batch riêng theo device và cùng shipment UUID; ràng buộc một active shipment/device do NTK kiểm thử, không do Solidity thực thi.
- [ ] `E25` Quy trình mới chạy hết → anchoring/readback/insurance vẫn theo ABI/event/evidence gate cũ, không key ESP32 hoặc telemetry thô trong on-chain storage/calldata.

### 8.2. Kịch bản demo blockchain theo đúng thứ tự

1. **Chuẩn bị Admin/provisioning:** duy nhất Admin login/JWT rồi TTDK UI đăng ký device ID/tên → tạo mã chuyến `SHIP-001` → nhận UUID và gán; NTK script dùng JWT upload public key sau provisioning/USB. NTD tạo policy qua Remix/MetaMask bằng `shipmentKey` từ **UUID vừa tạo**, approve/fund token; UI đọc qua API. Registry không tạo giao dịch chain, token không có giá trị thực.
2. **Ký và nhận telemetry:** ESP32/simulator gửi sample, Backend verify chữ ký/sequence, ghi MySQL; chain chưa có từng sample.
3. **Kiểm tra tính toàn vẹn đầu vào:** chữ ký sai, duplicate, gap, offline được gắn trạng thái đúng; không kích hoạt bảo hiểm giả.
4. **Seal batch:** Backend dựng Merkle root bằng `MERKLE-v1`, hiển thị root/batch ID/record count/first-last seq.
5. **Anchor root:** `anchorBatch` gửi tx từ authorized anchorer → `BLOCKCHAIN_PENDING` → receipt confirmed → `DATA_ANCHORED`; đọc lại root từ contract.
6. **Verify/tamper:** verify batch bình thường `MATCHED`; chỉnh record trong MySQL demo → `DATA_INTEGRITY_FAILED`, root on-chain không đổi.
7. **Insurance flow:** reseed lại dữ liệu demo sạch; dùng virtual clock **ở local/test** minh họa đủ 15 phút nhưng không đổi luật production; sau khi evidence anchored hợp lệ, Backend Oracle gọi `reportViolation`.
8. **Xác minh payout:** receipt `status=1`, `InsurancePaid`, token balance beneficiary tăng đúng; retry không thêm payout.
9. **Pending/failed:** tạm ngắt RPC hoặc mô phỏng backend timeout, cho thấy trạng thái đúng và không mất telemetry.
10. **Public demo:** Frontend gọi **Render FastAPI URL thật** được NTK bàn giao; không gọi blockchain từ trình duyệt. Nếu public backend/testnet chưa sẵn sàng, nêu rõ phần local/mock, không giả URL hay giả tx.

### 8.3. Điều kiện hoàn thành demo

- [ ] Có ít nhất một transaction anchoring và một insurance transaction với **receipt/event/state/balance** khớp trên **Ethereum Sepolia `11155111` qua Alchemy**, ABI từ Remix; kèm Etherscan link thật. Legacy local chỉ là lịch sử.
- [ ] Hiển thị tách bạch root anchoring tx và insurance payout tx; không kết luận thành công chỉ từ tx hash.
- [ ] Phân biệt verified signature, anchored root, integrity mismatch, data incomplete và payout confirmation.
- [ ] Không tuyên bố blockchain tự đo được nhiệt độ thật; không dùng token demo là tiền thực.
- [ ] Lưu lại command/script, chain ID, contract addresses và test outputs để người khác kiểm chứng lại.

---

## 9. Security, Reliability và giới hạn hệ thống

### 9.1. Security checklist

- [ ] Dùng library tiêu chuẩn cho `AccessControl`/`Ownable`, ERC-20/SafeERC20, checks-effects-interactions/reentrancy.
- [ ] Restrict anchoring và Oracle reporting riêng biệt; không expose admin function không được kiểm soát.
- [ ] Validate zero address, bytes32, uint bound, policy lifetime và funding; chống duplicate batch/policy/payout.
- [ ] Dùng exact contract address + chain ID từ environment; không reuse manifest môi trường khác.
- [ ] Secrets trong local `.env` đã gitignore, Render Environment Variables/secret manager ở Backend; `.env.example` không có key.
- [ ] Hạn chế on-chain metadata; không đưa raw telemetry, private key, PII, GPS giả/real vào transaction.
- [ ] Không public key ESP32, PEM, `config.h` hoặc giao dịch đăng ký device trên chain. Public key chỉ ở Backend/MySQL, private key chỉ trong file local tin cậy/firmware ESP32; `deviceKey` là hash định danh.
- [ ] `evidenceHash` và Merkle root đều versioned/documented, không dùng JSON serialize mặc định không ổn định.
- [ ] Review role revocation và key rotation; nếu Oracle/anchorer bị lộ, có quy trình tắt/revoke ngay.
- [ ] Đánh giá ảnh hưởng event forgery, chain reorg, RPC lỗi, gas failure, deadline bypass và policy expiry.

### 9.2. Reliability checklist

- [ ] Backend durable outbox/idempotency + transaction receipt polling là trách nhiệm NTK; NTD xác định contract errors, replay behavior và event decoding.
- [ ] Retry sau timeout phải tra nonce/tx/state trước, không coi lỗi network là on-chain revert hoặc không hề phát giao dịch.
- [ ] Root on-chain bất biến, MySQL lưu authoritative telemetry; contract không xóa được dữ liệu thiếu và không thay thế backup database.
- [ ] Testnet có thể downtime, RPC rate limits, transaction delay/gas shortage; hệ thống phải thể hiện `BLOCKCHAIN_PENDING/FAILED` trung thực.
- [ ] Render Free nếu dùng có thể spin down; không gợi ý tự ping giả liên tục để né giới hạn.
- [ ] Local/testnet token/demo policy không tương đương SLA/giám định/bồi thường thực tế.

### 9.3. Giới hạn cần công bố

1. **Signature** chứng minh người sở hữu khóa ký bytes theo protocol, không chứng minh ESP32 hoặc cảm biến vật lý không bị giả mạo/tamper.
2. **Merkle Root** bảo vệ khả năng phát hiện sửa đổi dữ liệu canonical đã đóng batch; không xác thực mẫu đã bị bỏ mất trước khi ký/nhận.
3. **Data Integrity Contract** chứng minh commitment tồn tại trên chain, không xác định nhiệt độ có đúng ngoài đời.
4. **Insurance Contract** tin cậy Authorized Backend Oracle; một Oracle bị chiếm quyền vẫn có thể gửi báo cáo sai nếu không có các cơ chế đánh giá bổ sung.
5. **Render public + testnet** phục vụ demo và trải nghiệm API, không được tự suy ra đây là dịch vụ sản xuất bảo đảm uptime/giải quyết tranh chấp thực.

---

## 10. Deliverables, trạng thái và quyết định còn mở

### 10.1. Danh sách deliverables của NTD

| # | Artifact | Điều kiện bàn giao | Trạng thái được ghi nhận trên local |
|---|---|---|---|
| 1 | `contracts/ColdChainDataIntegrity.sol` | Anchor/query/verify + role + immutable root | `DEPLOYED / TESTED` |
| 2 | `contracts/ColdChainInsurance.sol` | Policy/oracle/payout/anti-duplicate | `DEPLOYED / TESTED` |
| 3 | `contracts/MockInsuranceToken.sol` (nếu chọn) | ERC-20 demo + funding fixture | `DEPLOYED / TESTED` |
| 4 | `test/DataIntegrity.test.ts` | Golden vectors + immutable/role/duplicate tests | `TESTED (20 passing)` |
| 5 | `test/Insurance.test.ts` | Funding/oracle/expiry/double payout tests | `TESTED (36 passing)` |
| 6 | `test/IntegrationFlow.test.ts` | Anchor/readback → Oracle demo payout | `TESTED (2 passing)` |
| 7 | `scripts/deploy.ts`, `seed-demo.ts`, `verify-deployment.ts` | Local deployment reproducible | `DEPLOYED / TESTED` |
| 8 | `deployments/*.json` | Exact deployed network/contract/token info, no secrets | `DEPLOYED (localhost.json)` |
| 9 | ABI artifacts của 2 contract | Import được từ Backend adapter | `DELIVERED (deployments/abi/)` |
| 10 | `blockchain/INTEGRATION.md` | Byte-level hash, ABI, role, events, examples | `DELIVERED` |
| 11 | `blockchain/README.md` | Run/test/deploy/demo/error handling | `DELIVERED` |
| 12 | Hardhat test results + demo evidence | Receipt + root + token balance + edge cases | `TESTED (83 passing, 100% PASS; Phase 6 local E2E verified)` |

Các trạng thái và số test trong bảng được giữ từ cập nhật Blockchain trước đây, áp dụng cho **local Hardhat chain 31337**, không phải Sepolia/Render hoặc E2E MySQL production. Không chạy lại test/deploy trong lượt sửa roadmap này; `BLOCKED` testnet cũ là lịch sử, chưa có bằng chứng triển khai Sepolia mới. Tên `test/Insurance.test.ts` trong bảng lịch sử được giữ nguyên như bản cũ; file hiện có dùng để port là `test/ColdChainInsurance.test.ts`.

| Deliverable mới | Owner | Trạng thái |
|---|---|---|
| Remix workspace/compiled source + settings/dependency snapshot | NTD | `VERIFIED — Remix 0.8.36+commit.8a079791 / osaka (compiler-settings.json, ABI.md)` |
| Remix Solidity Unit Testing + Python scenario mapping/test suite | NTD, NTK hỗ trợ adapter | `SKIPPED — bỏ qua port test case theo yêu cầu` |
| Sepolia deployment/roles/funding/policy + manifest/ABI/receipts | NTD | `DEPLOYED — contracts & roles verified on 11155111 (sepolia.json, HANDOFF_SEPOLIA.md); createPolicy chờ UUID` |
| Web3.py/Alchemy smoke + MySQL/evidence/payout E2E | NTK + NTD, TTDK QA | `PENDING_NTK — chờ Backend cấu hình Alchemy/keys & Shipment UUID` |
| Một Admin/JWT cho API/UI, không ABI/account contract mới | NTK + TTDK; NTD regression quyền | `PLANNED — auth runtime chưa đổi` |

**Deliverable bổ sung cho yêu cầu đăng ký (chưa thực hiện):** ghi chú impact/API/ID mapping trong INTEGRATION và regression E21–E25, owner **NTD**; script/key/schema/API do **NTK**, form Admin/key status/dropdown/QA do **TTDK**. Không phát sinh smart contract mới.

### 10.2. Những quyết định kỹ thuật cần xác nhận với NTK và TTDK

1. **ID mapping:** giữ `keccak256(UTF8(ID))` trong INTEGRATION; xác nhận seed/adapter dùng UUID shipment vừa tạo, không dùng `code`. Registry mới không đổi batch/device keys.
2. **`MERKLE-v1`:** NTK xác nhận danh sách canonical fields, timestamps, hash prefixes, odd-leaf rule và golden fixtures; NTD xác nhận `bytes32` root truyền on-chain nguyên 32 bytes.
3. **`evidenceHash`:** giữ `keccak256(UTF8(event_id))` hiện có; NTK tiếp tục lưu evidence/batch references ở Backend. Không cần protocol mới cho đăng ký device.
4. **Role:** NTD/NTK xác nhận địa chỉ `ANCHORER` và `ORACLE` có dùng chung signer hay tách, rotate/revoke protocol.
5. **Network đã chọn:** Ethereum Sepolia `11155111`, Remix/MetaMask deploy, Alchemy HTTPS RPC, Sepolia Etherscan; còn thiếu gas/faucet, addresses/receipts thật và khóa confirmations/polling/budget. Không coi local Hardhat là lựa chọn nghiệm thu mới.
6. **Funding:** token demo standard, decimals, policy escrow/funding method, mapping từ giá trị bảo hiểm nghiệp vụ sang số token demo (nếu muốn hiển thị).
7. **Policy & anchoring:** giữ mặc định `PAYOUT_REQUIRES_ANCHORED_EVIDENCE=true`; xác nhận E2E không bỏ qua evidence gate khi thêm flow đăng ký, thiếu assignment/key vẫn bị chặn trước khi tạo evidence.
8. **Expiry & reporting delay:** hiện contract từ chối khi `block.timestamp > expiry`, kể cả phát hiện vi phạm trước đó; giữ logic này, test delay và chọn expiry demo đủ dài. Grace period chỉ là yêu cầu nghiệp vụ tương lai, không phải thay đổi để migrate công cụ.
9. **Integration:** khóa compiler/dependency/EVM Remix, ABI loader/paths, JWT API contract/client, Alchemy app; public Render URL/MySQL do NTK đảm nhận. README/INTEGRATION hiện còn hướng dẫn legacy cần NTD chuyển trước nghiệm thu.
10. **Deployment status:** có source/ABI/tài liệu trong repo và checkbox lịch sử, nhưng lượt sửa này không xác minh runtime/testnet/Render; không tự nhận address/receipt/URL thật hoặc tăng trạng thái hoàn thành.

### 10.3. Các bước thực hiện đầu tiên (để nhóm làm song song)

1. NTD mở Phase 0, draft `INTEGRATION.md` và role/contract interface; NTK chốt ID/telemetry/Merkle vectors; TTDK dựng UI bằng OpenAPI mocks.
2. NTD import **hai contract hiện có** vào Remix, pin compiler/dependency/settings, đối chiếu ABI rồi port tests; không viết lại Solidity vì đổi IDE.
3. NTD handoff Data Integrity ABI sớm để NTK triển khai `blockchain_adapter.py` + durable outbox; không cần đợi insurance token test xong.
4. NTD handoff Insurance ABI và policy/Oracle config cho NTK sau khi unit tests pass; Member 3 chỉ nhận schema, status và tx URLs qua Backend API.
5. Khi Backend public được deploy trên Render, nhóm chạy E2E theo §8; mọi vấn đề ở contract sửa trong `blockchain/`, ở Backend sửa bởi NTK, ở Frontend sửa bởi TTDK.

---

## 11. Quy tắc nghiệm thu cuối và ghi chú chỉnh sửa

- Roadmap giữ owner, source/ABI/constructor/events/access control, policy/Oracle/token payout, chống payout trùng và ownership. Hardhat/local `31337`/scripts/tests/artifacts chỉ giữ dưới nhãn **lịch sử legacy**, không còn nằm trong workflow/gate mục tiêu.
- Phần mở rộng mới: **Data Integrity Contract độc lập**, `MERKLE-v1` cùng NTK, batch immutable anchoring, phân quyền anchorer, on-chain readback, network/finality, public Backend integration và QA/demo matrix.
- **Không triển khai Merkle hashing trong Solidity chỉ để "có Merkle"**: Python fixtures/Remix tests thống nhất canonical bytes; contract nhận `bytes32` root; inclusion proofs là mở rộng riêng.
- **Không báo payout thành công trước khi** tx receipt success, state/event khớp và beneficiary nhận token demo trên Sepolia; kết quả Remix VM/mock/local được ghi đúng môi trường.
- Một Phase chỉ kết thúc khi hoàn tất DoD và có bằng chứng test/deployment; mọi trường đang `TBD` phải được chốt trước khi tăng integration dependency.

**Bản cập nhật này chỉ sửa ba roadmap; chưa sửa source/ABI/API/client/`.env`, port tests hoặc deploy. Giữ nguyên tiến độ và checkbox lịch sử; các nhiệm vụ JWT/Remix/Sepolia/Alchemy mới đều chưa được tự đánh dấu hoàn thành.**

## 12. Tóm tắt chuyển đổi và rủi ro cần kiểm thử — dùng chung ba roadmap

| Phần | Quy trình mục tiêu | Công việc còn lại / owner |
|---|---|---|
| Bỏ Hardhat khỏi workflow | Không setup/config/node/Ignition/localhost deploy hoặc lệnh Hardhat làm gate; giữ code/test/artifact legacy | NTD chuyển README/INTEGRATION; NTK chuyển runtime defaults, test runner và runbook, không xóa lịch sử |
| Thay bằng Remix | Compile/settings/dependencies, Solidity Unit Testing, MetaMask Sepolia deploy, roles/funding/policy và export ABI | NTD Phase 1/3/4/5, chưa thực hiện |
| Thay bằng Python/Web3.py | Golden root/bytes32 tests, transaction/receipt/event/state/balance, FastAPI adapter/evidence integration; RPC mocks cho lỗi | NTD port contract scenarios, NTK port adapter/E2E; default offline, Sepolia smoke opt-in |
| Triển khai Sepolia | Faucet/gas → compile/test → deploy token/integrity/insurance → roles → approve/createPolicy → verify receipt/code → manifest | NTD; NTK tạo Alchemy app và Backend secrets, sau đó anchor/readback/payout smoke |
| Package NTD → NTK | ABI/source/settings/constructor, addresses/token/chain/deploy tx, roles/events/errors/ID vectors, confirmations và runbook | §7.3; không private key/RPC key thật trong hồ sơ công khai |
| Auth một Admin | Backend env → login/JWT có TTL → Bearer cho Admin/monitoring; ESP32 P-256 riêng | NTK login/dependency/rate limit/config/tests, TTDK Login/Logout/401/session token; không users/đa vai trò hoặc ABI mới |

| Rủi ro còn lại | Cách kiểm thử / tiêu chí |
|---|---|
| Compiler/OZ/EVM/ABI không khớp | Pin full versions/settings/checksum; Remix compile, ABI diff và constructor preflight; giữ signatures/events/roles cũ |
| Sai chain/address/role, thiếu ETH hoặc token | Preflight `11155111`, code, public signer addresses/balance; test unauthorized, approve/fund/expiry và receipt fail không paid |
| Alchemy 429/timeout, pending/reorg, retry trùng | Mock RPC + persisted outbox/nonce/hash/state reconciliation; opt-in Sepolia kiểm chứng receipt/events/root, không chỉ tx hash |
| Root Python khác on-chain, MySQL bị sửa | Golden vectors 1/2/3/5 leaf, root readback, tamper/co-tamper trên DB demo; `DATA_INTEGRITY_FAILED` chặn evidence |
| Policy hết hạn lúc chờ anchor hoặc payout lặp | Remix/pytest test expired/insufficient funding/transfer revert/double report; giữ rule 15 phút/gap/anti-replay và anchored evidence, chọn expiry demo đủ dài |
| Gỡ API key làm hở route hoặc token sai vẫn dùng được | Ma trận Admin GET/POST/PATCH/verify/retry, JWT expired/tampered/missing claim/alg/sai subject/header cũ, rate limit/HTTPS/redacted logs; ESP32 không JWT vẫn phải ký đúng |
| Render restart/cold start/MySQL chưa deploy | Persistence/CORS/public HTTPS smoke, manual reconcile JWT, phân biệt Backend unavailable/device offline/chain pending; chưa chạy ghi `NOT_TESTED/BLOCKED` |

Tham chiếu: [Remix compiler](https://remix-ide.readthedocs.io/en/latest/compile.html), [Remix Unit Testing](https://remix-ide.readthedocs.io/en/latest/unittesting.html), [Deploy & Run](https://remix-ide.readthedocs.io/en/latest/run.html), [Alchemy Ethereum Sepolia RPC](https://www.alchemy.com/rpc/ethereum-sepolia), [PyJWT usage](https://pyjwt.readthedocs.io/en/stable/usage.html). Các hướng dẫn repo được link ở trên còn baseline legacy cho tới khi owner hoàn thành nhiệm vụ cập nhật; không dùng lệnh Hardhat/API key trong chúng làm yêu cầu mới.
