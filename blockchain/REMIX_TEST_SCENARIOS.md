# Kịch bản Kiểm thử Thủ công trên Remix IDE (Dành cho người mới — NTK & TTDK)

> **Mục tiêu:** Tài liệu này hướng dẫn từng bước bấm nút trực tiếp trên **Remix IDE (Remix VM — miễn phí gas, không cần MetaMask hay SepoliaETH thật)** để kiểm tra các kịch bản phổ biến nhất của Smart Contract mà không cần viết code test.
>
> **Thời gian thực hiện:** ~10–15 phút.

---

## Phần 0: Chuẩn bị & Dữ liệu mẫu (Chỉ cần Copy & Paste)

### Bước 0.1 — Mở Remix và Compile
1. Mở [Remix IDE](https://remix.ethereum.org/).
2. Tạo/copy 3 file từ thư mục `blockchain/contracts/` vào Remix:
   - `MockInsuranceToken.sol`
   - `ColdChainDataIntegrity.sol`
   - `ColdChainInsurance.sol`
3. Ở tab **Solidity Compiler** (biểu tượng chữ S bên trái):
   - **Compiler:** `0.8.36+commit.8a079791`
   - Tick **Enable optimization** = `200`
   - Bấm **Compile** từng file (đảm bảo có dấu tick xanh, không lỗi đỏ).

### Bước 0.2 — Chọn môi trường ảo & Ghi nhớ 5 ví mẫu
Ở tab **Deploy & Run Transactions** (biểu tượng Ethereum bên trái):
- **ENVIRONMENT:** Chọn **`Remix VM (Osaka)`** *(hoặc `Remix VM (Cancun)` — hoàn toàn miễn phí, mỗi ví có sẵn 100 ETH ảo)*.
- Trong mục **ACCOUNT**, bấm vào dropdown sẽ thấy danh sách các ví. Quy ước dùng 5 ví đầu tiên như sau:

| Thứ tự ví trong Remix | Vai trò trong kịch bản | Ghi chú |
|---|---|---|
| **Account #1 (dòng đầu tiên)** | **Owner / Insurer** | Người deploy 3 contract, giữ token `MINS`, tạo & cấp vốn Policy |
| **Account #2 (dòng thứ 2)** | **Anchorer** | Ví đại diện Backend neo Merkle Root (`Module A`) |
| **Account #3 (dòng thứ 3)** | **Oracle** | Ví đại diện Backend báo vi phạm nhiệt độ (`Module B`) |
| **Account #4 (dòng thứ 4)** | **Beneficiary** | Ví người nhận tiền bồi thường bảo hiểm |
| **Account #5 (dòng thứ 5)** | **Stranger** | Ví người lạ — dùng để test gọi trái quyền (phải bị chặn) |

*(Mẹo: Bấm biểu tượng Copy bên cạnh ô **ACCOUNT** để lấy nhanh địa chỉ `0x...` của từng ví.)*

### Bước 0.3 — Deploy 3 Contract theo đúng thứ tự
Đảm bảo **ACCOUNT** đang chọn **Account #1 (Owner)**, lần lượt chọn contract ở ô **CONTRACT** và deploy:

1. **`MockInsuranceToken`**:
   - Ô `initialSupply`: dán `1000000000000000000000000` *(tức 1,000,000 MINS)* → bấm **Deploy**.
2. **`ColdChainDataIntegrity`**:
   - Copy địa chỉ **Account #2 (Anchorer)** dán vào ô `_anchorer` → bấm **Deploy**.
3. **`ColdChainInsurance`**:
   - Mở mục **Deployed Contracts** bên dưới, copy địa chỉ của `MOCKINSURANCETOKEN` vừa deploy dán vào `_payoutToken`.
   - Copy địa chỉ **Account #3 (Oracle)** dán vào `_oracle` → bấm **Deploy**.

> Sau bước này, dưới mục **Deployed Contracts** bạn sẽ thấy đủ 3 contract để bấm gọi hàm.

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
- **Mục đích:** Kiểm tra Backend (`Anchorer`) neo được Merkle Root lên chain và đối chiếu trả về đúng `true`.
- **Các bước:**
  1. Ở ô **ACCOUNT** trên cùng, chọn **Account #2 (Anchorer)**.
  2. Mở rộng contract **`COLDCHAINDATAINTEGRITY`** ở dưới **Deployed Contracts**.
  3. Bấm mũi tên mở rộng hàm **`anchorBatch`** (nút màu cam), điền:
     - `_batchKey`: dán `_batchKey` trong bảng mẫu
     - `_shipmentKey`: dán `_shipmentKey`
     - `_deviceKey`: dán `_deviceKey`
     - `_merkleRoot`: dán `_merkleRoot` (gốc đúng)
     - `_firstSequence`: `1`
     - `_lastSequence`: `3`
     - `_recordCount`: `3`
  4. Bấm **transact** → Terminal phía dưới hiện dấu **tick xanh** là thành công.
  5. Kiểm tra lại bằng cách mở hàm **`verifyBatch`** (nút màu xanh dương):
     - `_batchKey`: dán `_batchKey`
     - `_candidateRoot`: dán `_merkleRoot` (gốc đúng)
     - Bấm **call**.
- **Kết quả mong đợi:** `verifyBatch` trả về **`true`**. Gọi thêm **`getBatch(_batchKey)`** sẽ thấy đúng `merkleRoot`, `recordCount = 3` và `anchoredBy` là địa chỉ Account #2.

---

### Kịch bản 2: Phát hiện giả mạo dữ liệu (`verifyBatch` trả về `false`)
- **Mục đích:** Mô phỏng tình huống dữ liệu trong Database bị sửa sau khi đã neo lên blockchain.
- **Các bước:**
  1. Vẫn ở contract **`COLDCHAINDATAINTEGRITY`**, mở hàm **`verifyBatch`**.
  2. Điền `_batchKey` cũ và `_candidateRoot` = giá trị **bị sửa sai 1 ký tự cuối** (`...ae38` ở bảng mẫu).
  3. Bấm **call**.
- **Kết quả mong đợi:** Trả về **`false`** (chứng minh gốc trên chain không hề bị thay đổi và đã phát hiện sai lệch).

---

### Kịch bản 3: Chặn gửi trùng & Chặn ví lạ neo dữ liệu (`Security`)
- **3a. Chặn gửi trùng (`Duplicate Batch`):**
  1. Đang ở **Account #2 (Anchorer)**, bấm **transact** lại hàm **`anchorBatch`** với đúng `_batchKey` đã neo ở Kịch bản 1.
  2. **Kết quả mong đợi:** Terminal báo **dấu X đỏ (revert)** với lỗi **`ColdChain__BatchAlreadyExists`**. Không cho phép ghi đè root cũ.
- **3b. Chặn ví lạ (`Unauthorized Anchorer`):**
  1. Ở ô **ACCOUNT**, đổi sang **Account #5 (Stranger)**.
  2. Thử gọi **`anchorBatch`** với một `_batchKey` mới (ví dụ đổi ký tự cuối `_batchKey` từ `66` thành `67`).
  3. **Kết quả mong đợi:** Terminal báo **dấu X đỏ (revert)** với lỗi **`ColdChain__CallerNotAnchorer`**.

---

## Phần 2: Các kịch bản Module B — `ColdChainInsurance` & `MockInsuranceToken`

### Kịch bản 4: Cấp vốn & Tạo hợp đồng bảo hiểm (`approve` → `createPolicy`)
- **Mục đích:** Mô phỏng bước chuẩn bị quỹ bảo hiểm cho 1 chuyến hàng trước khi chạy demo.
- **Các bước:**
  1. Đổi **ACCOUNT** về lại **Account #1 (Owner / Insurer)**.
  2. Copy địa chỉ của contract **`COLDCHAININSURANCE`** ở dưới **Deployed Contracts**.
  3. Mở rộng **`MOCKINSURANCETOKEN`**, tìm hàm **`approve`** (nút màu cam):
     - `spender`: dán địa chỉ **`COLDCHAININSURANCE`** vừa copy
     - `value`: `500000000000000000000` (`500 MINS`)
     - Bấm **transact** → đợi **tick xanh**.
  4. Mở rộng **`COLDCHAININSURANCE`**, tìm hàm **`createPolicy`** (nút màu cam):
     - `_shipmentKey`: dán `_shipmentKey` trong bảng mẫu
     - `_beneficiary`: copy & dán địa chỉ **Account #4 (Beneficiary)**
     - `_payoutAmount`: `500000000000000000000`
     - `_expiry`: `1893456000`
     - Bấm **transact** → đợi **tick xanh**.
- **Kết quả mong đợi:**
  - Gọi `COLDCHAININSURANCE.getPolicy(_shipmentKey)` → thấy `status = 1` (`Active`) và `payoutAmount = 500000000000000000000`.
  - Gọi `MOCKINSURANCETOKEN.balanceOf(địa_chỉ_ColdChainInsurance)` → trả về `500000000000000000000` (`500 MINS` đã được khóa vào hợp đồng).

---

### Kịch bản 5: Oracle báo vi phạm & Chi trả bồi thường thành công (`reportViolation`)
- **Mục đích:** Kiểm tra chỉ ví Oracle hợp lệ mới kích hoạt được bồi thường và tiền chuyển đúng cho người thụ hưởng.
- **Các bước:**
  1. Kiểm tra số dư trước payout: gọi `MOCKINSURANCETOKEN.balanceOf(Account #4)` → phải là **`0`**.
  2. Ở ô **ACCOUNT**, đổi sang **Account #3 (Oracle)**.
  3. Mở **`COLDCHAININSURANCE`**, tìm hàm **`reportViolation`** (nút màu cam):
     - `_shipmentKey`: dán `_shipmentKey` trong bảng mẫu
     - `_evidenceHash`: dán `_evidenceHash` trong bảng mẫu
     - `_detectedAt`: `1763300000`
     - Bấm **transact** → đợi **tick xanh**.
- **Kết quả mong đợi:**
  - Gọi `COLDCHAININSURANCE.getPolicy(_shipmentKey)` → `status` đổi từ `1` sang **`2` (`PaidOut`)**.
  - Gọi `MOCKINSURANCETOKEN.balanceOf(Account #4)` → tăng từ `0` lên **`500000000000000000000`** (`500 MINS`).
  - Gọi `MOCKINSURANCETOKEN.balanceOf(địa_chỉ_ColdChainInsurance)` → giảm về **`0`**.

---

### Kịch bản 6: Chống chi trả trùng & Chặn ví lạ báo vi phạm (`Security`)
- **6a. Chống chi trả 2 lần (`Double Payout`):**
  1. Vẫn ở **Account #3 (Oracle)**, bấm **transact** lại hàm **`reportViolation`** một lần nữa với cùng `_shipmentKey` của Kịch bản 5.
  2. **Kết quả mong đợi:** Terminal báo **dấu X đỏ (revert)** với lỗi **`ColdChain__PolicyNotActive`**. Số dư của Account #4 không bị cộng thêm.
- **6b. Chặn ví lạ gọi `reportViolation` (`Unauthorized Oracle`):**
  1. Đổi **ACCOUNT** sang **Account #5 (Stranger)**.
  2. Thử gọi **`reportViolation`** với một `_shipmentKey` bất kỳ.
  3. **Kết quả mong đợi:** Terminal báo **dấu X đỏ (revert)** với lỗi **`ColdChain__CallerNotOracle`**.

---

## Tóm tắt nhanh các lỗi (Revert) thường gặp khi test

| Thông báo lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `ColdChain__CallerNotAnchorer` | Đang chọn sai ví ở ô `ACCOUNT` (không phải ví Anchorer) | Đổi lại đúng ví Anchorer |
| `ColdChain__CallerNotOracle` | Đang chọn sai ví (không phải ví Oracle) | Đổi lại đúng ví Oracle |
| `ColdChain__BatchAlreadyExists` | `_batchKey` đã từng được neo trước đó | Đổi `_batchKey` khác (thay 1-2 ký tự hex cuối) |
| `ColdChain__PolicyAlreadyExists` | `_shipmentKey` đã tạo policy rồi | Đổi `_shipmentKey` khác |
| `ERC20InsufficientAllowance` | Chưa gọi `MockInsuranceToken.approve(...)` cho `ColdChainInsurance` trước khi `createPolicy` | Gọi `approve` trước rồi mới gọi `createPolicy` |
| `ColdChain__PolicyNotActive` | Policy chưa tạo hoặc đã chi trả (`PaidOut`) / hoàn tiền (`Refunded`) | Tạo policy mới với `_shipmentKey` khác |
