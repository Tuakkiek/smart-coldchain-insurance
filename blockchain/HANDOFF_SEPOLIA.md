# Bàn giao cấu hình Ethereum Sepolia cho Backend (NTK)

> **Dành cho Member 1 (NTK):** Tài liệu này hướng dẫn các thông số cần điền vào `backend/.env` (hoặc Render Environment Variables) và chỉ rõ **private key của địa chỉ ví nào** tương ứng với từng biến sau khi deploy lên **Ethereum Sepolia (`11155111`)** bằng Remix + MetaMask.
>
> **Cơ chế tiền tệ mới:** Hệ thống sử dụng **native `SepoliaETH`** trực tiếp để ký quỹ & bồi thường (`createPolicy` là `payable`), **không còn dùng `MockInsuranceToken` (`MINS`)**.
>
> **Nguồn sự thật kỹ thuật:** [deployments/sepolia.json](deployments/sepolia.json) · [compiler-settings.json](compiler-settings.json)

---

## 1. Phân vai địa chỉ ví & Private Key tương ứng

| Vai trò trên Contract | Địa chỉ ví Sepolia (Public) | Biến `.env` phía Backend | Ai giữ Private Key? |
|---|---|---|---|
| **Owner / Deployer** | `0x66077Ef603B524911B9226011A3C17Dd4B623fEF` | *(Không đưa vào Backend)* | **Member 2 (NTD)** — dùng MetaMask để `createPolicy` (gửi kèm `SepoliaETH`), `setAnchorer`/`setOracle` |
| **Anchorer** (`ColdChainDataIntegrity`) | `0xd2D62EB2cd0731383b9F49A7e8DdD7cdD54b355E` | `BACKEND_ANCHORER_PRIVATE_KEY` | **Member 1 (NTK)** — dùng để gọi `anchorBatch(...)` |
| **Oracle** (`ColdChainInsurance`) | `0x7747f2c48C0D9562c311BbeBE4F822aE372C54bb` | `BLOCKCHAIN_ORACLE_PRIVATE_KEY` | **Member 1 (NTK)** — dùng để gọi `reportViolation(...)` |

> ⚠️ **Lưu ý bảo mật:**
> - **Đúng key theo địa chỉ:**
>   - `BACKEND_ANCHORER_PRIVATE_KEY` = private key của ví **`0xd2D62EB2cd0731383b9F49A7e8DdD7cdD54b355E`** (nếu sai sẽ bị contract revert `ColdChain__CallerNotAnchorer` / adapter báo `ANCHORER_MISMATCH`).
>   - `BLOCKCHAIN_ORACLE_PRIVATE_KEY` = private key của ví **`0x7747f2c48C0D9562c311BbeBE4F822aE372C54bb`** (nếu sai sẽ bị contract revert `ColdChain__CallerNotOracle` / adapter báo `ORACLE_MISMATCH`).
> - Tuyệt đối **không** commit private key thật hay Alchemy API key lên Git.

---

## 2. Quy đổi mức ký quỹ & bồi thường `SepoliaETH` (cho ví có `2 – 10 SepoliaETH`)

Để đủ dùng cho hàng trăm lượt test/demo mà vẫn minh họa rõ sự thay đổi số dư ví Beneficiary trên Etherscan:

| Giá trị hợp đồng nghiệp vụ (`insured_amount_vnd`) | Số `SepoliaETH` ký quỹ / chi trả | Giá trị nhập `Wei` (`uint256`) | Giá trị theo `Finney` |
|---|---|---|---|
| `5,000,000 VND` | `0.005 SepoliaETH` | `5000000000000000` | `5 Finney` |
| **`10,000,000 VND` (Mặc định demo)** | **`0.01 SepoliaETH`** | **`10000000000000000`** | **`10 Finney`** |
| `20,000,000 VND` | `0.02 SepoliaETH` | `20000000000000000` | `20 Finney` |

- Với ví Owner đang có `~2.5 SepoliaETH`, mức **`0.01 SepoliaETH`** (`10000000000000000` wei) đủ tạo **>200 lần** policy demo mà vẫn dư nhiều SepoliaETH làm phí gas.

---

## 3. Cấu hình mẫu cho `backend/.env` (hoặc Render Env)

Copy các dòng dưới đây vào `backend/.env` và thay các giá trị bí mật (Alchemy key, 2 private keys) cùng địa chỉ `ColdChainInsurance` bản SepoliaETH sau khi deploy lại:

```dotenv
# Bật tích hợp Blockchain lên Ethereum Sepolia
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_NETWORK=sepolia
BLOCKCHAIN_CHAIN_ID=11155111

# Alchemy HTTPS RPC URL do NTK tạo (Sepolia)
BLOCKCHAIN_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY

# Module A — ColdChainDataIntegrity (không đổi)
DATA_INTEGRITY_CONTRACT_ADDRESS=0xE04F6f1bb80C438D356E0547ec10337F33ecD81f
# Điền private key của ví Anchorer: 0xd2D62EB2cd0731383b9F49A7e8DdD7cdD54b355E
BACKEND_ANCHORER_PRIVATE_KEY=0x...
DATA_INTEGRITY_ABI_PATH=blockchain/deployments/abi/ColdChainDataIntegrity.json

# Module B — ColdChainInsurance (dùng bản native SepoliaETH mới)
BLOCKCHAIN_CONTRACT_ADDRESS=0x13Cb896302ea78146EF5eb1E28bFfC1073b8ea9F
# Điền private key của ví Oracle: 0x7747f2c48C0D9562c311BbeBE4F822aE372C54bb
BLOCKCHAIN_ORACLE_PRIVATE_KEY=0x...
BLOCKCHAIN_ABI_PATH=blockchain/deployments/abi/ColdChainInsurance.json

# Confirmations, Timeout & Start Block phù hợp Sepolia + Alchemy
BLOCKCHAIN_CONFIRMATIONS=2
BLOCKCHAIN_RECEIPT_TIMEOUT_SECONDS=120
BLOCKCHAIN_START_BLOCK=12145351
```

---

## 4. Trạng thái Contracts hiện tại trên Sepolia

| Contract | Địa chỉ trên Sepolia | Deploy Block | Deploy Tx |
|---|---|---|---|
| `ColdChainDataIntegrity` (Module A) | `0xE04F6f1bb80C438D356E0547ec10337F33ecD81f` | `12145351` | [`0x669df6...50b3f0`](https://sepolia.etherscan.io/tx/0x669df621fdbd5962f2e3e6cf4311b7686da0f62a28e04b36f8c5f5a39450b3f0) |
| `ColdChainInsurance` (Module B — Native SepoliaETH) | `0x13Cb896302ea78146EF5eb1E28bFfC1073b8ea9F` | `12159144` | [`0x6a8112...e07ddb`](https://sepolia.etherscan.io/tx/0x6a811214cdb38cc1eccd55fcf1f8e6d06942af01e19dc670bccb817126e07ddb) |

---

## 5. Lưu ý kỹ thuật khi tạo Policy & gọi `reportViolation` trên Sepolia + Alchemy

1. **Đã xử lý ở Backend (`blockchain_adapter.py`):** Đã hỗ trợ `BLOCKCHAIN_START_BLOCK` (tránh lỗi `get_logs(from_block=0)` trên Alchemy), EIP-1559 gas fees, và đọc linh hoạt cả 2 dạng ABI JSON.
2. **Tạo Policy bằng native `SepoliaETH` trước khi test Payout:**
   - Khi có **UUID `shipment_id`** từ Backend/MySQL, NTD mở Remix bằng ví Owner (`0x6607...`), nhập **`10000000000000000` `Wei`** *(tức `0.01 SepoliaETH` / `10 Finney`)* vào ô **`VALUE`** trên Remix, rồi gọi `ColdChainInsurance.createPolicy(keccak256(UUID), beneficiary, 10000000000000000, expiry)` (không cần bước `approve` token nữa).
3. **Phía Backend không thay đổi luồng gọi `reportViolation`:** Backend Oracle (`0x7747...`) vẫn gọi đúng `reportViolation(shipmentKey, evidenceHash, detectedAt)` như cũ; Smart Contract tự động chuyển thẳng `0.01 SepoliaETH` cho `beneficiary`.
