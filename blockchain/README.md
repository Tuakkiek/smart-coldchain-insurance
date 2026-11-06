# Blockchain — Smart Cold Chain Insurance

Smart Contract quản lý dữ liệu toàn vẹn (Module A) và chính sách bảo hiểm chuỗi lạnh (Module B) trên local EVM blockchain (Hoàn thành Phase 4).

> ⚠️ **Demo only** — Token và tài sản trong project này không có giá trị thật.
> Không kết nối ví/tài khoản có tiền thật.

## Stack

- **Solidity** 0.8.24
- **Hardhat** 2.x + TypeScript
- **OpenZeppelin** Contracts v5 (ERC-20, SafeERC20, ReentrancyGuard)
- **Chai** + **Mocha** (qua Hardhat Toolbox) — 66 test cases (100% passing) bao phủ toàn bộ Module A, Module B, Security/Failure Scenarios và Cross-contract Integration Flow

## Cài đặt

```bash
cd blockchain
npm install
```

## Scripts

| Lệnh              | Mô tả                                       |
|--------------------|----------------------------------------------|
| `npm run compile`  | Compile smart contracts                      |
| `npm run test`     | Chạy toàn bộ 66 unit & integration tests     |
| `npm run node`     | Khởi chạy local Hardhat node (chain ID 31337)|
| `npm run deploy`   | Deploy contracts lên local node              |
| `npm run seed`     | Tạo dữ liệu demo (1 policy mẫu)             |
| `npm run verify`   | Xác minh bytecode, roles, quỹ và demo policy |
| `npm run clean`    | Xoá artifacts/cache                          |

## Quy trình chạy demo

```bash
# Terminal 1: Chạy local node
npm run node

# Terminal 2: Deploy contracts
npm run deploy

# Terminal 2: Tạo dữ liệu demo
npm run seed

# Terminal 2: Xác minh deployment
npm run verify
```

Sau khi deploy, thông tin contract được lưu tại `deployments/localhost.json`.

## Cấu trúc thư mục

```
blockchain/
  contracts/
    ColdChainDataIntegrity.sol  # Module A: Telemetry batch Merkle root anchoring & verification
    ColdChainInsurance.sol      # Module B: Insurance policy, funding, payout & refund
    MockInsuranceToken.sol      # Token ERC-20 demo
    test/
      MaliciousReentrantToken.sol # Token ERC-20 độc hại để test tấn công Reentrancy
  scripts/
    deploy.ts                   # Script deploy
    seed-demo.ts                # Script tạo dữ liệu demo
    verify-deployment.ts        # Script xác minh trạng thái deployment
  test/
    ColdChainInsurance.test.ts          # Module B tests (36 cases)
    DataIntegrity.test.ts               # Module A tests + Merkle-v1 Golden Vectors (20 cases)
    SecurityAndFailureScenarios.test.ts # Reentrancy, SafeERC20 failures, Solvency (8 cases)
    IntegrationFlow.test.ts             # Module A + Module B E2E workflow (2 cases)
  deployments/
    localhost.json              # Thông tin deploy (sinh tự động)
  artifacts/                    # Sinh tự động bởi Hardhat
  typechain-types/              # TypeScript typings (sinh tự động)
  INTEGRATION.md                # Hướng dẫn tích hợp cho Member 1 (Backend) & Member 3
  README.md                     # File này
```

## Contracts

### 1. ColdChainDataIntegrity (Module A)

Contract chịu trách nhiệm lưu trữ (anchor) và xác thực tính toàn vẹn của các lô dữ liệu telemetry IoT từ Edge/Backend.

- **Merkle v1 Protocol**: Tuân thủ chuẩn hashing RFC 6962 / Tuakkiek protocol v1 (`SHA-256(0x00 || canonical_record_utf8)` cho lá và `SHA-256(0x01 || left || right)` cho node cha).
- Khóa batch (`batchKey`) và khóa shipment (`shipmentKey`) sử dụng `keccak256(bytes)`.

| Hàm                                | Ai gọi            | Mô tả                                                             |
|-------------------------------------|-------------------|-------------------------------------------------------------------|
| `anchorBatch(...)`                  | Anchorer (Backend)| Neo Merkle root, recordCount, timestamps và deviceKey cho batch   |
| `getBatch(batchKey)`                | Public view       | Trả về toàn bộ thông tin batch (tuple 6 giá trị)                 |
| `verifyBatch(batchKey, root, count)`| Public view       | Xác thực tính toàn vẹn của batch (so sánh Merkle root và count)  |
| `batchExists(batchKey)`             | Public view       | Kiểm tra nhanh sự tồn tại của batch                              |
| `setAnchorer(newAnchorer)`          | Owner             | Cập nhật địa chỉ anchorer được cấp quyền                          |

### 2. ColdChainInsurance (Module B)

Contract chính quản lý chính sách bảo hiểm:

| Hàm                        | Ai gọi          | Mô tả                                                             |
|----------------------------|-----------------|-------------------------------------------------------------------|
| `createPolicy(...)`        | Insurer         | Đăng ký policy, ghi nhận insurer, khóa token ký quỹ (SafeERC20)   |
| `reportViolation(...)`      | Oracle (Backend)| Báo vi phạm, tự động chuyển token cho beneficiary khi đủ điều kiện|
| `refundExpiredPolicy(...)` | Insurer / Owner | Hoàn lại token cho bên bảo hiểm khi chuyến hàng an toàn, hết hạn |
| `setOracle(...)`           | Owner           | Cập nhật địa chỉ oracle                                           |
| `getPolicy(...)`           | Public view     | Đọc thông tin chi tiết policy (7 giá trị tuple khớp Backend)       |
| `isPolicyActive(...)`      | Public view     | Kiểm tra nhanh policy có đang active và còn hiệu lực không        |
| `getContractBalance()`     | Public view     | Kiểm tra số dư quỹ bảo hiểm trong contract                        |

### 3. MockInsuranceToken (MINS)

Token ERC-20 đơn giản dùng để mô phỏng ký quỹ và chi trả bảo hiểm.
- Owner có thể `mint()` thêm token.
- 18 decimals.
- Sử dụng Custom Errors (`MockToken__CallerNotOwner`, `MockToken__ZeroAddress`).
- Không đại diện giá trị VND hoặc tiền thật.

## Bảo mật & Tối ưu hóa (Phase 3 & Phase 4)

- **SafeERC20 (OpenZeppelin v5)**: Chống revert âm thầm và chuẩn hóa các hành vi trả về của token.
- **Custom Errors (Solidity 0.8.24)**: Tiết kiệm gas đáng kể so với `require(..., "string")`.
- **ReentrancyGuard**: Ngăn chặn tấn công Reentrancy trên toàn bộ các hàm state-changing và transfer token (đã kiểm chứng qua `MaliciousReentrantToken`).
- **Checks-Effects-Interactions**: Cập nhật trạng thái `PaidOut` / `Refunded` trước khi gọi hàm transfer token.
- **Solvency Check**: Kiểm tra số dư quỹ bảo hiểm trước khi thực hiện chuyển token.
- **Phân quyền chặt chẽ**: Quyền `Anchorer` và `Oracle` tách biệt, kiểm soát bởi `Owner`.
- **Toàn vẹn dữ liệu chuỗi lạnh**: Kết hợp Module A (Merkle root on-chain) và Module B (evidenceHash vi phạm), đảm bảo bằng chứng không thể bị làm giả.
