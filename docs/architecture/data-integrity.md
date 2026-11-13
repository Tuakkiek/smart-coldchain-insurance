# Data integrity v1 — bản triển khai Phase 0

Trạng thái: **TESTED ở thư viện Python, golden fixture và API signed ingestion**. Chưa có MySQL batch, ESP32 thật hoặc contract anchoring. Đây là đặc tả byte-level để Member 2 và Member 3 rà soát; không coi là xác nhận liên nhóm.

## SIGNED-TELEMETRY-v1

- Thuật toán: ECDSA P-256 với SHA-256. Chữ ký ASN.1 DER, truyền bằng Base64 chuẩn có padding; public key dạng SPKI PEM. Khóa riêng chỉ ở thiết bị hoặc môi trường sinh fixture dùng một lần.
- Projection gồm chính xác: `device_id`, `firmware_version`, `humidity_milli_pct`, `key_id`, `payload_version`, `recorded_at`, `sequence_number`, `shipment_id`, `temperature_milli_c`. Bỏ `signature`, hai số thực để hiển thị và mọi trường do server sinh.
- Khóa JSON theo thứ tự ASCII tăng dần, compact không khoảng trắng, UTF-8. Các string đều giới hạn ASCII. Số là integer JSON, không phải float hay bool. `payload_version=1`; `sequence_number` dương; nhiệt độ và độ ẩm được scale ×1000.
- `recorded_at` dạng UTC `YYYY-MM-DDTHH:mm:ssZ`. API kiểm tra hai giá trị hiển thị khớp chính xác với integer đã scale bằng Decimal, rồi xác minh thiết bị/key/assignment trước khi lưu. Thư viện canonical vẫn tách khỏi bước validate API.

Golden vector ở [protocol_vectors_v1.json](../../backend/tests/fixtures/protocol_vectors_v1.json) chứa request hợp lệ, request đã đổi đồng thời `temperature_c` và `temperature_milli_c` nhưng giữ chữ ký, canonical UTF-8/hex, SHA-256, public key và chữ ký. **Không có private key trong fixture.** Script [generate_protocol_vectors.py](../../backend/tests/fixtures/generate_protocol_vectors.py) tạo khóa thử chỉ trong bộ nhớ; chạy lại sẽ đổi chữ ký và mọi root, cần thông báo Member 2 trước khi thay fixture đã công bố.

## MERKLE-v1

Chỉ bản ghi đã được Backend chấp nhận sau xác minh chữ ký mới vào batch. Một batch chứa đúng một cặp `(shipment_id, device_id)`, membership đóng băng khi seal, sắp xếp theo `sequence_number` tăng dần và không có sequence trùng. Batch rỗng không được anchor.

Canonical record thêm `received_at` UTC do server gán và `signature` Base64 vào projection trên. `received_at` dùng sáu chữ số microsecond: `YYYY-MM-DDTHH:mm:ss.ffffffZ`. Không hash trạng thái anchor/verification hay vị trí mô phỏng vì các trường đó có thể thay đổi.

```text
leaf   = SHA256(0x00 || canonical_record_utf8)
parent = SHA256(0x01 || left_32_bytes || right_32_bytes)
```

Ở mỗi tầng, nếu số node lẻ thì nhân đôi node cuối. Root một leaf chính là leaf đó. Root là **32 raw bytes**; hiển thị dưới dạng `0x` + 64 hex chars, nhưng khi gọi contract phải truyền bytes32, không hash chuỗi hex lần nữa. Fixture chứa leaf và root cho 1, 2, 3 bản ghi; `pytest backend/tests/test_telemetry_protocol.py` xác nhận root và phát hiện thay `received_at` hoặc `signature`.

## Quyết định và phụ thuộc còn mở

- `shipment_key = keccak256(UTF8(shipment_id))` đã có trong [blockchain/INTEGRATION.md](../../blockchain/INTEGRATION.md) cho contract bảo hiểm. Contract hiện tại **chưa có Data Integrity Contract**, `anchorBatch`, `getBatch` hay quy tắc `batch_key`; Member 2 cần chốt các phần này trước khi viết adapter anchoring.
- Luồng development chưa ký chỉ dùng để mô phỏng và không vượt qua evidence gate mặc định. Signed ingestion dùng `PAYOUT_REQUIRES_ANCHORED_EVIDENCE=true`: đủ thời lượng theo `received_at`, không time/sequence gap, mọi telemetry thuộc batch `MATCHED + DATA_ANCHORED`, và on-chain readback khớp mới được dispatch payout. `recorded_at` không được dùng để bù 15 phút nhận dữ liệu ở Backend.
- Đã có Alembic revision `20261105_01` cho bảng thiết bị, key, assignment, signed receipt và rejected audit; các bản ghi signed vẫn dùng bảng telemetry hiện có kèm receipt riêng. Batch membership và outbox integrity cần migration tiếp theo. Không dùng `create_all()` để nâng cấp schema production.
- Board ESP32, Arduino core, sensor, CORS origin production, MySQL provider và Render URL vẫn cần xác nhận trên môi trường thực tế.
