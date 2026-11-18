# Kịch bản Kiểm thử Thủ công trên Remix + MetaMask (Dành cho người mới — NTK & TTDK)

> **Mục tiêu:** Tài liệu này hướng dẫn từng bước bấm nút trực tiếp trên **Remix IDE kết nối `Browser Extension` (MetaMask) mạng Ethereum Sepolia (`11155111`)** sử dụng **trực tiếp `SepoliaETH`** (không cần tạo token riêng) để kiểm tra các kịch bản phổ biến của Smart Contract.
>
> **Thời gian thực hiện:** ~10–15 phút.

---

## Khác biệt cần biết khi dùng `Browser Extension (MetaMask)` & Native `SepoliaETH`

1. **Đơn giản hơn trước (Chỉ còn 2 Contract):** Không còn `MockInsuranceToken` và không cần bước `approve(...)` — khi gọi `createPolicy(...)` chỉ cần điền số `SepoliaETH` (`0.01 SepoliaETH` = `10000000000000000` `wei` = `10 Finney`) vào ô **`VALUE`** trên Remix.
2. **Cách đổi ví khi test quyền:** Không bấm đổi ở ô `ACCOUNT` trong Remix được — phải **mở tiện ích MetaMask trên trình duyệt và chuyển sang Account khác**, Remix sẽ tự cập nhật theo MetaMask.
3. **Popup cảnh báo khi test lỗi (`revert`):** Ở Kịch bản 3 và Kịch bản 6 (cố tình gọi sai quyền hoặc gửi trùng), MetaMask/Remix sẽ hiện cảnh báo *"Gas estimation failed / Transaction is likely to fail"* ngay trước khi ký — đó chính là dấu hiệu contract đã chặn đúng! Bạn có thể bấm **Cancel** để đỡ tốn gas.
4. **Dữ liệu lưu vĩnh viễn trên Sepolia:**
   - Để bấm test thoải mái mà không làm thay đổi trạng thái bộ contract chính của nhóm (trong `deployments/sepolia.json`), người test nên dùng ví MetaMask cá nhân **Deploy 1 bộ contract test riêng** (với 2–3 account con có ít SepoliaETH).
   - Nếu chạy lại kịch bản nhiều lần trên cùng 1 contract đã deploy, hãy **đổi 2 ký tự cuối** của `_batchKey` / `_shipmentKey` để tránh bị trùng key cũ đã lưu trên chain.

---

## Phần 0: Chuẩn bị & Dữ liệu mẫu (Chỉ cần Copy & Paste)

### Bước 0.1 — Chuẩn bị MetaMask trên trình duyệt
1. Cài tiện ích **MetaMask** trên Chrome/Edge/Brave.
2. Bật chế độ hiển thị mạng thử nghiệm (**Show test networks**) và chọn mạng **Sepolia**.
3. Tạo **3–4 Account con** trong cùng ví MetaMask và mỗi account có tối thiểu `~0.05 SepoliaETH` (với mức `0.01 SepoliaETH` mỗi policy, ví `2–10 SepoliaETH` test được hàng trăm lần):

| Account trong MetaMask | Vai trò trong kịch bản | Ghi chú |
|---|---|---|
| **Account 1** | **Owner / Insurer** | Deploy 2 contract, gửi `0.01 SepoliaETH` ký quỹ khi gọi `createPolicy` |
| **Account 2** | **Anchorer** | Ví Backend neo Merkle Root (`Module A`) |
| **Account 3** | **Oracle** | Ví Backend báo vi phạm nhiệt độ (`Module B`) |
| **Account 4** | **Beneficiary** | Ví nhận `0.01 SepoliaETH` tiền bồi thường & test gọi trái quyền |

### Bước 0.2 — Mở Remix và Compile
1. Mở [Remix IDE](https://remix.ethereum.org/).
2. Tạo/copy **2 file** từ thư mục `blockchain/contracts/` vào Remix:
   - `ColdChainDataIntegrity.sol`
   - `ColdChainInsurance.sol`
3. Ở tab **Solidity Compiler** (biểu tượng chữ S bên trái):
   - **Compiler:** `0.8.36+commit.8a079791`
   - Tick **Enable optimization** = `200`
   - Bấm **Compile** từng file (đảm bảo có dấu tick xanh, không lỗi đỏ).

### Bước 0.3 — Kết nối `Browser Extension` (MetaMask) & Deploy 2 Contract
Ở tab **Deploy & Run Transactions** (biểu tượng Ethereum bên trái):
1. Ở mục **ENVIRONMENT**, chọn **`Browser Extension`** → **MetaMask**.
2. Kiểm tra ngay bên dưới thấy **Sepolia (11155111) network** và ô **ACCOUNT** đang hiện địa chỉ **Account 1 (Owner)**.
3. Lần lượt chọn từng contract ở ô **CONTRACT** và bấm **Deploy** → **Confirm trên MetaMask**:
   - **`ColdChainDataIntegrity`**:
     - Copy địa chỉ **Account 2 (Anchorer)** dán vào ô `_anchorer` → **Deploy** → **Confirm MetaMask**.
   - **`ColdChainInsurance`**:
     - Copy địa chỉ **Account 3 (Oracle)** dán vào ô `_oracle` → **Deploy** → **Confirm MetaMask**.

*(Lưu ý: Nếu chỉ muốn gọi hàm xem trạng thái như `verifyBatch` / `getPolicy` / `getContractBalance` trên bộ contract chính của nhóm, dán địa chỉ từ `blockchain/deployments/sepolia.json` vào ô **`At Address`** và bấm nút **`At Address`**.)*

### Bước 0.4 — Bảng giá trị mẫu dùng chung (Copy nguyên dòng để dán vào Remix)

| Tên tham số | Giá trị copy sẵn (đúng chuẩn `bytes32` / `uint256`) |
|---|---|
| `_shipmentKey` | `0x770fdffbbe559e11472e63e8a6058bb3c9dc5170704a7e3db36c6d5f694688b8` |
| `_batchKey` | `0xe5b396f0394f112e1489b4621b121e385ac41b015188ef7d92a60c2585ca6f66` |
| `_deviceKey` | `0x665aa8370a5792d4b2b3e44ea73ac8f2401dd778dcd729e657fc3d4409704b97` |
| `_merkleRoot` (gốc đúng) | `0x5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae37` |
| `_candidateRoot` (bị sửa sai 1 ký tự cuối) | `0x5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae38` |
| `_evidenceHash` | `0x369a9b80a854d96f09ef468093609abd2b42614119fff486a6019d378a29886e` |
| `_payoutAmount` (`0.01 SepoliaETH` = `10 Finney`) | `10000000000000000` *(điền cùng số này vào ô `VALUE` đơn vị `Wei`)* |
| `_expiry` (còn hạn tới năm 2030) | `1893456000` |
| `_detectedAt` | `1763300000` |

---

## Phần 1: Các kịch bản Module A — `ColdChainDataIntegrity`

### Kịch bản 1: Neo batch dữ liệu hợp lệ & Xác minh khớp gốc (`anchorBatch` → `verifyBatch`)
1. Mở **MetaMask**, chuyển sang **Account 2 (Anchorer)**.
2. Mở rộng contract **`COLDCHAINDATAINTEGRITY`** ở dưới **Deployed Contracts**, tìm **`anchorBatch`** (nút màu cam):
   - `_batchKey`: dán `_batchKey`
   - `_shipmentKey`: dán `_shipmentKey`
   - `_deviceKey`: dán `_deviceKey`
   - `_merkleRoot`: dán `_merkleRoot` (gốc đúng)
   - `_firstSequence`: `1`, `_lastSequence`: `3`, `_recordCount`: `3`
3. Đảm bảo ô **`VALUE`** ở phía trên là **`0`** → Bấm **transact** → **Confirm trên MetaMask**.
4. Gọi **`verifyBatch`** (nút màu xanh dương — miễn phí) với `_batchKey` và `_merkleRoot` → trả về **`true`**.

### Kịch bản 2: Phát hiện giả mạo dữ liệu (`verifyBatch` trả về `false`)
1. Vẫn ở **`COLDCHAINDATAINTEGRITY`**, mở **`verifyBatch`**.
2. Điền `_batchKey` và `_candidateRoot` bị sửa 1 ký tự (`...ae38`).
3. Bấm **call** → trả về **`false`** (root gốc trên Sepolia không bị thay đổi).

### Kịch bản 3: Chặn gửi trùng & Chặn ví lạ neo dữ liệu (`Security`)
- **3a. Chặn gửi trùng:** Đang ở **Account 2**, bấm lại `anchorBatch` với đúng `_batchKey` cũ → báo revert **`ColdChain__BatchAlreadyExists`** (bấm **Cancel** để khỏi tốn gas).
- **3b. Chặn ví lạ:** Chuyển MetaMask sang **Account 4** (hoặc Account 1), thử gọi `anchorBatch` với `_batchKey` đổi 2 ký tự cuối → báo revert **`ColdChain__CallerNotAnchorer`**.

---

## Phần 2: Các kịch bản Module B — `ColdChainInsurance` (Native `SepoliaETH`)

### Kịch bản 4: Tạo & Ký quỹ Policy bằng `SepoliaETH` (`createPolicy` — chỉ 1 bước duy nhất)
- **Mục đích:** Tạo policy cho 1 chuyến hàng và gửi thẳng `0.01 SepoliaETH` vào hợp đồng làm tiền ký quỹ.
- **Các bước:**
  1. Mở **MetaMask**, chuyển về **Account 1 (Owner / Insurer)**.
  2. Trên thanh điều khiển bên trái của Remix (Tab Deploy & Run), tìm ô **`VALUE`** ở gần trên cùng:
     - Nhập **`10000000000000000`** và chọn đơn vị bên cạnh là **`Wei`** *(hoặc nhập `10` và chọn **`Finney`** — tương đương `0.01 SepoliaETH`)*.
  3. Mở rộng **`COLDCHAININSURANCE`**, tìm hàm **`createPolicy`** (nút **màu đỏ** `payable` vì có nhận ETH):
     - `_shipmentKey`: dán `_shipmentKey`
     - `_beneficiary`: copy & dán địa chỉ **Account 4 (Beneficiary)**
     - `_payoutAmount`: `10000000000000000` *(hoặc nhập `0` để contract tự lấy theo ô `VALUE`)*
     - `_expiry`: `1893456000`
  4. Bấm **transact** → kiểm tra trên popup MetaMask thấy gửi `0.01 SepoliaETH` → bấm **Confirm**.
  5. *(Nhớ đưa ô **`VALUE`** về lại **`0`** ngay sau bước này để các lệnh sau không gửi nhầm thêm ETH!)*
- **Kết quả mong đợi:**
  - Gọi `getPolicy(_shipmentKey)` → `status = 1` (`Active`) và `payoutAmount = 10000000000000000`.
  - Gọi `getContractBalance()` → trả về **`10000000000000000`** (`0.01 SepoliaETH` đang được khóa trong contract).

### Kịch bản 5: Oracle báo vi phạm & Chi trả `0.01 SepoliaETH` cho Beneficiary (`reportViolation`)
- **Mục đích:** Kiểm tra chỉ ví Oracle hợp lệ mới kích hoạt được bồi thường và cộng thẳng `0.01 SepoliaETH` vào ví Beneficiary.
- **Các bước:**
  1. Mở **MetaMask** xem số dư hiện tại của **Account 4 (Beneficiary)** (ghi nhớ lại).
  2. Chuyển MetaMask sang **Account 3 (Oracle)**. Đảm bảo ô **`VALUE`** ở Remix đang là **`0`**.
  3. Mở **`COLDCHAININSURANCE`**, tìm hàm **`reportViolation`** (nút màu cam):
     - `_shipmentKey`: dán `_shipmentKey`
     - `_evidenceHash`: dán `_evidenceHash`
     - `_detectedAt`: `1763300000`
     - Bấm **transact** → **Confirm trên MetaMask** → đợi ~10–15s thấy tick xanh.
- **Kết quả mong đợi:**
  - Gọi `getPolicy(_shipmentKey)` → `status` đổi từ `1` sang **`2` (`PaidOut`)**.
  - Gọi `getContractBalance()` → giảm từ `10000000000000000` về **`0`**.
  - Kiểm tra **Account 4 (Beneficiary)** trên MetaMask (hoặc tab *Internal Transactions* trên Sepolia Etherscan) → số dư tăng đúng thêm **`0.01 SepoliaETH`**.

### Kịch bản 6: Chống chi trả trùng & Chặn ví lạ (`Security`)
- **6a. Chống chi trả 2 lần (`Double Payout`):** Vẫn ở **Account 3 (Oracle)**, bấm gọi lại `reportViolation` cho cùng `_shipmentKey` của Kịch bản 5 → Remix/MetaMask cảnh báo revert **`ColdChain__PolicyNotActive`** (bấm **Cancel**).
- **6b. Chặn ví lạ gọi `reportViolation` (`Unauthorized Oracle`):** Chuyển MetaMask sang **Account 4** (hoặc bất kỳ ví nào không phải Account 3), thử gọi `reportViolation` → báo revert **`ColdChain__CallerNotOracle`**.

---

## Tóm tắt nhanh các lỗi (Revert) thường gặp khi test

| Thông báo lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `ColdChain__CallerNotAnchorer` | MetaMask đang chọn sai ví (không phải Account Anchorer) | Đổi lại sang Account Anchorer |
| `ColdChain__CallerNotOracle` | MetaMask đang chọn sai ví (không phải Account Oracle) | Đổi lại sang Account Oracle |
| `ColdChain__IncorrectETHDeposit` | Số ETH trong ô `VALUE` của Remix khác `_payoutAmount` truyền vào hàm | Nhập ô `VALUE` khớp `_payoutAmount` (`10000000000000000` `Wei`), hoặc truyền `_payoutAmount = 0` |
| `ColdChain__InvalidPayoutAmount` | Quên nhập ETH vào ô `VALUE` (để `0` khi gọi `createPolicy`) | Nhập `10000000000000000` `Wei` vào ô `VALUE` rồi mới bấm `transact` |
| `ColdChain__BatchAlreadyExists` | `_batchKey` đã từng được neo trước đó | Đổi 2 ký tự cuối của `_batchKey` |
| `ColdChain__PolicyAlreadyExists` | `_shipmentKey` đã tạo policy rồi | Đổi 2 ký tự cuối của `_shipmentKey` |
| `ColdChain__PolicyNotActive` | Policy chưa tạo hoặc đã chi trả (`PaidOut`) / hoàn tiền (`Refunded`) | Tạo policy mới với `_shipmentKey` khác |
