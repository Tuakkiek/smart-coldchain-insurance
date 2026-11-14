# Blockchain — Smart Cold Chain Insurance

Smart Contract quản lý dữ liệu toàn vẹn (Module A) và chính sách bảo hiểm chuỗi lạnh (Module B) trên EVM blockchain (Hoàn thành Phase 6).

> ⚠️ **Demo only** — Token và tài sản trong project này không có giá trị thật.
> Không kết nối ví/tài khoản có tiền thật.

## Stack

- **Solidity** 0.8.24
- **Hardhat** 2.x + TypeScript
- **OpenZeppelin** Contracts v5 (ERC-20, SafeERC20, ReentrancyGuard)
- **Chai** + **Mocha** (qua Hardhat Toolbox) — 83 test cases (100% passing) bao phủ toàn bộ Module A, Module B, Deployment Workflow, Phase 6 Backend Oracle/Integrity Integration, Security/Failure Scenarios và Cross-contract Integration Flow

## Cài đặt

```bash
cd blockchain
npm install
```

## Scripts

| Lệnh                 | Mô tả                                                          |
|-----------------------|-----------------------------------------------------------------|
| `npm run compile`     | Compile smart contracts                                         |
| `npm run test`        | Chạy toàn bộ 83 unit & integration tests                        |
| `npm run node`        | Khởi chạy local Hardhat node (Chain ID 31337)                   |
| `npm run deploy`      | Deploy 3 contracts lên local node                               |
| `npm run seed`        | Tạo dữ liệu demo (neo lô telemetry Module A & policy Module B)  |
| `npm run verify`      | Xác minh bytecode, roles, Merkle root và solvency               |
| `npm run roles`       | Kiểm tra hoặc cập nhật `anchorer` / `oracle` trên chain         |
| `npm run inspect`     | Tra cứu trực tiếp event logs (`BatchAnchored`, `InsurancePaid`) |
| `npm run export-abi`  | Xuất pure ABI và metadata bàn giao cho Backend & Frontend       |
| `npm run clean`       | Xoá artifacts/cache                                             |

## Quy trình chạy demo Local

```bash
# Terminal 1: Chạy local node
npm run node

# Terminal 2: Deploy contracts
npm run deploy

# Terminal 2: Tạo dữ liệu demo
npm run seed

# Terminal 2: Xác minh deployment
npm run verify

# Terminal 2: Xuất ABI bàn giao (tùy chọn)
npm run export-abi
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
    deploy.ts                   # Script deploy 3 contracts & phân quyền
    seed-demo.ts                # Script tạo dữ liệu demo (deterministic)
    verify-deployment.ts        # Script xác minh 6 tiêu chí deployment
    manage-roles.ts             # Script kiểm tra / xoay vòng quyền Anchorer & Oracle
    inspect-onchain.ts          # Script tra cứu event logs & state thực tế trên chain
    export-abi.ts               # Script trích xuất pure ABI bàn giao
  test/
    ColdChainInsurance.test.ts          # Module B tests (36 cases)
    DataIntegrity.test.ts               # Module A tests + Merkle-v1 Golden Vectors (20 cases)
    DeploymentWorkflow.test.ts          # Deploy, seed & verification workflow tests (5 cases)
    Phase6IntegrationScenarios.test.ts  # Phase 6 Outbox mapping, tamper & E13-E17b tests (12 cases)
    SecurityAndFailureScenarios.test.ts # Reentrancy, SafeERC20 failures, Solvency (8 cases)
    IntegrationFlow.test.ts             # Module A + Module B E2E workflow (2 cases)
  deployments/
    localhost.json              # Thông tin deploy mạng local (sinh tự động)
    abi/                        # Bàn giao ABI cho Backend & Frontend
      ColdChainDataIntegrity.abi.json
      ColdChainInsurance.abi.json
      MockInsuranceToken.abi.json
      contract-interfaces.json
  artifacts/                    # Sinh tự động bởi Hardhat
  typechain-types/              # TypeScript typings (sinh tự động)
  INTEGRATION.md                # Hướng dẫn tích hợp cho Member 1 (Backend) & Member 3
  README.md                     # File này
```

## Contracts

### 1. ColdChainDataIntegrity (Module A)

Contract chịu trách nhiệm lưu trữ (anchor) và xác thực tính toàn vẹn của các lô dữ liệu telemetry IoT từ Edge/Backend.

- **Merkle v1 Protocol**: Tuân thủ chuẩn RFC 6962 (`SHA-256(0x00 || canonical_record_utf8)` cho lá và `SHA-256(0x01 || left || right)` cho node cha).
- Khóa batch (`batchKey`) và khóa shipment (`shipmentKey`) sử dụng `keccak256(bytes)`.

| Hàm                                | Ai gọi            | Mô tả                                                             |
|-------------------------------------|-------------------|-------------------------------------------------------------------|
| `anchorBatch(...)`                  | Anchorer (Backend)| Neo Merkle root, recordCount, sequences và deviceKey cho batch    |
| `getBatch(batchKey)`                | Public view       | Trả về toàn bộ thông tin batch (tuple 8 giá trị)                 |
| `verifyBatch(batchKey, root)`       | Public view       | Xác thực tính toàn vẹn của batch (so sánh candidate Merkle root)  |
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

## Môi trường & Xác nhận khối (Confirmations)

- **Local Node**: Cung cấp xác nhận tức thì (1 confirmation, mining ~0 giây). Khởi động lại node sẽ thiết lập lại trạng thái từ block 0.
- **Testnet**: Trạng thái hiện tại là `BLOCKED` (theo Definition of Done Phase 5) do phạm vi đồ án tập trung vào Local Node demo ổn định; không tạo địa chỉ giả mạo trên testnet. Khi nhóm cấp RPC và Faucet testnet, script deploy có thể cấu hình target network tương ứng.
