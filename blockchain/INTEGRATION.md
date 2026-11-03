# INTEGRATION.md — Hướng dẫn tích hợp Blockchain cho Member 1

> Tài liệu này mô tả cách Backend tương tác với Smart Contract `ColdChainInsurance`.
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

- **Ai gọi**: Tài khoản insurer (cần `approve` token trước).
- **Trước khi gọi**: Gọi `MockInsuranceToken.approve(insuranceContractAddress, payoutAmount)`.
- `_payoutAmount`: Số token demo (18 decimals). Ví dụ: 1000 token = `1000 * 10^18`.
- `_expiry`: Unix timestamp giây, phải lớn hơn `block.timestamp` hiện tại.

### reportViolation

```solidity
function reportViolation(
    bytes32 _shipmentKey,
    bytes32 _evidenceHash,
    uint256 _detectedAt
) external
```

- **Ai gọi**: Chỉ địa chỉ oracle (Backend signer).
- Contract tự động kiểm tra: policy tồn tại, Active, chưa hết hạn, chưa chi trả.
- Nếu hợp lệ: chuyển token cho beneficiary và phát event `InsurancePaid`.

### getPolicy

```solidity
function getPolicy(bytes32 _shipmentKey) external view returns (
    address beneficiary,
    uint256 payoutAmount,
    uint256 expiry,
    PolicyStatus status,    // 0=NotExist, 1=Active, 2=PaidOut
    bytes32 evidenceHash,
    uint256 detectedAt
)
```

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

### OracleUpdated

```solidity
event OracleUpdated(
    address indexed previousOracle,
    address indexed newOracle
);
```

## 5. Ví dụ tích hợp (Python pseudo-code)

```python
from web3 import Web3

w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))

# Tạo shipmentKey
shipment_id = "8b4fb8a2-2996-4da2-90b9-35019517f56f"
shipment_key = w3.keccak(text=shipment_id)

# Tạo evidenceHash
event_id = "c3afece0-1668-4f96-aad6-58349f8f0a64"
evidence_hash = w3.keccak(text=event_id)

# Gọi reportViolation
detected_at = 1730000000  # Unix timestamp giây
tx = contract.functions.reportViolation(
    shipment_key,
    evidence_hash,
    detected_at
).build_transaction({...})
```

## 6. Revert messages thường gặp

| Revert message                            | Nguyên nhân                                |
|-------------------------------------------|--------------------------------------------|
| `ColdChain: caller is not oracle`         | Người gọi không phải oracle address        |
| `ColdChain: policy not active or not found`| Policy không tồn tại hoặc đã chi trả      |
| `ColdChain: policy expired`              | Policy đã hết hạn                          |
| `ColdChain: policy already exists`        | shipmentKey đã được đăng ký                |
| `ColdChain: beneficiary is zero address`  | Địa chỉ beneficiary = 0x0                  |
| `ColdChain: payout amount must be > 0`    | Số token chi trả = 0                       |
| `ColdChain: token transfer failed`        | Chưa approve hoặc không đủ token           |
| `ColdChain: payout transfer failed`       | Contract hết token (không nên xảy ra)      |

## 7. Oracle address & Signer

- Oracle address là **account #1** (index 1) từ danh sách account mặc định của Hardhat.
- Xem địa chỉ cụ thể trong `deployments/localhost.json` → `contracts.ColdChainInsurance.oracle`.
- Backend cần cấu hình private key tương ứng để ký giao dịch.
- Danh sách account mặc định của Hardhat: chạy `npx hardhat node` sẽ in ra 20 accounts + private keys.

## 8. ABI

ABI được tự động sinh bởi Hardhat tại:
- `artifacts/contracts/ColdChainInsurance.sol/ColdChainInsurance.json`
- `artifacts/contracts/MockInsuranceToken.sol/MockInsuranceToken.json`

Lấy field `"abi"` trong file JSON.

## 9. Giới hạn

- Oracle là bên tin cậy — contract **không** tự xác minh cảm biến vật lý hoặc tính đúng của dữ liệu Backend gửi.
- Token demo **không** đại diện giá trị VND hoặc tiền thật.
- `insured_amount_vnd` từ Backend **không** tự động chuyển thành lượng token; số token do người tạo policy quyết định.

