# Backend Phase 2

FastAPI + SQLAlchemy, dùng SQLite khi phát triển và giữ schema có thể chuyển sang PostgreSQL. REST contract: [api-v1.md](../docs/contracts/api-v1.md). Python 3.10+.

## Cài đặt và chạy (PowerShell)

Chạy các lệnh sau từ thư mục `backend/`:

```powershell
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.venv\Scripts\python.exe -m app.cli init-db
.venv\Scripts\python.exe -m app.cli seed-demo
.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

`init-db` là lệnh tạo bảng. `seed-demo` tự tạo bảng nếu cần, thêm 3 lô hàng (một lô chưa có telemetry, một lô bình thường, một lô có event cảnh báo mẫu); chạy lại không tạo lô trùng. SQLite mặc định nằm ở `backend/coldchain.db` khi chạy từ thư mục này. `.env` và file database được Git bỏ qua. Để dùng PostgreSQL sau này, đổi `DATABASE_URL` sang URL SQLAlchemy phù hợp và cài driver tương ứng; Phase 2 chưa có migration cho database đã tồn tại.

- Health: <http://127.0.0.1:8000/api/v1/health>
- Swagger/OpenAPI: <http://127.0.0.1:8000/docs>
- OpenAPI JSON: <http://127.0.0.1:8000/openapi.json>

Ví dụ tạo lô hàng trong Swagger hoặc qua PowerShell:

```powershell
$body = @{
  code = 'SHIP-001'; cargo_type = 'vaccine'
  origin = @{ name = 'Kho A'; latitude = 10.03; longitude = 105.77 }
  destination = @{ name = 'Điểm B'; latitude = 10.05; longitude = 105.81 }
  temp_min_c = 2.0; temp_max_c = 8.0
  violation_duration_minutes = 15; insured_amount_vnd = 10000000
} | ConvertTo-Json -Depth 3
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/shipments -ContentType application/json -Body $body
```

Lấy `id` trong response rồi chạy bộ giả lập từ thư mục gốc repo:

```powershell
py -3 device/simulator/send_telemetry.py --shipment-id <UUID_LO_HANG> --mode sequence --normal-temp 5 --breach-temp 9.2 --normal-count 2 --breach-count 3
```

ESP32 phải dùng IP LAN của máy chạy Backend, không dùng `localhost`. Nếu truy cập từ thiết bị khác, chạy Uvicorn với `--host 0.0.0.0` trong mạng phát triển tin cậy và cho phép cổng 8000 trên firewall.

## Endpoint và ranh giới Phase 2

Đã có `GET /api/v1/health`, `POST/GET /api/v1/shipments`, `GET /api/v1/shipments/{id}`, `POST/GET /api/v1/shipments/{id}/telemetry`, `GET /api/v1/shipments/{id}/events`. Telemetry chỉ nhận `device_id`, `temperature_c`, `humidity_pct`, `recorded_at` tùy chọn; Backend tạo `received_at` và vị trí mô phỏng. Vị trí hiện dùng nội suy thẳng theo số mẫu (20 mẫu đến đích), mang nhãn `backend_simulated`; Phase 3 có thể thay quy tắc di chuyển mà giữ response schema.

Phase 2 **chưa** tự đánh giá vi phạm 15 phút, phát sinh event từ telemetry hay gọi Blockchain. Endpoint demo có virtual clock thuộc Phase 4 nên chưa được bật. `seed-demo` thêm một event mẫu chỉ để dựng UI. `GET /events` của lô hàng tạo mới trả danh sách rỗng cho tới khi Phase 4 triển khai nghiệp vụ.

## Kiểm thử

```powershell
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.venv\Scripts\python.exe -m pytest tests -q
```

Các test dùng database SQLite tạm và FastAPI TestClient; không ghi vào `coldchain.db` đang dùng để phát triển.
