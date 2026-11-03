# Backend — MySQL

FastAPI + SQLAlchemy, dùng **MySQL** cho dữ liệu ứng dụng. REST contract: [api-v1.md](../docs/contracts/api-v1.md). Python 3.10+ và MySQL 8.0+.

## Cấu hình (Git Bash trên Windows)

```bash
cd /d/block_chain/smart-coldchain-insurance/backend
py -3 -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt
```

Nếu chưa có `backend/.env`, sao chép `.env.example` thành `.env`, rồi điền `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` của tài khoản ứng dụng. Không ghi mật khẩu vào Git. Backend tạo URL MySQL bằng `URL.create`, nên mật khẩu chứa `@`, `/` hay `:` không cần mã hóa thủ công. `DATABASE_URL` cũ của SQLite không còn được dùng. `.env` được Git bỏ qua.

Kết nối MySQL luôn yêu cầu TLS. Cấu hình mặc định tương đương `ssl-mode=REQUIRED` trong URI Aiven: dữ liệu được mã hóa nhưng chưa xác minh danh tính máy chủ. Nếu tải CA certificate của dự án từ Aiven, đặt đường dẫn file vào `MYSQL_SSL_CA` trong `.env` để bật kiểm tra certificate và hostname.

Database phải tồn tại và tài khoản ứng dụng phải có quyền tạo bảng, đọc/ghi dữ liệu. Nếu tài khoản có quyền tạo database, chạy:

```bash
./.venv/Scripts/python.exe -m app.cli create-db
```

Lệnh này dùng `CREATE DATABASE IF NOT EXISTS`, `utf8mb4`. Nếu tài khoản thiếu quyền, quản trị viên có thể tạo database riêng và cấp quyền trên database đó; Backend không cần quyền trên các database khác.

## Chuyển dữ liệu SQLite hiện có

Trong workspace này, dữ liệu từ `backend/coldchain.db` đã được chuyển sang **Aiven MySQL `defaultdb`** và kiểm tra từng cột: **3 lô hàng, 5 mẫu telemetry, 1 sự kiện**. File SQLite cũ được giữ làm nguồn đối chiếu/backup, còn API chỉ dùng MySQL được cấu hình trong `.env`. Không chạy lệnh chuyển lần nữa trên database đích đã có dữ liệu.

Với một bản sao mới và MySQL đích **trống**, chạy từ `backend/`:

```bash
./.venv/Scripts/python.exe -m app.migrate_sqlite_to_mysql --check-source
./.venv/Scripts/python.exe -m app.migrate_sqlite_to_mysql
./.venv/Scripts/python.exe -m app.migrate_sqlite_to_mysql --verify
```

Công cụ giữ nguyên UUID, timestamp, trạng thái, telemetry và event; từ chối đích đã có dữ liệu, không xóa nguồn và ghi MySQL trong một transaction. `--verify` so sánh tất cả cột. Bản chuyển thử ban đầu dùng `FLOAT`/`DATETIME` thiếu độ chính xác; đã sửa trên MySQL cục bộ bằng `--repair-precision`. Bản cài mới tạo ngay cột `DOUBLE` và `DATETIME(6)`.

Nếu không chuyển dữ liệu cũ mà bắt đầu database mới:

```bash
./.venv/Scripts/python.exe -m app.cli init-db
./.venv/Scripts/python.exe -m app.cli seed-demo
```

`seed-demo` thêm 3 lô hàng mẫu và có thể chạy lại mà không tạo lô trùng. Không seed trước khi chuyển dữ liệu SQLite vào đích trống. Phase 2 chưa có migration schema tổng quát cho các lần đổi model sau này.

## Chạy API

```bash
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload
```

- Health: <http://127.0.0.1:8000/api/v1/health>
- Swagger: <http://127.0.0.1:8000/docs>
- OpenAPI JSON: <http://127.0.0.1:8000/openapi.json>

Nếu ESP32 truy cập từ LAN, chạy Uvicorn với `--host 0.0.0.0`, dùng IP LAN của máy trong `device/esp32/config.h` và cho phép cổng 8000 trên firewall. Không đưa dịch vụ HTTP phát triển trực tiếp ra Internet.

Ví dụ gửi telemetry bằng bộ giả lập từ thư mục gốc repo:

```bash
py -3 device/simulator/send_telemetry.py --shipment-id <UUID_LO_HANG> --mode sequence --normal-temp 5 --breach-temp 9.2 --normal-count 2 --breach-count 3
```

Endpoint hiện có: `GET /api/v1/health`, `POST/GET /api/v1/shipments`, `GET /api/v1/shipments/{id}`, `POST/GET /api/v1/shipments/{id}/telemetry`, `GET /api/v1/shipments/{id}/events`. Tọa độ vẫn là mô phỏng ở Backend. Việc tự đánh giá vi phạm 15 phút, endpoint demo virtual clock và Blockchain thuộc các phase sau.

## Kiểm thử

```bash
./.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
./.venv/Scripts/python.exe -m pytest tests -q
RUN_MYSQL_TESTS=1 ./.venv/Scripts/python.exe -m pytest tests/test_mysql_live.py -q
```

Các API unit tests dùng SQLite tạm để chạy độc lập và kiểm tra logic; test cuối là smoke test chỉ đọc database MySQL cấu hình trong `.env`.
