# Giải thích Toàn diện về Blockchain & Mối liên hệ với Backend trong Dự án `smart-coldchain-insurance`

> **Đối tượng đọc:** Dành cho người chưa biết gì về Blockchain hoặc mới tham gia dự án muốn hiểu tường tận **hệ thống hoạt động thế nào, tại sao dùng Merkle Tree, dữ liệu được lưu/kiểm tra ra sao, và Backend giao tiếp với Smart Contract như thế nào**.

---

## 1. Bức tranh tổng quan: Tại sao dự án cần Blockchain?

Trong chuỗi cung ứng lạnh (vận chuyển vắc-xin, thực phẩm đông lạnh), cảm biến IoT (**ESP32 + DHT22**) liên tục đo nhiệt độ/độ ẩm rồi gửi về máy chủ (**Backend FastAPI + MySQL**).

Nếu **chỉ dùng MySQL truyền thống**, sẽ có 2 vấn đề lớn:
1. **Dữ liệu có thể bị sửa ngầm:** Quản trị viên hoặc kẻ tấn công có quyền truy cập Database có thể lén sửa nhiệt độ từ `12°C` (hỏng hàng) thành `4°C` (an toàn) để trốn trách nhiệm, mà không ai chứng minh được dữ liệu đã bị sửa.
2. **Tranh chấp bồi thường bảo hiểm:** Khi hàng hỏng do quá nhiệt, bên vận chuyển và bên bảo hiểm dễ tranh cãi xem ai đúng ai sai, tiền bồi thường có bị giữ lại hoặc chi trả trùng hay không.

**Giải pháp của dự án là kết hợp 2 thế giới:**
- **Off-chain (MySQL — ngoài Blockchain):** Lưu toàn bộ hàng nghìn bản ghi nhiệt độ thô, thông tin thiết bị, khóa công khai của ESP32, tài khoản Admin, audit log. **Nhanh, rẻ, truy vấn dễ.**
- **On-chain (Ethereum Sepolia Blockchain):** Chỉ lưu **chứng cứ tóm tắt bất biến (Merkle Root)** cho từng lô dữ liệu và **luật chi trả bảo hiểm tự động (Smart Contract)**. **Không ai sửa/xóa được, ai cũng kiểm chứng được.**

```text
[ESP32] --(1. Ký số ECDSA P-256)--> [Backend FastAPI] --(2. Lưu dữ liệu thô)--> [MySQL]
                                             │
                 ┌───────────────────────────┴───────────────────────────┐
                 ▼ (3. Gom lô & Tính Merkle Root)                        ▼ (5. Vi phạm >= 15 phút & bằng chứng sạch)
    [Web3IntegrityAdapter]                                    [Web3BlockchainAdapter]
    (Ví Anchorer: 0xd2D6...)                                  (Ví Oracle: 0x7747...)
                 │                                                       │
                 ▼ (anchorBatch)                                         ▼ (reportViolation)
  ┌──────────────────────────────┐                        ┌──────────────────────────────┐
  │   ColdChainDataIntegrity     │                        │     ColdChainInsurance       │
  │ (Lưu Merkle Root bất biến)   │                        │  (Khóa tiền & tự động trả)   │
  └──────────────────────────────┘                        └──────────────────────────────┘
                                                                         │
                                                                         ▼ (chuyển SepoliaETH)
                                                                [Ví Beneficiary]
```

---

## 2. Nguyên lý Merkle Tree (`MERKLE-v1`) & Tại sao không lưu từng bản ghi lên Blockchain?

### 2.1. Tại sao phải gom lô (Batch) rồi dùng Merkle Tree?
Mỗi giao dịch ghi lên Blockchain (kể cả testnet Sepolia) đều tốn **phí gas** và mất **~12 giây/block** để xác nhận. Nếu cứ 5 giây cảm biến gửi 1 mẫu nhiệt độ mà ghi thẳng lên Blockchain thì sẽ:
- Cực kỳ tốn gas và nghẽn mạng.
- Lộ dữ liệu chi tiết ra công khai (Blockchain ai cũng đọc được).

Thay vào đó, Backend gom các bản ghi hợp lệ của cùng một `(shipment_id, device_id)` thành một **Lô (Batch)** (ví dụ: tối đa `100` bản ghi hoặc mỗi `5` phút thì đóng gói gọi là **`SEALED`**), rồi nén toàn bộ lô đó thành **1 mã băm duy nhất dài 32 bytes gọi là Merkle Root**.

### 2.2. Cách Backend dựng cây Merkle (`MERKLE-v1`) từng bước

Giả sử một Batch có 3 bản ghi nhiệt độ với `sequence_number = 1, 2, 3`:

1. **Bước 1 — Chuẩn hóa từng bản ghi (Canonical JSON):**
   Backend lấy dữ liệu đã lưu ở `SignedTelemetryReceipt` + `Telemetry`, sắp xếp tên trường theo **thứ tự ASCII tăng dần**, bỏ khoảng trắng thừa, nhiệt độ/độ ẩm dùng số nguyên (`temperature_milli_c`, `humidity_milli_pct`), thời gian chuẩn UTC (`...Z`), và kèm chữ ký `signature` của ESP32:
   ```json
   {"device_id":"ESP32-001","firmware_version":"1.0.0","humidity_milli_pct":80000,"key_id":"key-v1","payload_version":1,"received_at":"2026-11-14T10:00:00Z","recorded_at":"2026-11-14T10:00:00Z","sequence_number":1,"shipment_id":"8b4fb8a2-...","signature":"...","temperature_milli_c":9500}
   ```
   *(Lưu ý: không đưa các trường trạng thái hay thay đổi như `status` vào đây để hash không bao giờ đổi theo thời gian.)*

2. **Bước 2 — Tính Hash của từng Lá (`Leaf Hash`):**
   Dùng thuật toán **SHA-256** với tiền tố `0x00` (theo chuẩn RFC 6962 để chống tấn công giả mạo node cây):
   ```text
   L1 = SHA256(0x00 || canonical_json_của_bản_ghi_1)
   L2 = SHA256(0x00 || canonical_json_của_bản_ghi_2)
   L3 = SHA256(0x00 || canonical_json_của_bản_ghi_3)
   ```

3. **Bước 3 — Ghép cặp tính Node cha (`Parent Hash`) & Xử lý số lẻ:**
   Dùng tiền tố `0x01` ghép 2 hash 32-byte cạnh nhau. Nếu một tầng có **số lượng node lẻ** (ví dụ có 3 lá), hệ thống **nhân đôi node cuối** ở tầng đó:
   ```text
               [ Merkle Root ]  = SHA256(0x01 || P12 || P33)
                  /        \
               [P12]       [P33]
              /     \     /     \
           [L1]    [L2] [L3]   [L3 (nhân đôi)]
   ```
   - Nếu Batch chỉ có **1 bản ghi** (`L1`), thì `Merkle Root = L1`.
   - Batch **0 bản ghi** bị cấm neo lên chain (`ColdChain__InvalidRecordCount`).

> **Tính chất kỳ diệu của Merkle Tree:** Chỉ cần **1 con số** trong bất kỳ bản ghi nào (dù là bản ghi số 99/100) bị sửa đổi từ `9.5°C` thành `2.5°C` (hoặc sửa 1 ký tự chữ ký), Leaf Hash đó đổi → toàn bộ nhánh cha đổi theo → **Merkle Root cuối cùng thay đổi hoàn toàn**, không thể nào khớp với gốc cũ trên Blockchain.

---

## 3. Cơ chế lưu trữ trên Blockchain (`ColdChainDataIntegrity.sol`)

### 3.1. Tại sao dùng 2 hàm băm khác nhau (`keccak256` vs `SHA-256`)?
Trong dự án cần phân biệt rõ:
- **`SHA-256`**: Chỉ dùng để tính **Merkle Root** (`MERKLE-v1`) cho nội dung dữ liệu telemetry.
- **`keccak256`** *(hàm băm mặc định của Ethereum)*: Dùng để biến các chuỗi ID dạng text (`UUID`, `device_id`, `event_id`) thành khóa `bytes32` cố định dài 32 bytes:
  ```text
  shipmentKey = keccak256(UTF8(shipment_id))   // Ví dụ: UUID "8b4fb8a2-..." (KHÔNG hash mã hiển thị "SHIP-001")
  batchKey    = keccak256(UTF8(batch_id))
  deviceKey   = keccak256(UTF8(device_id))     // Chỉ là hash định danh, KHÔNG phải khóa công khai ECDSA P-256
  evidenceHash = keccak256(UTF8(event_id))     // UUID của sự kiện vi phạm
  ```

### 3.2. Dữ liệu nào thực sự được lưu trong Smart Contract Module A?
Khi Backend gọi hàm `anchorBatch(...)` trên contract `ColdChainDataIntegrity`:
```solidity
struct Batch {
    bytes32 shipmentKey;   // Chuyến hàng nào
    bytes32 deviceKey;     // Thiết bị nào
    bytes32 merkleRoot;    // Dấu vân tay 32-byte của cả lô dữ liệu
    uint64 firstSequence;  // Số thứ tự gói đầu tiên
    uint64 lastSequence;   // Số thứ tự gói cuối cùng
    uint32 recordCount;    // Tổng số bản ghi trong lô
    uint64 anchoredAt;     // Thời gian block khi neo lên chain
    address anchoredBy;    // Địa chỉ ví Anchorer đã gửi
}
```
Contract lưu vào `mapping(bytes32 => Batch) private batches;` (khóa chính là `batchKey`) và phát ra sự kiện **`BatchAnchored(...)`**.

### 3.3. Cơ chế bảo vệ tính bất biến (Immutability)
1. **Chỉ ví `anchorer` được quyền ghi:** Hàm `anchorBatch` gắn modifier `onlyAnchorer`. Bất kỳ ví lạ nào gọi vào đều bị chặn ngay (`ColdChain__CallerNotAnchorer`).
2. **Không cho phép ghi đè / sửa / xóa:**
   - Trong code Solidity (`ColdChainDataIntegrity.sol`), nếu `batches[_batchKey].anchoredAt != 0` (tức `batchKey` đã tồn tại), contract lập tức hủy giao dịch với lỗi `ColdChain__BatchAlreadyExists`.
   - **Không có bất kỳ hàm `updateBatch` hay `deleteBatch` nào** — kể cả người tạo contract (`owner`) cũng không thể sửa `merkleRoot` một khi đã neo xong.

---

## 4. Cơ chế Kiểm tra & Phát hiện Sửa dữ liệu (Tamper Detection)

Khi Admin bấm kiểm tra toàn vẹn một lô (`POST /api/v1/batches/{batch_id}/verify`), Backend thực hiện quy trình **2 lớp đối chiếu**:

1. **Lớp 1 — Đối chiếu nội bộ MySQL (`Telemetry` vs `SignedTelemetryReceipt`):**
   - Backend lấy toàn bộ các bản ghi trong lô từ bảng `Telemetry` và đối chiếu với bảng `SignedTelemetryReceipt` (bản gốc lúc mới nhận chữ ký ESP32).
   - Nếu kẻ xấu vào MySQL sửa `Telemetry.temperature_c` từ `9.5` thành `2.5` → lệch với `receipt.temperature_milli_c = 9500` → Backend báo ngay **`DATA_INTEGRITY_FAILED`**.
2. **Lớp 2 — Tính lại Merkle Root & Đối chiếu với Blockchain (`verifyBatch` / `getBatch`):**
   - Giả sử kẻ xấu tinh vi hơn, sửa **cả hai bảng** `Telemetry` và `SignedTelemetryReceipt` trong MySQL cho khớp nhau.
   - Backend tính lại `calculated_root` theo đúng chuẩn `MERKLE-v1`, rồi gọi hàm `verifyBatch(_batchKey, calculated_root)` (hoặc `getBatch(_batchKey)`) trên Sepolia.
   - Vì `merkleRoot` lưu trên Sepolia là **bất biến**, phép so sánh `b.merkleRoot == _candidateRoot` trả về **`false`** → Hệ thống kết luận **`DATA_INTEGRITY_FAILED`** và **tuyệt đối không neo root mới lên đè để che giấu lỗi**.

---

## 5. Cơ chế Bảo hiểm tự động (`ColdChainInsurance.sol` với Native `SepoliaETH`)

### 5.1. Tiền tệ ký quỹ & Mức quy đổi `SepoliaETH` hợp lý cho Demo
- Thay vì tạo thêm token ERC-20 riêng (`MINS`), hợp đồng bảo hiểm sử dụng trực tiếp **native `SepoliaETH`** (tiền test mặc định của mạng Ethereum Sepolia — không có giá trị tiền thật).
- Vì các ví test thường có khoảng **`2 – 10 SepoliaETH`**, mức ký quỹ & bồi thường chuẩn được quy đổi như sau để chạy được hàng trăm lượt test/demo mà không lo hết ví:
  - **Mức mặc định cho 1 chuyến hàng (`10,000,000 VND` nghiệp vụ):** **`0.01 SepoliaETH`** = **`10000000000000000` `wei`** (`10 Finney`).
  - **Mức thấp (`5,000,000 VND`):** `0.005 SepoliaETH` (`5000000000000000` wei).
  - **Mức cao (`20,000,000 VND`):** `0.02 SepoliaETH` (`20000000000000000` wei).

### 5.2. Vòng đời một hợp đồng bảo hiểm (`Policy`) trên Smart Contract
Mỗi chuyến hàng (`_shipmentKey`) có tối đa 1 `Policy` với 4 trạng thái: `0 = NotExist`, `1 = Active`, `2 = PaidOut`, `3 = Refunded`.

1. **Bước 1 — Ký quỹ & Khóa `SepoliaETH` (`createPolicy` — chỉ 1 giao dịch):**
   - Trước khi chuyến hàng chạy (hoặc trước khi bồi thường), ví `Owner/Insurer` gọi hàm **`createPolicy(shipmentKey, beneficiary, payoutAmount, expiry)`** và **gửi kèm `msg.value`** (ví dụ `0.01 SepoliaETH` = `10000000000000000` wei). Không cần bước `approve` trung gian.
   - Smart Contract **giữ khóa cứng số `SepoliaETH` đó ngay trong số dư hợp đồng** (Escrow) và đặt trạng thái `Active`.
   - *Lưu ý:* Việc tạo shipment trên Web/MySQL chỉ sinh ra UUID trong DB; chưa tự động gửi `SepoliaETH` tạo Policy trên Blockchain.
2. **Bước 2 — Điều kiện kích hoạt (Off-chain ở Backend) & Bằng chứng (`PAYOUT_REQUIRES_ANCHORED_EVIDENCE=true`):**
   - Smart Contract **không thể tự đọc nhiệt kế** và cũng **không tự đếm 15 phút** được. Toàn bộ việc kiểm tra điều kiện nghiệp vụ nằm ở Backend (`InsuranceEvidenceCoordinator`):
     - Chuỗi dữ liệu phải là signed telemetry hợp lệ, **không bị ngắt quãng (gap)**, vượt ngưỡng nhiệt độ **liên tục ≥ 15 phút** theo `received_at`.
     - Toàn bộ các batch chứa bằng chứng phải có trạng thái **`DATA_ANCHORED`** và kiểm tra toàn vẹn khớp với gốc on-chain (`MATCHED`). Nếu batch chưa neo xong hoặc bị sửa dữ liệu → Backend dừng lại ở `EVIDENCE_PENDING` / chặn payout, **không gọi Smart Contract**.
3. **Bước 3 — Chi trả tự động (`reportViolation`) & Chống gian lận:**
   - Khi mọi điều kiện đều đạt, Backend dùng riêng ví **Oracle** gọi `reportViolation(shipmentKey, evidenceHash, detectedAt)`.
   - Smart Contract tự động kiểm tra 4 điều kiện trên chuỗi:
     1. Người gọi phải đúng là ví `oracle` (`onlyOracle`).
     2. Policy phải đang `Active` (`ColdChain__PolicyNotActive` — **chặn chi trả 2 lần** nếu Oracle gửi trùng!).
     3. Thời gian block hiện tại chưa vượt quá `expiry` (`block.timestamp <= policy.expiry`).
     4. Hợp đồng có đủ số dư `SepoliaETH` (`address(this).balance >= policy.payoutAmount`).
   - Sau đó contract cập nhật `status = PaidOut` **trước** khi chuyển `0.01 SepoliaETH` cho `beneficiary` (tuân thủ mẫu *Checks-Effects-Interactions* + `nonReentrant` chống tấn công Reentrancy), rồi phát sự kiện **`InsurancePaid`**.
4. **Bước 4 — Hoàn tiền nếu chuyến hàng an toàn (`refundExpiredPolicy`):**
   - Nếu hết hạn `expiry` mà chuyến hàng không vi phạm gì (vẫn `Active`), `Insurer` hoặc `Owner` gọi `refundExpiredPolicy(shipmentKey)` để contract chuyển trả lại `SepoliaETH` đã khóa về ví `insurer` (`status = Refunded`).

---

## 6. Mối liên hệ kỹ thuật giữa Backend (`FastAPI + Web3.py`) và Blockchain (`Sepolia`)

### 6.1. Backend kết nối Blockchain bằng những thành phần gì?
1. **RPC Provider (`Alchemy HTTPS RPC`):** Giống như "cổng API" để Backend Python (`web3.py`) gửi request đọc dữ liệu hoặc phát transaction lên mạng lưới các node Ethereum Sepolia (`chainId = 11155111`).
2. **ABI (`Application Binary Interface` — file `.json`):** Giống như "bản thiết kế thực đơn" mô tả tên hàm, kiểu tham số, event và custom error của Smart Contract để Python biết cách mã hóa dữ liệu gửi đi và giải mã kết quả trả về.
3. **3 Ví tách biệt quyền (Separation of Duties):**
   - **Owner (`0x6607...`)**: Giữ trên MetaMask cá nhân của thành viên Blockchain để deploy, quản trị quyền (`setAnchorer`, `setOracle`), cấp vốn `createPolicy`. **Không đưa khóa ví này vào Backend.**
   - **Anchorer (`0xd2D6...`)**: Backend giữ private key trong `.env` (`BACKEND_ANCHORER_PRIVATE_KEY`), chỉ được phép ghi `anchorBatch` lên Module A.
   - **Oracle (`0x7747...`)**: Backend giữ private key trong `.env` (`BLOCKCHAIN_ORACLE_PRIVATE_KEY`), chỉ được phép gọi `reportViolation` lên Module B.

### 6.2. Cơ chế Outbox & Đảm bảo không mất dữ liệu khi mạng Blockchain lỗi
Giao dịch Blockchain có thể chậm, timeout hoặc lỗi RPC. Vì vậy Backend **không gọi Blockchain đồng bộ trực tiếp trong lúc ESP32 gửi nhiệt độ**, mà dùng **Integration Outbox**:
1. ESP32 gửi dữ liệu → Backend xác minh chữ ký/sequence → **lưu ngay vào MySQL**.
2. Khi batch `SEALED`, Backend tạo một bản ghi chờ trong bảng `integration_outbox`.
3. `Web3IntegrityAdapter` ký offline giao dịch `anchorBatch` bằng private key `Anchorer`, gửi lên Alchemy → lúc mới có `tx_hash`, trạng thái chỉ là **`BLOCKCHAIN_PENDING`** (tuyệt đối chưa báo thành công).
4. Khi giao dịch được đào xong (`receipt.status == 1`) và đạt đủ số block xác nhận (`BLOCKCHAIN_CONFIRMATIONS=2` trên Sepolia), đồng thời đọc lại `batchExists` / `getBatch` khớp root → mới chuyển sang **`DATA_ANCHORED`**.
5. Nếu mạng rớt giữa chừng và Backend gửi lại, hợp đồng Module A chặn bằng `ColdChain__BatchAlreadyExists`, Backend kiểm tra lại `getBatch` nếu thấy root đã khớp thì đối soát thành công (`idempotent`), không bao giờ mất dữ liệu cảm biến trong MySQL.

---

## 7. Những giới hạn thực tế cần nắm rõ (tránh hiểu nhầm khi báo cáo)

1. **Blockchain không tự đo được nhiệt độ thật:** Nếu ai đó dùng máy sấy thổi vào cảm biến hoặc làm giả tín hiệu phần cứng trước khi ESP32 ký, thì chữ ký và Merkle Root vẫn hợp lệ về mặt toán học. Blockchain chỉ bảo vệ **tính bất biến kể từ sau khi dữ liệu đã được Backend tiếp nhận và neo**.
2. **Blockchain không thay thế MySQL:** Dữ liệu chi tiết để vẽ biểu đồ, lọc theo giờ, kiểm tra thiếu gói (`DATA_INCOMPLETE`) đều đọc từ MySQL.
3. **Tin cậy Backend Oracle ở Module B:** Smart Contract tin vào báo cáo của ví `Oracle` hợp lệ; nếu server Backend bị chiếm quyền và lộ private key của Oracle, kẻ tấn công có thể gọi `reportViolation` sai sự thật (vì vậy mới cần tách riêng private key vào biến môi trường bảo mật và có hàm `setOracle` để thu hồi ngay khi có sự cố).
4. **`SepoliaETH` trong dự án chỉ là coin testnet miễn phí:** Không đại diện cho ETH thật (mainnet) hay hợp đồng bảo hiểm pháp lý ngoài đời thực.
