# Giai đoạn 1 — Hướng dẫn Compile & Chuẩn bị Remix IDE (Không dùng Hardhat / Node.js)

> **Phạm vi:** Hướng dẫn này dùng đúng cấu hình nhóm đã thống nhất cho `blockchain/contracts/*.sol` mà **không chỉnh sửa logic Solidity** và **không cần cài Node.js / Hardhat**.

---

## 1. Cấu hình Remix Compiler

Mở [Remix IDE](https://remix.ethereum.org/) và thiết lập tab **Solidity Compiler**:

| Thiết lập | Giá trị bắt buộc | Ghi chú |
|---|---|---|
| **Compiler** | `0.8.36+commit.8a079791` | Cả 3 file dùng `pragma solidity ^0.8.24;` nên tương thích trực tiếp |
| **Language** | `Solidity` | — |
| **Enable optimization** | **Bật (`true`)**, `200` runs | Khớp cấu hình baseline trong `compiler-settings.json` |
| **EVM Version** | `osaka` *(default của `0.8.36`)* | Đã xác nhận compile & deploy thành công trên Sepolia |
| **viaIR** | Tắt (`false`) | Không bật |

### Cách import source và pin OpenZeppelin `v5.6.1` (không sửa `.sol`)

1. Copy 3 file từ `blockchain/contracts/` vào workspace Remix:
   - `contracts/ColdChainDataIntegrity.sol`
   - `contracts/ColdChainInsurance.sol`
   - `contracts/MockInsuranceToken.sol`
2. Hai file `ColdChainInsurance.sol` và `MockInsuranceToken.sol` đang dùng:
   ```solidity
   import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
   import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
   import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
   import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
   ```
3. **Cách pin đúng phiên bản `@openzeppelin/contracts@5.6.1` trên Remix:**
   - **Cách A (Khuyên dùng):** Trong Remix, tạo hoặc kiểm tra thư mục `.deps/npm/@openzeppelin/contracts/` (khi Remix tự tải lần đầu), đảm bảo `package.json` trong `.deps/npm/@openzeppelin/contracts/package.json` là version **`5.6.1`** (không để bản khác trôi nổi).
   - **Cách B (Dùng GitHub tag cố định nếu import tay):** Nếu tạo remapping trong `remix.config.json` (khi dùng Remix plugin/remapping), map `@openzeppelin/contracts/=https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.6.1/contracts/`. **Không** sửa trực tiếp câu `import` trong `blockchain/contracts/*.sol` ở Git để giữ nguyên checksum source.

---

## 2. Kiểm tra ABI không Breaking Change (bằng Python, không cần Node.js)

Sau khi compile cả 3 contract trên Remix không có lỗi:

1. Ở tab **Solidity Compiler**, nhấn **ABI** (hoặc mở file `contracts/artifacts/<ContractName>.json` trong Remix).
2. Lưu file ABI vừa copy (dạng mảng `[...]` hoặc object `{ "abi": [...] }`) vào thư mục tạm, rồi chạy script kiểm tra bằng Python:
   ```bash
   python blockchain/scripts_py/validate_remix_abi.py \
     --contract ColdChainDataIntegrity \
     --input path/to/remix_integrity_abi.json \
     --out blockchain/deployments/abi/ColdChainDataIntegrity.backend.json
   ```
   Làm tương tự cho `ColdChainInsurance`:
   ```bash
   python blockchain/scripts_py/validate_remix_abi.py \
     --contract ColdChainInsurance \
     --input path/to/remix_insurance_abi.json \
     --out blockchain/deployments/abi/ColdChainInsurance.backend.json
   ```
3. Script sẽ:
   - Đối chiếu từng **function, event, custom error** so với ABI chuẩn mà Backend đang dùng (`backend/app/integrations/abi/`).
   - Đảm bảo file xuất ra có định dạng `{"contractName": "...", "abi": [...]}` (bắt buộc vì `backend/app/integrations/blockchain_adapter.py` đọc `json.load(f)["abi"]`).

---

## 3. Cấu hình Deploy & Run Transactions (Cho Phase 3 & Phase 5)

Ở tab **Deploy & Run Transactions** trên Remix:

- **ENVIRONMENT:** Chọn **`Browser Extension`** → kết nối **MetaMask**.
- **Mạng trên MetaMask:** Chọn **Sepolia test network** (`Chain ID: 11155111`).
- **ACCOUNT:** Đảm bảo ví Deployer (Owner) có đủ Sepolia ETH trước khi deploy.
- **Thứ tự Deploy chuẩn (giữ nguyên constructor):**
  1. `MockInsuranceToken(initialSupply)` — ví dụ `1000000000000000000000000` (`1,000,000 * 10^18`).
  2. `ColdChainDataIntegrity(_anchorer)` — truyền **địa chỉ public ví Anchorer** của Backend.
  3. `ColdChainInsurance(_payoutToken, _oracle)` — truyền địa chỉ `MockInsuranceToken` ở bước 1 và **địa chỉ public ví Oracle** của Backend.

> **Lưu ý:** Sau khi deploy thật trên Sepolia, dùng Python tooling (không cần Node.js/Hardhat) để tạo manifest và xác minh trạng thái:
>
> ```bash
> pip install -r blockchain/requirements.txt
>
> # 1. Tạo blockchain/deployments/sepolia.json (không chứa secrets)
> python blockchain/scripts_py/create_sepolia_manifest.py \
>   --token-address 0x... --token-tx 0x... --token-block 123456 \
>   --integrity-address 0x... --integrity-tx 0x... --integrity-block 123457 \
>   --insurance-address 0x... --insurance-tx 0x... --insurance-block 123458 \
>   --owner 0x... --anchorer 0x... --oracle 0x...
>
> # 2. Kiểm tra RPC Sepolia, bytecode và role on-chain
> python blockchain/scripts_py/preflight_sepolia.py --manifest blockchain/deployments/sepolia.json
> ```
