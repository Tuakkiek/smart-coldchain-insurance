# Chạy local với 10 ESP32 cố định

## 1. Khởi tạo một lần

Trong `backend/.env`:

```dotenv
APP_ENV=development
DEVICE_PROVISIONING_MODE=local
DEVICE_KEYS_PATH=backend/.local/esp32-private-keys.txt
DEVICE_CONFIG_PATH=device/cold_chain_device/config.h
```

Giữ các cấu hình MySQL và đăng nhập hiện có. Đường dẫn trên tính từ gốc repository, dù chạy lệnh từ `backend/`.

Chạy trong thư mục `backend/`:

```powershell
.\.venv\Scripts\python.exe -m app.cli upgrade-db
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1
```

Lệnh đầu áp dụng migration `20261118_08`: tên cũ được giữ trong cột `name`, UUID và dữ liệu liên quan giữ nguyên. Backend tạo đúng **ESP32-01 đến ESP32-10** cùng 10 cặp P-256, `key_id=key-v1`.

- Private key lưu trong **một file text định dạng JSON**: `backend/.local/esp32-private-keys.txt`.
- Database chỉ lưu public key. API, frontend và Blockchain không nhận private key.
- File và `config.h` đều được Git bỏ qua. Giữ bản sao riêng của file khóa; không gửi hoặc commit file này.
- Các lần chạy sau đọc lại file, giữ nguyên khóa, trạng thái thu hồi, sequence và assignment. Có thể chạy lại `python -m app.cli init-devices` mà không tạo khóa mới.
- Nếu file mất/hỏng hoặc không khớp database, Backend dừng và yêu cầu khôi phục file gốc; không ghi đè public key bằng khóa mới. Nếu database lỗi trong lần khởi tạo, giữ file khóa và chạy lại lệnh.
- Thiết bị cũ ngoài bộ 10 được giữ làm lịch sử nhưng không thể gán hoặc gửi signed telemetry mới.

Khi chạy cloud, dùng `DEVICE_PROVISIONING_MODE=manual` với database đã có 10 public key; không chép file private key lên cloud.

## 2. Tạo lô hàng và gán thiết bị

Trên frontend, nhập **Tên lô hàng**, tạo lô hàng rồi lấy `shipment_id` UUID từ thông báo hoặc trang chi tiết. Response API có dạng:

```json
{
  "id": "8b4fb8a2-2996-4da2-90b9-35019517f56f",
  "shipment_id": "8b4fb8a2-2996-4da2-90b9-35019517f56f",
  "name": "Vaccine Cần Thơ - đợt 1"
}
```

Tên tối đa 255 ký tự và có thể trùng; UUID luôn riêng cho mỗi lô hàng. Trong trang Thiết bị, chọn một ESP32 có sẵn và **Liên kết chuyến hàng**. Không còn đăng ký, xóa thiết bị hoặc thêm key qua API.

Các thao tác quản lý đều thực hiện thủ công trên giao diện:

- **Tạo lô hàng:** trang Lô hàng → Tạo lô hàng mới → nhập thông tin → Tạo. Thông báo thành công có nút Gán thiết bị.
- **Gán thiết bị:** bấm Gán / tháo thiết bị ngay trên lô hàng hoặc trang chi tiết → chọn ESP32 có sẵn → Gán thiết bị. Lô hàng được chọn sẵn, không cần nhập UUID.
- **Tháo thiết bị:** mở cùng hộp thoại, chọn thiết bị đang gán → Tháo thiết bị. Có thể tiếp tục chọn và gán thiết bị khác.
- **Xóa lô hàng:** bấm Xóa trên lô hàng → xác nhận. Nếu vẫn còn thiết bị, tháo các thiết bị trước. Lô có dữ liệu vận hành hoặc giao dịch blockchain được giữ lại để đối soát; giao diện sẽ giải thích khi không thể xóa.

## 3. Test bằng simulator

Từ gốc repository, sau khi gán ESP32-01 vào lô hàng:

```powershell
.\backend\.venv\Scripts\python.exe device/simulator/send_telemetry.py `
  --device-id ESP32-01 `
  --sequence 1 --scenario happy
```

Simulator tự đọc khóa tương ứng từ file local; không cần sao chép PEM hoặc gọi API đăng ký. Nếu dùng `DEVICE_KEYS_PATH` khác mặc định, thêm `--registry-file '<đường dẫn file khóa>'`.

`--sequence` phải lớn hơn `last_sequence_number` trong chi tiết thiết bị. Khi test tiếp, dùng số tiếp theo; không dùng lại số cũ cho payload khác. Có các kịch bản `happy`, `invalid_signature`, `duplicate`, `replay`, `gap`, `reconnect`; `--dry-run` chỉ in payload đã ký. Simulator và board thật dùng chung counter cho cùng Device ID.

## 4. Nạp ESP32 thật

Chạy một lần cho thiết bị từ `backend/` (không cần gán shipment trước):

```powershell
.\.venv\Scripts\python.exe -m app.cli configure-device `
  --device-id ESP32-01
```

Lệnh lấy đúng khóa đã có, ghi `DEVICE_ID`, `KEY_ID` và private key vào `device/cold_chain_device/config.h`; nếu file cũ còn `SHIPMENT_ID`, lệnh sẽ xóa khai báo đó. Không tạo khóa mới, không in khóa ra terminal. Điền Wi-Fi/API URL phù hợp rồi nạp sketch qua USB.

Firmware gửi payload v2 không chứa `shipment_id`. Backend xác minh thiết bị/key/chữ ký, khóa assignment active hiện tại trong MySQL rồi gắn `shipment_id` vào telemetry. Vì vậy khi Admin đổi chuyến trên Frontend, ESP32 tiếp tục gửi bằng cùng firmware, không cần chạy lại `configure-device` hay nạp USB.

## 5. Blockchain

Định danh contract giữ nguyên: `shipmentKey = keccak256(UTF8(shipment_id))`, `deviceKey = keccak256(UTF8(device_id))`. Tên chỉ để hiển thị. Backend xác minh chữ ký P-256 bằng public key trong database rồi mới đưa dữ liệu vào batch/evidence; khóa ESP32 khác khóa ví Oracle/Anchorer.

ABI, adapter và scripts đã đồng bộ với Solidity hiện có dùng **native ETH**, ký quỹ qua `createPolicy(..., {value: amount_wei})`. Không cần approve ERC-20. Nếu node local đang dùng contract ERC-20 cũ, chạy lại `npm run deploy` và cập nhật địa chỉ Backend từ `blockchain/deployments/localhost.json`. Việc sửa code không tự triển khai hoặc thay địa chỉ contract trên testnet.

Script demo Hardhat dùng `ESP32-01`. Khi cần seed policy ETH local cho lô hàng vừa tạo, từ `blockchain/`:

```powershell
$env:DEMO_SHIPMENT_ID = '<shipment_id vừa nhận>'
npm run seed
```

Đây là policy ETH demo trên localhost, mặc định 0.05 ETH. Luồng SepoliaETH dùng cấu hình Insurer của Backend; frontend có thể kết nối ví để lấy địa chỉ người nhận. Batch seed là fixture minh họa lưu root; dữ liệu thiết bị thực phải đi qua Backend để được xác minh và anchor.

Kiểm thử toàn bộ luồng khóa cố định → tạo UUID/policy → ký telemetry → anchor → chi trả một lần: chạy Hardhat riêng bằng `npx hardhat node --port 18545`, sau đó từ `backend/` đặt `$env:RUN_FIXED_DEVICE_BLOCKCHAIN_TESTS='1'` và chạy `python -m pytest tests/test_fixed_devices_blockchain_local.py -q`. Bài test dùng SQLite tạm, không ghi vào database cấu hình trong `.env`.
