# Handover: Backend Single-Admin Login/JWT & API Key Removal

**Ngày cập nhật**: 2026-11-16  
**Phạm vi**: `backend/` (Backend Service)  
**Trạng thái**: Hoàn thành và kiểm thử toàn diện (177 passed, 14 skipped, 0 failed).

---

## 1. Tóm tắt thay đổi

1. **Xóa bỏ hoàn toàn cơ chế API Key cũ**:
   - Biến môi trường `ADMIN_API_KEY` và cấu hình `admin_api_key` đã bị loại bỏ hoàn toàn khỏi backend.
   - Header `X-Admin-Key` không còn được công nhận; bất kỳ request nào chỉ gửi `X-Admin-Key` đều nhận về `401 Unauthorized`.
   - OpenAPI/Swagger UI không còn định nghĩa security scheme `APIKeyHeader`; thay vào đó là `HTTPBearer`.
   - Không có chế độ chạy song song (dual-mode) hay fallback bỏ qua xác thực.

2. **Triển khai Login / JWT cho duy nhất một Admin**:
   - Endpoint: `POST /api/v1/auth/login`.
   - Xác thực duy nhất một Admin cấu hình qua biến môi trường (`ADMIN_USERNAME`, `ADMIN_PASSWORD`).
   - Sử dụng thư viện `PyJWT==2.10.1` với thuật toán cố định `HS256`.
   - Secret key bắt buộc tối thiểu 32 bytes (256 bits).
   - Kiểm tra chặt chẽ các claims: `sub` (khớp đúng `ADMIN_USERNAME`), `iat` (issued at), `exp` (expiration).
   - Cố định allowlist thuật toán `["HS256"]`, từ chối triệt để thuật toán do client tự chọn hoặc `alg: "none"`.
   - So sánh thông tin xác thực an toàn bằng `secrets.compare_digest` theo UTF-8 bytes constant-time, hỗ trợ đầy đủ ký tự Unicode (tiếng Việt có dấu) cho username, password và claim `sub` mà không phát sinh lỗi 500 hay TypeError.
   - Giữ nguyên vẹn mật khẩu: không trim, lowercase hay normalize mật khẩu của người dùng; bảo đảm mật khẩu có khoảng trắng đầu/cuối chỉ đăng nhập được khi người dùng nhập đúng nguyên văn.
   - Startup fail-closed: Ứng dụng từ chối khởi động nếu thiếu cấu hình, cấu hình rỗng, hoặc chứa giá trị placeholder (ví dụ: `<...>`, `changeme`, `placeholder`, `password`, `secret`). Toàn bộ test credential mặc định đã bị loại khỏi runtime source.

3. **Rate Limiting chống Brute-Force & Expose CORS Header**:
   - Giới hạn 5 lần đăng nhập thất bại / 60 giây / IP.
   - Khi vượt ngưỡng: trả về HTTP `429 Too Many Requests`, mã lỗi `RATE_LIMITED`, header `Retry-After: <seconds>`, và JSON error envelope.
   - Cấu hình CORS expose đồng thời cả `X-Request-ID` và `Retry-After` qua header `Access-Control-Expose-Headers` cho các origin được phép trong `CORS_ORIGINS`.
   - Client IP được phân giải an toàn qua cấu hình proxy tin cậy `TRUSTED_PROXIES` (mặc định `127.0.0.1,::1`). Ngăn chặn hoàn toàn việc giả mạo header `X-Forwarded-For` để né rate limiter.
   - Lưu ý kiến trúc: Limiter hiện tại dùng sliding window trong bộ nhớ tiến trình (in-memory). Nếu scale ra nhiều container hoặc tiến trình worker độc lập, mỗi tiến trình có bộ đếm riêng.

4. **Bảo vệ toàn bộ API Quản trị & Giám sát**:
   - Toàn bộ các route quản trị và giám sát (thiết bị, chuyến hàng, truy vấn telemetry, sự kiện, batches, verify, seal, anchor, reconcile) đều yêu cầu header `Authorization: Bearer <access_token>`.
   - Ingestion telemetry có chữ ký (`POST /api/v1/shipments/{id}/telemetry`) giữ nguyên xác thực độc lập bằng chữ ký ECDSA P-256 từ thiết bị phần cứng, không yêu cầu JWT và không bị JWT thay thế.

---

## 2. API Contract: Đăng nhập & Xác thực

### 2.1 Endpoint Đăng nhập

- **URL**: `POST /api/v1/auth/login`
- **Public**: Có
- **Content-Type**: `application/json`

#### Request Body (Ví dụ với placeholder)
```json
{
  "username": "<your-admin-username>",
  "password": "<your-admin-password>"
}
```

#### Response Thành công (`200 OK`)
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

#### Response Sai thông tin đăng nhập (`401 Unauthorized`)
- Header: `WWW-Authenticate: Bearer`
- Body:
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Tên đăng nhập hoặc mật khẩu không chính xác",
    "details": []
  }
}
```

#### Response Vượt quá Rate Limit (`429 Too Many Requests`)
- Header: `Retry-After: 60`
- Header: `Access-Control-Expose-Headers: X-Request-ID, Retry-After` (với origin được phép)
- Body:
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau.",
    "details": []
  }
}
```

#### Response Lỗi định dạng Request (`422 Unprocessable Entity`)
Trả về theo chuẩn FastAPI validation error envelope khi thiếu trường, password rỗng hoặc toàn khoảng trắng:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu không hợp lệ",
    "details": [
      {
        "field": "password",
        "message": "Value error, must not be blank"
      }
    ]
  }
}
```

---

### 2.2 Sử dụng Bearer Token

Gửi kèm token trong header HTTP của mọi request cần xác thực:
```http
Authorization: Bearer <access_token>
```

- Thời hạn hiệu lực: Mặc định 30 phút (`JWT_ACCESS_TOKEN_EXPIRE_MINUTES`).
- Khi token hết hạn hoặc không hợp lệ: Backend trả về `401 Unauthorized` với header `WWW-Authenticate: Bearer` và thông báo lỗi an toàn (không log token và không lộ lý do chi tiết cho client bên ngoài):
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Xác thực không hợp lệ",
    "details": []
  }
}
```
- Logout: Không có endpoint thu hồi phía server (stateless JWT). Phía client thực hiện logout bằng cách xóa token khỏi bộ nhớ / `sessionStorage`.

---

## 3. Ma trận Route: Public vs Protected

| Phương thức | Route | Xác thực | Ghi chú |
|---|---|---|---|
| `GET` | `/api/v1/health` | **Public** | Kiểm tra liveness |
| `GET` | `/api/v1/ready` | **Public** | Kiểm tra database readiness |
| `POST` | `/api/v1/auth/login` | **Public** | Đăng nhập Admin (Rate limited: 5 req/phút/IP, CORS expose `Retry-After`) |
| `POST` | `/api/v1/shipments/{id}/telemetry` | **Public (Device)** | Xác thực qua ECDSA P-256 SPKI PEM của device |
| `POST` | `/api/v1/devices` | **Bearer JWT** | Đăng ký thiết bị |
| `GET` | `/api/v1/devices` | **Bearer JWT** | Danh sách thiết bị & trạng thái |
| `GET` | `/api/v1/devices/{device_id}` | **Bearer JWT** | Chi tiết thiết bị, khóa và phân công |
| `PATCH` | `/api/v1/devices/{device_id}` | **Bearer JWT** | Kích hoạt hoặc thu hồi thiết bị |
| `POST` | `/api/v1/devices/{device_id}/assignments` | **Bearer JWT** | Gán/hủy gán thiết bị vào chuyến hàng |
| `POST` | `/api/v1/devices/{device_id}/keys` | **Bearer JWT** | Nạp Public Key P-256 cho thiết bị |
| `PATCH` | `/api/v1/devices/{device_id}/keys/{key_id}` | **Bearer JWT** | Kích hoạt hoặc thu hồi khóa của thiết bị |
| `POST` | `/api/v1/shipments` | **Bearer JWT** | Tạo chuyến hàng mới |
| `GET` | `/api/v1/shipments` | **Bearer JWT** | Danh sách chuyến hàng |
| `GET` | `/api/v1/shipments/{id}` | **Bearer JWT** | Chi tiết chuyến hàng |
| `GET` | `/api/v1/shipments/{id}/telemetry` | **Bearer JWT** | Lịch sử telemetry của chuyến hàng |
| `GET` | `/api/v1/shipments/{id}/events` | **Bearer JWT** | Sự kiện vi phạm & bảo hiểm |
| `GET` | `/api/v1/shipments/{id}/devices` | **Bearer JWT** | Trạng thái online/offline của thiết bị |
| `GET` | `/api/v1/shipments/{id}/integrity` | **Bearer JWT** | Tóm tắt tính toàn vẹn Merkle theo chuyến |
| `GET` | `/api/v1/integrity/summary` | **Bearer JWT** | Tóm tắt tính toàn vẹn toàn hệ thống |
| `GET` | `/api/v1/shipments/{id}/batches` | **Bearer JWT** | Danh sách batch theo chuyến |
| `GET` | `/api/v1/batches` | **Bearer JWT** | Danh sách tất cả batch |
| `GET` | `/api/v1/batches/{batch_id}` | **Bearer JWT** | Chi tiết batch & Merkle root |
| `POST` | `/api/v1/batches/{batch_id}/verify` | **Bearer JWT** | Xác minh tính toàn vẹn batch |
| `POST` | `/api/v1/shipments/{id}/batches/seal` | **Bearer JWT** | Đóng batch thủ công |
| `POST` | `/api/v1/batches/{batch_id}/anchor` | **Bearer JWT** | Đưa batch lên Data Integrity Contract / Thử lại (retry) dispatch batch |
| `POST` | `/api/v1/shipments/{id}/insurance/reconcile` | **Bearer JWT** | Đối soát bằng chứng bảo hiểm |

*Ghi chú*: Không tồn tại endpoint `/batches/{batch_id}/retry`; chức năng retry khi việc neo batch gặp sự cố hoặc timeout được thực hiện trực tiếp thông qua endpoint `POST /api/v1/batches/{batch_id}/anchor`.

---

## 4. Biến môi trường Backend cần cấu hình

Thêm vào file `.env` của Backend (hoặc cấu hình Environment trên dịch vụ lưu trữ):

```dotenv
# Duy nhất một tài khoản Admin (chỉ là placeholder - thay bằng giá trị thực tế của bạn)
ADMIN_USERNAME=<your-admin-username>
ADMIN_PASSWORD=<your-secure-admin-password>

# JWT Token Configuration (Khóa bí mật tối thiểu 32 ký tự ngẫu nhiên, ví dụ sinh bằng: python -c "import secrets; print(secrets.token_hex(32))")
JWT_SECRET_KEY=<generate-at-least-32-random-bytes-secret-key>
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30

# Danh sách Origin được phép truy cập CORS (phân tách bởi dấu phẩy, bắt buộc rõ ràng ở production)
CORS_ORIGINS=http://localhost:5173

# Proxy tin cậy (ngăn IP spoofing qua header X-Forwarded-For)
TRUSTED_PROXIES=127.0.0.1,::1
```

> **Cảnh báo an toàn**:
> - Không dùng giá trị mặc định, từ khóa yếu như `changeme`, `placeholder`, `password`, `secret`, `<...>`, hoặc khóa bí mật dưới 32 bytes. Backend sẽ kiểm tra và dừng khởi động ngay lập tức (fail-closed) nếu phát hiện.
> - Tuyệt đối không commit file `.env` thật chứa mật khẩu/secret vào Git repository.

---

## 5. Hướng dẫn bàn giao & Các hạng mục cần cập nhật ở các phân hệ khác

Vì lượt thực hiện này **CHỈ** được phép sửa đổi trong thư mục `backend/`, các phân hệ bên ngoài chưa được cập nhật và cần thực hiện trong các lượt tiếp theo:

### 5.1 Phân hệ Frontend (`frontend/`)
Hiện tại frontend gửi `X-Admin-Key` hoặc chưa có cơ chế lưu/gửi JWT token. Do đó, các request gọi API quản trị từ frontend sẽ nhận `401 Unauthorized` cho đến khi hoàn thành các cập nhật sau:
1. **API Client & Request Interceptor**:
   - `frontend/src/api/client.ts`: Xóa bỏ việc đọc `VITE_ADMIN_API_KEY` và header `X-Admin-Key`. Thêm interceptor tự động đính kèm `Authorization: Bearer <token>` lấy từ state / `sessionStorage`.
   - Bắt mã lỗi `401 Unauthorized`: Điều hướng người dùng về màn hình đăng nhập và xóa token hết hạn.
   - Bắt mã lỗi `429 Too Many Requests`: Đọc giá trị header `Retry-After` (đã được backend expose qua CORS) để hiển thị đếm ngược thời gian chờ cho người dùng.
2. **Giao diện Đăng nhập**:
   - Tạo UI form đăng nhập (modal hoặc trang `/login`) thu thập username/password và gọi `POST /api/v1/auth/login`.
   - Lưu trữ `access_token` trong React context/state hoặc `sessionStorage` (khuyến nghị tránh `localStorage` để giảm thiểu nguy cơ XSS).
3. **Cập nhật các API calls**:
   - `frontend/src/api/devices.ts`
   - `frontend/src/api/shipments.ts`
   - `frontend/src/api/integrity.ts`
   - Đảm bảo các component modal (`AdminDeviceDetailModal.tsx`, `AssignDeviceModal.tsx`, `RegisterDeviceModal.tsx`, `CreateShipmentModal.tsx`, `DevicesPage.tsx`) hoạt động dựa trên trạng thái xác thực Admin.
4. **Environment Frontend**:
   - Cập nhật `frontend/.env.example` và `frontend/.env`: Loại bỏ `VITE_ADMIN_API_KEY`.

### 5.2 Tài liệu & Triển khai Deployment
1. **Render Configuration (`render.yaml`, `docs/deployment/render.md`, `docs/deployment/render-wokwi.md`)**:
   - Thay thế `ADMIN_API_KEY` bằng `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET_KEY`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, và `TRUSTED_PROXIES` (đặt IP proxy của Render).
2. **API Documentation (`docs/contracts/api-v1.md`)**:
   - Cập nhật tài liệu OpenAPI và REST contract sang cơ chế Bearer Token, làm rõ mã lỗi `RATE_LIMITED` và việc expose header `Retry-After` qua CORS.
3. **Firmware ESP32 / Wokwi Simulator (`device/README.md`)**:
   - Không cần thay đổi logic nạp khóa hoặc gửi telemetry, vì endpoint `POST /api/v1/shipments/{id}/telemetry` vẫn dùng cơ chế chữ ký số P-256 độc lập.

---

## 6. Kết quả nghiệm thu kiểm thử (Backend Test Suite)

Toàn bộ 191 bài kiểm thử trong `backend/tests/` đã được chạy xác minh:
- **177 passed**
- **14 skipped** (các kiểm thử MySQL live server chỉ chạy khi có cờ `RUN_MYSQL_TESTS=1` hoặc testnet live)
- **0 failed**

Các bộ kiểm thử mới và cập nhật tiêu biểu:
- `backend/tests/test_auth_jwt.py` (74 tests):
  - Khởi tạo `Settings` trực tiếp và qua environment fail-closed khi thiếu từng trường auth, rỗng, placeholder hoặc secret dưới 32 bytes (bao phủ cả development và production).
  - Xác nhận xóa hoàn toàn credential test mặc định khỏi runtime source (`DEFAULT_TEST_*`).
  - Hỗ trợ đầy đủ xác thực admin bằng Unicode (tiếng Việt), mã hóa UTF-8 constant-time, không gây lỗi 500 hay TypeError.
  - Bảo toàn nguyên văn mật khẩu có khoảng trắng đầu/cuối, phân biệt chính xác mật khẩu nguyên văn và mật khẩu bị trim/thêm khoảng trắng.
  - Kiểm tra an toàn JWT `sub` với Unicode và từ chối an toàn khi subject không khớp.
  - Rate limiting (5 attempts/phút), trả về 429 mã `RATE_LIMITED` cùng header `Retry-After`.
  - CORS expose header: Xác minh `Access-Control-Expose-Headers` trả về cả `Retry-After` và `X-Request-ID` cho origin được phép khi bị rate limit.
  - Origin không được phép không nhận quyền đọc response qua CORS.
  - Preflight `OPTIONS` cho phép `Authorization` và `Content-Type`.
  - Ma trận route: Toàn bộ route admin trả 401 khi không có Bearer token hợp lệ; xác nhận `X-Admin-Key` cũ bị từ chối.
  - Xác nhận signed telemetry độc lập hoàn toàn với JWT Admin.
  - Xác nhận endpoint demo không còn đăng ký trên toàn bộ môi trường (404).
