# ROADMAP THÀNH VIÊN 3 — Frontend, Dashboard và Kiểm thử giao diện

> Dự án: `smart-coldchain-insurance`  
> Vai trò: **Owner của `frontend/`**.  
> Mục tiêu: Xây dựng Dashboard quan sát lô hàng lạnh, dữ liệu nhiệt độ/độ ẩm, vị trí mô phỏng, cảnh báo vi phạm và trạng thái bảo hiểm/Blockchain.

---

## 1. Phạm vi và ranh giới sở hữu

### Bạn chịu trách nhiệm

- Frontend web responsive.
- Gọi REST API Backend và hiển thị dữ liệu, trạng thái loading/error/empty.
- Bản đồ hiển thị tuyến đường và marker vị trí mô phỏng do Backend trả về.
- Biểu đồ telemetry và timeline sự kiện.
- Các nút/kịch bản demo gọi endpoint Backend được công bố.
- Kiểm thử UI và checklist trình diễn.

### Bạn không được sửa

- `backend/`, `device/` hoặc API contract (Member 1 sở hữu).
- `blockchain/` và ABI contract (Member 2 sở hữu).
- Không gọi trực tiếp ESP32 hoặc RPC Blockchain từ trình duyệt.
- Không tự tạo/ước đoán dữ liệu production khi API trả lỗi; dữ liệu mock chỉ dùng khi bật rõ chế độ development/mock.

### Thư mục được phép sở hữu

```text
frontend/
  src/
    api/
    components/
    features/
      dashboard/
      shipments/
      telemetry/
      events/
    pages/
    types/
    mocks/
  public/
  tests/
  .env.example
  README.md
```

## 2. Quy ước công nghệ và giao tiếp

- Đề xuất: React + Vite + TypeScript.
- Bản đồ: Leaflet với nền bản đồ phù hợp cho demo; không cần GPS module.
- Gọi REST API qua một lớp duy nhất trong `src/api/`; không rải `fetch()` tùy ý trong từng component.
- Base URL đọc từ `VITE_API_BASE_URL`, ví dụ `http://localhost:8000`.
- Kiểm tra `docs/contracts/api-v1.md` do Member 1 cung cấp; tên field trong TypeScript phải trùng API.
- Dữ liệu vị trí phải có nhãn **“Vị trí mô phỏng từ Backend”** khi `location_source === "backend_simulated"`. Không ghi “GPS trực tiếp”.
- Giao diện sử dụng trạng thái do Backend trả về; không tự kết luận bảo hiểm đã được thanh toán chỉ vì nhiệt độ vượt ngưỡng.
- Frontend chỉ hiển thị `transaction_hash`/trạng thái chain do Backend trả về; không giữ private key.

## 3. Màn hình MVP

### 3.1 Dashboard tổng quan

- Tổng số lô hàng.
- Lô hàng đang vận chuyển.
- Lô hàng đang vi phạm nhiệt độ.
- Lô hàng đã kích hoạt quy trình bảo hiểm.
- Danh sách cảnh báo gần nhất.

Không tạo số liệu giả cố định trong chế độ kết nối thật. Khi API chưa sẵn sàng, dùng fixtures có nhãn `MOCK DATA`.

### 3.2 Danh sách lô hàng

- Mã lô hàng, loại hàng, trạng thái, nhiệt độ gần nhất, tiến độ tuyến và trạng thái bảo hiểm.
- Tìm kiếm/lọc theo mã lô hàng hoặc trạng thái.
- Có trạng thái chưa có dữ liệu và lỗi API.

### 3.3 Chi tiết lô hàng

- Thông tin nguồn/đích, loại hàng và khoảng nhiệt độ cho phép.
- Nhiệt độ/độ ẩm hiện tại cùng thời điểm cập nhật.
- Biểu đồ lịch sử nhiệt độ/độ ẩm.
- Bản đồ tuyến mô phỏng với marker hiện tại và tiến độ.
- Timeline: bắt đầu vi phạm, đủ điều kiện kích hoạt, gửi giao dịch và kết quả giao dịch.
- Số tiền bảo hiểm theo VND ở Backend và trạng thái/token payout demo trên Blockchain phải hiển thị phân biệt; không quy đổi token demo thành VND nếu không có tỷ giá/logic được thống nhất.

### 3.4 Khu vực demo

- Chọn lô hàng mẫu.
- Nút “Kịch bản bình thường”.
- Nút “Mô phỏng nhiệt độ vượt ngưỡng”.
- Trạng thái chạy kịch bản và kết quả trả về.
- Chỉ hiển thị các nút này khi Backend chạy ở development/demo; không để lẫn vào giao diện production.

## 4. Roadmap theo Phase

### Phase 0 — Chốt API và dựng skeleton

**Việc cần làm**

1. Tạo nhánh `feat/frontend-dashboard`.
2. Đọc `docs/contracts/api-v1.md`; yêu cầu Member 1 xác nhận schema trước khi tạo TypeScript types.
3. Khởi tạo React + Vite + TypeScript và cấu trúc thư mục `api/`, `features/`, `components/`, `pages/`, `types/`, `mocks/`.
4. Tạo `.env.example` với `VITE_API_BASE_URL`.
5. Thiết lập routing cơ bản và layout responsive.
6. Viết `frontend/README.md` hướng dẫn cài đặt và chạy.

**Tiêu chí nghiệm thu**

- Project chạy được từ lệnh trong README.
- Không commit `.env` có thông tin bí mật.
- Các thành viên khác có thể chạy frontend dù Backend chưa hoàn thiện.

### Phase 1 — Thiết kế kiểu dữ liệu và mock API

**Việc cần làm**

1. Tạo TypeScript types cho `Shipment`, `Telemetry`, `Location`, `ShipmentEvent`, `InsuranceStatus` và `BlockchainStatus` dựa trên API contract.
2. Viết một lớp API client duy nhất, có base URL và xử lý lỗi.
3. Tạo fixtures cho ít nhất 3 tình huống: bình thường, đang vi phạm, đã kích hoạt bảo hiểm.
4. Tạo mock adapter có thể bật/tắt bằng biến môi trường rõ ràng; không tự fallback sang mock nếu API thật lỗi mà không báo cho người dùng.
5. Gửi ảnh/chụp màn hình wireframe cho cả nhóm để chốt trước khi làm chi tiết.

**Tiêu chí nghiệm thu**

- UI phát triển được trước khi Backend hoàn chỉnh.
- Kiểu dữ liệu phù hợp với API contract và không tự đặt tên field riêng.

### Phase 2 — Dashboard và danh sách lô hàng

**Việc cần làm**

1. Xây layout chung, navigation, thanh trạng thái kết nối và bộ lọc.
2. Xây thẻ tổng quan và bảng/danh sách lô hàng.
3. Xây trạng thái loading, empty, error và retry.
4. Tách component để không nhồi toàn bộ Dashboard vào một file lớn.
5. Dùng nhãn trạng thái và màu sắc dễ phân biệt; không phụ thuộc chỉ vào màu để biểu đạt cảnh báo.

**Tiêu chí nghiệm thu**

- Dữ liệu mock thể hiện đúng ít nhất 3 trạng thái nghiệp vụ.
- Layout sử dụng được ở desktop và màn hình điện thoại.

### Phase 3 — Chi tiết lô hàng, biểu đồ và bản đồ mô phỏng

**Việc cần làm**

1. Tạo trang chi tiết lấy dữ liệu từ API theo `shipment_id`.
2. Vẽ lịch sử nhiệt độ/độ ẩm từ telemetry Backend trả về.
3. Tích hợp Leaflet và vẽ đường từ điểm đầu đến điểm cuối cùng marker vị trí hiện tại.
4. Hiển thị `location_source`; nếu là `backend_simulated`, gắn nhãn “Vị trí mô phỏng từ Backend”.
5. Hiển thị `progress_pct`, thời điểm cập nhật cuối và trạng thái dữ liệu.
6. Tạo timeline sự kiện và hiển thị transaction hash dưới dạng liên kết/copy nếu Backend có trả về.
7. Xử lý trường hợp thiếu tọa độ, thiếu telemetry hoặc API trả về giao dịch pending/failed.

**Tiêu chí nghiệm thu**

- Marker được đặt từ tọa độ API, không tự sinh tọa độ trong Frontend.
- Màn hình không báo “đã bồi thường” nếu transaction chưa thành công.
- Có cách biểu diễn trạng thái chưa có vị trí và mất dữ liệu.

### Phase 4 — Điều khiển kịch bản demo

**Việc cần làm**

1. Tạo khu vực demo có chọn lô hàng và hai kịch bản `normal`/`temperature_breach`.
2. Gọi đúng endpoint demo do Member 1 cung cấp; không tự gửi payload telemetry giả trực tiếp vào database.
3. Khóa nút khi kịch bản đang chạy, hiển thị lỗi có thể đọc được và cho phép chạy lại.
4. Hiển thị chuỗi thay đổi sau kịch bản: telemetry → cảnh báo → đủ điều kiện bảo hiểm → giao dịch Blockchain.
5. Gắn nhãn “Mô phỏng” cho toàn bộ kịch bản demo.

**Tiêu chí nghiệm thu**

- Người trình bày có thể chạy kịch bản mà không cần chỉnh database thủ công.
- Khi Backend tắt endpoint demo, UI không giả vờ kịch bản chạy thành công.

### Phase 5 — Tích hợp API thật và đồng bộ trạng thái

**Việc cần làm**

1. Đổi dần mock adapter sang Backend API thật; giữ mock chỉ cho phát triển độc lập.
2. Kiểm tra tất cả endpoint, query param và field theo `api-v1.md`/OpenAPI.
3. Dùng polling có chu kỳ hợp lý để cập nhật dữ liệu; dọn interval khi component unmount, tránh tạo nhiều vòng polling.
4. Cập nhật bản đồ/biểu đồ theo dữ liệu mới nhưng tránh nhảy giao diện hoặc reset bộ lọc không cần thiết.
5. Hiển thị trạng thái `BLOCKCHAIN_PENDING`, `SUCCESS` hoặc `FAILED` đúng với response Backend.
6. Báo Member 1 mọi field thiếu/sai qua issue thay vì tự sửa backend hoặc giấu lỗi bằng fallback.

**Tiêu chí nghiệm thu**

- Frontend hoạt động với API thật mà không cần chỉnh code để đổi địa chỉ server.
- Mọi lỗi mạng có thông báo rõ và có thể thử lại.

### Phase 6 — Kiểm thử UI và chuẩn bị bảo vệ/demo

**Việc cần làm**

1. Kiểm tra luồng bình thường và luồng nhiệt độ vượt ngưỡng.
2. Kiểm tra màn hình khi chưa có lô hàng, chưa có telemetry, Backend offline và Blockchain pending/failed.
3. Kiểm tra kích thước desktop/mobile và trạng thái loading.
4. Kiểm tra không có tọa độ hoặc transaction hash bị hard-code trong chế độ API thật.
5. Chuẩn bị checklist trình diễn 3–5 phút và ảnh chụp giao diện khi cần đưa vào báo cáo.
6. Rà console/network để loại bỏ lỗi JavaScript và request trùng.

**Tiêu chí nghiệm thu**

- Người khác có thể chạy frontend theo README.
- Luồng demo thể hiện rõ dữ liệu cảm biến, vị trí mô phỏng, sự kiện vi phạm và kết quả Blockchain.
- Không dùng từ ngữ khiến người xem nhầm vị trí mô phỏng là GPS thực hoặc token demo là tiền thật.

## 5. Phụ thuộc và bàn giao

- **Nhận từ Member 1:** API contract, OpenAPI, seed data, URL Backend, endpoint demo và giải thích các trạng thái nghiệp vụ.
- **Không cần gọi Member 2 trực tiếp:** mọi trạng thái Blockchain được Frontend lấy từ Backend.
- **Gửi cho Member 1:** danh sách field thiếu, lỗi schema và phản hồi API cần điều chỉnh.
- **Gửi cho cả nhóm:** ảnh wireframe, hướng dẫn chạy, kịch bản demo và checklist UI.

## 6. Quy tắc làm việc để không xung đột

- Chỉ Member 3 sửa `frontend/`.
- Dùng nhánh `feat/frontend-dashboard`; không commit thẳng vào `main`.
- Nếu API chưa sẵn sàng, dùng mock dựa trên schema đã chốt; không tự đổi schema để thuận tiện cho giao diện.
- Nếu cần API mới, tạo issue mô tả mục tiêu, request/response mong muốn và lý do; Member 1 là người cập nhật API contract.
- Không đặt private key, seed phrase hoặc logic ký giao dịch trong Frontend.
