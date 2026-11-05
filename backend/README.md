# Backend — MySQL

## Phase 0 — Signed Telemetry/Merkle v1 foundation

`app/services/telemetry_protocol.py` implements the canonical signed projection,
P-256 signature verification and MERKLE-v1 root calculation. Public golden vectors
are in `tests/fixtures/protocol_vectors_v1.json`; run
`./.venv/Scripts/python.exe -m pytest tests/test_telemetry_protocol.py -q` from
`backend/` to check them. See `docs/architecture/data-integrity.md` for the byte
rules and pending Member 2 handoff.

The current `POST .../telemetry` endpoint still accepts the legacy unsigned
payload and does **not** call this module yet. Its data is not verified or
anchored evidence; the existing insurance flow must not be presented as the
new signed-data payout flow. Device registration, migrations and Data Integrity
Contract integration are subsequent phases.

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

## Vị trí mô phỏng (Phase 3)

Backend nội suy đường thẳng từ `origin` đến `destination` theo số mẫu telemetry **đã nhận**. Mẫu đầu tiên đạt 5%, mẫu thứ 20 đạt 100%; các mẫu sau giữ vị trí tại điểm đến. Quy tắc này không phụ thuộc thời gian hoặc giá trị nhiệt độ nên có thể chạy lại và kiểm thử. Khi chưa có mẫu, `status` là `created`, `latest_telemetry` và `location` là `null`. Mỗi vị trí từ Backend mang `location_source: "backend_simulated"`; đây không phải GPS hay tuyến đường giao thông thực. Payload thiết bị chứa tọa độ sẽ bị từ chối.

Trên MySQL, Backend khóa bản ghi lô hàng khi nhận telemetry để các request đồng thời nhận mức tiến độ khác nhau.

## Vi phạm nhiệt độ (Phase 4)

Mỗi mẫu được so với `[temp_min_c, temp_max_c]` của lô hàng. Mẫu đầu ngoài ngưỡng tạo `TEMPERATURE_BREACH_STARTED`; chuỗi mẫu tiếp tục ngoài ngưỡng đủ `violation_duration_minutes` (mặc định 15) tạo đúng một `INSURANCE_TRIGGERED` cho lô hàng. Nhiệt độ trở lại ngưỡng reset chuỗi. Thời lượng dùng `received_at` của Backend; `recorded_at` từ ESP32 chỉ để đối chiếu. Kích hoạt bảo hiểm off-chain không tự đặt `payout_status` thành `paid`.

`SENSOR_GAP_MINUTES=5` trong `.env.example` là ngưỡng mất tín hiệu mặc định, phù hợp thiết bị gửi mỗi phút. Khoảng giữa hai mẫu lớn hơn ngưỡng sẽ cắt chuỗi vi phạm và tạo `SENSOR_DATA_GAP` khi mẫu mới tới. Trong lúc chưa có mẫu mới, API chi tiết/danh sách hiển thị `status: "sensor_data_gap"` nếu mẫu cuối quá hạn. Không cần thay đổi schema MySQL cho Phase này; service tính chuỗi từ telemetry đã lưu và ghi event trong cùng transaction với mẫu mới.

Ở `APP_ENV=development`, endpoint `POST /api/v1/demo/shipments/{id}/scenario` nhận `{"scenario":"normal"}` hoặc `{"scenario":"temperature_breach"}`. Kịch bản vi phạm dùng đồng hồ ảo, tạo bốn mẫu cho chính sách 15 phút/ngưỡng gap 5 phút và chạy qua cùng service với ESP32. Hãy dùng lô hàng demo riêng vì đồng hồ ảo có thể đưa `received_at` vào tương lai. Endpoint không được đăng ký trong production.

Nếu ESP32 truy cập từ LAN, chạy Uvicorn với `--host 0.0.0.0`, dùng IP LAN của máy trong `device/esp32/config.h` và cho phép cổng 8000 trên firewall. Không đưa dịch vụ HTTP phát triển trực tiếp ra Internet.

Ví dụ gửi telemetry bằng bộ giả lập từ thư mục gốc repo:

```bash
py -3 device/simulator/send_telemetry.py --shipment-id <UUID_LO_HANG> --mode sequence --normal-temp 5 --breach-temp 9.2 --normal-count 2 --breach-count 3
```

Endpoint hiện có: `GET /api/v1/health`, `POST/GET /api/v1/shipments`, `GET /api/v1/shipments/{id}`, `POST/GET /api/v1/shipments/{id}/telemetry`, `GET /api/v1/shipments/{id}/events`, và endpoint demo trong development. Tọa độ vẫn là mô phỏng ở Backend.

## Tích hợp Blockchain (Phase 5)

Mặc định `BLOCKCHAIN_ENABLED=false`; Backend tiếp tục lưu sự kiện bảo hiểm off-chain. Khi bật, Backend dùng `blockchain/INTEGRATION.md`: `shipmentKey = keccak256(UTF8(shipment_id))`, `evidenceHash = keccak256(UTF8(event_id))`, `detectedAt` là Unix timestamp giây UTC. Adapter đọc ABI đã compile, kiểm tra chain ID, contract và oracle signer, rồi gọi `reportViolation` cho event `INSURANCE_TRIGGERED`.

Thiết lập local Hardhat từ thư mục `blockchain/` (mỗi lần khởi động lại node phải deploy và seed lại):

```bash
npm ci
npm run compile
npm run node            # terminal 1, để chạy
npm run deploy          # terminal 2
npm run seed            # terminal 2, tạo policy cho UUID mẫu trong INTEGRATION.md
```

Đặt `BLOCKCHAIN_ENABLED=true`, `BLOCKCHAIN_CONTRACT_ADDRESS` từ `blockchain/deployments/localhost.json` và `BLOCKCHAIN_ORACLE_PRIVATE_KEY` của **account #1** trong `backend/.env` (file được Git bỏ qua). `BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_CHAIN_ID`, `BLOCKCHAIN_NETWORK` và `BLOCKCHAIN_ABI_PATH` có ví dụ trong `.env.example`. Chỉ dùng key local/testnet. Policy phải được tạo **trước** cho đúng `shipment_id` của Backend; script `npm run seed` của Member 2 hiện dùng một UUID cố định, không tạo policy cho các shipment UUID ngẫu nhiên từ API. Khi không có policy, sự kiện vẫn ở `BLOCKCHAIN_PENDING` với mã lỗi `POLICY_NOT_ACTIVE`.

Backend lưu telemetry và event cùng một transaction trước khi gọi RPC. Hash và raw transaction đã ký được lưu trong event để retry chính giao dịch đó; raw transaction không hiện qua API. `GET /api/v1/shipments/{id}` trả `blockchain.transaction_hash` và `confirmation_status`; `GET .../events` trả `blockchain_status`, `sent_at`, `attempt_count` và `last_error`. Chỉ receipt thành công cùng policy có đúng evidence mới đặt payout thành `paid`. Nếu RPC lỗi hoặc chưa có policy, chạy:

```bash
./.venv/Scripts/python.exe -m app.cli retry-blockchain --shipment-id <UUID_LO_HANG>
# hoặc bỏ --shipment-id để retry tất cả pending/failed
```

Kiểm thử end-to-end với node local **mới deploy và seed** (Git Bash, từ `backend/`):

```bash
export BLOCKCHAIN_TEST_ORACLE_KEY='PASTE_HARDHAT_ACCOUNT_1_PRIVATE_KEY'
RUN_BLOCKCHAIN_TESTS=1 ./.venv/Scripts/python.exe -m pytest tests/test_blockchain_local.py -q
```

Test này dùng SQLite tạm và policy UUID mẫu trong `seed-demo.ts`; nó gửi một giao dịch chi trả thật trên Hardhat local. Chạy lại cần reset node, deploy và seed lại.

## Kiểm thử

```bash
./.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
./.venv/Scripts/python.exe -m pytest tests -q
RUN_MYSQL_TESTS=1 ./.venv/Scripts/python.exe -m pytest tests/test_mysql_live.py -q
```

Các API unit tests dùng SQLite tạm để chạy độc lập và kiểm tra logic; test cuối là smoke test chỉ đọc database MySQL cấu hình trong `.env`.
