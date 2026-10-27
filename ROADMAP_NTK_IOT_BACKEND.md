# ROADMAP THÀNH VIÊN 1 — IoT, Backend và Điều phối hệ thống

> Dự án: `smart-coldchain-insurance`  
> Vai trò: **Owner của `device/` và `backend/`**, đồng thời là đầu mối chốt hợp đồng API dùng chung.  
> Mục tiêu: Nhận dữ liệu nhiệt độ/độ ẩm từ ESP32, tạo tọa độ vận chuyển mô phỏng ở Backend, đánh giá vi phạm điều kiện bảo quản và gọi Smart Contract thông qua adapter.

---

## 1. Phạm vi và ranh giới sở hữu

### Bạn chịu trách nhiệm

- Firmware ESP32 Wi-Fi gửi nhiệt độ/độ ẩm lên API.
- Backend REST API, cơ sở dữ liệu, xác thực dữ liệu đầu vào và luật nghiệp vụ.
- Sinh tọa độ mô phỏng ở Backend; **không yêu cầu cảm biến GPS và không nhận tọa độ GPS từ ESP32**.
- Theo dõi thời gian nhiệt độ nằm ngoài khoảng cho phép.
- Gọi Blockchain qua một adapter riêng sau khi Member 2 bàn giao ABI và địa chỉ contract.
- Tạo tài liệu API và dữ liệu mẫu để Member 2, Member 3 tích hợp.

### Bạn không được tự ý sửa

- Thư mục `blockchain/` do Member 2 sở hữu.
- Thư mục `frontend/` do Member 3 sở hữu.
- Giao diện và tên trường API sau khi đã chốt ở Phase 1 mà chưa báo cả nhóm.

### Thư mục được phép sở hữu

```text
device/
  esp32/
    cold_chain_device.ino
    config.example.h
  simulator/
    send_telemetry.py
backend/
  app/
    api/
    core/
    models/
    schemas/
    services/
    integrations/
      blockchain_adapter.py
  tests/
docs/
  contracts/
    api-v1.md                 # Member 1 là người tạo và cập nhật
```

Các tên file trên là cấu trúc đề xuất; nếu cả nhóm đã tạo cấu trúc khác, hãy thống nhất trước khi đổi tên.

## 2. Quy ước chung bắt buộc

- Backend: **FastAPI + Python**; database phát triển ban đầu dùng SQLite, thiết kế model để có thể chuyển PostgreSQL.
- Thiết bị: Arduino/C++ cho ESP32; cảm biến chỉ gửi `temperature_c` và `humidity_pct` cùng `device_id`.
- Frontend chỉ gọi REST API của Backend, không gọi trực tiếp ESP32 và không tự gửi giao dịch Blockchain.
- Blockchain chỉ nhận sự kiện vi phạm đã được Backend đánh giá; không ghi từng mẫu cảm biến lên chain.
- Thời gian hệ thống (`received_at`) do Backend tạo là nguồn chính để tính khoảng thời gian vi phạm thực tế. `recorded_at` từ thiết bị chỉ để tham khảo/đối chiếu.
- Tọa độ phải được đánh dấu `location_source: "backend_simulated"`. Không được hiển thị như GPS thực.
- Mặc định chính sách demo: nhiệt độ nằm ngoài `[temp_min_c, temp_max_c]` liên tục ít nhất **15 phút** mới tạo sự kiện đủ điều kiện. Khoảng nhiệt độ phải cấu hình theo lô hàng, không hard-code một giá trị cho mọi loại hàng.
- Nếu cảm biến mất dữ liệu quá lâu, không được tự suy diễn rằng nhiệt độ vẫn vi phạm; phải thể hiện trạng thái mất tín hiệu/không đủ dữ liệu theo cấu hình.
- Mọi thay đổi API phải được ghi trong `docs/contracts/api-v1.md` và thông báo trước cho hai thành viên còn lại.

## 3. Hợp đồng API dùng chung — chốt tại Phase 1

Member 1 tạo `docs/contracts/api-v1.md` và ghi chính xác request/response sau khi triển khai. Dùng các trường dưới đây làm chuẩn ban đầu.

### 3.1 Tạo lô hàng

`POST /api/v1/shipments`

```json
{
  "code": "SHIP-001",
  "cargo_type": "vaccine",
  "origin": {"name": "Kho A", "latitude": 10.030, "longitude": 105.770},
  "destination": {"name": "Điểm nhận B", "latitude": 10.050, "longitude": 105.810},
  "temp_min_c": 2.0,
  "temp_max_c": 8.0,
  "violation_duration_minutes": 15,
  "insured_amount_vnd": 10000000
}
```

Backend kiểm tra dữ liệu hợp lệ, lưu lô hàng và khởi tạo tuyến di chuyển mô phỏng từ tọa độ đầu đến tọa độ cuối. Với MVP, có thể nội suy tuyến đường đơn giản; không tuyên bố đó là tuyến đường giao thông thực.

### 3.2 Nhận telemetry từ ESP32

`POST /api/v1/shipments/{shipment_id}/telemetry`

```json
{
  "device_id": "ESP32-01",
  "temperature_c": 9.2,
  "humidity_pct": 72.5,
  "recorded_at": "2026-10-27T09:00:00Z"
}
```

`recorded_at` có thể bỏ qua. Backend tự thêm `received_at`, tọa độ mô phỏng và `location_source`. Thiết bị không được gửi trường GPS.

### 3.3 Các endpoint tối thiểu

| Method | Endpoint | Mục đích |
|---|---|---|
| `GET` | `/api/v1/health` | Kiểm tra Backend còn hoạt động |
| `POST` | `/api/v1/shipments` | Tạo lô hàng và chính sách demo |
| `GET` | `/api/v1/shipments` | Danh sách lô hàng |
| `GET` | `/api/v1/shipments/{id}` | Chi tiết, trạng thái mới nhất, tọa độ mô phỏng |
| `GET` | `/api/v1/shipments/{id}/telemetry` | Lịch sử nhiệt độ/độ ẩm/vị trí |
| `GET` | `/api/v1/shipments/{id}/events` | Lịch sử cảnh báo và sự kiện bảo hiểm |
| `POST` | `/api/v1/shipments/{id}/telemetry` | Nhận một mẫu cảm biến |
| `POST` | `/api/v1/demo/shipments/{id}/scenario` | Chạy kịch bản demo; chỉ bật ở môi trường development |

Endpoint demo nhận `{"scenario":"normal"}` hoặc `{"scenario":"temperature_breach"}`. Kịch bản demo phải gọi cùng service đánh giá nghiệp vụ như dữ liệu thật, nhưng được phép dùng đồng hồ mô phỏng để trình diễn 15 phút trong thời gian ngắn. Không bật endpoint này ở production.

### 3.4 Trường response quan trọng

Response chi tiết lô hàng cần có tối thiểu:

- `id`, `code`, `cargo_type`, `status`
- `temp_min_c`, `temp_max_c`, `violation_duration_minutes`
- `latest_telemetry`: nhiệt độ, độ ẩm, `received_at`
- `location`: `latitude`, `longitude`, `location_source`, `progress_pct`
- `insurance`: `insured_amount_vnd`, `status`, `payout_status`
- `blockchain`: `network`, `transaction_hash`, `confirmation_status` nếu đã có giao dịch

Tên field thực tế phải được chốt trong `api-v1.md`; Member 3 dùng đúng tên đó, không tự đặt field thay thế.

## 4. Roadmap theo Phase

### Phase 0 — Chốt hợp đồng và dựng khung (cả nhóm cùng thống nhất)

**Việc cần làm**

1. Tạo repo và các thư mục gốc: `device/`, `backend/`, `blockchain/`, `frontend/`, `docs/`.
2. Thống nhất stack, tên field API, định dạng thời gian ISO 8601 UTC và quy ước ID lô hàng.
3. Tạo nhánh riêng: `feat/iot-backend`.
4. Tạo `docs/contracts/api-v1.md` và gửi link/nội dung cho hai thành viên còn lại.
5. Chốt cách biểu diễn định danh lô hàng trên Blockchain: chuỗi `shipment_id` được Member 2 hash thành `bytes32` theo một quy tắc duy nhất; ghi quy tắc chính xác trong tài liệu tích hợp của Member 2.

**Điều kiện hoàn thành**

- Member 2 biết dữ liệu Backend sẽ gửi cho adapter.
- Member 3 biết response nào cần dựng trên Dashboard.
- Không ai tự đổi API sau khi Phase này kết thúc.

### Phase 1 — Firmware ESP32 và dữ liệu giả lập đầu vào

**Việc cần làm**

1. Viết firmware đọc nhiệt độ/độ ẩm từ cảm biến đang có.
2. Kết nối Wi-Fi bằng cấu hình riêng; không commit mật khẩu Wi-Fi/API key vào Git.
3. Gửi JSON định kỳ tới endpoint telemetry.
4. Thiết lập timeout, retry có giới hạn và log lỗi kết nối.
5. Kiểm tra trường hợp cảm biến trả `NaN`, giá trị ngoài phạm vi hoặc mất kết nối.
6. Viết `device/simulator/send_telemetry.py` để giả lập ESP32 khi không có phần cứng; cho phép nhập nhiệt độ bình thường và nhiệt độ vượt ngưỡng.

**Tiêu chí nghiệm thu**

- Backend nhận được nhiều mẫu dữ liệu liên tiếp.
- Thiết bị không gửi GPS.
- Không để chương trình treo vô hạn khi Wi-Fi/API lỗi.
- Có hướng dẫn cấu hình và chạy trong `device/README.md`.

### Phase 2 — Backend nền tảng và database

**Việc cần làm**

1. Tạo FastAPI app, cấu hình `.env`, logging và `/api/v1/health`.
2. Tạo model/schema/service cho `Shipment`, `Telemetry`, `ShipmentEvent` và trạng thái bảo hiểm.
3. Thêm validation: nhiệt độ/độ ẩm là số hữu hạn; min phải nhỏ hơn max; thời lượng vi phạm và số tiền bảo hiểm không âm.
4. Triển khai tạo lô hàng, danh sách, chi tiết, lịch sử telemetry và lịch sử sự kiện.
5. Tạo seed data cho 2–3 lô hàng để Member 3 dựng UI.
6. Cấu hình Swagger/OpenAPI tại `/docs`.

**Tiêu chí nghiệm thu**

- Tạo và truy vấn được lô hàng.
- API trả lỗi 4xx dễ hiểu khi input sai; không trả stack trace cho người dùng.
- Database khởi tạo theo một lệnh được ghi trong README.

### Phase 3 — Mô phỏng vị trí ở Backend

**Việc cần làm**

1. Tạo service độc lập, ví dụ `route_simulator.py`.
2. Mỗi lô hàng có điểm đầu/cuối đã lưu; Backend nội suy điểm hiện tại theo thời gian hoặc số mẫu telemetry được nhận.
3. Đảm bảo vị trí có tính lặp lại và có thể kiểm thử; cùng đầu vào và cùng cấu hình phải cho kết quả có thể dự đoán.
4. Thêm `location_source = "backend_simulated"` và `progress_pct`.
5. Không cho client override tọa độ trong payload telemetry.
6. Nếu chưa có telemetry, trả vị trí/trạng thái chưa khởi hành thay vì tự bịa một điểm cập nhật mới.

**Tiêu chí nghiệm thu**

- Tọa độ thay đổi dọc theo tuyến mô phỏng từ điểm đầu đến điểm cuối.
- Frontend nhận đủ latitude/longitude để đặt marker trên bản đồ.
- UI có thể ghi nhãn rõ ràng “Vị trí mô phỏng”.

### Phase 4 — Luật vi phạm nhiệt độ và tạo sự kiện bảo hiểm

**Việc cần làm**

1. So sánh mỗi mẫu với ngưỡng min/max của chính lô hàng.
2. Ghi nhận thời điểm bắt đầu vi phạm và số mẫu liên tục ngoài ngưỡng.
3. Chỉ đánh dấu đủ điều kiện khi vi phạm kéo dài liên tục đủ 15 phút theo chính sách; không tạo nhiều sự kiện trùng cho cùng một vi phạm.
4. Khi nhiệt độ trở lại ngưỡng trước thời hạn, kết thúc/reset khoảng vi phạm theo quy tắc đã ghi trong docs.
5. Xử lý khoảng trống dữ liệu: nếu mất kết nối quá ngưỡng cấu hình, không khẳng định vi phạm liên tục khi thiếu bằng chứng đo.
6. Tạo service đồng hồ có thể thay thế trong test; kịch bản demo dùng virtual clock để minh họa 15 phút trong vài giây/phút mà không thay đổi quy tắc production.
7. Tạo sự kiện rõ ràng: `TEMPERATURE_BREACH_STARTED`, `INSURANCE_TRIGGERED`, `SENSOR_DATA_GAP`.

**Tiêu chí nghiệm thu**

- Vi phạm ngắn hơn 15 phút không kích hoạt bảo hiểm.
- Vi phạm liên tục đủ 15 phút chỉ tạo một sự kiện đủ điều kiện.
- Nhiệt độ bình thường không kích hoạt bảo hiểm.
- Thiếu dữ liệu không tự động bị xem là hàng hỏng.

### Phase 5 — Tích hợp Blockchain từ Backend

**Việc cần làm**

1. Chỉ bắt đầu sau khi Member 2 bàn giao ABI, địa chỉ contract, chain ID, cách tạo `shipment_key`, địa chỉ oracle và script deploy.
2. Viết `backend/app/integrations/blockchain_adapter.py`; không đặt logic Web3 trực tiếp trong API route.
3. Thêm cấu hình RPC, private key demo và địa chỉ contract vào `.env`; chỉ dùng tài khoản local/testnet, không commit bí mật.
4. Khi service nghiệp vụ tạo sự kiện đủ điều kiện, gửi đúng một giao dịch `reportViolation` theo `shipment_key`.
5. Lưu transaction hash, thời gian gửi, trạng thái pending/success/failed và thông báo lỗi phù hợp.
6. Làm idempotency: retry API hoặc worker không được trả bảo hiểm hai lần; dùng unique event/policy key và kiểm tra trạng thái chain.
7. Nếu Blockchain tạm lỗi, vẫn lưu sự kiện off-chain với trạng thái `BLOCKCHAIN_PENDING` để có thể retry, không làm mất mẫu telemetry.

**Tiêu chí nghiệm thu**

- Có thể bật chế độ `BLOCKCHAIN_ENABLED=false` để chạy backend độc lập.
- Khi bật local chain, một vi phạm đủ điều kiện tạo một giao dịch thành công.
- Có thể tra transaction hash từ API.
- Lỗi RPC không làm mất dữ liệu cảm biến.

### Phase 6 — Kiểm thử đầu-cuối và đóng gói demo

**Việc cần làm**

1. Viết unit test cho route simulator và luật vi phạm.
2. Viết API test cho input hợp lệ/sai, lô hàng chưa có telemetry và sensor data gap.
3. Chạy kịch bản: dữ liệu bình thường → nhiệt độ vượt ngưỡng → đủ 15 phút mô phỏng → sự kiện bảo hiểm → transaction hash.
4. Viết `README.md` cấp repo hoặc phần Backend hướng dẫn khởi chạy theo thứ tự.
5. Chuẩn bị payload mẫu và cách demo khi ESP32 không kết nối được.
6. Kiểm tra `.env`, private key, Wi-Fi credentials không bị commit.

**Tiêu chí nghiệm thu**

- Kịch bản demo chạy lại được từ đầu bằng các bước rõ ràng.
- Có log giúp tìm lỗi ở API, sensor, route simulator và blockchain adapter.
- Tất cả endpoint đã công bố xuất hiện trong OpenAPI.

## 5. Thứ tự phụ thuộc với hai thành viên còn lại

- **Nhận từ Member 2:** ABI, địa chỉ deployment, chain ID, quy tắc `shipment_key`, quyền gọi oracle, trạng thái giao dịch và event schema.
- **Gửi cho Member 2:** `shipment_id`, thời điểm phát hiện, hash bằng chứng, payout/policy key theo hợp đồng API đã chốt.
- **Gửi cho Member 3:** `api-v1.md`, OpenAPI, seed data, endpoint demo, các trạng thái và ví dụ response.
- Khi API đổi, mở PR cập nhật tài liệu trước, báo cả nhóm, rồi mới đổi code.

## 6. Quy tắc làm việc để không đụng code nhau

- Chỉ Member 1 sửa `device/`, `backend/` và `docs/contracts/api-v1.md`.
- Commit nhỏ theo từng Phase; không đưa `.env`, token hay private key vào Git.
- Không tự sửa contract hoặc giao diện để “chữa cháy”; gửi yêu cầu qua issue/PR cho đúng owner.
- Mỗi Phase chỉ được xem là hoàn thành khi tiêu chí nghiệm thu tương ứng đã được chạy thử.
