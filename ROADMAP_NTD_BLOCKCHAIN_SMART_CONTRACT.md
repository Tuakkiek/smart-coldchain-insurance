# ROADMAP THÀNH VIÊN 2 — Blockchain và Smart Contract

> **Dự án:** `smart-coldchain-insurance`  
> **Phụ trách:** Member 2 — NTD, **owner của `blockchain/`**  
> **Mục tiêu nâng cấp:** triển khai **Data Integrity Contract** để neo Merkle Root của telemetry lên Blockchain, đồng thời **giữ và hoàn thiện Insurance Contract** để tiếp nhận bằng chứng vi phạm, kiểm soát Oracle và chi trả token demo an toàn.  
> **Kết quả mong đợi:** hai contract triển khai được trên local chain/testnet, có Hardhat tests, ABI/deployment artifacts, ví dụ gọi hàm và tài liệu `blockchain/INTEGRATION.md` đủ chi tiết để NTK kết nối từ FastAPI mà không phải đoán giao thức.  
> **Trạng thái tài liệu:** KẾ HOẠCH CẬP NHẬT — không ngụ ý source code, hợp đồng, deployment hay test đã được thực hiện.

---

## 1. Phạm vi và ranh giới sở hữu

### 1.1. Bạn chịu trách nhiệm

- Thiết kế, viết, kiểm thử và triển khai **Data Integrity Smart Contract** (module A): neo batch hash/Merkle Root, metadata tối thiểu, phân quyền anchor, chống đăng ký lặp, bất biến sau khi neo, truy vấn/đối chiếu và phát event.
- Tiếp tục xây dựng **Insurance Smart Contract** (module B): quản lý policy, beneficiary, quỹ token demo, Oracle, ghi nhận vi phạm, chống payout trùng và phát `InsurancePaid`.
- Quản lý Solidity/Hardhat/TypeScript, test fixtures, compile, local chain, testnet, deployment scripts và artifact/ABI.
- Xác định và tài liệu hóa chính xác các quy tắc **`shipmentKey`, `batchKey`, `deviceKey`, Merkle Root, `evidenceHash`, event/transaction receipt** cùng NTK.
- Cung cấp ABI, contract address, RPC configuration, chain ID, quyền `ANCHORER`/`ORACLE`, error codes, events và ví dụ giao dịch đã test cho NTK.
- Hỗ trợ Member 1 xác minh giao dịch từ Backend adapter, hỗ trợ Member 3 hiểu ý nghĩa status thông qua REST API (không để frontend gọi Blockchain trực tiếp).
- Kiểm thử các failure mode: gửi trùng, thiếu quyền, revert, RPC lỗi, pending transaction, timeout và payout lặp.

### 1.2. Ranh giới không được vượt qua

- **Không sửa** `device/` hoặc `backend/` của Member 1; không đưa logic Web3 vào Backend thay NTK.
- **Không sửa** `frontend/` của Member 3; không yêu cầu Frontend giữ private key, ký giao dịch hoặc truy cập RPC cho nghiệp vụ.
- **Không tự đổi** `docs/contracts/api-v1.md` hay schema của Backend; mở issue/PR đề xuất cho Member 1 chốt khi cần.
- Không triển khai tính năng blockchain để thay thế MySQL; không đưa raw telemetry, private key, PII hoặc payload cảm biến lên chain.
- Không tự khẳng định dữ liệu cảm biến đúng vật lý chỉ vì chữ ký hợp lệ hoặc Merkle Root đã anchor.

### 1.3. Cấu trúc thư mục mục tiêu

```text
blockchain/
├── contracts/
│   ├── ColdChainDataIntegrity.sol       # Module A: anchoring và lookup
│   ├── ColdChainInsurance.sol           # Module B: policy, oracle, payout
│   └── MockInsuranceToken.sol           # ERC-20 demo (nếu dùng)
├── scripts/
│   ├── deploy.ts                        # Deploy cả 2 module + token demo
│   ├── seed-demo.ts                     # Policy/batch demo trên local chain
│   └── verify-deployment.ts             # Kiểm tra address, roles, code/chain
├── test/
│   ├── DataIntegrity.test.ts
│   ├── Insurance.test.ts
│   ├── IntegrationFlow.test.ts
│   └── fixtures/                        # Hash vectors từ Member 1
├── ignition/                            # Chỉ nếu framework thực tế sử dụng
├── deployments/
│   ├── localhost.json                   # Không chứa secret
│   └── <network>.json                   # Chỉ tạo sau deploy thật
├── artifacts/                            # Generate; không sửa tay
├── hardhat.config.ts
├── package.json
├── package-lock.json                   # Hoặc lockfile package manager đã chốt
├── .env.example                        # Chỉ placeholder
├── README.md
└── INTEGRATION.md                       # Source of truth Blockchain ↔ Backend
```

Cấu trúc trên là **đề xuất mở rộng từ Roadmap cũ**; nếu repository hiện có đường dẫn/tên contract khác, giữ tên đang hoạt động hoặc lên kế hoạch migration trước khi đổi. Không được tự giả định cây thư mục thực tế đã có đủ các file này.

---

## 2. Kiến trúc và quy ước kỹ thuật bắt buộc

### 2.1. Luồng dữ liệu mới — hai module hợp đồng, một Backend Oracle

```text
ESP32 + Sensors
    │  Signed Telemetry (ECDSA P-256, sequence_number, timestamp)
    ▼
FastAPI Backend (Member 1; chạy public trên Render khi deploy)
    │  Verify signature / sequence / gap / replay
    ▼
External MySQL (toàn bộ accepted telemetry và audit)
    │
    ├──► Integrity Service (Member 1)
    │       ├─ Canonical record, SHA-256 leaf hashes
    │       ├─ MERKLE-v1 root theo batch đã SEALED
    │       └─ Blockchain Adapter → anchorBatch(...)
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
- **Public Backend** trên Render là trách nhiệm NTK; NTD chỉ cung cấp network/RPC/contract configuration, tránh để frontend hoặc ESP32 trực tiếp điều khiển contract.

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

- Giữ stack đề xuất hiện tại: **Solidity + Hardhat + TypeScript + EVM local chain/testnet**. Chốt và pin phiên bản compiler, framework, Node/lockfile khi triển khai; không tự đổi framework khi chưa có lý do.
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

**Điểm khóa:** NTD **không** đoán cách canonicalize telemetry từ tên field; phải nhận fixture do NTK xuất và tính được expected root giống nhau. Các thông số chưa thống nhất phải đánh dấu `TBD` thay vì triển khai ngầm.

### 3.2. Member 2 → Member 1: package bàn giao

- [ ] **ABI** cho `ColdChainDataIntegrity` và `ColdChainInsurance`, và `MockInsuranceToken` khi sử dụng.
- [ ] Contract **addresses thực** theo network tương ứng, RPC URL không chứa secret, `chainId`, deployment transaction hash và version ABI.
- [ ] Exact function signatures, Solidity type order, return values, custom errors và event definitions.
- [ ] Công thức/fixtures cho `shipmentKey`, `batchKey`, `deviceKey`, `evidenceHash`, bytes32 encoding/decoding.
- [ ] Ví dụ `anchorBatch`, `getBatch`, `verifyBatch`, `createPolicy`, `reportViolation`, event/receipt, cả success lẫn revert.
- [ ] Quyền `ANCHORER` và `ORACLE`, cách cấp/thu hồi quyền và cấu hình address; **không** chuyển private key qua Git/tài liệu.
- [ ] Quy tắc finality/confirmations, tx status, duplicate, nonce/retry sau RPC timeout và cách phân loại thất bại.
- [ ] Deployment scripts, Hardhat tests, fixtures và file `blockchain/INTEGRATION.md` được cập nhật trước khi Backend dùng ABI thật.

**Acceptance gate:** NTK tự làm được tối thiểu 1 anchor → lấy receipt → đọc root on-chain và 1 payout demo → đọc sự kiện, dựa trên tài liệu bàn giao, không cần NTD sửa Backend.

### 3.3. Member 1 ↔ Member 3; Member 2 hỗ trợ gì?

- Member 1 cung cấp `docs/contracts/api-v1.md`, OpenAPI, device/telemetry/integrity/batch/transaction schemas, status enums, Render public URL sau khi deploy; Member 3 tích hợp **chỉ qua REST API**.
- Member 3 phản hồi CORS origins, API types, loading/error states, Blockchain pending, integrity warning và demo acceptance; không quyết định trực tiếp ABI.
- NTD cung cấp **event semantics** và explorer/network metadata **thông qua NTK**; giúp QA kiểm tra `BatchAnchored`, `InsurancePaid`, không yêu cầu frontend đọc RPC/contract hoặc tự suy luận thành công chỉ từ `tx_hash`.
- Khi thay ABI/hash/rule: tạo PR cập nhật `blockchain/INTEGRATION.md` và tests/fixtures → gửi NTK duyệt adapter/API impact → thông báo Member 3 → mới merge; breaking change cần version/migration plan.

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

**Quy tắc chung giữa Python (NTK) và TypeScript tests (NTD), không phải logic chạy trong Solidity:**

1. Chỉ batch những **accepted telemetry đã verify chữ ký**; mỗi batch cho đúng một `(shipment_id, device_id)` và đã khóa membership (`SEALED`).
2. Sắp xếp record theo `sequence_number` **tăng dần**; Backend phải lưu `leaf_index`/membership, không phụ thuộc thứ tự SELECT mặc định.
3. Canonical record là compact UTF-8 JSON với key **ASCII ascending**, timestamp UTC chuẩn hóa, số đã scale dạng integer (không float), các field đã thống nhất chính xác: `payload_version`, `shipment_id`, `device_id`, `key_id`, `sequence_number`, `temperature_milli_c`, `humidity_milli_pct`, `recorded_at`, `received_at`, `firmware_version`, `signature` (Base64 chuẩn). **Không hash các trường status thay đổi theo thời gian**.
4. `leaf = SHA256(0x00 || canonical_record_utf8)`.
5. `parent = SHA256(0x01 || left_hash_32bytes || right_hash_32bytes)`.
6. Nếu tầng có số node lẻ, **nhân đôi node cuối tại tầng đó**; với 1 leaf thì root chính là leaf; **batch rỗng không được anchor**.
7. `merkleRoot` là **đúng 32 byte**; Solidity nhận `bytes32`; chuỗi hex `0x` + 64 hex chỉ là biểu diễn. **Không** `keccak256(hex-string)` lại, không đổi sang SHA-3, không encode cả JSON thành ABI để thay root.
8. `hash_version = "MERKLE-v1"` lưu ở MySQL/API/INTEGRATION; nếu đổi quy tắc phải tăng phiên bản và đối chiếu fixture trước khi thay code.

> **Yêu cầu kiểm thử byte-level:** fixture 1/2/3/5 leaf phải ghi `canonical_record_utf8_hex`, `leaf_hash_hex`, `merkle_root_hex` và cách tính. Hardhat/TypeScript hash thử phải ra cùng root với Python. Smart Contract **chỉ lưu/check** `bytes32`, không có nhiệm vụ tự dựng Merkle Tree từ raw telemetry.

**Hash Chain:** chỉ tùy chọn để nối audit log hoặc các batch theo thời gian, phải có domain/version riêng. Không dùng Hash Chain làm tên gọi khác của Merkle root, không bắt buộc triển khai trong MVP.

### 4.3. Quy tắc định danh `bytes32` — đề xuất cần cả nhóm chốt Phase 0

Để giữ quy ước `shipmentKey` gốc và tương thích kiểu `bytes32`, đề xuất:

```text
shipmentKey = keccak256(UTF8(shipment_id))
batchKey    = keccak256(UTF8(batch_id))
deviceKey   = keccak256(UTF8(device_id))
```

- Dùng bytes UTF-8 của **ID đúng như được Backend phát hành**, không tự trim, lowercase, chuẩn hóa Unicode hay encode UUID theo dạng nhị phân. Nên giới hạn ID ở ASCII có pattern/version rõ ràng để tránh nhập mơ hồ.
- `keccak256` **chỉ dùng cho chuyển ID sang `bytes32`**; **Merkle hash vẫn là SHA-256** như §4.2. Không đánh đồng hai hash function.
- `batchKey` là **định danh duy nhất của batch**, không dùng `merkleRoot` làm key (hai batch khác nhau được phép có root giống nhau nếu nội dung trùng).
- `evidenceHash` là commitment của **evidence nghiệp vụ canonical** do NTK tạo theo một rule/version **khác** `MERKLE-v1`; chưa chốt thì ghi `EVIDENCE-v1: TBD`. Không dùng `hash JSON` với thứ tự key tùy ý.
- Sau khi thống nhất, viết bảng vectors bằng input string, UTF-8 hex, expected bytes32 vào `blockchain/INTEGRATION.md`. Một giao thức đã chốt **không tự đổi** khi triển khai.

### 4.4. Module A — `ColdChainDataIntegrity.sol`

**Mục tiêu:** lưu root bất biến cho mỗi batch đã khóa và cho Backend tra cứu/đối chiếu. Contract không cần lưu toàn bộ metadata telemetry có trong MySQL.

**Giao diện đề xuất v1 (chưa phải ABI cuối cùng):**

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

- [ ] Chỉ `ANCHORER_ROLE` (Backend signer hoặc service account được cấp quyền) có thể gọi `anchorBatch`; owner/admin có quy trình grant/revoke rõ ràng.
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

Định nghĩa finality cụ thể (`confirmation_count`, polling strategy) phải được Member 2 chốt theo **network thật**; ở local chain có thể dùng ngưỡng khác testnet nhưng phải ghi rõ environment.

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

**Interface đề xuất kế thừa từ Roadmap cũ:**

```solidity
function createPolicy(
    bytes32 shipmentKey,
    address beneficiary,
    uint256 payoutAmount,
    uint64 expiry
) external;

function reportViolation(
    bytes32 shipmentKey,
    bytes32 evidenceHash,
    uint64 detectedAt
) external;

function setOracle(address newOracle) external;
function getPolicy(bytes32 shipmentKey) external view returns (Policy memory);

// Events tối thiểu:
event PolicyCreated(...);
event InsurancePaid(...);
event OracleUpdated(...);
```

- Đây là **contract design proposal**, không khẳng định chữ ký ABI đã triển khai. Nếu thêm `violationEvidenceId`, `batchKey`, `policyVersion` vào `reportViolation`, phải thống nhất và version hóa API/ABI **trước** khi adapter tích hợp.
- `detectedAt` là thời gian Backend xác lập sự kiện, thường là Unix seconds từ `received_at`; contract có thể kiểm tra reasonable bounds nhưng **không tự xác thực độ chính xác** của event time do Oracle gửi.
- **Cần chốt:** sự kiện xảy ra trước `expiry` nhưng transaction gửi sau `expiry` vì anchor pending có được chi trả trong `reporting_grace_period` hay không. Đặc tả chính xác điều kiện `detectedAt`, `block.timestamp`, effective time và anti-backdating thay vì vô tình từ chối hợp lệ hoặc cho phép timestamp giả.

### 5.2. Quan hệ giữa Data Integrity và Insurance

MVP đề xuất **hai contract độc lập** để trách nhiệm rõ ràng:

1. Member 1 verify telemetry, sequence, gap và tính khoảng vi phạm **liên tục ít nhất 15 phút** bằng `received_at` và policy của shipment.
2. Backend tạo evidence đã version hóa, gắn các `batchKey`/Merkle Root liên quan, xác minh trạng thái data integrity.
3. **Đề xuất `PAYOUT_REQUIRES_ANCHORED_EVIDENCE=true`:** Backend chỉ gửi `reportViolation` khi các batch bằng chứng cần thiết đã `DATA_ANCHORED`, root tính lại khớp on-chain, không có gap khiến chuỗi 15 phút không đủ tin cậy. Nếu chưa đủ → `EVIDENCE_PENDING`, **không** payout.
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

- [ ] Xác nhận sở hữu `blockchain/`, tạo nhánh `feat/blockchain_smart_contract` như Roadmap gốc (hoặc tên nhánh chuẩn repo); đọc cấu trúc repository và Hardhat version đang dùng trước khi thay đổi.
- [ ] Thống nhất **2 module**: `ColdChainDataIntegrity` và `ColdChainInsurance`, `MockInsuranceToken` tùy chọn; liệt kê rõ ai deploy/admin/anchor/oracle/fund.
- [ ] Chốt `shipmentKey`, `batchKey`, `deviceKey` và `evidenceHash` mapping với NTK, bao gồm input bytes/encoding, domain/version, expected hex vectors.
- [ ] Chốt `MERKLE-v1` byte-level từ NTK (SHA-256, prefix `0x00/0x01`, odd leaf duplicate) và nguồn fixture cross-language.
- [ ] Dự thảo `anchorBatch/getBatch/verifyBatch`, `createPolicy/reportViolation`, events, errors, payout funding/expiry và duplicate rules.
- [ ] Làm rõ policy khi integrity pending/failed, `PAYOUT_REQUIRES_ANCHORED_EVIDENCE`, reporting grace period, chain confirmations và số confirmations môi trường local/testnet.
- [ ] Tạo bản đầu `blockchain/INTEGRATION.md` có interface proposal **gắn trạng thái PROPOSED/APPROVED**, gửi cho Member 1 và nhận phản hồi; thông báo requirements UI qua NTK cho Member 3.
- [ ] Ghi rõ địa chỉ deploy/RPC chưa có nếu chưa deploy thực tế, không sử dụng địa chỉ ví dụ như thông số production.

**Definition of Done**

- [ ] Có interface specification đã được NTK xác nhận hoặc blocker list ngắn gọn; không còn hash method do Member 1 phải tự đoán.
- [ ] Có golden fixture/plan nhận fixture, data types, roles, enum transaction/event và acceptance criteria.
- [ ] Không có breaking schema change chưa thông báo cả nhóm.

### Phase 1 — Hardhat Setup & Data Integrity Contract

**Phụ thuộc:** Phase 0 khóa tối thiểu `batchKey` và root encoding; vẫn có thể tạo scaffolding Hardhat ngay.

**Việc cần làm**

- [ ] Khởi tạo/xác nhận Hardhat + TypeScript + Solidity, pin version, lockfile; tạo scripts `compile`, `test`, `node`, `deploy` phù hợp thực tế.
- [ ] Thiết lập roles `DEFAULT_ADMIN_ROLE`/`ANCHORER_ROLE` theo thư viện phù hợp; quyền cấp/thu hồi, event và kiểm thử permission.
- [ ] Xây `ColdChainDataIntegrity.sol` với `Batch` metadata tối thiểu, immutable `batchKey`/`merkleRoot`, duplicate prevention và custom errors.
- [ ] Triển khai `anchorBatch(...)`, `getBatch(...)`, `verifyBatch(...)`, event `BatchAnchored` theo interface đã chốt; không ghi raw telemetry.
- [ ] Kiểm thử `bytes32` roundtrip và root bắt nguồn SHA-256; lưu đơn vị test dùng fixture thay vì tính hash theo Solidity khác quy tắc.
- [ ] Viết test từ account có quyền/không quyền, batch rỗng, zero IDs/root, duplicate key, root immutable và retrieval.
- [ ] Không đưa claim "on-chain validates sensor" vào docs hoặc UI metadata.

**Definition of Done**

- [ ] Compile thành công, Hardhat tests của Module A pass.
- [ ] `batchKey` chưa có → anchor được; cùng key gửi lại → revert; batch cũ không sửa được.
- [ ] `getBatch`/`verifyBatch` trả đúng root byte-for-byte từ golden fixture NTK.

### Phase 2 — Batch Anchoring, Verification & Cross-language Proof

**Phụ thuộc:** Module A có ABI; NTK cung cấp canonical batch fixtures.

**Việc cần làm**

- [ ] Viết TypeScript fixture reader và hash/reference test tính root từ canonical bytes theo `MERKLE-v1` cho 1, 2, 3, 5 record; so sánh expected Python root.
- [ ] Dựng test anchor một batch đã seal, query root by `batchKey`, xác minh match và mismatch; test hai batch khác key nhưng cùng root vẫn hợp lệ.
- [ ] Chạy thử event `BatchAnchored`: topic/indexed args, field order và giải mã từ ABI; cung cấp ví dụ cho Backend.
- [ ] Test batch có gap: `recordCount` thấp hơn khoảng first/last sequence **không bị Contract suy ra thành thông tin nhiệt độ**; Backend giữ trạng thái `DATA_INCOMPLETE`.
- [ ] Test pending/duplicate/reorg assumptions ở mức mock adapter/integration test phù hợp; contract revert gửi trùng theo đúng error.
- [ ] Tài liệu hóa vòng đời `SUBMITTED → MINED → CONFIRMED` và cách Backend lấy receipt, check `status=1`, `getBatch` và số confirmations.
- [ ] Nếu Solidity không expose proof-of-inclusion, ghi rõ `verifyBatch` **chỉ so root được cung cấp với root lưu**, không verify từng telemetry.

**Definition of Done**

- [ ] NTK và NTD tạo **cùng 32-byte root** trên cùng fixture; có bằng chứng test.
- [ ] Anchor + readback + decoded event khớp; mismatch trả false hoặc custom error đúng contract.
- [ ] `blockchain/INTEGRATION.md` đủ thông tin cho Backend tích hợp batch anchoring.

### Phase 3 — Insurance Contract, Policy Funding & Demo Payout

**Phụ thuộc:** Phase 0 đã khóa `shipmentKey`, `evidenceHash`, Oracle role, reporting window và token scheme; có thể phát triển song song với Phase 1/2.

**Việc cần làm**

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

### Phase 4 — Hardhat Security, Unit Tests & Failure Scenarios

**Phụ thuộc:** Module A và B có implementation đủ kiểm thử. Viết test song song mỗi khi có function mới.

**Việc cần làm**

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

### Phase 5 — Local/Testnet Deployment, ABI & Artifact Handoff

**Phụ thuộc:** Phase 1–4 đạt DoD; chốt target local chain/testnet với nhóm.

**Việc cần làm**

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

**Definition of Done**

- [x] Deploy script chạy lặp lại trên local môi trường sạch; được xác minh addresses/roles/chain ID.
- [x] ABI + examples đủ để NTK gọi cả 2 contract mà không phải đoán argument order, byte encoding hay event names.
- [x] Nếu testnet chưa triển khai được, ghi `BLOCKED` và nguyên nhân; **không** trình bày URL/address placeholder như deployment thành công.

### Phase 6 — Backend Oracle & Integrity Integration

**Phụ thuộc:** Member 1 Phase 4/5 hoàn thành canonical batch + adapter; Phase 5 của NTD đã bàn giao ABI/addresses. Insurance integration dựa trên Member 1 Phase 6.

> **Trạng thái hiện tại (`IN_PROGRESS — WAITING FOR BACKEND PHASE 5/6`):**
> - **Đã hoàn thành phía `blockchain/` (NTD):** Kiểm chứng mapping payload `IntegrationOutbox` (`batch_service.py`) $\rightarrow$ `anchorBatch`, hoàn thiện test matrix E13–E17 (`Phase6IntegrationScenarios.test.ts`), bổ sung script `manage-roles.ts` (xoay vòng `Anchorer`/`Oracle`) và `inspect-onchain.ts` (đối chiếu event/state trực tiếp trên chain), cập nhật `INTEGRATION.md` quy tắc retry/idempotency.
> - **Đang chờ phía `backend/` (Member 1 - NTK):** `backend/app/integrations/blockchain_adapter.py` hiện mới tích hợp Module B (`ColdChainInsurance`), **chưa tích hợp** Module A (`anchor_batch`, `verify_batch`, `get_batch`), outbox dispatcher xử lý `ANCHOR_BATCH`, và cơ chế `PAYOUT_REQUIRES_ANCHORED_EVIDENCE`. Do đó các bước kiểm thử E2E trực tiếp với API Backend chưa đủ điều kiện nghiệm thu hoàn tất Phase 6.

**Việc cần làm**

- [ ] Nhận một batch đã `SEALED` từ NTK, đối chiếu `merkleRoot`, `batchKey`, metadata; gọi `anchorBatch` **từ Backend** (NTK thực hiện adapter).
- [ ] Backend kiểm tra receipt thành công và root on-chain trước khi đưa `DATA_ANCHORED`; NTD đối chiếu event/contract state/log.
- [ ] Kiểm tra một batch được thay đổi record trong **MySQL demo**: recomputed root lệch dẫn đến `DATA_INTEGRITY_FAILED`, không tạo root on-chain mới để che lỗi.
- [ ] Kiểm tra block RPC/timeouts: Backend ghi outbox pending, khôi phục và không gửi duplicate anchor; NTD kiểm tra contract chống duplicate.
- [ ] Tạo policy test đúng `shipmentKey`, cấp quỹ token; Backend chỉ báo violation sau **15 phút liên tục** và bằng chứng integrity đủ theo policy.
- [ ] Xác minh `reportViolation` do Oracle authorized gọi, receipt status, beneficiary token balance và `InsurancePaid` event; API không đánh dấu thành công khi tx pending/reverted.
- [ ] Test wrong Oracle/contract address/chain ID, expired policy, insufficient funding và double request với NTK.
- [ ] Không sửa Backend để "chữa cháy"; nếu muốn thay payload/ABI, đề xuất PR, cập nhật `INTEGRATION.md` và thông báo Member 3.

**Definition of Done**

- [ ] Có 1 flow signed telemetry → MySQL → Merkle Root → on-chain anchor → verify root → đủ điều kiện vi phạm → Insurance payout demo.
- [ ] Lỗi Blockchain không làm mất accepted telemetry; pending không hiển thị như thành công.
- [ ] Mọi tx dùng chain đúng, receipt/state/event khớp; không double anchor hoặc payout ngoài mong đợi.

### Phase 7 — End-to-End Blockchain Demo, Documentation & Safety Review

**Phụ thuộc:** NTK đã deploy Backend lên Render với external MySQL hoặc demo local rõ ràng; Member 3 tích hợp API/các trạng thái. **Không phụ thuộc bắt buộc Render để viết/kiểm thử contract.**

**Việc cần làm**

- [ ] Hoàn thiện `blockchain/README.md`: setup → test → local node → deploy → seed → ABI → reset/reseed demo.
- [ ] Hoàn thiện `blockchain/INTEGRATION.md`: public interface, root/ID vectors, role setup, tx lifecycle, error matrix, network/ABI handoff.
- [ ] Demo minh họa **12 kịch bản bắt buộc** ở §8, phân rõ những kịch bản thuộc NTK, NTD, TTDK và cần phối hợp.
- [ ] Kiểm tra `Render public API → external MySQL → Blockchain RPC` theo pipeline Backend; nếu dùng Render Free, công bố cold start/idle limitation (không ping giả để né giới hạn).
- [ ] Rà soát secrets: demo keys chỉ nằm local env/Render env phù hợp; frontend không giữ khóa; deployment JSON không chứa mnemonic/password/RPC key.
- [ ] Test one clean deploy trên máy khác, import ABI và xác minh on-chain root/payout bằng CLI/scripts.
- [ ] Đối chiếu UI với Backend: `DATA_VERIFIED`, `DATA_ANCHORED`, `DATA_INTEGRITY_FAILED`, `DATA_INCOMPLETE`, `BLOCKCHAIN_PENDING`, `BLOCKCHAIN_FAILED` và payout status không bị gộp.
- [ ] Ghi giới hạn bảo mật: Blockchain không chứng minh nhiệt độ thực, không bù được sensor tampering/compromised private key/Oracle sai, không thay thế hệ thống bảo hiểm thật.
- [ ] Chốt changelog, quyết định kỹ thuật đã duyệt, vấn đề còn pending và rollback/redeploy hướng dẫn.

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

### 7.3. Checklist package bàn giao thực tế cho NTK

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

### 8.2. Kịch bản demo blockchain theo đúng thứ tự

1. **Xem policy:** NTK tạo shipment, NTD seed policy ERC-20 demo, UI đọc qua API; ghi rõ token không có giá trị thực.
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

- [ ] Có ít nhất một transaction anchoring và một insurance transaction với **receipt/event/state** khớp trên local/testnet thực.
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

| # | Artifact | Điều kiện bàn giao | Trạng thái ban đầu |
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
| 12 | Hardhat test results + demo evidence | Receipt + root + token balance + edge cases | `TESTED (80 passing, 100% PASS)` |

`PLANNED` không ngụ ý đã có source code. Khi triển khai, thay status thành `IN_PROGRESS / TESTED / DEPLOYED / BLOCKED` kèm link PR, commit hash hoặc log chứng minh.

### 10.2. Những quyết định kỹ thuật cần xác nhận với NTK và TTDK

1. **`batchKey`/`deviceKey`:** có áp dụng `keccak256(UTF8(ID))` như §4.3, cần có input vectors và namespace/version chính thức.
2. **`MERKLE-v1`:** NTK xác nhận danh sách canonical fields, timestamps, hash prefixes, odd-leaf rule và golden fixtures; NTD xác nhận `bytes32` root truyền on-chain nguyên 32 bytes.
3. **`evidenceHash`:** evidence schema, canonicalization và domain/version; có gắn `violation_evidence_id`, anchored batch references không?
4. **Role:** NTD/NTK xác nhận địa chỉ `ANCHORER` và `ORACLE` có dùng chung signer hay tách, rotate/revoke protocol.
5. **Network:** local/testnet nào, chain ID, gas/confirmation threshold, RPC provider, explorer và budget demo; addresses thực chưa biết cho tới khi deploy.
6. **Funding:** token demo standard, decimals, policy escrow/funding method, mapping từ giá trị bảo hiểm nghiệp vụ sang số token demo (nếu muốn hiển thị).
7. **Policy & anchoring:** có chốt `PAYOUT_REQUIRES_ANCHORED_EVIDENCE=true`? Khi data incomplete/pending/mismatch phải chặn theo ngữ nghĩa nào?
8. **Expiry & reporting delay:** nếu temperature breach kết thúc trước expiry nhưng receipt anchor chậm, policy có cho `reportViolation` sau expiry không? Chốt chống backdating và grace period.
9. **Integration:** repo actual structure và Hardhat version, giao diện Backend `blockchain_adapter.py`/API contract, public Render URL và DB provider do NTK đảm nhận.
10. **Deployment status:** chưa có bằng chứng test/deploy trong hồ sơ hiện tại; không tự nhận có contract address, receipt, ABI hoặc production URL thật.

### 10.3. Các bước thực hiện đầu tiên (để nhóm làm song song)

1. NTD mở Phase 0, draft `INTEGRATION.md` và role/contract interface; NTK chốt ID/telemetry/Merkle vectors; TTDK dựng UI bằng OpenAPI mocks.
2. NTD làm **Data Integrity Contract** và **Insurance Contract** song song sau khi interface tối thiểu được duyệt; hoàn thiện tests trước deploy.
3. NTD handoff Data Integrity ABI sớm để NTK triển khai `blockchain_adapter.py` + durable outbox; không cần đợi insurance token test xong.
4. NTD handoff Insurance ABI và policy/Oracle config cho NTK sau khi unit tests pass; Member 3 chỉ nhận schema, status và tx URLs qua Backend API.
5. Khi Backend public được deploy trên Render, nhóm chạy E2E theo §8; mọi vấn đề ở contract sửa trong `blockchain/`, ở Backend sửa bởi NTK, ở Frontend sửa bởi TTDK.

---

## 11. Quy tắc nghiệm thu cuối và ghi chú chỉnh sửa

- Roadmap được cập nhật **trực tiếp từ bản NTD cũ**: giữ vai trò owner, Hardhat, local/testnet, policy, oracle, demo-token payout, chống payout trùng, scripts/README/INTEGRATION và quy tắc không sửa code chéo.
- Phần mở rộng mới: **Data Integrity Contract độc lập**, `MERKLE-v1` cùng NTK, batch immutable anchoring, phân quyền anchorer, on-chain readback, network/finality, public Backend integration và QA/demo matrix.
- **Không triển khai Merkle hashing trong Solidity chỉ để "có Merkle"**: Python/TypeScript thống nhất canonical byte-level; contract nhận `bytes32` root; inclusion proofs là tính năng mở rộng có đặc tả riêng.
- **Không báo payout thành công trước khi** tx receipt success, state/event khớp và beneficiary nhận token demo thật trên local/testnet.
- Một Phase chỉ kết thúc khi hoàn tất DoD và có bằng chứng test/deployment; mọi trường đang `TBD` phải được chốt trước khi tăng integration dependency.

**Bản cập nhật này là tài liệu roadmap, chưa sửa source code hoặc repository ngoài file Markdown được yêu cầu.**
