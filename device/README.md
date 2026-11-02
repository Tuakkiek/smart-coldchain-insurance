# Thiết bị và bộ giả lập telemetry

Payload gửi lên Backend theo [hợp đồng API v1](../docs/contracts/api-v1.md): chỉ có `device_id`, `temperature_c`, `humidity_pct`. Thiết bị/bộ giả lập không gửi GPS, `received_at` hay `recorded_at`; Backend tự gắn thời gian nhận và vị trí mô phỏng.

## ESP32 + DHT22

Nhóm dùng **DHT22**; `config.example.h` đã chọn loại này. GPIO 4 là chân dữ liệu ví dụ, cần đối chiếu với dây nối thực tế. Firmware ở `esp32/cold_chain_device.ino`; `esp32/esp32.ino` là file chính tối thiểu để Arduino nhận đúng tên thư mục sketch theo [quy cách sketch của Arduino](https://docs.arduino.cc/arduino-cli/sketch-specification/). Cần Arduino IDE hoặc Arduino CLI với board package ESP32, [DHT sensor library by Adafruit](https://github.com/adafruit/DHT-sensor-library) và dependency **Adafruit Unified Sensor**. Chưa khóa phiên bản thư viện vì hiện chưa có máy/board chuẩn của nhóm.

1. Nối VCC cảm biến với 3.3V, GND với GND, chân dữ liệu với GPIO 4 (hoặc sửa `DHT_PIN`). Cảm biến DHT dạng rời thường cần điện trở kéo lên theo hướng dẫn của module/cảm biến đang dùng.
2. Sao chép `esp32/config.example.h` thành `esp32/config.h`. Điền Wi-Fi, URL Backend, UUID lô hàng đã tạo và ID thiết bị; giữ `DHT_TYPE DHT22`. File `config.h` được `.gitignore` bỏ qua; không đưa mật khẩu/API key vào Git.
3. `API_BASE_URL` là địa chỉ máy chạy Backend trên cùng mạng LAN, ví dụ `http://192.168.1.100:8000`, **không** là `localhost` trên ESP32. Firmware Phase 1 dùng HTTP trong mạng phát triển tin cậy; không dùng trực tiếp trên Internet.
4. Mở `esp32/esp32.ino` trong Arduino IDE, chọn board ESP32 và cổng nối, biên dịch rồi upload. Mở Serial Monitor ở **115200 baud** để xem log. Nếu dùng Arduino CLI với ESP32 Dev Module: `arduino-cli compile --fqbn esp32:esp32:esp32 device/esp32` rồi `arduino-cli upload --fqbn esp32:esp32:esp32 -p <COM_PORT> device/esp32`. Thay FQBN nếu dùng board khác.

Firmware đọc mỗi `SAMPLE_INTERVAL_MS` (mặc định 60 giây), loại bỏ `NaN`/giá trị ngoài phạm vi cảm biến, chờ Wi-Fi tối đa 10 giây và đặt timeout HTTP 5 giây. Mỗi mẫu được thử gửi tối đa 3 lần; lỗi HTTP 4xx (trừ 429) không thử lại vì thường là sai ID hoặc payload. Sau lỗi, vòng lặp tiếp tục ở chu kỳ kế tiếp. Không có vòng chờ vô hạn. `DEVICE_ID` chỉ dùng chữ cái ASCII, số, `-` hoặc `_` (1–100 ký tự) để JSON được tạo an toàn.

Nếu sau này thay bằng DHT11, đổi `DHT_TYPE` và ngưỡng cảm biến trong `config.h`. Nếu dùng loại khác hẳn, cần thay thư viện và hàm đọc ở `cold_chain_device.ino`. Điều chỉnh `SENSOR_TEMP_MIN_C`/`SENSOR_TEMP_MAX_C` cho đúng thông số cảm biến.

## Giả lập bằng Python

Yêu cầu Python 3.10+; script chỉ dùng thư viện chuẩn. Lấy UUID lô hàng từ `POST /api/v1/shipments`. Endpoint nhận telemetry được triển khai ở Phase 2; trước đó dùng `--dry-run` để xem payload.

```powershell
py -3 device/simulator/send_telemetry.py --shipment-id 8b4fb8a2-2996-4da2-90b9-35019517f56f --dry-run
```

Khi Backend chạy trên `http://127.0.0.1:8000` và lô hàng tồn tại:

```powershell
py -3 device/simulator/send_telemetry.py --shipment-id <UUID_LO_HANG> --mode sequence --normal-temp 5 --breach-temp 9.2 --normal-count 2 --breach-count 3 --interval-seconds 1
```

`--mode normal` hoặc `--mode breach` gửi `--count` mẫu cùng loại. `--mode sequence` (mặc định) gửi `--normal-count` mẫu bình thường rồi `--breach-count` mẫu vượt ngưỡng. Dùng `--base-url` nếu Backend không ở localhost, `--humidity` để đổi độ ẩm, `--timeout-seconds`/`--retries`/`--retry-delay-seconds` để chỉnh giới hạn thử lại. Script báo số mẫu được HTTP chấp nhận và trả mã thoát `1` nếu có mẫu thất bại. Dừng bằng Ctrl+C trả mã `130`.

Giá trị `--breach-temp` phải nằm ngoài `[temp_min_c, temp_max_c]` của lô hàng. Gửi vài mẫu cách nhau 1 giây **không** thay thế điều kiện 15 phút liên tục; virtual clock của endpoint demo thuộc Phase 4.

## Kiểm tra

```powershell
py -3 -m unittest discover -s device/simulator/tests -v
```

Test dùng HTTP server cục bộ để kiểm tra nhiều mẫu liên tiếp, payload không có GPS và retry khi lỗi tạm thời. Biên dịch/upload ESP32 và thử với Backend thật cần board/cảm biến và endpoint Phase 2.
