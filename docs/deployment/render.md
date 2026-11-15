# Deploy FastAPI Backend lên Render

Trạng thái tài liệu: **deployment-ready, chưa xác nhận deploy thực tế**. Chỉ ghi URL public sau khi Render cấp URL và toàn bộ smoke test bên dưới pass.

## 1. Hạ tầng bắt buộc

- Render Web Service dùng Python runtime, region `singapore`, Root Directory `backend`.
- External managed MySQL có TLS và backup; không dùng SQLite hoặc filesystem của Render để lưu dữ liệu.
- Repository có `render.yaml`; Blueprint mặc định dùng gói Free cho demo.
- Data Integrity và Insurance contract có address/role/signer riêng nếu bật Blockchain.

Render Free phù hợp demo, không phù hợp production/SLA: service spin down sau 15 phút không có inbound traffic, lần gọi sau có cold start, filesystem là ephemeral và Free service không có one-off job/shell. Xem tài liệu chính thức: [Deploy for Free](https://render.com/docs/free), [Blueprint YAML](https://render.com/docs/blueprint-spec), [FastAPI](https://render.com/docs/deploy-fastapi), [Health Checks](https://render.com/docs/health-checks).

## 2. Build, migrate và start

Blueprint chạy:

```text
Build: pip install -r requirements.txt
Start: python -m app.cli upgrade-db && uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health check: /api/v1/health
```

`upgrade-db` là idempotent và chạy trước Uvicorn. Nếu migration thất bại, process không nhận traffic. Đây là phương án cho Free Web Service vì `preDeployCommand` chỉ có trên paid web/private/worker service. Khi nâng lên paid plan, chuyển migration sang `preDeployCommand: python -m app.cli upgrade-db` và trả start command về chỉ chạy Uvicorn.

Trước migration production: tạo backup/restore point của MySQL, đọc revision Alembic dự kiến, deploy trong cửa sổ bảo trì và không seed demo.

## 3. Environment Variables

Không dán secret vào Git, log, screenshot hay frontend. Các giá trị bắt buộc trong Render:

```dotenv
APP_ENV=production
DATABASE_URL=mysql+pymysql://<user>:<url-encoded-password>@<host>:<port>/<database>
ADMIN_API_KEY=<random-secret-at-least-32-characters>
CORS_ORIGINS=https://<actual-frontend-domain>
PUBLIC_API_BASE_URL=https://<actual-render-service>.onrender.com/api/v1
LOG_LEVEL=INFO
```

`DATABASE_URL` được ưu tiên hơn `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_DATABASE`/`MYSQL_USER`/`MYSQL_PASSWORD`. Backend bắt buộc MySQL, tự dùng driver PyMySQL, pool nhỏ (`5 + 2 overflow`), `pool_pre_ping`, recycle và timeout. Nếu provider cấp CA, tạo Render Secret File rồi đặt:

```dotenv
MYSQL_SSL_CA=/etc/secrets/mysql-ca.pem
```

Nếu chưa tích hợp chain:

```dotenv
BLOCKCHAIN_ENABLED=false
```

Khi bật chain, phải đặt đầy đủ và đối chiếu role trước khi nhận traffic:

```dotenv
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_NETWORK=<actual-network-name>
BLOCKCHAIN_RPC_URL=<secret-rpc-url>
BLOCKCHAIN_CHAIN_ID=<actual-chain-id>
BLOCKCHAIN_CONFIRMATIONS=1
DATA_INTEGRITY_CONTRACT_ADDRESS=<actual-address>
BACKEND_ANCHORER_PRIVATE_KEY=<render-secret>
BLOCKCHAIN_CONTRACT_ADDRESS=<actual-insurance-address>
BLOCKCHAIN_ORACLE_PRIVATE_KEY=<render-secret>
```

Không dùng wildcard cho `CORS_ORIGINS`. `APP_ENV=production` tắt toàn bộ `/api/v1/demo/*`, từ chối unsigned telemetry và fail startup nếu admin secret quá ngắn hoặc CORS không phải allowlist rõ ràng.

## 4. Smoke test sau deploy

Thay `<api-origin>` bằng origin Render thật, không thêm `/api/v1` hai lần:

```bash
curl -fsS https://<api-origin>/api/v1/health
curl -fsS https://<api-origin>/api/v1/ready
curl -fsS https://<api-origin>/openapi.json
```

Kỳ vọng khi chưa bật Blockchain:

```json
{"status":"ok","database":"ok","blockchain":"unavailable"}
```

`/health` là liveness và vẫn trả `200` với `status=degraded`; `/ready` trả `503` khi MySQL unavailable. RPC unavailable không làm readiness fail vì accepted telemetry phải được persist trước, còn anchor/payout đi qua outbox.

Tiếp tục kiểm tra:

1. Gọi admin API bằng `X-Admin-Key`, đăng ký public key thiết bị và assignment.
2. Gửi một signed telemetry từ simulator qua HTTPS public; xác nhận signature `VALID`, `received_at` do server tạo và dữ liệu đọc lại được.
3. Restart/redeploy service; xác nhận shipment/telemetry vẫn còn trong external MySQL.
4. Gửi preflight/request từ đúng Frontend origin và xác nhận origin khác không nhận CORS header.
5. Xác nhận `/api/v1/demo/...` trả `404` và unsigned telemetry trả `403` trên production.
6. Nếu bật chain, kiểm tra RPC/chain ID/contract role, anchor + readback và insurance receipt thật trước khi ghi trạng thái `DEPLOYED`.

## 5. Khôi phục và retry

- DB lỗi: `/ready` trả `503`; kiểm tra provider/TLS/CA/pool, phục hồi backup nếu cần rồi restart. Không chạy seed lên production.
- RPC lỗi: telemetry vẫn nằm trong MySQL; dùng `python -m app.cli retry-integrity` và `python -m app.cli retry-blockchain` ở môi trường worker/paid shell, hoặc admin retry API có xác thực trong demo.
- Render Free không bảo đảm timer/worker sống liên tục. Muốn retry theo SLA phải dùng paid worker/cron phù hợp; không ping giả để né spin-down.
- Transaction pending giữ nguyên signed raw transaction/idempotency; không xóa outbox hoặc tự sửa `transaction_hash` trong DB.
- Chỉ log request ID, shipment/device/batch/evidence ID và mã lỗi đã chuẩn hóa; không log connection string, private key, admin key hoặc raw transaction.

## 6. Handoff cho Frontend

Chỉ sau khi smoke test hoàn tất mới bàn giao:

```dotenv
VITE_API_BASE_URL=https://<actual-render-service>.onrender.com/api/v1
```

Ghi kèm thời điểm kiểm tra, branch/commit deploy, trạng thái MySQL, chain/network và giới hạn cold start. Placeholder không được báo cáo như URL thật.
