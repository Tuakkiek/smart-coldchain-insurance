# Render + Wokwi: kiểm tra nhiệt độ đầu cuối

`render.yaml` triển khai **backend** trên Render với `APP_ENV=production`. Ở chế độ này API chỉ nhận telemetry có chữ ký. Sketch `device/cold_chain_device/cold_chain_device.ino` dùng ESP32 + DHT22, ký ECDSA P-256 và gửi HTTPS trực tiếp tới Render.

## 1. Chuẩn bị MySQL

Backend dùng MySQL 8+ bên ngoài Render. `backend/.env` là file **cục bộ**, không được commit và không được upload nguyên file lên Render. Cấu hình `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` để kết nối cùng database sẽ dùng trên Render. Nếu dùng Aiven CA, giữ chứng chỉ cục bộ trong `backend/certs/` và `MYSQL_SSL_CA` trỏ tới file đó.

Trên database mới, từ PowerShell ở gốc repo:

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.cli init-db
cd ..
```

Với database đã có dữ liệu, sao lưu trước rồi chạy `python -m app.cli upgrade-db` từ `backend/`. Việc này áp dụng migration cho các bảng thiết bị/chữ ký. Không chạy lại công cụ chuyển SQLite sang MySQL trên database đã có dữ liệu.

## 2. Tạo dịch vụ trên Render

1. Đưa các thay đổi cần thiết lên Git remote của bạn. Tạo **Blueprint** từ repo; Render đọc `render.yaml` ở gốc repo và tạo Web Service với `rootDir: backend`. Hoặc tạo Web Service thủ công: Python 3, root directory `backend`, build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health path `/api/v1/health`.
2. Trong Render Environment, điền các biến `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `ADMIN_API_KEY`. Tạo `ADMIN_API_KEY` ngẫu nhiên, dài và giữ riêng; không đưa vào sketch hay Git. Blueprint yêu cầu nhập các giá trị `sync: false` khi tạo service.
3. Nếu MySQL dùng CA, thêm **Secret File** tên `mysql-ca.pem` với nội dung chứng chỉ CA và thêm env var `MYSQL_SSL_CA=/etc/secrets/mysql-ca.pem`. Đường dẫn Windows ở `backend/.env` không dùng được trên Render.
4. `APP_ENV=production` và `BLOCKCHAIN_ENABLED=false` đã ở trong Blueprint. Chỉ bật blockchain sau khi có RPC, contract, ABI và key đúng trên môi trường Render. Nếu có frontend public, đặt `CORS_ORIGINS` thành origin của frontend, ví dụ `https://example.com` (không có `/api/v1`).
5. Sau deploy, mở `https://<service>.onrender.com/api/v1/health`. Health chỉ xác nhận app đang chạy; để kiểm tra MySQL, mở `https://<service>.onrender.com/api/v1/shipments` và mong đợi HTTP 200.

Nếu MySQL giới hạn IP nguồn, cho phép kết nối từ Render theo cấu hình provider. Không có database kết nối được thì API lô hàng/telemetry sẽ lỗi dù health trả 200.

## 3. Chạy ESP32 thật hoặc Wokwi

1. Sao chép `device/cold_chain_device/config.example.h` thành `device/cold_chain_device/config.h` (Git bỏ qua file đích). Điền Wi-Fi, URL, identity, private key mới và CA xác thực chứng chỉ của Backend. Đăng ký public key tương ứng qua API admin. Xem `device/README.md`.
2. Nối DHT22: `VCC -> 3V3`, `DATA/SDA -> GPIO27`, `GND -> GND`. Sơ đồ Wokwi tương ứng là `device/diagram.json`.
3. Cài thư viện **DHT sensor library for ESPx**, biên dịch và upload bằng Arduino IDE hoặc dán sketch vào Wokwi. Mở Serial Monitor 115200.
4. Khi thành công, Serial Monitor báo `HTTP 201`, `signature_status: "VALID"`, `duplicate: false`. Kiểm tra `GET .../shipments/<UUID>` để xem `latest_telemetry`.

Sketch dùng `WiFiClientSecure.setCACert()`; thiếu CA hoặc CA không khớp sẽ chặn gửi. Key và mật khẩu từng có trong Git history cần được thay và key cũ cần bị revoke trước khi triển khai.

## Lỗi thường gặp

| Triệu chứng | Kiểm tra |
|---|---|
| `HTTP 503 ADMIN_NOT_CONFIGURED` khi cấp thiết bị | `ADMIN_API_KEY` chưa được đặt trên Render. |
| `HTTP 401 INVALID_SIGNATURE` | Kiểm tra `config.h` và public key đã đăng ký cùng device ID/key ID. |
| `HTTP 403 DEVICE_NOT_ASSIGNED` | Device và shipment ID trong `config.h` không khớp assignment. |
| `HTTP 409 SEQUENCE_REPLAY` | Wokwi mất NVS; cấp thiết bị mới. |
| `HTTP 422` | Xem JSON lỗi trong Serial; kiểm tra UUID, timestamp UTC, giá trị cảm biến. |
| `HTTP 500` ở `/shipments` | Kiểm tra Render logs, MySQL credentials, quyền tạo/đọc bảng và CA secret file. |
| Timeout lần gửi đầu | Render Free có thể khởi động chậm; chờ rồi gửi mẫu tiếp theo. |

Tài liệu nền: [Render FastAPI](https://render.com/docs/deploy-fastapi), [Render Blueprint](https://render.com/docs/blueprint-spec), [Render Secret Files](https://render.com/docs/configure-environment-variables), [Wokwi VS Code/PlatformIO](https://docs.wokwi.com/vscode/platformio), [Wokwi ESP32 Wi-Fi](https://docs.wokwi.com/guides/esp32-wifi).
