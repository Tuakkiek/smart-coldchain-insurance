# Blockchain — Smart Cold Chain Insurance

Smart Contract quản lý chính sách bảo hiểm chuỗi lạnh trên local EVM blockchain (Hoàn thành Phase 3).

> ⚠️ **Demo only** — Token và tài sản trong project này không có giá trị thật.
> Không kết nối ví/tài khoản có tiền thật.

## Stack

- **Solidity** 0.8.24
- **Hardhat** 2.x + TypeScript
- **OpenZeppelin** Contracts v5 (ERC-20, SafeERC20, ReentrancyGuard)
- **Chai** + **Mocha** (qua Hardhat Toolbox) — unit tests (36 test cases bao phủ 100%)

## Cài đặt

```bash
cd blockchain
npm install
```

## Scripts

| Lệnh              | Mô tả                                       |
|--------------------|----------------------------------------------|
| `npm run compile`  | Compile smart contracts                      |
| `npm run test`     | Chạy toàn bộ 36 unit tests                   |
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
    ColdChainInsurance.sol      # Module B: Insurance contract (Phase 3 hoàn thiện)
    MockInsuranceToken.sol      # Token ERC-20 demo
  scripts/
    deploy.ts                   # Script deploy
    seed-demo.ts                # Script tạo dữ liệu demo
    verify-deployment.ts        # Script xác minh trạng thái deployment
  test/
    ColdChainInsurance.test.ts  # Unit tests (36 cases bao phủ toàn bộ nhánh)
  deployments/
    localhost.json              # Thông tin deploy (sinh tự động)
  artifacts/                    # Sinh tự động bởi Hardhat
  typechain-types/              # TypeScript typings (sinh tự động)
  INTEGRATION.md                # Hướng dẫn tích hợp cho Member 1 (Backend) & Member 3
  README.md                     # File này
```

## Contracts

### MockInsuranceToken (MINS)

Token ERC-20 đơn giản dùng để mô phỏng chi trả bảo hiểm.
- Owner có thể `mint()` thêm token.
- 18 decimals.
- Sử dụng Custom Errors (`MockToken__CallerNotOwner`, `MockToken__ZeroAddress`).
- Không đại diện giá trị VND hoặc tiền thật.

### ColdChainInsurance

Contract chính quản lý policy bảo hiểm:

| Hàm                        | Ai gọi          | Mô tả                                                             |
|----------------------------|-----------------|-------------------------------------------------------------------|
| `createPolicy(...)`        | Insurer         | Đăng ký policy, ghi nhận insurer, khóa token ký quỹ (SafeERC20)   |
| `reportViolation(...)`      | Oracle (Backend)| Báo vi phạm, tự động chuyển token cho beneficiary khi đủ điều kiện|
| `refundExpiredPolicy(...)` | Insurer / Owner | Hoàn lại token cho bên bảo hiểm khi chuyến hàng an toàn, hết hạn |
| `setOracle(...)`           | Owner           | Cập nhật địa chỉ oracle                                           |
| `getPolicy(...)`           | Public view     | Đọc thông tin chi tiết policy (7 giá trị tuple khớp Backend)       |
| `isPolicyActive(...)`      | Public view     | Kiểm tra nhanh policy có đang active và còn hiệu lực không        |
| `getContractBalance()`     | Public view     | Kiểm tra số dư quỹ bảo hiểm trong contract                        |

### Events

- `PolicyCreated(shipmentKey, insurer, beneficiary, payoutAmount, expiry)`
- `InsurancePaid(shipmentKey, beneficiary, payoutAmount, evidenceHash, detectedAt)`
- `PolicyRefunded(shipmentKey, insurer, amount)`
- `OracleUpdated(previousOracle, newOracle)`

## Bảo mật & Tối ưu hóa (Phase 3)

- **SafeERC20 (OpenZeppelin)**: Đảm bảo các giao dịch chuyển token tuân thủ tiêu chuẩn an toàn, chống revert âm thầm.
- **Custom Errors (Solidity 0.8.24)**: Tiết kiệm gas đáng kể so với revert string và cung cấp mã lỗi chi tiết.
- **ReentrancyGuard**: Chống tấn công Reentrancy trên mọi hàm xử lý chuyển token.
- **Checks-Effects-Interactions**: Cập nhật trạng thái `PaidOut` / `Refunded` trước khi gọi hàm transfer token.
- **Solvency Check**: Kiểm tra số dư quỹ bảo hiểm trước khi thực hiện chuyển token.
- **Quyền Oracle chặt chẽ**: Chỉ oracle được ủy quyền mới có thể kích hoạt chi trả bảo hiểm.
