# Blockchain — Smart Cold Chain Insurance

Smart Contract quản lý chính sách bảo hiểm chuỗi lạnh trên local EVM blockchain.

> ⚠️ **Demo only** — Token và tài sản trong project này không có giá trị thật.
> Không kết nối ví/tài khoản có tiền thật.

## Stack

- **Solidity** 0.8.24
- **Hardhat** 2.x + TypeScript
- **OpenZeppelin** Contracts v5 (ERC-20, ReentrancyGuard)
- **Chai** + **Mocha** (qua Hardhat Toolbox) — unit tests

## Cài đặt

```bash
cd blockchain
npm install
```

## Scripts

| Lệnh              | Mô tả                                       |
|--------------------|----------------------------------------------|
| `npm run compile`  | Compile smart contracts                      |
| `npm run test`     | Chạy toàn bộ unit tests                      |
| `npm run node`     | Khởi chạy local Hardhat node (chain ID 31337)|
| `npm run deploy`   | Deploy contracts lên local node              |
| `npm run seed`     | Tạo dữ liệu demo (1 policy mẫu)             |
| `npm run clean`    | Xoá artifacts/cache                          |

## Quy trình chạy demo

```bash
# Terminal 1: Chạy local node
npm run node

# Terminal 2: Deploy contracts
npm run deploy

# Terminal 2: Tạo dữ liệu demo
npm run seed
```

Sau khi deploy, thông tin contract được lưu tại `deployments/localhost.json`.

## Cấu trúc thư mục

```
blockchain/
  contracts/
    ColdChainInsurance.sol      # Contract chính
    MockInsuranceToken.sol      # Token ERC-20 demo
  scripts/
    deploy.ts                   # Script deploy
    seed-demo.ts                # Script tạo dữ liệu demo
  test/
    ColdChainInsurance.test.ts  # Unit tests (21 cases)
  deployments/
    localhost.json              # Thông tin deploy (sinh tự động)
  artifacts/                    # Sinh tự động bởi Hardhat
  typechain-types/              # TypeScript typings (sinh tự động)
  INTEGRATION.md                # Hướng dẫn tích hợp cho Member 1
  README.md                     # File này
```

## Contracts

### MockInsuranceToken (MINS)

Token ERC-20 đơn giản dùng để mô phỏng chi trả bảo hiểm.
- Owner có thể `mint()` thêm token.
- 18 decimals.
- Không đại diện giá trị VND hoặc tiền thật.

### ColdChainInsurance

Contract chính quản lý policy bảo hiểm:

| Hàm                  | Ai gọi | Mô tả                                           |
|-----------------------|--------|--------------------------------------------------|
| `createPolicy(...)`   | Ai đó  | Đăng ký policy, khóa token vào contract          |
| `reportViolation(...)` | Oracle | Báo vi phạm, tự động chuyển token cho beneficiary |
| `setOracle(...)`      | Owner  | Cập nhật địa chỉ oracle                          |
| `getPolicy(...)`      | Ai đó  | Đọc thông tin policy                              |

### Events

- `PolicyCreated(shipmentKey, beneficiary, payoutAmount, expiry)`
- `InsurancePaid(shipmentKey, beneficiary, payoutAmount, evidenceHash, detectedAt)`
- `OracleUpdated(previousOracle, newOracle)`

## Bảo mật

- Private key chỉ dùng key test local — **KHÔNG** commit file `.env`.
- Oracle là bên tin cậy (Backend); contract không tự xác minh cảm biến vật lý.
- Contract sử dụng `ReentrancyGuard` và pattern Checks-Effects-Interactions.

