# Render + Wokwi: kiểm tra nhiệt độ đầu cuối

`render.yaml` triển khai **backend** trên Render với `APP_ENV=production`. Ở chế độ này API chỉ nhận telemetry có chữ ký. Project `device/wokwi/` dùng ESP32 + DHT22, ký ECDSA P-256 và gửi HTTPS trực tiếp tới Render; không dùng payload HTTP không ký của firmware `device/esp32/` cũ.

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

## 3. Cấp danh tính cho Wokwi

Project Wokwi chạy **trong VS Code** với PlatformIO và extension Wokwi. Cài hai extension đó. Từ thư mục gốc repo, dùng Python của backend để tạo cặp khóa P-256, tạo lô demo và đăng ký public key qua API:

```powershell
.\backend\.venv\Scripts\python.exe device\wokwi\provision.py --base-url https://<service>.onrender.com
```

Chương trình hỏi `ADMIN_API_KEY` mà không hiện ký tự; **không** đưa key lên command line. Có thể dùng lô hàng đã có bằng `--shipment-id <UUID-v4>`; nếu bỏ qua, chương trình tạo lô demo riêng (ngưỡng 2–8°C). Nó tạo `device/wokwi/config.h`, `device-key.pem` và `device-key.pub.pem` tại máy bạn. Các file này được Git bỏ qua. Chỉ public key được gửi cho backend. Không chia sẻ project Wokwi đã build vì binary chứa private key demo.

Nếu cần cấp thiết bị mới, cất hoặc xóa ba file local trên, chạy lại `provision.py`; mỗi lần dùng ID thiết bị và khóa mới. Thiết bị cũ có thể revoke qua API quản trị. Sequence được lưu trên NVS của ESP32 mô phỏng; nếu xóa trạng thái flash của Wokwi nhưng giữ cùng danh tính, hãy cấp thiết bị mới để tránh `SEQUENCE_REPLAY`.

## 4. Chạy mô phỏng

1. Trong VS Code mở **folder `device/wokwi`** làm workspace. PlatformIO: **Build** (`pio run` trong terminal nếu CLI có trong PATH).
2. Chọn **Wokwi: Start Simulator**. `wokwi.toml` trỏ tới binary PlatformIO; build lại sau khi đổi `config.h`.
3. Mở Serial Monitor 115200. ESP32 nối Wi-Fi ảo `Wokwi-GUEST`, lấy thời gian UTC, đọc DHT22 và gửi một mẫu mỗi 60 giây. Thành công có `HTTP 201`, `signature_status: "VALID"`, `duplicate: false`. Click cảm biến DHT22 trong sơ đồ để đổi nhiệt độ/độ ẩm; chờ chu kỳ kế tiếp.
4. Mở URL mà `provision.py` in ra (`GET .../telemetry`) hoặc `GET .../shipments/<UUID>` để xem `latest_telemetry`. `GET .../devices` cho biết thiết bị `ONLINE` sau mẫu signed.

Sketch Wokwi dùng `WiFiClientSecure.setInsecure()` để thử luồng ký dữ liệu trong simulator: HTTPS được mã hóa nhưng sketch không kiểm tra danh tính máy chủ TLS. **Không dùng sketch này làm firmware thiết bị thật**; cần cấu hình CA/trust phù hợp và bảo vệ private key trên thiết bị thật.

## Lỗi thường gặp

| Triệu chứng | Kiểm tra |
|---|---|
| `HTTP 503 ADMIN_NOT_CONFIGURED` khi cấp thiết bị | `ADMIN_API_KEY` chưa được đặt trên Render. |
| `HTTP 401 INVALID_SIGNATURE` | Build lại sau khi `provision.py` tạo `config.h`; kiểm tra public key đăng ký cùng device ID. |
| `HTTP 403 DEVICE_NOT_ASSIGNED` | Device và shipment ID trong `config.h` không khớp assignment. |
| `HTTP 409 SEQUENCE_REPLAY` | Wokwi mất NVS; cấp thiết bị mới. |
| `HTTP 422` | Xem JSON lỗi trong Serial; kiểm tra UUID, timestamp UTC, giá trị cảm biến. |
| `HTTP 500` ở `/shipments` | Kiểm tra Render logs, MySQL credentials, quyền tạo/đọc bảng và CA secret file. |
| Timeout lần gửi đầu | Render Free có thể khởi động chậm; chờ rồi gửi mẫu tiếp theo. |

Tài liệu nền: [Render FastAPI](https://render.com/docs/deploy-fastapi), [Render Blueprint](https://render.com/docs/blueprint-spec), [Render Secret Files](https://render.com/docs/configure-environment-variables), [Wokwi VS Code/PlatformIO](https://docs.wokwi.com/vscode/platformio), [Wokwi ESP32 Wi-Fi](https://docs.wokwi.com/guides/esp32-wifi).
