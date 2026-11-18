# ESP32 và simulator

Dùng bộ thiết bị cố định **ESP32-01 đến ESP32-10**, mỗi thiết bị một cặp ECDSA P-256 và `key_id=key-v1`.
Backend local tạo khóa một lần vào `backend/.local/esp32-private-keys.txt`; MySQL chỉ lưu public key.

Xem [hướng dẫn chạy local](../docs/local-devices.md) để tạo lô hàng bằng tên, lấy `shipment_id`, gán thiết bị, cấu hình firmware và chạy simulator.

Sketch `cold_chain_device/cold_chain_device.ino` dùng DHT22 ở GPIO 27, ký theo `SIGNED-TELEMETRY-v1`, lưu sequence trong ESP32 Preferences và gửi HTTPS. Chưa kiểm thử trên board thật; sketch chưa có hàng đợi bền vững khi mất mạng. Điền Wi-Fi, API URL và CA trong cấu hình trước khi nạp USB.

Khi đổi chuyến, bỏ gán chuyến cũ rồi gán chuyến mới, chạy lại `configure-device` và nạp firmware. Giữ nguyên sequence của thiết bị, kể cả khi chuyển giữa simulator và ESP32 thật.
