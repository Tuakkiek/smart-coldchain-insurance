# Bàn giao cấu hình Ethereum Sepolia cho Backend (NTK)

> **Dành cho Member 1 (NTK):** Tài liệu này hướng dẫn các thông số cần điền vào `backend/.env` (hoặc Render Environment Variables) và chỉ rõ **private key của địa chỉ ví nào** tương ứng với từng biến sau khi các contract đã được deploy lên **Ethereum Sepolia (`11155111`)** bằng Remix + MetaMask.
>
> **Nguồn sự thật kỹ thuật:** [deployments/sepolia.json](deployments/sepolia.json) · [compiler-settings.json](compiler-settings.json)

---

## 1. Phân vai địa chỉ ví & Private Key tương ứng

| Vai trò trên Contract | Địa chỉ ví Sepolia (Public) | Biến `.env` phía Backend | Ai giữ Private Key? |
|---|---|---|---|
| **Owner / Deployer** | `0x66077Ef603B524911B9226011A3C17Dd4B623fEF` | *(Không đưa vào Backend)* | **Member 2 (NTD)** — dùng MetaMask để `mint`, `approve`, `createPolicy`, `setAnchorer`/`setOracle` |
| **Anchorer** (`ColdChainDataIntegrity`) | `0xd2D62EB2cd0731383b9F49A7e8DdD7cdD54b355E` | `BACKEND_ANCHORER_PRIVATE_KEY` | **Member 1 (NTK)** — dùng để gọi `anchorBatch(...)` |
| **Oracle** (`ColdChainInsurance`) | `0x7747f2c48C0D9562c311BbeBE4F822aE372C54bb` | `BLOCKCHAIN_ORACLE_PRIVATE_KEY` | **Member 1 (NTK)** — dùng để gọi `reportViolation(...)` |

> ⚠️ **Lưu ý bảo mật:**
> - **Đúng key theo địa chỉ:**
>   - `BACKEND_ANCHORER_PRIVATE_KEY` = private key của ví **`0xd2D62EB2cd0731383b9F49A7e8DdD7cdD54b355E`** (nếu sai sẽ bị contract revert `ColdChain__CallerNotAnchorer` / adapter báo `ANCHORER_MISMATCH`).
>   - `BLOCKCHAIN_ORACLE_PRIVATE_KEY` = private key của ví **`0x7747f2c48C0D9562c311BbeBE4F822aE372C54bb`** (nếu sai sẽ bị contract revert `ColdChain__CallerNotOracle` / adapter báo `ORACLE_MISMATCH`).
> - Tuyệt đối **không** commit private key thật hay Alchemy API key lên Git.

---

## 2. Cấu hình mẫu cho `backend/.env` (hoặc Render Env)

Copy các dòng dưới đây vào `backend/.env` và thay 3 giá trị secret (`YOUR_ALCHEMY_API_KEY` và 2 private key):

```dotenv
# Bật tích hợp Blockchain lên Ethereum Sepolia
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_NETWORK=sepolia
BLOCKCHAIN_CHAIN_ID=11155111

# Alchemy HTTPS RPC URL do NTK tạo (Sepolia)
BLOCKCHAIN_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY

# Module A — ColdChainDataIntegrity
DATA_INTEGRITY_CONTRACT_ADDRESS=0xE04F6f1bb80C438D356E0547ec10337F33ecD81f
# Điền private key của ví Anchorer: 0xd2D62EB2cd0731383b9F49A7e8DdD7cdD54b355E
BACKEND_ANCHORER_PRIVATE_KEY=0x...
DATA_INTEGRITY_ABI_PATH=blockchain/deployments/abi/ColdChainDataIntegrity.json

# Module B — ColdChainInsurance
BLOCKCHAIN_CONTRACT_ADDRESS=0xeD8266444aF3506C5FceB556cA00Bf4305De1cA8
# Điền private key của ví Oracle: 0x7747f2c48C0D9562c311BbeBE4F822aE372C54bb
BLOCKCHAIN_ORACLE_PRIVATE_KEY=0x...
BLOCKCHAIN_ABI_PATH=blockchain/deployments/abi/ColdChainInsurance.json

# Confirmations & Timeout phù hợp với block time ~12s của Sepolia
BLOCKCHAIN_CONFIRMATIONS=2
BLOCKCHAIN_RECEIPT_TIMEOUT_SECONDS=120
```

*(Nếu NTK đã copy 2 file ABI mới từ `blockchain/deployments/abi/ColdChainDataIntegrity.json` và `ColdChainInsurance.json` sang `backend/app/integrations/abi/` thì vẫn giữ nguyên `DATA_INTEGRITY_ABI_PATH=backend/app/integrations/abi/ColdChainDataIntegrity.json` và `BLOCKCHAIN_ABI_PATH=backend/app/integrations/abi/ColdChainInsurance.json` được.)*

---

## 3. Thông tin Contracts & Block Deploy (Sepolia Etherscan)

| Contract | Địa chỉ trên Sepolia | Deploy Block | Deploy Tx |
|---|---|---|---|
| `MockInsuranceToken` (`MINS`, 18 decimals) | `0x33D620C26f045d2C60C8A29F41e987875aAEbC93` | `12145165` | [`0xfae9e7...8b3711`](https://sepolia.etherscan.io/tx/0xfae9e747b27e56d440f7b6835da3693e26904077f85b258d7cc502e3788b3711) |
| `ColdChainDataIntegrity` (Module A) | `0xE04F6f1bb80C438D356E0547ec10337F33ecD81f` | `12145351` | [`0x669df6...50b3f0`](https://sepolia.etherscan.io/tx/0x669df621fdbd5962f2e3e6cf4311b7686da0f62a28e04b36f8c5f5a39450b3f0) |
| `ColdChainInsurance` (Module B) | `0xeD8266444aF3506C5FceB556cA00Bf4305De1cA8` | `12145343` | [`0x30ade7...16ebf0`](https://sepolia.etherscan.io/tx/0x30ade76d287eb06c66e5aa67273b0b7d7f661e479ac34fa821e149da2916ebf0) |

---

## 4. Lưu ý kỹ thuật quan trọng cho Backend khi chạy trên Sepolia + Alchemy

1. **Tránh `get_logs(from_block=0)` trên Alchemy Free Tier:**
   - Trong `backend/app/integrations/blockchain_adapter.py`, hàm `prepare_report` (`InsurancePaid.get_logs`) và `anchored_transaction_hash` (`BatchAnchored.get_logs`) hiện đang dùng `from_block=0`.
   - Trên Sepolia, Alchemy giới hạn phạm vi block của `eth_getLogs`, nên gọi `from_block=0` có thể bị RPC từ chối. Khuyên dùng `deployBlockNumber` (`12145343` / `12145351`) hoặc query theo dải block gần `latest`.
2. **Schema file ABI JSON:**
   - `blockchain_adapter.py` đọc `json.load(artifact_file)["abi"]`. Hãy trỏ `DATA_INTEGRITY_ABI_PATH` và `BLOCKCHAIN_ABI_PATH` tới file dạng `{"contractName": ..., "abi": [...]}` (đã xuất sẵn tại `blockchain/deployments/abi/ColdChainDataIntegrity.json` và `ColdChainInsurance.json`), **không** trỏ nhầm tới file `*.abi.json` dạng mảng thuần `[...]`.
3. **Tạo Policy trước khi test Payout (`INSURANCE_TRIGGERED`):**
   - Tạo shipment trên Backend sẽ sinh `shipments.id` (UUID v4) trong MySQL, nhưng **chưa tự tạo policy trên blockchain**.
   - Trước khi test chi trả bảo hiểm cho một chuyến hàng, NTK gửi **UUID `shipment_id`** (và địa chỉ `beneficiary`, số `payoutAmount`, thời hạn `expiry` đủ dài) cho NTD để NTD dùng ví Owner (`0x6607...`) gọi `MockInsuranceToken.approve(...)` + `ColdChainInsurance.createPolicy(keccak256(UUID), ...)` trên Sepolia.
