# INTEGRATION.md — Hướng dẫn tích hợp Blockchain (Module A & B)

> Tài liệu kỹ thuật tích hợp giữa Smart Contracts và Backend / Dashboard.
> Member 1 (Backend - NTK) sử dụng tài liệu này cùng **[HANDOFF_SEPOLIA.md](HANDOFF_SEPOLIA.md)** và **[deployments/sepolia.json](deployments/sepolia.json)** để cấu hình `blockchain_adapter.py`.

---

## 1. Thông tin Bàn giao Mạng & Artifacts (Handoff)

### 1.1. Cấu hình Mạng (Ethereum Sepolia)

| Thuộc tính | Ethereum Sepolia (`11155111`) |
|---|---|
| **Network Name** | `sepolia` |
| **RPC URL** | `https://eth-sepolia.g.alchemy.com/v2/<ALCHEMY_KEY>` (NTK giữ trong env) |
| **Chain ID** | `11155111` |
| **Block Time / Finality** | ~12s/block (`BLOCKCHAIN_CONFIRMATIONS=2`, `TIMEOUT=120s`) |
| **Block Explorer** | `https://sepolia.etherscan.io` |
| **Manifest chuẩn** | `blockchain/deployments/sepolia.json` |
| **Deploy Toolchain** | Remix IDE (`0.8.36+commit.8a079791`, `osaka`) + Browser Extension (`MetaMask`) |

> 🚀 **Lưu ý vận hành Sepolia + Alchemy:**
> - Xem bảng phân vai địa chỉ ví (`Owner`, `Anchorer`, `Oracle`), biến `.env` mẫu và `deployBlockNumber` (`12145351`, `12159144`) trong **[HANDOFF_SEPOLIA.md](HANDOFF_SEPOLIA.md)**.
> - Khi dùng `get_logs(...)` trên Alchemy Free Tier, tránh `from_block=0` (dùng `BLOCKCHAIN_START_BLOCK=12145351` hoặc chunk scan từ `latest`).

### 1.2. Đường dẫn Artifacts & ABI Bàn giao

Backend và Frontend sử dụng các file ABI được đóng gói từ Remix (`0.8.36+commit.8a079791`, `optimizer=200`, `evmVersion=osaka`, OpenZeppelin `5.6.1`):
1. **Wrapped ABI cho Backend (`blockchain_adapter.py` đọc `json.load(...)["abi"]`)**:
   - `blockchain/deployments/abi/ColdChainDataIntegrity.json`
   - `blockchain/deployments/abi/ColdChainInsurance.json`
2. **Pure ABI Files (mảng `[...]` thuần) & Metadata**:
   - `blockchain/deployments/abi/ColdChainDataIntegrity.abi.json`
   - `blockchain/deployments/abi/ColdChainInsurance.abi.json`
   - Bảng tổng hợp signature: `blockchain/deployments/abi/contract-interfaces.json`
3. **Deployment & Compiler Metadata**:
   - `blockchain/deployments/sepolia.json` (chứa addresses thật, `deployTxHash`, `deployBlockNumber`, và các roles public — không chứa secret).
   - `blockchain/compiler-settings.json` (khóa compiler, optimizer, `osaka`, SHA-256 checksum source).

---

## 2. Quy tắc mã hóa định danh (ID Encoding & Hashes)

### 2.1. Định danh Keys (`bytes32`)

Quy tắc chuyển chuỗi ID chuẩn từ Backend sang `bytes32`:

```text
shipmentKey = keccak256(UTF8(shipment_id))
batchKey    = keccak256(UTF8(batch_id))
deviceKey   = keccak256(UTF8(device_id))
```

- Sử dụng `keccak256` trên chuỗi UTF-8 nguyên bản có dấu gạch nối (ví dụ UUID v4 `shipments.id`: `8b4fb8a2-2996-4da2-90b9-35019517f56f`).
- **`code` vs UUID:** Mã chuyến hiển thị `SHIP-001` (`shipments.code`) chỉ dùng cho UI/tra cứu; **mọi `shipmentKey` trên chain và policy đều phải hash từ UUID `shipments.id`**. Tạo shipment trong MySQL chưa đồng nghĩa policy đã được tạo/cấp vốn trên chain.
- **Ranh giới Registry & Auth:** Đăng ký thiết bị, gán chuyến (`device_assignments`), public key ECDSA P-256 của ESP32 và Admin JWT nằm hoàn toàn ở Backend/MySQL, **không** đưa lên Smart Contract. `deviceKey = keccak256(UTF8(device_id))` chỉ là hash định danh trong batch metadata, không phải public key P-256.
- **Không** hash UUID dạng nhị phân 16 bytes, **không** dùng SHA-256 cho các trường định danh Key.

### 2.2. Merkle Root (`MERKLE-v1` — SHA-256)

Khác với `keccak256` dùng cho Keys, **Merkle Tree sử dụng SHA-256** theo chuẩn RFC 6962 / `MERKLE-v1`:

```text
leaf   = SHA256(0x00 || canonical_record_utf8)
parent = SHA256(0x01 || left_32_bytes || right_32_bytes)
```

- Nếu tầng có số node lẻ, nhân đôi node cuối cùng tại tầng đó.
- Root luôn là **32 bytes nhị phân** (`bytes32` trong Solidity).
- Golden vectors kiểm chứng đối chiếu: xem [`protocol_vectors_v1.json`](../../backend/tests/fixtures/protocol_vectors_v1.json).

### 2.3. Evidence Hash & Timestamp

- `evidenceHash = keccak256(UTF8(event_id))` (trong đó `event_id` là UUID của sự kiện `INSURANCE_TRIGGERED`).
- `detectedAt`: Unix timestamp tính bằng **giây UTC** (`int(datetime.now(timezone.utc).timestamp())`).

---

## 3. Module A: `ColdChainDataIntegrity`

### 3.1. Function Signatures

#### `anchorBatch`
```solidity
function anchorBatch(
    bytes32 _batchKey,
    bytes32 _shipmentKey,
    bytes32 _deviceKey,
    bytes32 _merkleRoot,
    uint64 _firstSequence,
    uint64 _lastSequence,
    uint32 _recordCount
) external;
```
- **Người gọi**: Chỉ địa chỉ `anchorer` được ủy quyền (Backend service signer).
- **Quy tắc**:
  - Revert nếu `_batchKey == 0`, `_merkleRoot == 0`, `_recordCount == 0`, hoặc `_firstSequence > _lastSequence`.
  - Revert nếu `_batchKey` đã tồn tại (`ColdChain__BatchAlreadyExists`).
  - Ghi nhận `anchoredAt` (timestamp) và `anchoredBy` (msg.sender).
  - Phát event `BatchAnchored`.

#### `getBatch`
```solidity
function getBatch(bytes32 _batchKey) external view returns (Batch memory);
```
- Trả về struct `Batch` gồm: `shipmentKey`, `deviceKey`, `merkleRoot`, `firstSequence`, `lastSequence`, `recordCount`, `anchoredAt`, `anchoredBy`.
- Revert với `ColdChain__BatchNotFound` nếu batch chưa được neo.

#### `verifyBatch`
```solidity
function verifyBatch(bytes32 _batchKey, bytes32 _candidateRoot) external view returns (bool matchResult);
```
- Trả về `true` nếu candidate root khớp với on-chain root; trả về `false` nếu root không khớp (dữ liệu bị sửa đổi).
- Revert với `ColdChain__BatchNotFound` nếu batch chưa từng được neo (phân biệt rõ giữa *chưa neo* và *bị lệch root*).

#### `batchExists`
```solidity
function batchExists(bytes32 _batchKey) external view returns (bool exists);
```

#### `setAnchorer`
```solidity
function setAnchorer(address _newAnchorer) external;
```
- Chỉ contract `owner` mới có quyền thay đổi địa chỉ anchorer.

### 3.2. Events
```solidity
event BatchAnchored(
    bytes32 indexed batchKey,
    bytes32 indexed shipmentKey,
    bytes32 indexed deviceKey,
    bytes32 merkleRoot,
    uint32 recordCount,
    address anchoredBy
);

event AnchorerUpdated(
    address indexed previousAnchorer,
    address indexed newAnchorer
);
```

### 3.3. Custom Errors
| Custom Error | Nguyên nhân |
|---|---|
| `ColdChain__CallerNotAnchorer()` | Caller không khớp với địa chỉ `anchorer` được cấp quyền. |
| `ColdChain__CallerNotOwner()` | Caller không phải owner/admin. |
| `ColdChain__ZeroAddress()` | Địa chỉ truyền vào là zero address `0x0`. |
| `ColdChain__InvalidBatchKey()` | `batchKey` bằng `bytes32(0)`. |
| `ColdChain__InvalidMerkleRoot()` | `merkleRoot` bằng `bytes32(0)`. |
| `ColdChain__InvalidRecordCount()` | `recordCount` bằng 0. |
| `ColdChain__InvalidSequenceRange(uint64, uint64)` | `firstSequence > lastSequence`. |
| `ColdChain__BatchAlreadyExists(bytes32)` | BatchKey đã được neo trước đó (chống ghi đè root). |
| `ColdChain__BatchNotFound(bytes32)` | Không tìm thấy batch với batchKey đã cho. |

---

## 4. Module B: `ColdChainInsurance`

### 4.1. Function Signatures

#### `createPolicy` (`payable` — Ký quỹ trực tiếp bằng `SepoliaETH`)
```solidity
function createPolicy(
    bytes32 _shipmentKey,
    address _beneficiary,
    uint256 _payoutAmount,
    uint256 _expiry
) external payable;
```
- Người gọi gửi kèm `msg.value` (`SepoliaETH` tính theo `wei`), không cần ERC-20 `approve`. Có thể truyền `_payoutAmount == msg.value`, hoặc truyền `_payoutAmount = 0` để hợp đồng lấy trực tiếp `msg.value`.
- **Quy đổi mức ký quỹ gợi ý (với ví test có `2 – 10 SepoliaETH`):**
  - `5,000,000 VND` $\rightarrow$ `0.005 SepoliaETH` (`5000000000000000` wei)
  - **`10,000,000 VND` (Mặc định demo)** $\rightarrow$ **`0.01 SepoliaETH`** (**`10000000000000000` wei** = `10 Finney`)
  - `20,000,000 VND` $\rightarrow$ `0.02 SepoliaETH` (`20000000000000000` wei)
- Phát event `PolicyCreated(shipmentKey, insurer, beneficiary, payoutAmount, expiry)`.

#### `reportViolation`
```solidity
function reportViolation(
    bytes32 _shipmentKey,
    bytes32 _evidenceHash,
    uint256 _detectedAt
) external;
```
- **Người gọi**: Chỉ địa chỉ `oracle` được cấp quyền.
- Kiểm tra: Policy Active, `block.timestamp <= expiry`, contract đủ số dư ETH (`address(this).balance >= policy.payoutAmount`).
- Cập nhật trạng thái `PaidOut` (2) **trước** khi chuyển thẳng `SepoliaETH` cho `beneficiary`.
- Phát event `InsurancePaid`.

#### `refundExpiredPolicy`
```solidity
function refundExpiredPolicy(bytes32 _shipmentKey) external;
```
- Cho phép `insurer` (hoặc `owner`) rút lại `SepoliaETH` đã khóa khi policy đã hết hạn an toàn (`block.timestamp > expiry`) mà không có vi phạm nào.
- Trạng thái chuyển sang `Refunded` (3), phát event `PolicyRefunded`.

#### `getPolicy`
```solidity
function getPolicy(bytes32 _shipmentKey) external view returns (
    address insurer,       // index 0
    address beneficiary,   // index 1
    uint256 payoutAmount,  // index 2
    uint256 expiry,        // index 3
    PolicyStatus status,   // index 4 (0=NotExist, 1=Active, 2=PaidOut, 3=Refunded)
    bytes32 evidenceHash,  // index 5
    uint256 detectedAt     // index 6
);
```

#### `isPolicyActive` & `getContractBalance`
```solidity
function isPolicyActive(bytes32 _shipmentKey) external view returns (bool);
function getContractBalance() external view returns (uint256);
```

### 4.2. Custom Errors
| Custom Error | Nguyên nhân |
|---|---|
| `ColdChain__CallerNotOracle()` | Caller không khớp với địa chỉ oracle. |
| `ColdChain__CallerNotOwner()` | Caller không phải owner contract. |
| `ColdChain__CallerNotInsurer()` | Caller không phải insurer khi yêu cầu hoàn tiền policy. |
| `ColdChain__PolicyAlreadyExists(bytes32)` | `shipmentKey` đã được tạo policy trước đó. |
| `ColdChain__PolicyNotActive(bytes32, uint8)` | Policy không ở trạng thái Active (đã PaidOut hoặc đã Refunded). |
| `ColdChain__PolicyExpired(uint256, uint256)` | Policy đã hết hạn tại thời điểm báo cáo vi phạm. |
| `ColdChain__PolicyNotExpired(uint256, uint256)` | Policy chưa đến hạn hết hiệu lực nên chưa thể hoàn tiền. |
| `ColdChain__ContractInsufficientBalance(uint256, uint256)` | Số dư SepoliaETH của contract không đủ chi trả. |
| `ColdChain__IncorrectETHDeposit(uint256, uint256)` | `msg.value` gửi kèm `createPolicy` không khớp `_payoutAmount`. |
| `ColdChain__ETHTransferFailed()` | Lệnh chuyển native `SepoliaETH` cho `beneficiary` hoặc `insurer` thất bại. |

---

## 5. Ví dụ Tích hợp Python (web3.py) End-to-End cho Backend

```python
import json
import os
from pathlib import Path
from web3 import Web3

# 1. Kết nối Ethereum Sepolia qua Alchemy HTTPS RPC
w3 = Web3(Web3.HTTPProvider(os.environ["BLOCKCHAIN_RPC_URL"], request_kwargs={"timeout": 10}))
assert w3.is_connected(), "Không thể kết nối Sepolia RPC"
assert w3.eth.chain_id == 11155111, "Chain ID không khớp Sepolia"

# 2. Đọc Deployment Info & Wrapped ABI
deployment = json.loads(Path("blockchain/deployments/sepolia.json").read_text(encoding="utf-8"))
data_integrity_address = deployment["contracts"]["ColdChainDataIntegrity"]["address"]
insurance_address = deployment["contracts"]["ColdChainInsurance"]["address"]

data_integrity_abi = json.loads(Path("blockchain/deployments/abi/ColdChainDataIntegrity.json").read_text(encoding="utf-8"))["abi"]
insurance_abi = json.loads(Path("blockchain/deployments/abi/ColdChainInsurance.json").read_text(encoding="utf-8"))["abi"]

data_integrity = w3.eth.contract(address=data_integrity_address, abi=data_integrity_abi)
insurance = w3.eth.contract(address=insurance_address, abi=insurance_abi)

# 3. Chuẩn bị Keys & Hashes
shipment_id = "8b4fb8a2-2996-4da2-90b9-35019517f56f"
batch_id = "batch-0001-sealed"
device_id = "device-coldchain-01"

shipment_key = bytes(w3.keccak(text=shipment_id))
batch_key = bytes(w3.keccak(text=batch_id))
device_key = bytes(w3.keccak(text=device_id))

# Root Merkle v1 (SHA-256) từ canonical telemetry records
merkle_root = bytes.fromhex("5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae37")

# 4. Anchor Batch vào Module A (Caller: Anchorer Signer)
anchorer_key = os.environ["BACKEND_ANCHORER_PRIVATE_KEY"]
anchorer_account = w3.eth.account.from_key(anchorer_key)

if not data_integrity.functions.batchExists(batch_key).call():
    tx = data_integrity.functions.anchorBatch(
        batch_key,
        shipment_key,
        device_key,
        merkle_root,
        1,  # firstSequence
        3,  # lastSequence
        3   # recordCount
    ).build_transaction({
        "from": anchorer_account.address,
        "nonce": w3.eth.get_transaction_count(anchorer_account.address, "pending"),
        "chainId": 11155111,
        "gas": 400000,
    })
    signed = w3.eth.account.sign_transaction(tx, private_key=anchorer_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    assert receipt["status"] == 1, "Anchor batch failed"
    print("Batch anchored thành công, Tx:", tx_hash.hex())

# 5. Xác minh tính toàn vẹn (Read-only call)
is_valid = data_integrity.functions.verifyBatch(batch_key, merkle_root).call()
assert is_valid is True, "Toàn vẹn dữ liệu Merkle root không khớp"

# 6. Báo vi phạm và kích hoạt bồi thường SepoliaETH (Module B - Caller: Oracle Signer)
oracle_key = os.environ["BLOCKCHAIN_ORACLE_PRIVATE_KEY"]
oracle_account = w3.eth.account.from_key(oracle_key)

event_id = "c3afece0-1668-4f96-aad6-58349f8f0a64"
evidence_hash = bytes(w3.keccak(text=event_id))
detected_at = 1762300000

policy = insurance.functions.getPolicy(shipment_key).call()
if policy[4] == 1:  # Active
    payout_tx = insurance.functions.reportViolation(
        shipment_key,
        evidence_hash,
        detected_at
    ).build_transaction({
        "from": oracle_account.address,
        "nonce": w3.eth.get_transaction_count(oracle_account.address, "pending"),
        "chainId": 11155111,
        "gas": 300000,
    })
    signed_payout = w3.eth.account.sign_transaction(payout_tx, private_key=oracle_key)
    payout_hash = w3.eth.send_raw_transaction(signed_payout.raw_transaction)
    payout_receipt = w3.eth.wait_for_transaction_receipt(payout_hash, timeout=120)
    assert payout_receipt["status"] == 1, "Bồi thường bảo hiểm thất bại"
    print("Bồi thường SepoliaETH thành công, Tx:", payout_hash.hex())
```

---

## 5.1. Ánh xạ Backend Outbox (`ANCHOR_BATCH`) $\rightarrow$ `anchorBatch`

Hiện tại `backend/app/services/batch_service.py` tạo sẵn `IntegrationOutbox(kind="ANCHOR_BATCH")` chứa JSON payload sau khi seal batch:

| Field trong `IntegrationOutbox.payload` | Tham số `ColdChainDataIntegrity.anchorBatch` | Quy tắc chuyển đổi |
|---|---|---|
| `batch_id` (UUID/string) | `_batchKey` (`bytes32`) | `bytes(Web3.keccak(text=payload["batch_id"]))` |
| `shipment_id` (UUID/string) | `_shipmentKey` (`bytes32`) | `bytes(Web3.keccak(text=payload["shipment_id"]))` |
| `device_id` (string) | `_deviceKey` (`bytes32`) | `bytes(Web3.keccak(text=payload["device_id"]))` |
| `merkle_root` (`0x` + 64 hex) | `_merkleRoot` (`bytes32`) | `bytes.fromhex(payload["merkle_root"].removeprefix("0x"))` |
| `first_sequence` (int) | `_firstSequence` (`uint64`) | Giữ nguyên số nguyên `int` |
| `last_sequence` (int) | `_lastSequence` (`uint64`) | Giữ nguyên số nguyên `int` |
| `record_count` (int) | `_recordCount` (`uint32`) | Giữ nguyên số nguyên `int` |

### Quy tắc Idempotency & Retry khi RPC Timeout (Phase 6)
1. **Trước khi broadcast lại (`ANCHOR_BATCH`)**: Backend gọi `batchExists(batchKey)` (hoặc `getBatch(batchKey)`).
   - Nếu đã tồn tại và `on_chain_batch.merkleRoot == merkle_root`: Tx trước đó đã thành công $\rightarrow$ đối chiếu `BatchAnchored` event & chuyển sang `DATA_ANCHORED`, **không gửi lại giao dịch**.
   - Nếu đã tồn tại nhưng `merkleRoot` khác: Ghi nhận `DATA_INTEGRITY_FAILED` & cảnh báo audit; **không ghi đè**.
   - Nếu gửi trùng sẽ nhận Custom Error `ColdChain__BatchAlreadyExists(batchKey)`.
2. **Trước khi broadcast lại (`reportViolation`)**:
   - Đọc `getPolicy(shipmentKey)`: nếu `policy[4] == 2` (`PaidOut`) với cùng `evidenceHash` (`policy[5]`) và `detectedAt` (`policy[6]`) $\rightarrow$ reconcile `CONFIRMED`, không gửi lại giao dịch.

---

## 6. Trạng thái Kiểm chứng Sepolia (`11155111`)

- **ABI Parity (`validate_remix_abi.py`):** Cả `ColdChainDataIntegrity` (5 chữ ký Backend, 18 entries) và `ColdChainInsurance` bản native `SepoliaETH` (4 chữ ký Backend, 28 entries) đã được đối chiếu khớp 100% với `backend/app/integrations/abi/*.json`.
- **On-chain Preflight (`preflight_sepolia.py`):** Đã xác minh bytecode và roles (`Anchorer = 0xd2D6...`, `Oracle = 0x7747...`) trực tiếp trên Sepolia tại `deployments/sepolia.json`, cùng kiểm tra kết nối thành công từ `Web3IntegrityAdapter` và `Web3BlockchainAdapter` của Backend.
- **Hướng dẫn Demo E2E thủ công trên Remix + MetaMask:** Xem [REMIX_TEST_SCENARIOS.md](REMIX_TEST_SCENARIOS.md).

---

## 7. Tên lô hàng và bộ thiết bị cố định

- Backend tạo lô hàng bằng `name`, trả `shipment_id` UUID (`id` cùng giá trị). Luôn hash UUID `shipment_id` cho `shipmentKey`, không hash `name` vì tên có thể trùng.
- Bộ thiết bị cố định dùng `ESP32-01` đến `ESP32-10`; `deviceKey` hash đúng chuỗi `device_id` này. Public key P-256 lưu ở MySQL, private key chỉ ở file local/ESP32, không đăng ký khóa ESP32 lên chain.
- ABI/adapter hiện dùng native `SepoliaETH` (`constructor` chỉ nhận `Oracle`; `createPolicy` là `payable`, gửi `value=amount_wei`, không approve ERC-20). Xem thêm [hướng dẫn local](../docs/local-devices.md).
