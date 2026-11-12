# INTEGRATION.md — Hướng dẫn tích hợp Blockchain (Module A & B)

> Tài liệu kỹ thuật tích hợp giữa Smart Contracts và Backend / Dashboard (Hoàn thành Phase 5).
> Member 1 (Backend - NTK) sử dụng tài liệu này để cấu hình và phát triển `blockchain_adapter.py`.

---

## 1. Thông tin Bàn giao Mạng & Artifacts (Handoff)

### 1.1. Cấu hình Mạng (Network Configuration)

| Thuộc tính | Local Chain (Hardhat Node) | Testnet (Sepolia/Arbitrum Sepolia) |
|---|---|---|
| **Network Name** | `localhost` | `BLOCKED` (Chưa cấp RPC/Faucet) |
| **RPC URL** | `http://127.0.0.1:8545` | N/A |
| **Chain ID** | `31337` | N/A |
| **Block Time / Finality** | Tức thì (~0s, 1 confirmation) | ~12s (yêu cầu 2 confirmations) |
| **Block Explorer** | Không có (dùng terminal logs hoặc node console) | Sepolia Etherscan (khi triển khai) |
| **Giới hạn** | Khởi động lại node sẽ xóa state; cần chạy lại `deploy` và `seed`. | Cần testnet ETH/tokens để trả gas. |

> ⚠️ **Quy tắc Testnet (DoD Phase 5)**: Hiện tại dự án tập trung vào Local Node ổn định phục vụ demo. Chưa triển khai testnet và không sử dụng địa chỉ placeholder giả mạo. File `deployments/localhost.json` là nguồn sự thật duy nhất cho local chain.

### 1.2. Đường dẫn Artifacts & ABI Bàn giao

Backend và Frontend có thể sử dụng 2 định dạng ABI:
1. **Hardhat Full Artifacts (khuyên dùng cho Backend `blockchain_adapter.py`)**:
   - `blockchain/artifacts/contracts/ColdChainDataIntegrity.sol/ColdChainDataIntegrity.json`
   - `blockchain/artifacts/contracts/ColdChainInsurance.sol/ColdChainInsurance.json`
   - `blockchain/artifacts/contracts/MockInsuranceToken.sol/MockInsuranceToken.json`
   *(Backend đọc trường `["abi"]` từ file này)*.
2. **Pure ABI Files (nhẹ, chuẩn hóa độc lập)**:
   - `blockchain/deployments/abi/ColdChainDataIntegrity.abi.json`
   - `blockchain/deployments/abi/ColdChainInsurance.abi.json`
   - `blockchain/deployments/abi/MockInsuranceToken.abi.json`
   - Bảng tổng hợp signature: `blockchain/deployments/abi/contract-interfaces.json`
3. **Deployment Metadata**:
   - `blockchain/deployments/localhost.json` (chứa addresses của 3 contract và các roles: Deployer, Oracle, Anchorer).

---

## 2. Quy tắc mã hóa định danh (ID Encoding & Hashes)

### 2.1. Định danh Keys (`bytes32`)

Quy tắc chuyển chuỗi ID chuẩn từ Backend sang `bytes32`:

```text
shipmentKey = keccak256(UTF8(shipment_id))
batchKey    = keccak256(UTF8(batch_id))
deviceKey   = keccak256(UTF8(device_id))
```

- Sử dụng `keccak256` trên chuỗi UTF-8 nguyên bản có dấu gạch nối (ví dụ UUID v4: `8b4fb8a2-2996-4da2-90b9-35019517f56f`).
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

#### `createPolicy`
```solidity
function createPolicy(
    bytes32 _shipmentKey,
    address _beneficiary,
    uint256 _payoutAmount,
    uint256 _expiry
) external;
```
- Khóa token ký quỹ (`SafeERC20`) từ insurer (`msg.sender`) vào contract.
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
- Kiểm tra: Policy Active, `block.timestamp <= expiry`, contract đủ số dư.
- Cập nhật trạng thái `PaidOut` (2) trước khi chuyển token cho beneficiary (`SafeERC20`).
- Phát event `InsurancePaid`.

#### `refundExpiredPolicy`
```solidity
function refundExpiredPolicy(bytes32 _shipmentKey) external;
```
- Cho phép `insurer` (hoặc `owner`) rút lại token ký quỹ khi policy đã hết hạn an toàn (`block.timestamp > expiry`) mà không có vi phạm nào.
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
| `ColdChain__ContractInsufficientBalance(uint256, uint256)` | Số dư quỹ contract không đủ chi trả. |

---

## 5. Ví dụ Tích hợp Python (web3.py) End-to-End cho Backend

```python
import json
from pathlib import Path
from web3 import Web3

# 1. Kết nối Local Hardhat Node
w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545", request_kwargs={"timeout": 5}))
assert w3.is_connected(), "Không thể kết nối RPC Node"
assert w3.eth.chain_id == 31337, "Chain ID không khớp"

# 2. Đọc Deployment Info & ABI
deployments_file = Path("blockchain/deployments/localhost.json")
with open(deployments_file, "r", encoding="utf-8") as f:
    deployment = json.load(f)

data_integrity_address = deployment["contracts"]["ColdChainDataIntegrity"]["address"]
insurance_address = deployment["contracts"]["ColdChainInsurance"]["address"]

with open("blockchain/deployments/abi/ColdChainDataIntegrity.abi.json") as f:
    data_integrity_abi = json.load(f)
with open("blockchain/deployments/abi/ColdChainInsurance.abi.json") as f:
    insurance_abi = json.load(f)

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
anchorer_key = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" # Hardhat Account #2
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
        "nonce": w3.eth.get_transaction_count(anchorer_account.address),
        "gas": 250000,
        "gasPrice": w3.eth.gas_price
    })
    signed = w3.eth.account.sign_transaction(tx, private_key=anchorer_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=10)
    assert receipt["status"] == 1, "Anchor batch failed"
    print("Batch anchored thành công, Tx:", tx_hash.hex())

# 5. Xác minh tính toàn vẹn (Read-only call)
is_valid = data_integrity.functions.verifyBatch(batch_key, merkle_root).call()
assert is_valid is True, "Toàn vẹn dữ liệu Merkle root không khớp"

# 6. Báo vi phạm và kích hoạt bồi thường (Module B - Caller: Oracle Signer)
oracle_key = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" # Hardhat Account #1
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
        "nonce": w3.eth.get_transaction_count(oracle_account.address),
        "gas": 300000,
        "gasPrice": w3.eth.gas_price
    })
    signed_payout = w3.eth.account.sign_transaction(payout_tx, private_key=oracle_key)
    payout_hash = w3.eth.send_raw_transaction(signed_payout.raw_transaction)
    payout_receipt = w3.eth.wait_for_transaction_receipt(payout_hash, timeout=10)
    assert payout_receipt["status"] == 1, "Bồi thường bảo hiểm thất bại"
    print("Bồi thường thành công, Tx:", payout_hash.hex())
```

---

## 6. Ma trận kiểm thử (Test Matrix)

| Test File | Phạm vi kiểm thử | Số lượng Cases | Kết quả |
|---|---|---|---|
| `ColdChainInsurance.test.ts` | Khởi tạo, tạo policy, chi trả oracle, hoàn tiền hết hạn, solvency, Backend tuple mapping, mock token mint | 36 | PASS (100%) |
| `DataIntegrity.test.ts` | Cross-language Merkle-v1 golden vectors (1, 2, 3 leaves), anchor batch, duplicate revert, sequence validation, verifyBatch mismatch/unknown | 20 | PASS (100%) |
| `DeploymentWorkflow.test.ts` | Triển khai 3 hợp đồng, phân quyền Anchorer/Oracle, seed dữ liệu mẫu deterministic, schema localhost.json không rò rỉ secrets | 5 | PASS (100%) |
| `IntegrationFlow.test.ts` | Chu trình E2E kết hợp Module A & Module B: Batch Anchoring $\rightarrow$ Integrity Check $\rightarrow$ Breach $\rightarrow$ Oracle Payout $\rightarrow$ Tampered data detection | 2 | PASS (100%) |
| `SecurityAndFailureScenarios.test.ts` | Tấn công Reentrancy qua SafeERC20/ReentrancyGuard, rollback trạng thái khi transfer lỗi, kiểm tra biên thời gian expiry, solvency checks | 8 | PASS (100%) |
| **Tổng cộng** | **Bao phủ toàn diện Module A & B, Deployment Workflow, Failure Modes & Cross-contract Security** | **71** | **PASS (100%)** |
