# Kịch bản Kiểm thử Thủ công trên Remix + MetaMask (Dành cho người mới — NTK & TTDK)

> **Mục tiêu:** Tài liệu này hướng dẫn từng bước bấm nút trực tiếp trên **Remix IDE kết nối `Browser Extension` (MetaMask) mạng Ethereum Sepolia (`11155111`)** để kiểm tra các kịch bản phổ biến của Smart Contract mà không cần viết code test.
>
> **Thời gian thực hiện:** ~15 phút.

---

## Khác biệt cần biết khi dùng `Browser Extension (MetaMask)` thay cho `Remix VM`

1. **Cách đổi ví khi test quyền:** Không bấm đổi ở ô `ACCOUNT` trong Remix được — phải **mở tiện ích MetaMask trên trình duyệt và chuyển sang Account khác**, Remix sẽ tự cập nhật theo MetaMask.
2. **Tốn SepoliaETH & cần xác nhận popup:** Mỗi nút **`transact` (màu cam)** sẽ bật popup MetaMask yêu cầu **Confirm** và mất ~10–15 giây để xác nhận trên Sepolia. Các nút **`call` (màu xanh dương)** như `verifyBatch`, `getBatch`, `getPolicy`, `balanceOf` hoàn toàn **miễn phí và trả kết quả ngay**.
3. **Popup cảnh báo khi test lỗi (`revert`):** Ở Kịch bản 3 và Kịch bản 6 (cố tình gọi sai quyền hoặc gửi trùng), MetaMask/Remix sẽ hiện cảnh báo *"Gas estimation failed / Transaction is likely to fail"* ngay trước khi ký — đó chính là dấu hiệu contract đã chặn đúng! Bạn có thể bấm **Cancel** để đỡ tốn gas.
4. **Dữ liệu lưu vĩnh viễn trên Sepolia:**
   - Để bấm test thoải mái mà không làm thay đổi trạng thái bộ contract chính của nhóm (trong `deployments/sepolia.json`), người test nên dùng ví MetaMask cá nhân **Deploy 1 bộ contract test riêng** (với 2–3 account con có ít SepoliaETH trong cùng ví MetaMask).
   - Nếu chạy lại kịch bản nhiều lần trên cùng 1 contract đã deploy, hãy **đổi 2 ký tự cuối** của `_batchKey` / `_shipmentKey` để tránh bị trùng key cũ đã lưu trên chain.

---

## Phần 0: Chuẩn bị & Dữ liệu mẫu (Chỉ cần Copy & Paste)

### Bước 0.1 — Chuẩn bị MetaMask trên trình duyệt
1. Cài tiện ích **MetaMask** trên Chrome/Edge/Brave.
2. Bật chế độ hiển thị mạng thử nghiệm (**Show test networks**) trong MetaMask và chọn mạng **Sepolia**.
3. Tạo **3–4 Account con** ngay trong cùng ví MetaMask (bấm *Add account* → rất nhanh) và nạp mỗi account một ít **SepoliaETH** từ faucet (chỉ cần ~0.05–0.1 SepoliaETH là đủ test thoải mái):

| Account trong MetaMask | Vai trò trong kịch bản | Ghi chú |
|---|---|---|
| **Account 1** | **Owner / Insurer** | Deploy 3 contract, giữ token `MINS`, `approve` & `createPolicy` |
| **Account 2** | **Anchorer** | Ví Backend neo Merkle Root (`Module A`) |
| **Account 3** | **Oracle** | Ví Backend báo vi phạm nhiệt độ (`Module B`) |
| **Account 4** | **Beneficiary** *(hoặc dùng luôn ví phụ làm người nhận & người lạ)* | Ví nhận tiền bảo hiểm & test gọi trái quyền |

*(Mẹo: Nếu chỉ muốn tiết kiệm bước nạp faucet, bạn có thể gộp ví **Owner** và **Beneficiary** nếu muốn, nhưng nên tách **Account 1 (Owner)**, **Account 2 (Anchorer)** và **Account 3 (Oracle/Stranger)** để test rõ phân quyền.)*

### Bước 0.2 — Mở Remix và Compile
1. Mở [Remix IDE](https://remix.ethereum.org/).
2. Tạo/copy 3 file từ thư mục `blockchain/contracts/` vào Remix:
   - `MockInsuranceToken.sol`
   - `ColdChainDataIntegrity.sol`
   - `ColdChainInsurance.sol`
3. Ở tab **Solidity Compiler** (biểu tượng chữ S bên trái):
   - **Compiler:** `0.8.36+commit.8a079791`
   - Tick **Enable optimization** = `200`
   - Bấm **Compile** từng file (đảm bảo có dấu tick xanh, không lỗi đỏ).

### Bước 0.3 — Kết nối `Browser Extension` (MetaMask) & Deploy 3 Contract
Ở tab **Deploy & Run Transactions** (biểu tượng Ethereum bên trái):
1. Ở mục **ENVIRONMENT**, chọn **`Browser Extension`** → **MetaMask** *(nếu MetaMask bật popup hỏi kết nối, chọn kết nối hết các Account test vừa tạo)*.
2. Kiểm tra ngay bên dưới thấy chữ **Sepolia (11155111) network** và ô **ACCOUNT** đang hiện địa chỉ **Account 1 (Owner)**.
3. Lần lượt chọn từng contract ở ô **CONTRACT** và bấm **Deploy** → **Confirm trên MetaMask** (chờ ~10–15s có tick xanh ở terminal dưới cùng):
   - **`MockInsuranceToken`**:
     - Ô `initialSupply`: dán `1000000000000000000000000` *(1,000,000 MINS)* → **Deploy** → **Confirm MetaMask**.
   - **`ColdChainDataIntegrity`**:
     - Copy địa chỉ **Account 2 (Anchorer)** dán vào ô `_anchorer` → **Deploy** → **Confirm MetaMask**.
   - **`ColdChainInsurance`**:
     - Copy địa chỉ của `MOCKINSURANCETOKEN` vừa deploy (ở mục **Deployed Contracts** bên dưới) dán vào `_payoutToken`.
     - Copy địa chỉ **Account 3 (Oracle)** dán vào `_oracle` → **Deploy** → **Confirm MetaMask**.

*(Lưu ý: Nếu chỉ muốn xem dữ liệu hoặc gọi `verifyBatch` / `getPolicy` trên bộ contract chính của nhóm mà không deploy mới, bạn chỉ cần copy địa chỉ trong `blockchain/deployments/sepolia.json`, dán vào ô **`At Address`** và bấm nút **`At Address`**.)*

### Bước 0.4 — Bảng giá trị mẫu dùng chung (Copy nguyên dòng để dán vào Remix)

| Tên tham số | Giá trị copy sẵn (đúng chuẩn `bytes32` / `uint256`) |
|---|---|
| `_shipmentKey` | `0x770fdffbbe559e11472e63e8a6058bb3c9dc5170704a7e3db36c6d5f694688b8` |
| `_batchKey` | `0xe5b396f0394f112e1489b4621b121e385ac41b015188ef7d92a60c2585ca6f66` |
| `_deviceKey` | `0x665aa8370a5792d4b2b3e44ea73ac8f2401dd778dcd729e657fc3d4409704b97` |
| `_merkleRoot` (gốc đúng) | `0x5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae37` |
| `_candidateRoot` (bị sửa sai 1 ký tự cuối) | `0x5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae38` |
| `_evidenceHash` | `0x369a9b80a854d96f09ef468093609abd2b42614119fff486a6019d378a29886e` |
| `_payoutAmount` (`500 MINS`) | `500000000000000000000` |
| `_expiry` (còn hạn tới năm 2030) | `1893456000` |
| `_detectedAt` | `1763300000` |

---

## Phần 1: Các kịch bản Module A — `ColdChainDataIntegrity`

### Kịch bản 1: Neo batch dữ liệu hợp lệ & Xác minh khớp gốc (`anchorBatch` → `verifyBatch`)
- **Mục đích:** Kiểm tra `Anchorer` neo được Merkle Root lên Sepolia và đối chiếu trả về đúng `true`.
- **Các bước:**
  1. Mở **MetaMask**, chuyển sang **Account 2 (Anchorer)**. Kiểm tra ô `ACCOUNT` trong Remix đã đổi sang Account 2.
  2. Mở rộng contract **`COLDCHAINDATAINTEGRITY`** ở dưới **Deployed Contracts**.
  3. Mở rộng hàm **`anchorBatch`** (nút màu cam), điền:
     - `_batchKey`: dán `_batchKey` trong bảng mẫu
     - `_shipmentKey`: dán `_shipmentKey`
     - `_deviceKey`: dán `_deviceKey`
     - `_merkleRoot`: dán `_merkleRoot` (gốc đúng)
     - `_firstSequence`: `1`
     - `_lastSequence`: `3`
     - `_recordCount`: `3`
  4. Bấm **transact** → **Confirm trên MetaMask** → đợi ~10–15s thấy dấu **tick xanh** ở terminal Remix.
  5. Kiểm tra lại bằng hàm **`verifyBatch`** (nút màu xanh dương — miễn phí):
     - `_batchKey`: dán `_batchKey`
     - `_candidateRoot`: dán `_merkleRoot` (gốc đúng)
     - Bấm **call**.
- **Kết quả mong đợi:** `verifyBatch` trả về **`true`**. Gọi thêm **`getBatch(_batchKey)`** sẽ thấy đúng `merkleRoot`, `recordCount = 3` và `anchoredBy` là địa chỉ Account 2.

---

### Kịch bản 2: Phát hiện giả mạo dữ liệu (`verifyBatch` trả về `false`)
- **Mục đích:** Mô phỏng tình huống dữ liệu trong Database bị sửa sau khi đã neo lên Sepolia.
- **Các bước:**
  1. Vẫn ở contract **`COLDCHAINDATAINTEGRITY`**, mở hàm **`verifyBatch`** (miễn phí).
  2. Điền `_batchKey` cũ và `_candidateRoot` = giá trị **bị sửa sai 1 ký tự cuối** (`...ae38` ở bảng mẫu).
  3. Bấm **call**.
- **Kết quả mong đợi:** Trả về **`false`** (chứng minh root gốc trên Sepolia không đổi và đã phát hiện sai lệch).

---

### Kịch bản 3: Chặn gửi trùng & Chặn ví lạ neo dữ liệu (`Security`)
- **3a. Chặn gửi trùng (`Duplicate Batch`):**
  1. Đang ở **Account 2 (Anchorer)** trên MetaMask, bấm **transact** lại hàm **`anchorBatch`** với đúng `_batchKey` đã neo ở Kịch bản 1.
  2. **Kết quả mong đợi:** Remix/MetaMask báo lỗi ước tính gas / revert **`ColdChain__BatchAlreadyExists`** (bạn có thể bấm **Cancel** trên popup để không tốn gas, hoặc gửi để thấy tx fail trên Etherscan).
- **3b. Chặn ví lạ (`Unauthorized Anchorer`):**
  1. Mở **MetaMask**, chuyển sang **Account 4** (hoặc **Account 1** — miễn không phải Account 2).
  2. Thử gọi **`anchorBatch`** với một `_batchKey` mới (đổi 2 ký tự cuối từ `66` thành `67`).
  3. **Kết quả mong đợi:** Remix báo lỗi ước tính gas / revert **`ColdChain__CallerNotAnchorer`**.

---

## Phần 2: Các kịch bản Module B — `ColdChainInsurance` & `MockInsuranceToken`

### Kịch bản 4: Cấp vốn & Tạo hợp đồng bảo hiểm (`approve` → `createPolicy`)
- **Mục đích:** Tạo policy bảo hiểm cho 1 chuyến hàng và khóa 500 token MINS vào hợp đồng.
- **Các bước:**
  1. Mở **MetaMask**, chuyển về **Account 1 (Owner / Insurer)**.
  2. Copy địa chỉ của contract **`COLDCHAININSURANCE`** ở dưới **Deployed Contracts**.
  3. Mở rộng **`MOCKINSURANCETOKEN`**, tìm hàm **`approve`** (nút màu cam):
     - `spender`: dán địa chỉ **`COLDCHAININSURANCE`**
     - `value`: `500000000000000000000` (`500 MINS`)
     - Bấm **transact** → **Confirm trên MetaMask** → đợi **tick xanh**.
  4. Mở rộng **`COLDCHAININSURANCE`**, tìm hàm **`createPolicy`** (nút màu cam):
     - `_shipmentKey`: dán `_shipmentKey` trong bảng mẫu
     - `_beneficiary`: copy & dán địa chỉ **Account 4 (Beneficiary)**
     - `_payoutAmount`: `500000000000000000000`
     - `_expiry`: `1893456000`
     - Bấm **transact** → **Confirm trên MetaMask** → đợi **tick xanh**.
- **Kết quả mong đợi:**
  - Gọi `COLDCHAININSURANCE.getPolicy(_shipmentKey)` → `status = 1` (`Active`) và `payoutAmount = 500000000000000000000`.
  - Gọi `MOCKINSURANCETOKEN.balanceOf(địa_chỉ_ColdChainInsurance)` → `500000000000000000000`.

---

### Kịch bản 5: Oracle báo vi phạm & Chi trả bồi thường thành công (`reportViolation`)
- **Mục đích:** Kiểm tra chỉ ví Oracle hợp lệ mới kích hoạt được bồi thường và chuyển đúng `500 MINS` cho người thụ hưởng trên Sepolia.
- **Các bước:**
  1. Kiểm tra trước payout: gọi `MOCKINSURANCETOKEN.balanceOf(Account 4)` → phải là **`0`**.
  2. Mở **MetaMask**, chuyển sang **Account 3 (Oracle)**.
  3. Mở **`COLDCHAININSURANCE`**, tìm hàm **`reportViolation`** (nút màu cam):
     - `_shipmentKey`: dán `_shipmentKey` trong bảng mẫu
     - `_evidenceHash`: dán `_evidenceHash` trong bảng mẫu
     - `_detectedAt`: `1763300000`
     - Bấm **transact** → **Confirm trên MetaMask** → đợi **tick xanh**.
- **Kết quả mong đợi:**
  - Gọi `COLDCHAININSURANCE.getPolicy(_shipmentKey)` → `status` đổi từ `1` sang **`2` (`PaidOut`)**.
  - Gọi `MOCKINSURANCETOKEN.balanceOf(Account 4)` → tăng từ `0` lên **`500000000000000000000`** (`500 MINS`).
  - Gọi `MOCKINSURANCETOKEN.balanceOf(địa_chỉ_ColdChainInsurance)` → giảm về **`0`**.

---

### Kịch bản 6: Chống chi trả trùng & Chặn ví lạ báo vi phạm (`Security`)
- **6a. Chống chi trả 2 lần (`Double Payout`):**
  1. Vẫn ở **Account 3 (Oracle)** trên MetaMask, bấm **transact** lại hàm **`reportViolation`** một lần nữa với cùng `_shipmentKey` của Kịch bản 5.
  2. **Kết quả mong đợi:** Remix báo lỗi ước tính gas / revert **`ColdChain__PolicyNotActive`** (bấm **Cancel** trên popup để đỡ tốn gas). Số dư Account 4 không đổi.
- **6b. Chặn ví lạ gọi `reportViolation` (`Unauthorized Oracle`):**
  1. Mở **MetaMask**, chuyển sang **Account 4** (hoặc bất kỳ ví nào không phải Account 3).
  2. Thử gọi **`reportViolation`** với một `_shipmentKey` bất kỳ.
  3. **Kết quả mong đợi:** Remix báo lỗi ước tính gas / revert **`ColdChain__CallerNotOracle`**.

---

## Tóm tắt nhanh các lỗi (Revert) thường gặp khi test

| Thông báo lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `ColdChain__CallerNotAnchorer` | MetaMask đang chọn sai ví (không phải ví Anchorer) | Mở MetaMask đổi lại sang Account Anchorer |
| `ColdChain__CallerNotOracle` | MetaMask đang chọn sai ví (không phải ví Oracle) | Mở MetaMask đổi lại sang Account Oracle |
| `ColdChain__BatchAlreadyExists` | `_batchKey` đã từng được neo trước đó trên Sepolia | Đổi `_batchKey` khác (thay 1-2 ký tự hex cuối) |
| `ColdChain__PolicyAlreadyExists` | `_shipmentKey` đã tạo policy rồi | Đổi `_shipmentKey` khác |
| `ERC20InsufficientAllowance` | Chưa gọi `MockInsuranceToken.approve(...)` cho `ColdChainInsurance` trước khi `createPolicy` | Gọi `approve` và chờ confirm xong rồi mới gọi `createPolicy` |
| `ColdChain__PolicyNotActive` | Policy chưa tạo hoặc đã chi trả (`PaidOut`) / hoàn tiền (`Refunded`) | Tạo policy mới với `_shipmentKey` khác |
