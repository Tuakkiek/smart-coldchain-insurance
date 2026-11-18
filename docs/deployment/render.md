# Deploy FastAPI Backend lên Render

Trạng thái tài liệu: **deployment-ready, chưa xác nhận deploy thực tế**. Chỉ ghi URL public sau khi Render cấp URL và toàn bộ smoke test bên dưới pass.

## 1. Hạ tầng bắt buộc

- Render Web Service dùng Python runtime, region `singapore`, Root Directory `backend`.
- External managed MySQL có TLS và backup; không dùng SQLite hoặc filesystem của Render để lưu dữ liệu.
- Repository có `render.yaml`; Blueprint mặc định dùng gói Free cho demo.
- Data Integrity và Insurance contract có address/role/signer riêng nếu bật Blockchain.

Đặt `DEVICE_PROVISIONING_MODE=manual` trên Render (Blueprint đã khai báo giá trị này).
Filesystem của Render không phải filesystem trên máy cá nhân và có thể bị thay thế khi deploy,
vì vậy Backend cloud không được báo `provisioning_status="ready"` cho `config.h` local. Luồng tự
sinh private key và cập nhật firmware chỉ dùng khi Backend chạy trên chính máy có repository với
`DEVICE_PROVISIONING_MODE=local`. Chế độ cloud giữ API public-key có xác thực hiện tại để phục vụ
quy trình provisioning local riêng nếu cần; private key không đi qua Frontend hoặc Render.

Render Free phù hợp demo, không phù hợp production/SLA: service spin down sau 15 phút không có inbound traffic, lần gọi sau có cold start, filesystem là ephemeral và Free service không có one-off job/shell. Xem tài liệu chính thức: [Deploy for Free](https://render.com/docs/free), [Blueprint YAML](https://render.com/docs/blueprint-spec), [FastAPI](https://render.com/docs/deploy-fastapi), [Health Checks](https://render.com/docs/health-checks).

## 2. Build, migrate và start

Backend cố định Python `3.11.9` trong `backend/.python-version` và biến
`PYTHON_VERSION` của Blueprint. Khi tạo Web Service thủ công, đặt Root Directory
là `backend` và thêm `PYTHON_VERSION=3.11.9` trong **Environment** của service.
Chỉ thêm `render.yaml` vào repo không áp dụng cấu hình Blueprint cho service tạo thủ công.
Biến `PYTHON_VERSION` trên Render được ưu tiên hơn file `.python-version`.
Xem [Setting Your Python Version](https://render.com/docs/python-version).

Blueprint chạy:

```text
Build: pip install -r requirements.txt
Start: python -m app.cli upgrade-db && uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health check: /api/v1/health
```

Nếu build báo `metadata-generation-failed` cho `pydantic-core`, kèm `maturin`,
`/usr/local/cargo` chỉ đọc và interpreter `python3.14`, kiểm tra phiên bản runtime:
dependencies hiện tại dùng `pydantic==2.11.4` với `pydantic-core==2.33.2`, có wheel
cho Python 3.11 nhưng không có wheel cho Python 3.14. Đặt lại
`PYTHON_VERSION=3.11.9`, chọn **Manual Deploy → Clear build cache & deploy**,
rồi xác nhận log build dùng Python 3.11.9. Không cần đổi quyền thư mục Cargo.

`upgrade-db` là idempotent và chạy trước Uvicorn. Nếu migration thất bại, process không nhận traffic. Đây là phương án cho Free Web Service vì `preDeployCommand` chỉ có trên paid web/private/worker service. Khi nâng lên paid plan, chuyển migration sang `preDeployCommand: python -m app.cli upgrade-db` và trả start command về chỉ chạy Uvicorn.

Trước migration production: tạo backup/restore point của MySQL, đọc revision Alembic dự kiến, deploy trong cửa sổ bảo trì và không seed demo.

## 3. Environment Variables

Không dán secret vào Git, log, screenshot hay frontend. Các giá trị bắt buộc trong Render:

```dotenv
APP_ENV=production
DATABASE_URL=mysql+pymysql://<user>:<url-encoded-password>@<host>:<port>/<database>
ADMIN_USERNAME=<single-admin-username>
ADMIN_PASSWORD=<admin-password>
JWT_SECRET_KEY=<random-secret-at-least-32-bytes>
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30
REFRESH_COOKIE_NAME=coldchain_refresh
REFRESH_COOKIE_PATH=/api/v1/auth
REFRESH_COOKIE_SECURE=true
REFRESH_COOKIE_SAMESITE=none
# Để trống nhằm dùng host-only cookie; chỉ đặt khi kiến trúc deployment thực sự cần.
REFRESH_COOKIE_DOMAIN=
CORS_ORIGINS=https://<actual-frontend-domain>
PUBLIC_API_BASE_URL=https://<actual-render-service>.onrender.com/api/v1
LOG_LEVEL=INFO
```

Blueprint dùng `REFRESH_COOKIE_SAMESITE=none` vì hai hostname riêng `*.onrender.com` là khác site
(`onrender.com` nằm trong [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat)).
Nếu Frontend/API dùng HTTPS trên cùng domain đăng ký, ví dụ `app.example.com` và `api.example.com`,
có thể dùng `REFRESH_COOKIE_SAMESITE=lax`. Nếu hai ứng dụng khác site, dùng
`REFRESH_COOKIE_SAMESITE=none` cùng `REFRESH_COOKIE_SECURE=true`; cấu hình `none` bị từ chối khi
cookie không Secure.

### F5 đưa người dùng về Login trên Render

Frontend khôi phục access token từ `localStorage` và chỉ cần refresh khi token còn tối đa 60 giây
hoặc đã hết hạn. Lỗi mạng/5xx khi refresh không xóa access token còn hạn; client thử lại sau 15 giây.
Refresh trả `401` hoặc access token hết hạn mà không refresh được thì phiên kết thúc.

Với hai service khác site, kiểm tra Backend Environment có `REFRESH_COOKIE_SAMESITE=none`,
`REFRESH_COOKIE_SECURE=true`, `REFRESH_COOKIE_DOMAIN=` và `CORS_ORIGINS` đúng frontend origin.
Giữ Domain trống để cookie chỉ thuộc backend; không đặt `.onrender.com` hoặc hostname frontend.
Kiểm tra `VITE_API_BASE_URL` trỏ đúng backend và rebuild frontend sau khi đổi biến Vite.
Service tạo thủ công phải cập nhật Environment riêng; sửa file Blueprint local không thay đổi service
đang chạy. Dùng **Save and deploy** để áp dụng cookie config; frontend cần deploy bản build mới.

Sau deploy, đăng nhập lại để nhận cookie mới. Trong DevTools Network, kiểm tra `Set-Cookie` ở login có
`HttpOnly; Secure; SameSite=None; Path=/api/v1/auth`; không chụp/chia sẻ giá trị token.
F5 ngay sau login phải giữ phiên; khi access token gần hết hạn, `/api/v1/auth/refresh` phải trả `200`.
Nếu vẫn thấy `REFRESH_TOKEN_MISSING`, xem lý do browser chặn cookie. `SameSite=None` không vượt qua
chính sách chặn third-party cookies: khi browser chặn, dùng frontend/backend dưới cùng domain đăng ký
hoặc proxy API qua origin frontend. Xem [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

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

Không dùng wildcard cho `CORS_ORIGINS`; backend bật credentialed CORS và kiểm tra `Origin` trên auth endpoint. `APP_ENV=production` bắt buộc refresh cookie có `Secure`, tắt toàn bộ `/api/v1/demo/*`, từ chối unsigned telemetry và fail startup nếu credential Admin/secret JWT thiếu, dùng placeholder, secret ngắn hoặc CORS không phải allowlist rõ ràng.

Admin lưu trong bảng `admin_accounts` của MySQL/Aiven, chỉ một dòng `id=1`, username và password hash PBKDF2-HMAC-SHA256. `ADMIN_USERNAME`/`ADMIN_PASSWORD` chỉ seed lần đầu khi chạy `upgrade-db`; không ghi đè tài khoản đã có. Sau khi seed có thể bỏ hai biến này, giữ `JWT_SECRET_KEY`, TTL, cấu hình DB/TLS. Không lưu password rõ hoặc JWT secret trong DB. Backend cần truy cập MySQL khi login/verify token; DB lỗi trả 503, không fallback env. `.env` local không tự đồng bộ Render. CA công khai đã được bundle tại `backend/certs/aiven-ca.crt`; đặt `MYSQL_SSL_CA=certs/aiven-ca.crt`.

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

1. Xác nhận OpenAPI có **POST `/api/v1/auth/login`**, `/api/v1/auth/refresh` và `/api/v1/auth/logout`**. Đăng nhập JSON `{username, password}` với credential đã seed trong MySQL, nhận `{access_token, token_type: "bearer"}` cùng cookie `HttpOnly`, rồi dùng `Authorization: Bearer <access_token>` cho các API quản trị/giám sát. Gọi refresh/logout với credentials; không log/screenshot password hoặc token.
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
- Chỉ log request ID, shipment/device/batch/evidence ID và mã lỗi đã chuẩn hóa; không log connection string, private key, password, JWT hoặc raw transaction.

### Login trả 500 và health báo database unavailable

Nếu log dừng tại `ssl.create_default_context(cafile=ca, ...)` với
`FileNotFoundError: [Errno 2] No such file or directory`, kiểm tra `MYSQL_SSL_CA`.
Đây là lỗi backend không tìm thấy CA của MySQL, xảy ra trước bước xác thực Admin.
`/api/v1/health` có thể vẫn trả HTTP 200 nhưng `database="unavailable"`;
`/api/v1/ready` trả 503. Kiểm tra CORS hoặc rebuild frontend không khắc phục lỗi CA.

Với service hiện tại dùng CA đã commit trong repository:

```dotenv
MYSQL_SSL_CA=/opt/render/project/src/backend/certs/aiven-ca.crt
```

Hoặc upload đúng CA qua Render Secret File và dùng `/etc/secrets/mysql-ca.pem`.
Đường dẫn Windows và file chỉ có trên máy cá nhân không dùng được trong container Render.
Backend mới resolve đường dẫn tương đối từ `backend/` và từ chối khởi động nếu CA không tồn tại;
không bỏ CA hay tắt xác minh TLS để né lỗi. Sau khi sửa Environment, deploy để áp dụng
cấu hình, rồi kiểm tra `/ready`, login, refresh và API có Bearer token.

### Shipments trả 503 sau khi đã đăng nhập được

Nếu log báo MySQL `1054 Unknown column 'shipments.origin_formatted_address'`,
database chưa chạy migration `20261118_07` trong khi backend đã dùng model mới.
Sao lưu `shipments` và revision hiện tại, rồi chạy `python -m app.cli upgrade-db`
từ `backend/` với cấu hình của đúng database đang deploy. Revision này bổ sung
metadata địa điểm, ví và policy; giữ dữ liệu VND cũ. Không xóa bảng hoặc seed demo.
Sau đó kiểm tra revision Alembic và gọi lại `/api/v1/shipments` với Bearer token.

Service tạo thủ công cần đặt **Start Command** giống Blueprint:

```text
python -m app.cli upgrade-db && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Chỉ chạy `uvicorn` không tự áp dụng migration trong repository khi deploy mã mới.

### Login trả 404 trên Render

`404 /api/v1/auth/login` là lỗi route/deployment/URL; sai username/password ở API JWT trả `401`. Kiểm tra `/openapi.json` trên đúng origin Frontend đang gọi. Nếu không có route login thì bản đang phục vụ chưa có endpoint đó, hoặc URL trỏ nhầm service; nhập/sửa dữ liệu Admin trong MySQL không giải quyết được.

1. Trong Render Dashboard, chọn **Backend Web Service** tương ứng URL, kiểm tra repository, branch và commit đang Live. Code deploy phải có route login trong `backend/app/api/routes.py`; commit JWT đã có trong repo, không chỉ deploy lại frontend.
2. Đặt các biến Admin/JWT ở §3 và kiểm tra `DATABASE_URL`/TLS; Root Directory `backend`, build/start ở §2. Với service thủ công, sửa `render.yaml` không tự cập nhật service.
3. Deploy commit chứa JWT từ nhánh đã liên kết bằng **Manual Deploy → Deploy latest commit**, kiểm tra build/start log và trạng thái Live. Nếu deploy mới fail thì URL có thể vẫn phục vụ bản cũ; sửa lỗi build/migration/settings trước. Xem [Deploying on Render](https://render.com/docs/deploys).
4. Đọc lại OpenAPI và thử login. Kiểm tra `/ready` với MySQL thực trước nghiệm thu monitoring; login Admin cần bảng `admin_accounts` và kết nối Aiven/MySQL hợp lệ.
5. Nếu URL sai, sửa `VITE_API_BASE_URL` sang đúng API origin (có thể kèm `/api/v1`) rồi restart Vite ở local hoặc rebuild/redeploy frontend static. Đừng đổi sang endpoint không tồn tại hoặc bỏ JWT để né lỗi.

## 6. Handoff cho Frontend

Chỉ sau khi smoke test hoàn tất mới bàn giao:

```dotenv
VITE_API_BASE_URL=https://<actual-render-service>.onrender.com/api/v1
```

Ghi kèm thời điểm kiểm tra, branch/commit deploy, trạng thái MySQL, chain/network và giới hạn cold start. Placeholder không được báo cáo như URL thật.

Chẩn đoán 2026-11-16: service Render `smart-coldchain-insurance` theo dõi nhánh `feat/iot-backend`; deployment cũ ở `6deecc2` chưa chứa Login/JWT. Phải push code lên đúng nhánh deploy và cấu hình Aiven/TLS/JWT trước khi nghiệm thu; sửa frontend không tự cập nhật code Backend trên Render.
