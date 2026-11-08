# ESP32 và simulator — Phase 1

Sketch `cold_chain_device/cold_chain_device.ino` dùng DHT22 ở GPIO 27, ký ECDSA P-256/SHA-256 theo `SIGNED-TELEMETRY-v1`, lưu số sequence trong ESP32 Preferences và gửi HTTPS. Chưa kiểm thử trên board thật; sketch hiện chưa có hàng đợi bền vững cho mẫu khi mất mạng.

## Cấp khóa và chạy simulator

Dùng Python của Backend (đã cài `backend/requirements.txt`) để tạo **khóa thử riêng** ở thư mục ngoài Git. Ví dụ PowerShell từ gốc repo:

```powershell
$env:DEVICE_KEY_PATH = "$HOME/coldchain-test-device.pem"
@'
import os
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
key = ec.generate_private_key(ec.SECP256R1())
path = Path(os.environ["DEVICE_KEY_PATH"])
with path.open("xb") as output:
    output.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))
print(key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode())
'@ | .\backend\.venv\Scripts\python.exe -
```

Đăng ký public key vừa in qua `POST /api/v1/devices` với `X-Admin-Key`, `device_id`, `key_id` và UUID của shipment đã tạo. Chỉ public key được gửi lên Backend. Dùng `--sequence` là số **chưa sử dụng** của thiết bị; simulator không tự lưu counter.

```powershell
.\backend\.venv\Scripts\python.exe device/simulator/send_telemetry.py `
  --base-url http://127.0.0.1:8000 `
  --shipment-id '<UUID-v4>' --device-id SIM-001 --key-id sim-v1 `
  --private-key $env:DEVICE_KEY_PATH --sequence 1 --scenario duplicate
```

Chạy từ gốc repo; venv trong ví dụ là `backend/.venv`. `--scenario` có `happy`, `invalid_signature`, `duplicate`, `replay`, `gap`, `reconnect`. `--dry-run` in payload đã ký mà không gửi mạng. Với `replay` và `gap`, dùng một dải sequence mới; `replay` cố ý tạo sequence cũ bị từ chối. `reconnect` mô phỏng lần kết nối thất bại rồi gửi lại **cùng** payload đã ký. Mặc định simulator chỉ cho HTTP ở localhost; URL công khai phải là HTTPS.

## Cấu hình ESP32

1. Sao chép `cold_chain_device/config.example.h` thành `cold_chain_device/config.h`. File đích đã bị Git bỏ qua.
2. Cấp một khóa P-256 **mới** cho board, đăng ký public key tương ứng bằng API admin. Điền Wi-Fi, URL, shipment/device/key ID, private key và PEM của CA xác thực chứng chỉ HTTPS của API. `WiFiClientSecure` sẽ kiểm tra chứng chỉ; CA thiếu hoặc sai khiến lần gửi thất bại.
3. Nạp sketch bằng Arduino IDE/ESP32 core có thư viện `DHTesp`; đặt DHT22 DATA vào GPIO 27. Đồng bộ NTP phải thành công trước khi ký mẫu.
4. Khi thay device ID hoặc xóa NVS, cấp identity/key mới hoặc đồng bộ số sequence với Backend trước khi gửi. Counter không được quay về số đã dùng. Khi mất mạng, sketch hiện giữ counter nhưng **không giữ mẫu**; Backend có thể phát hiện gap khi có mẫu tiếp theo.

Private key và mật khẩu từng có trong lịch sử Git của sketch. Hãy đổi mật khẩu Wi-Fi cũ, revoke public key thiết bị cũ qua API admin và cấp khóa mới trước khi dùng môi trường triển khai. Việc xóa chúng khỏi phiên bản hiện tại không xóa lịch sử Git.
