# ESP32 và simulator

Dùng bộ thiết bị cố định **ESP32-01 đến ESP32-10**, mỗi thiết bị một cặp ECDSA P-256 và `key_id=key-v1`.
Backend local tạo khóa một lần vào `backend/.local/esp32-private-keys.txt`; MySQL chỉ lưu public key.

Xem [hướng dẫn chạy local](../docs/local-devices.md) để tạo lô hàng bằng tên, lấy `shipment_id`, gán thiết bị, cấu hình firmware và chạy simulator.

Sketch `cold_chain_device/cold_chain_device.ino` dùng DHT22 ở GPIO 27, ký theo `SIGNED-TELEMETRY-v2`, lưu sequence trong ESP32 Preferences và gửi HTTPS tới `/api/v1/devices/{device_id}/telemetry`. Payload của thiết bị không chứa `shipment_id`; Backend tra assignment active trong MySQL sau khi xác minh chữ ký. Chưa kiểm thử trên board thật; sketch chưa có hàng đợi bền vững khi mất mạng. Điền Wi-Fi, API URL và CA trong cấu hình trước khi nạp USB.

`config.h` chỉ chứa `DEVICE_ID`, `KEY_ID`, private key, Wi-Fi và API URL. Chạy `configure-device` và nạp firmware một lần cho danh tính thiết bị. Khi đổi chuyến, Admin chỉ cần bỏ gán chuyến cũ rồi gán chuyến mới trên Frontend; không sửa `config.h` và không nạp lại firmware. Giữ nguyên sequence của thiết bị, kể cả khi chuyển giữa simulator và ESP32 thật.
