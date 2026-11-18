# Hướng dẫn Demo E2E & Thao tác Remix + MetaMask trên Sepolia (`11155111`)

> **Mục tiêu:** Hướng dẫn từng bước rõ ràng cho cả nhóm (**NTD, NTK, TTDK**) thực hiện **Demo E2E hoàn chỉnh** (Dashboard ↔ Backend ↔ Ethereum Sepolia) với **native `SepoliaETH`**, kèm kịch bản tự thực hành nhanh trên Remix cho người mới.

---

## Thông tin Contracts đang chạy trên Sepolia (`11155111`)

| Thành phần | Giá trị chính thức | Link kiểm tra |
|---|---|---|
| **Module A — `ColdChainDataIntegrity`** | `0xE04F6f1bb80C438D356E0547ec10337F33ecD81f` | [Xem trên Etherscan](https://sepolia.etherscan.io/address/0xE04F6f1bb80C438D356E0547ec10337F33ecD81f) |
| **Module B — `ColdChainInsurance`** | `0x13Cb896302ea78146EF5eb1E28bFfC1073b8ea9F` | [Xem trên Etherscan](https://sepolia.etherscan.io/address/0x13Cb896302ea78146EF5eb1E28bFfC1073b8ea9F) |
| **Ví Owner** (Deploy & tạo Policy) | `0x66077Ef603B524911B9226011A3C17Dd4B623fEF` | MetaMask của NTD |
| **Ví Anchorer** (Backend neo Batch) | `0xd2D62EB2cd0731383b9F49A7e8DdD7cdD54b355E` | Cấu hình ở `BACKEND_ANCHORER_PRIVATE_KEY` |
| **Ví Oracle** (Backend báo vi phạm) | `0x7747f2c48C0D9562c311BbeBE4F822aE372C54bb` | Cấu hình ở `BLOCKCHAIN_ORACLE_PRIVATE_KEY` |
| **Mức ký quỹ Policy chuẩn** | **`0.01 SepoliaETH`** = **`10000000000000000` `wei`** (`10 Finney`) | Gửi trực tiếp qua ô `VALUE` khi gọi `createPolicy` |

---

## Phần 1: Quy trình Demo E2E Chính thức (Frontend + Backend + Sepolia)

> Dùng đúng 2 Smart Contract đã deploy sẵn ở trên — **không cần deploy lại** khi trình diễn.

### Bước 1 — Tạo Thiết bị, Chuyến hàng & Lấy `shipment_id` (UUID)
1. Mở Dashboard (TTDK), đăng nhập bằng tài khoản Admin (JWT).
2. Đăng ký thiết bị mới (ví dụ `device_id = ESP32-001`).
3. Tạo chuyến hàng mới (ví dụ `code = SHIP-001`) → hệ thống trả về **UUID `shipment_id`** (dạng `8b4fb8a2-2996-4da2-90b9-35019517f56f`).
4. Gán thiết bị vào chuyến hàng vừa tạo và cấp/nạp cặp khóa ECDSA P-256 cho thiết bị (hoặc simulator).

### Bước 2 — Tạo & Ký quỹ Policy `0.01 SepoliaETH` trên Remix (NTD thao tác bằng MetaMask Owner)
> Backend tạo shipment trong MySQL chưa tự động nạp `SepoliaETH` lên Blockchain; cần thực hiện bước này trước khi chạy kịch bản vi phạm để giao dịch bồi thường thành công.

1. **Tính `shipmentKey` từ UUID `shipment_id` vừa tạo ở Bước 1** (chạy nhanh bằng Python, **không** dùng mã `SHIP-001`):
   ```bash
   python -c "from web3 import Web3; print(Web3.to_hex(Web3.keccak(text='DAN_UUID_SHIPMENT_VAO_DAY')))"
   ```
   *(Ví dụ: `8b4fb8a2-2996-4da2-90b9-35019517f56f` → `0x770fdffbbe559e11472e63e8a6058bb3c9dc5170704a7e3db36c6d5f694688b8`.)*
2. Mở [Remix IDE](https://remix.ethereum.org/), chọn tab **Solidity Compiler** → compile `ColdChainInsurance.sol` bằng **`0.8.36+commit.8a079791`** (`Enable optimization = 200`).
3. Sang tab **Deploy & Run Transactions**:
   - **ENVIRONMENT:** Chọn **`Browser Extension`** → kết nối **MetaMask** (ví Owner `0x66077Ef603B524911B9226011A3C17Dd4B623fEF`, mạng **Sepolia**).
   - Ở ô **`At Address`**, dán `0x13Cb896302ea78146EF5eb1E28bFfC1073b8ea9F` rồi bấm nút **`At Address`**.
4. Nhập số tiền ký quỹ vào ô **`VALUE`** (phía trên cùng bên trái Remix):
   - Nhập **`10000000000000000`** và chọn đơn vị **`Wei`** *(hoặc nhập `10` đơn vị **`Finney`** = `0.01 SepoliaETH`)*.
5. Mở rộng contract vừa gắn, điền hàm **`createPolicy`** (nút đỏ `payable`):
   - `_shipmentKey`: dán kết quả `0x...` ở bước tính UUID
   - `_beneficiary`: địa chỉ ví Sepolia nhận tiền bồi thường
   - `_payoutAmount`: `10000000000000000`
   - `_expiry`: timestamp tương lai còn hạn dài (ví dụ `1893456000`)
6. Bấm **transact** → **Confirm trên MetaMask** → chờ ~12–15 giây thấy tick xanh.
7. **Đưa ô `VALUE` về lại `0` ngay**, rồi bấm gọi `getPolicy(_shipmentKey)` → xác nhận `status = 1` (`Active`) và `getContractBalance()` đã tăng thêm `10000000000000000`.

### Bước 3 — Gửi Telemetry hợp lệ & Neo Merkle Root lên Sepolia (Module A)
1. Bật ESP32 hoặc script simulator gửi các gói signed telemetry hợp lệ về Backend.
2. Quan sát trên Dashboard:
   - Các mẫu hợp lệ hiện trạng thái `DATA_VERIFIED`.
   - Khi đủ điều kiện đóng lô (`SEALED`), Backend tự dùng ví **Anchorer (`0xd2D6...`)** gọi `anchorBatch(...)` lên contract `0xE04F6f1bb80C438D356E0547ec10337F33ecD81f`.
   - Giao dịch đi qua `BLOCKCHAIN_PENDING` → sau **2 confirmations (~24s)** chuyển thành **`DATA_ANCHORED`**.
3. Kiểm chứng chéo (tùy chọn khi demo):
   - Bấm link transaction hash trên `sepolia.etherscan.io` để xem event `BatchAnchored`.
   - Hoặc gắn `0xE04F6f1bb80C438D356E0547ec10337F33ecD81f` bằng `At Address` trên Remix → gọi `verifyBatch(batchKey, merkleRoot)` (miễn phí) → trả về **`true`**.

### Bước 4 — Kiểm chứng phát hiện sửa dữ liệu (Tamper Check)
1. *(Dùng chuyến hàng test hoặc bản sao DB demo)*: Sửa trực tiếp nhiệt độ của 1 bản ghi đã thuộc batch `DATA_ANCHORED` trong MySQL.
2. Bấm nút kiểm tra toàn vẹn (**Verify Batch**) trên Dashboard.
3. **Kết quả:** Hệ thống tính lại `MERKLE-v1` root bị lệch so với gốc bất biến trên Sepolia → hiển thị **`DATA_INTEGRITY_FAILED`** và **chặn sử dụng lô này làm bằng chứng bồi thường**.

### Bước 5 — Kích hoạt Vi phạm ≥ 15 phút & Bồi thường tự động (Module B)
1. Trên một chuyến hàng sạch đã có Policy `Active` (tạo ở Bước 2) và toàn bộ batch bằng chứng ở trạng thái `DATA_ANCHORED`:
   - Gửi chuỗi dữ liệu vượt ngưỡng nhiệt độ **liên tục ≥ 15 phút** (hoặc dùng simulator/test clock của Backend dev).
2. Khi đủ điều kiện bằng chứng (`PAYOUT_REQUIRES_ANCHORED_EVIDENCE=true`), Backend tự dùng ví **Oracle (`0x7747...`)** gọi `reportViolation(...)` lên contract `0x13Cb896302ea78146EF5eb1E28bFfC1073b8ea9F`.
3. **Đối chiếu kết quả hoàn chỉnh tại 3 nơi:**
   - **Dashboard (TTDK):** Trạng thái bảo hiểm chuyển `paid` (`CONFIRMED`), hiển thị `transaction_hash`.
   - **Remix (`getPolicy` & `getContractBalance`):** `status` đổi từ `1` sang **`2` (`PaidOut`)**, số dư contract giảm đi `0.01 SepoliaETH`.
   - **Sepolia Etherscan & MetaMask:** Mở tab **Internal Transactions** trên [link contract `0x13Cb...`](https://sepolia.etherscan.io/address/0x13Cb896302ea78146EF5eb1E28bFfC1073b8ea9F) hoặc kiểm tra ví **Beneficiary** thấy số dư tăng đúng **`+0.01 SepoliaETH`**.

---

## Phần 2: Kịch bản Tự thực hành nhanh trên Remix (Không cần Backend — cho người mới)

Nếu bạn (NTK / TTDK) muốn tự tay bấm thử hết 2 contract trên Sepolia qua Remix + MetaMask mà **không làm ảnh hưởng tới bộ contract chính của nhóm**:

### Chuẩn bị nhanh
1. Trong MetaMask (chọn mạng **Sepolia**), tạo **3–4 Account con** (chỉ cần ~`0.05 SepoliaETH`/ví từ faucet):
   - **Account 1 (`Owner`):** Deploy contract & gửi `0.01 SepoliaETH` tạo policy.
   - **Account 2 (`Anchorer`):** Neo batch lên Module A.
   - **Account 3 (`Oracle`):** Báo vi phạm lên Module B.
   - **Account 4 (`Beneficiary` / `Stranger`):** Ví nhận tiền & test gọi trái quyền.
2. Trên Remix (`0.8.36+commit.8a079791`, `200` runs), compile 2 file `ColdChainDataIntegrity.sol` và `ColdChainInsurance.sol`.
3. Chọn `ENVIRONMENT = Browser Extension (MetaMask)`, dùng **Account 1** deploy riêng bộ test:
   - `ColdChainDataIntegrity(_anchorer = địa chỉ Account 2)`
   - `ColdChainInsurance(_oracle = địa chỉ Account 3)`

### Bộ giá trị mẫu (Copy & Paste)

| Tham số | Giá trị copy sẵn |
|---|---|
| `_shipmentKey` | `0x770fdffbbe559e11472e63e8a6058bb3c9dc5170704a7e3db36c6d5f694688b8` |
| `_batchKey` | `0xe5b396f0394f112e1489b4621b121e385ac41b015188ef7d92a60c2585ca6f66` |
| `_deviceKey` | `0x665aa8370a5792d4b2b3e44ea73ac8f2401dd778dcd729e657fc3d4409704b97` |
| `_merkleRoot` (đúng) | `0x5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae37` |
| `_candidateRoot` (sai 1 ký tự cuối) | `0x5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae38` |
| `_evidenceHash` | `0x369a9b80a854d96f09ef468093609abd2b42614119fff486a6019d378a29886e` |
| `_payoutAmount` (`0.01 SepoliaETH`) | `10000000000000000` *(nhập cùng số này vào ô `VALUE` đơn vị `Wei`)* |
| `_expiry` (năm 2030) | `1893456000` |
| `_detectedAt` | `1763300000` |

### 4 Thao tác kiểm tra cốt lõi
1. **Neo & Verify Batch (Module A):**
   - Mở MetaMask chuyển sang **Account 2** (`VALUE = 0`) → gọi `anchorBatch(_batchKey, _shipmentKey, _deviceKey, _merkleRoot, 1, 3, 3)`.
   - Gọi `verifyBatch(_batchKey, _merkleRoot)` → **`true`**; thử với `_candidateRoot` (`...ae38`) → **`false`**.
   - Bấm lại `anchorBatch` cùng `_batchKey` → MetaMask cảnh báo revert **`ColdChain__BatchAlreadyExists`** (bấm **Cancel** để khỏi tốn gas).
2. **Tạo & Ký quỹ Policy (Module B):**
   - Chuyển MetaMask về **Account 1**, điền **`10000000000000000` `Wei`** vào ô **`VALUE`** → gọi `createPolicy(_shipmentKey, địa chỉ Account 4, 10000000000000000, 1893456000)`.
   - Đặt lại `VALUE = 0`, gọi `getContractBalance()` → thấy **`10000000000000000`**.
3. **Báo vi phạm & Nhận tiền (Module B):**
   - Chuyển MetaMask sang **Account 3 (`Oracle`)**, gọi `reportViolation(_shipmentKey, _evidenceHash, 1763300000)`.
   - Số dư **Account 4** tăng **`+0.01 SepoliaETH`**, `getPolicy(_shipmentKey)` chuyển `status = 2 (PaidOut)`.
4. **Kiểm tra bảo vệ (Security):**
   - Gọi lại `reportViolation` lần 2 → cảnh báo revert **`ColdChain__PolicyNotActive`** (bấm **Cancel**).
   - Đổi MetaMask sang **Account 4** thử gọi `reportViolation` → cảnh báo revert **`ColdChain__CallerNotOracle`** (bấm **Cancel**).

---

## Bảng tra cứu lỗi thường gặp

| Thông báo lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `ColdChain__CallerNotAnchorer` | MetaMask đang chọn sai ví Anchorer | Mở MetaMask đổi đúng ví Anchorer |
| `ColdChain__CallerNotOracle` | MetaMask đang chọn sai ví Oracle | Mở MetaMask đổi đúng ví Oracle |
| `ColdChain__IncorrectETHDeposit` | Ô `VALUE` trên Remix khác `_payoutAmount` | Điền ô `VALUE` khớp `_payoutAmount` (`10000000000000000` `Wei`), hoặc truyền `_payoutAmount = 0` |
| `ColdChain__InvalidPayoutAmount` | Quên điền ETH vào ô `VALUE` khi gọi `createPolicy` | Điền `10000000000000000` `Wei` vào ô `VALUE` |
| `ColdChain__BatchAlreadyExists` | `_batchKey` đã từng được neo trước đó | Đổi 2 ký tự hex cuối của `_batchKey` |
| `ColdChain__PolicyAlreadyExists` | `_shipmentKey` đã từng tạo policy trước đó | Đổi 2 ký tự hex cuối của `_shipmentKey` |
| `ColdChain__PolicyNotActive` | Policy chưa tạo hoặc đã chi trả / hoàn tiền | Kiểm tra lại `shipmentKey` hoặc tạo policy cho UUID mới |
