# Giai đoạn 1 — Hướng dẫn Compile & Chuẩn bị Remix IDE (Không dùng Hardhat / Node.js)

> **Phạm vi:** Hướng dẫn này dùng đúng cấu hình nhóm đã thống nhất cho `blockchain/contracts/*.sol` mà **không chỉnh sửa logic Solidity** và **không cần cài Node.js / Hardhat**.

---

## 1. Cấu hình Remix Compiler

Mở [Remix IDE](https://remix.ethereum.org/) và thiết lập tab **Solidity Compiler**:

| Thiết lập | Giá trị bắt buộc | Ghi chú |
|---|---|---|
| **Compiler** | `0.8.36+commit.8a079791` | Cả 2 file dùng `pragma solidity ^0.8.24;` nên tương thích trực tiếp |
| **Language** | `Solidity` | — |
| **Enable optimization** | **Bật (`true`)**, `200` runs | Khớp cấu hình baseline trong `compiler-settings.json` |
| **EVM Version** | `osaka` *(default của `0.8.36`)* | Đã xác nhận compile & deploy thành công trên Sepolia |
| **viaIR** | Tắt (`false`) | Không bật |

### Cách import source và pin OpenZeppelin `v5.6.1` (không sửa `.sol`)

1. Copy 2 file chính từ `blockchain/contracts/` vào workspace Remix *(không còn cần `MockInsuranceToken.sol` vì bảo hiểm dùng trực tiếp native `SepoliaETH`)*:
   - `contracts/ColdChainDataIntegrity.sol`
   - `contracts/ColdChainInsurance.sol`
2. File `ColdChainInsurance.sol` đang dùng:
   ```solidity
   import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
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
- **Thứ tự Deploy chuẩn (2 contracts, dùng native `SepoliaETH`):**
  1. `ColdChainDataIntegrity(_anchorer)` — truyền **địa chỉ public ví Anchorer** của Backend (`0xd2D62EB2cd0731383b9F49A7e8DdD7cdD54b355E`).
  2. `ColdChainInsurance(_oracle)` — truyền **địa chỉ public ví Oracle** của Backend (`0x7747f2c48C0D9562c311BbeBE4F822aE372C54bb`).

> **Mức ký quỹ Policy bằng `SepoliaETH` (cho ví test có `2 – 10 SepoliaETH`):**
> - **Mức chuẩn mặc định:** **`0.01 SepoliaETH`** = **`10000000000000000` `wei`** (`10 Finney`). Khi gọi `createPolicy(...)` trên Remix, điền `10000000000000000` vào ô **`VALUE`** (chọn đơn vị `Wei` hoặc nhập `10` đơn vị `Finney`) và điền `_payoutAmount = 10000000000000000` (hoặc `0` để contract tự lấy theo `msg.value`).

> **Lưu ý:** Sau khi deploy thật trên Sepolia, dùng Python tooling (không cần Node.js/Hardhat) để tạo manifest và xác minh trạng thái:
>
> ```bash
> pip install -r blockchain/requirements.txt
>
> # 1. Tạo blockchain/deployments/sepolia.json (không chứa secrets)
> python blockchain/scripts_py/create_sepolia_manifest.py \
>   --integrity-address 0x... --integrity-tx 0x... --integrity-block 123457 \
>   --insurance-address 0x... --insurance-tx 0x... --insurance-block 123458 \
>   --owner 0x... --anchorer 0x... --oracle 0x...
>
> # 2. Kiểm tra RPC Sepolia, bytecode và role on-chain
> python blockchain/scripts_py/preflight_sepolia.py --manifest blockchain/deployments/sepolia.json
> ```
