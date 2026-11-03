# INTEGRATION.md — Hướng dẫn tích hợp Blockchain cho Member 1 (Backend) & Member 3 (Dashboard)

> Tài liệu này mô tả cách Backend tương tác với Smart Contract `ColdChainInsurance` (cập nhật Phase 2).
> Member 1 đọc tài liệu này để viết `blockchain_adapter.py`.

## 1. Thông tin deploy (local)

Sau khi chạy `npm run deploy`, thông tin được lưu tại `deployments/localhost.json`:

```json
{
  "network": "localhost",
  "chainId": 31337,
  "contracts": {
    "MockInsuranceToken": { "address": "0x..." },
    "ColdChainInsurance": { "address": "0x...", "oracle": "0x..." }
  }
}
```

- **RPC URL**: `http://127.0.0.1:8545`
- **Chain ID**: `31337`
- Địa chỉ chỉ có hiệu lực trong phiên local chain hiện tại; deploy lại sẽ đổi địa chỉ.

## 2. Quy tắc mã hóa ID

### shipmentKey

```
shipmentKey = keccak256(UTF8(shipment_id))
```

- `shipment_id` là UUID v4 chuỗi chữ thường chuẩn có dấu gạch nối.
- Ví dụ: `shipment_id = "8b4fb8a2-2996-4da2-90b9-35019517f56f"`
- → `shipmentKey = keccak256("8b4fb8a2-2996-4da2-90b9-35019517f56f")`
- Kiểu Solidity: `bytes32`
- **Không** hash UUID dạng nhị phân, **không** dùng SHA-256.

### evidenceHash

```
evidenceHash = keccak256(UTF8(event_id))
```

- `event_id` là UUID v4 của event `INSURANCE_TRIGGERED`.
- Ví dụ: `event_id = "c3afece0-1668-4f96-aad6-58349f8f0a64"`
- → `evidenceHash = keccak256("c3afece0-1668-4f96-aad6-58349f8f0a64")`

### detectedAt

- `occurred_at` (ISO 8601 UTC) của `INSURANCE_TRIGGERED` → chuyển sang **Unix timestamp giây UTC**.
- Kiểu Solidity: `uint256`

## 3. Function Signatures

### createPolicy

```solidity
function createPolicy(
    bytes32 _shipmentKey,
    address _beneficiary,
    uint256 _payoutAmount,
    uint256 _expiry
) external
```

- **Ai gọi**: Tài khoản insurer (người tạo đơn bảo hiểm/ký quỹ).
- **Trước khi gọi**: Gọi `MockInsuranceToken.approve(insuranceContractAddress, payoutAmount)`.
- `_payoutAmount`: Số token demo (18 decimals). Ví dụ: 1000 token = `1000 * 10^18`.
- `_expiry`: Unix timestamp giây, phải lớn hơn `block.timestamp` hiện tại.
- Ghi nhận `msg.sender` làm `insurer`.

### reportViolation

```solidity
function reportViolation(
    bytes32 _shipmentKey,
    bytes32 _evidenceHash,
    uint256 _detectedAt
) external
```

- **Ai gọi**: Chỉ địa chỉ oracle (Backend signer).
- Contract tự động kiểm tra: policy tồn tại, Active, chưa hết hạn, contract đủ số dư (Solvency check), chưa chi trả.
- Nếu hợp lệ: chuyển token cho beneficiary và phát event `InsurancePaid`.

### refundExpiredPolicy

```solidity
function refundExpiredPolicy(bytes32 _shipmentKey) external
```

- **Ai gọi**: Bên bảo hiểm (`policy.insurer`) hoặc admin (`owner`).
- Khi chuyến hàng kết thúc an toàn, không có vi phạm nhiệt độ và policy đã hết hạn (`block.timestamp > expiry`), hàm này hoàn lại token ký quỹ về ví của `insurer`.
- Trạng thái chuyển thành `Refunded` (3) và phát event `PolicyRefunded`.

### getPolicy

```solidity
function getPolicy(bytes32 _shipmentKey) external view returns (
    address insurer,
    address beneficiary,
    uint256 payoutAmount,
    uint256 expiry,
    PolicyStatus status,    // 0=NotExist, 1=Active, 2=PaidOut, 3=Refunded
    bytes32 evidenceHash,
    uint256 detectedAt
)
```

### isPolicyActive

```solidity
function isPolicyActive(bytes32 _shipmentKey) external view returns (bool)
```

- Trả về `true` nếu policy tồn tại, trạng thái Active và chưa hết hạn.

### getContractBalance

```solidity
function getContractBalance() external view returns (uint256)
```

- Trả về số dư token demo đang khóa trong smart contract.

### setOracle

```solidity
function setOracle(address _newOracle) external
```

- Chỉ owner contract mới được gọi.

## 4. Events

### PolicyCreated

```solidity
event PolicyCreated(
    bytes32 indexed shipmentKey,
    address indexed insurer,
    address indexed beneficiary,
    uint256 payoutAmount,
    uint256 expiry
);
```

### InsurancePaid

```solidity
event InsurancePaid(
    bytes32 indexed shipmentKey,
    address indexed beneficiary,
    uint256 payoutAmount,
    bytes32 evidenceHash,
    uint256 detectedAt
);
```

### PolicyRefunded

```solidity
event PolicyRefunded(
    bytes32 indexed shipmentKey,
    address indexed insurer,
    uint256 amount
);
```

### OracleUpdated

```solidity
event OracleUpdated(
    address indexed previousOracle,
    address indexed newOracle
);
```

## 5. Ví dụ tích hợp Backend (Python web3.py)

```python
from web3 import Web3

w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))

# 1. Tạo shipmentKey
shipment_id = "8b4fb8a2-2996-4da2-90b9-35019517f56f"
shipment_key = w3.keccak(text=shipment_id)

# 2. Tạo evidenceHash
event_id = "c3afece0-1668-4f96-aad6-58349f8f0a64"
evidence_hash = w3.keccak(text=event_id)

# 3. Gọi reportViolation từ Oracle Account
detected_at = 1730000000  # Unix timestamp giây UTC
oracle_account = w3.eth.account.from_key(ORACLE_PRIVATE_KEY)

tx = contract.functions.reportViolation(
    shipment_key,
    evidence_hash,
    detected_at
).build_transaction({
    "from": oracle_account.address,
    "nonce": w3.eth.get_transaction_count(oracle_account.address),
    "gas": 300000,
    "gasPrice": w3.eth.gas_price
})

signed_tx = w3.eth.account.sign_transaction(tx, private_key=ORACLE_PRIVATE_KEY)
tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
```

## 6. Danh sách Custom Errors (Solidity 0.8.24)

Smart contract sử dụng Custom Errors nhằm tối ưu phí Gas và cung cấp thông tin lỗi chi tiết:

| Custom Error | Mô tả / Nguyên nhân |
|---|---|
| `ColdChain__CallerNotOracle()` | Caller không khớp với địa chỉ oracle đã cấu hình. |
| `ColdChain__CallerNotOwner()` | Caller không phải owner/admin của hợp đồng. |
| `ColdChain__CallerNotInsurer()` | Caller không phải insurer của policy khi gọi hoàn tiền. |
| `ColdChain__ZeroAddress()` | Địa chỉ truyền vào là zero address `0x0`. |
| `ColdChain__PolicyAlreadyExists(bytes32)` | `shipmentKey` đã được đăng ký policy trước đó. |
| `ColdChain__InvalidPayoutAmount()` | `payoutAmount` bằng 0. |
| `ColdChain__InvalidExpiry(uint256, uint256)` | `expiry` không nằm trong tương lai (`<= block.timestamp`). |
| `ColdChain__PolicyNotActive(bytes32, uint8)` | Policy không ở trạng thái Active (chưa tạo, đã PaidOut hoặc đã Refunded). |
| `ColdChain__PolicyExpired(uint256, uint256)` | Policy đã quá hạn tại thời điểm báo cáo vi phạm. |
| `ColdChain__PolicyNotExpired(uint256, uint256)` | Policy chưa đến hạn hết hiệu lực nên chưa thể hoàn tiền. |
| `ColdChain__ContractInsufficientBalance(uint256, uint256)` | Số dư quỹ của contract không đủ để thực hiện chi trả/hoàn tiền. |
| `ColdChain__TokenTransferFailed()` | Lệnh chuyển token ERC-20 thất bại (chưa approve hoặc lỗi transfer). |

## 7. Oracle address & Signer

- Oracle address là **account #1** (index 1) từ danh sách account mặc định của Hardhat node.
- Xem địa chỉ cụ thể trong `deployments/localhost.json` → `contracts.ColdChainInsurance.oracle`.
- Backend cần cấu hình private key tương ứng để ký giao dịch.

## 8. ABI & Artifacts

ABI được tự động sinh bởi Hardhat tại:
- `artifacts/contracts/ColdChainInsurance.sol/ColdChainInsurance.json`
- `artifacts/contracts/MockInsuranceToken.sol/MockInsuranceToken.json`

## 9. Giới hạn & Lưu ý an toàn

- Oracle là bên tin cậy — contract **không** tự xác minh cảm biến vật lý hoặc tính đúng của dữ liệu Backend gửi.
- Token demo **không** đại diện giá trị VND hoặc tiền thật.
- `insured_amount_vnd` từ Backend **không** tự động chuyển thành lượng token; số token do người tạo policy quyết định.
