# ROADMAP THÀNH VIÊN 2 — Blockchain và Smart Contract

> Dự án: `smart-coldchain-insurance`  
> Vai trò: **Owner của toàn bộ `blockchain/`**.  
> Mục tiêu: Xây dựng cơ chế ghi nhận vi phạm và xử lý quyền lợi bảo hiểm bằng Smart Contract trên local blockchain/testnet, có kiểm soát quyền gọi và chống xử lý trùng.

---

## 1. Phạm vi và ranh giới sở hữu

### Bạn chịu trách nhiệm

- Smart Contract Solidity quản lý chính sách bảo hiểm demo, sự kiện vi phạm và trạng thái chi trả.
- Unit tests, script deploy, cấu hình local chain và tài liệu tích hợp.
- Bàn giao ABI, địa chỉ contract, chain ID và quy tắc mã hóa ID cho Member 1.
- Kiểm soát quyền oracle: chỉ Backend được cấp quyền mới được gửi sự kiện vi phạm.

### Bạn không được sửa

- `backend/` và `device/` (Member 1 sở hữu).
- `frontend/` (Member 3 sở hữu).
- API Backend. Nếu cần một field hoặc thay đổi payload, tạo đề xuất để Member 1 cập nhật `docs/contracts/api-v1.md`.

### Thư mục được phép sở hữu

```text
blockchain/
  contracts/
    ColdChainInsurance.sol
    MockInsuranceToken.sol       # nếu dùng token mô phỏng
  scripts/
    deploy.ts
    seed-demo.ts
  test/
  ignition/                       # tùy framework
  deployments/
    localhost.json
  artifacts/                      # sinh tự động; không sửa tay
  README.md
  INTEGRATION.md
```

## 2. Quy ước chung bắt buộc

- Đề xuất stack: Solidity + Hardhat + TypeScript, dùng local EVM để phát triển và kiểm thử.
- Không ghi từng mẫu nhiệt độ/độ ẩm lên Blockchain; chỉ gửi sự kiện đủ điều kiện do Backend đánh giá.
- Smart Contract không thể tự đọc cảm biến/HTTP API. Backend đóng vai trò **oracle** và gửi giao dịch có bằng chứng tham chiếu.
- Không coi dữ liệu tọa độ mô phỏng là bằng chứng GPS thực; định vị không được tự nó kích hoạt bồi thường trong MVP.
- Bản demo dùng local chain hoặc testnet và tài sản/token vô giá trị thực. Không kết nối ví/tài khoản có tiền thật.
- Điều kiện nhiệt độ vượt ngưỡng liên tục 15 phút do Backend đánh giá theo policy; contract kiểm tra quyền, chính sách đã đăng ký, thời hạn và trạng thái xử lý trùng.
- Backend là nơi lưu telemetry đầy đủ. Có thể gửi `evidenceHash`/`eventHash` lên chain để liên kết với bản ghi off-chain; không đưa dữ liệu cá nhân hoặc toàn bộ telemetry lên chain.

## 3. Giao diện tích hợp cần chốt với Member 1

Trước khi viết contract, họp ngắn với Member 1 để khóa các điểm sau và ghi lại trong `blockchain/INTEGRATION.md`:

1. `shipment_id` ở Backend là chuỗi. Contract nhận `shipmentKey` kiểu `bytes32`.
2. Quy tắc thống nhất đề xuất: `shipmentKey = keccak256(UTF8(shipment_id))`. Cả Backend và script test phải áp dụng cùng quy tắc; không tự ý đổi sang SHA-256 hoặc hash UUID dạng nhị phân.
3. `evidenceHash` là hash của JSON bằng chứng đã chuẩn hóa hoặc ID sự kiện được hash; Member 1 phải biết chính xác cách tạo hash.
4. `detectedAt` là Unix timestamp giây do Backend xác lập cho sự kiện đủ điều kiện.
5. Địa chỉ oracle là ví demo mà Backend dùng để ký giao dịch. Địa chỉ đó phải được cấu hình trong môi trường local/testnet.
6. Thống nhất cơ chế quyền lợi: đề xuất dùng `MockInsuranceToken` trên local chain để mô phỏng chuyển khoản tự động. Tên token và số token chỉ mang ý nghĩa demo, **không đại diện giá trị VND hoặc tiền thật**.

## 4. Thiết kế Smart Contract MVP

### Trách nhiệm tối thiểu

- Quản lý policy theo `shipmentKey`.
- Lưu beneficiary, payout amount dạng token demo, thời hạn và trạng thái.
- Hạn chế gọi `reportViolation` vào địa chỉ oracle đã được cấp quyền.
- Khi nhận sự kiện hợp lệ: kiểm tra policy tồn tại/được cấp vốn/còn hiệu lực/chưa chi trả; ghi trạng thái trước khi chuyển token; tự động chuyển token demo cho beneficiary.
- Phát event chứa `shipmentKey`, `evidenceHash`, `detectedAt`, `payoutAmount` và beneficiary.
- Chống gửi trùng; cùng một policy không nhận payout lần thứ hai.
- Có cơ chế cập nhật/thay oracle chỉ bởi admin/owner; không cho người bất kỳ tự kích hoạt bảo hiểm.

### Hàm có thể dùng

Tên hàm có thể điều chỉnh khi code, nhưng cần giữ đúng chức năng tương đương:

- `createPolicy(shipmentKey, beneficiary, payoutAmount, expiry)` — đăng ký policy và khóa token demo.
- `reportViolation(shipmentKey, evidenceHash, detectedAt)` — chỉ oracle được gọi; đánh dấu chi trả và thực hiện transfer token demo.
- `setOracle(newOracle)` — chỉ owner.
- `getPolicy(shipmentKey)` — đọc trạng thái policy.
- `PolicyCreated(...)`, `InsurancePaid(...)`, `OracleUpdated(...)` — events.

Không cần xây marketplace, DAO, NFT hoặc nhiều loại token trong MVP. Giữ contract nhỏ để dễ kiểm thử và bảo vệ.

## 5. Roadmap theo Phase

### Phase 0 — Chốt giao diện với nhóm

**Việc cần làm**

1. Tạo nhánh `feat/blockchain-contract`.
2. Đọc `docs/contracts/api-v1.md` của Member 1; nếu chưa có, yêu cầu chốt trường `shipment_id`, policy và event trước khi viết integration assumptions.
3. Chốt `shipmentKey`, `evidenceHash`, timestamp, oracle address và định dạng payout demo.
4. Viết bản đầu của `blockchain/INTEGRATION.md` gồm function signature và ví dụ dữ liệu.
5. Gửi cho Member 1 và yêu cầu xác nhận bằng comment/issue; không đoán quy tắc ID.

**Tiêu chí nghiệm thu**

- Member 1 hiểu chính xác cách gọi contract và tạo các hash.
- Member 3 biết Dashboard sẽ đọc trạng thái chain thông qua Backend, không gọi trực tiếp contract.

### Phase 1 — Khởi tạo môi trường và contract khung

**Việc cần làm**

1. Khởi tạo Hardhat + TypeScript + Solidity.
2. Cố định compiler version trong cấu hình để mọi thành viên compile ra cùng kết quả.
3. Tạo `MockInsuranceToken.sol` nếu chọn mô phỏng chuyển khoản token.
4. Tạo `ColdChainInsurance.sol` với policy struct, oracle, owner và event cơ bản.
5. Thêm script compile/test và hướng dẫn cài đặt.

**Tiêu chí nghiệm thu**

- `compile` thành công trên máy sạch theo README.
- Contract ban đầu không có lỗi syntax; test framework chạy được.

### Phase 2 — Chính sách và cơ chế chi trả

**Việc cần làm**

1. Xây dựng hàm tạo policy và kiểm tra shipment key không bị đăng ký trùng.
2. Khóa số token demo cần thiết từ tài khoản insurer vào contract theo cách nhất quán.
3. Xây `reportViolation` có kiểm tra quyền oracle.
4. Kiểm tra policy tồn tại, được cấp vốn, còn hiệu lực và chưa chi trả.
5. Thực hiện hiệu ứng trạng thái trước khi transfer; sử dụng thư viện/chốt biện pháp chống reentrancy phù hợp.
6. Phát event thành công để Backend lấy transaction receipt và cập nhật trạng thái.
7. Xử lý rõ các trường hợp revert: unauthorized oracle, unknown policy, expired policy, unfunded policy, duplicate payout.

**Tiêu chí nghiệm thu**

- Giao dịch từ oracle hợp lệ chuyển token demo và phát event.
- Tài khoản không có quyền không thể kích hoạt payout.
- Gọi lặp lại không thể chi trả lần hai.

### Phase 3 — Unit test và kiểm thử tình huống lỗi

**Việc cần làm**

1. Test policy được tạo thành công với input đúng.
2. Test không cho tạo policy trùng shipment key.
3. Test người không phải oracle gọi `reportViolation` bị từ chối.
4. Test chưa cấp vốn/không đủ token.
5. Test policy hết hạn.
6. Test payout lần đầu thành công, balance thay đổi đúng.
7. Test gửi lặp cùng sự kiện không chi trả thêm.
8. Test `evidenceHash`, beneficiary và amount trong event đúng.
9. Test quyền thay đổi oracle chỉ thuộc owner.
10. Chạy coverage nếu setup có hỗ trợ; ưu tiên bao phủ logic và nhánh lỗi quan trọng thay vì chạy theo con số coverage hình thức.

**Tiêu chí nghiệm thu**

- Toàn bộ test contract pass.
- Các trường hợp chi trả trùng và caller sai quyền đã có test riêng.

### Phase 4 — Deploy local chain và bàn giao artifact

**Việc cần làm**

1. Viết script deploy token demo và contract.
2. Tạo tài khoản/token demo và cấp quyền/fund policy cho kịch bản mẫu.
3. Chạy local node theo hướng dẫn một lệnh hoặc các lệnh được ghi rõ.
4. Lưu `chainId`, địa chỉ contract, địa chỉ token và địa chỉ oracle vào `deployments/localhost.json`.
5. Xuất ABI/artifacts để Member 1 sử dụng; không yêu cầu Member 1 copy thủ công ABI từng hàm.
6. Ghi rõ địa chỉ deploy chỉ có hiệu lực với chain tương ứng; deploy lại sẽ đổi địa chỉ.

**Gói bàn giao cho Member 1**

- `ColdChainInsurance` ABI.
- Địa chỉ contract và token sau deploy local.
- Chain ID và RPC URL local.
- Oracle address + hướng dẫn cấu hình signer demo.
- Quy tắc `shipmentKey` và `evidenceHash`.
- Ví dụ gọi `createPolicy` và `reportViolation`.
- Ví dụ transaction receipt/event thành công và event lỗi/revert thường gặp.

**Tiêu chí nghiệm thu**

- Member 1 có thể đọc `INTEGRATION.md` và viết adapter mà không cần tự suy đoán contract.

### Phase 5 — Tích hợp thử cùng Backend

**Việc cần làm**

1. Tạo một policy test cho shipment ID mà Member 1 cung cấp.
2. Nhận giao dịch `reportViolation` từ Backend adapter.
3. Đối chiếu event và transaction hash với API response.
4. Test RPC bị dừng, oracle sai quyền và transaction revert; gửi cách xử lý cho Member 1.
5. Không sửa file Backend để tự tích hợp; tạo issue/PR mô tả thay đổi ABI/interface nếu cần.

**Tiêu chí nghiệm thu**

- Kịch bản vi phạm từ Backend xuất hiện thành giao dịch local chain.
- API có thể tham chiếu transaction hash, và trạng thái chi trả không bị ghi nhận thành công khi transaction thất bại.

### Phase 6 — Tài liệu demo và rà soát an toàn

**Việc cần làm**

1. Viết `blockchain/README.md`: cài đặt, chạy node, compile, test, deploy.
2. Viết `blockchain/INTEGRATION.md`: contract interface, dữ liệu hash, event schema, địa chỉ deploy.
3. Đảm bảo private key chỉ dùng key test local/testnet và nằm trong `.env`, không commit.
4. Ghi rõ giới hạn: oracle là bên tin cậy; contract không tự xác minh cảm biến vật lý hoặc tính đúng của dữ liệu do Backend gửi.
5. Không quảng bá token demo là bảo hiểm pháp lý hoặc tiền thật.

## 6. Cách phối hợp không xung đột

- Chỉ Member 2 sửa `blockchain/`.
- Member 1 sở hữu `backend/app/integrations/blockchain_adapter.py` và là người duy nhất nối Backend với contract.
- Member 3 chỉ hiển thị trạng thái nhận từ Backend; không dùng private key và không gửi transaction từ trình duyệt.
- Mọi thay đổi function signature, event hoặc kiểu dữ liệu phải cập nhật `INTEGRATION.md`, thông báo Member 1 trước và cập nhật test.
- Không merge khi unit test contract chưa pass.
