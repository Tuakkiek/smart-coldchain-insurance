# Handover: Backend Single-Admin Login/JWT & API Key Removal

**Ngày cập nhật**: 2026-11-16  
**Phạm vi**: `backend/` (Backend Service)  
**Trạng thái**: Hoàn thành và kiểm thử toàn diện (149 passed, 14 skipped, 0 failed).

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
   - So sánh thông tin xác thực an toàn bằng `secrets.compare_digest` để chống tấn công timing.
   - Startup fail-closed: Ứng dụng từ chối khởi động nếu thiếu cấu hình, cấu hình rỗng, hoặc chứa giá trị placeholder (ví dụ: `<...>`, `changeme`, `placeholder`).

3. **Rate Limiting chống Brute-Force**:
   - Giới hạn 5 lần đăng nhập thất bại / 60 giây / IP.
   - Khi vượt ngưỡng: trả về HTTP `429 Too Many Requests`, header `Retry-After: <seconds>`, và JSON error envelope.
   - Client IP được phân giải an toàn qua cấu hình proxy tin cậy `TRUSTED_PROXIES` (mặc định `127.0.0.1,::1`). Ngăn chặn hoàn toàn việc giả mạo header `X-Forwarded-For` để né rate limiter.
   - Lưu ý kiến trúc: Limiter hiện tại dùng sliding window trong bộ nhớ tiến trình (in-memory). Nếu scale ra nhiều container hoặc tiến trình worker độc lập, mỗi tiến trình có bộ đếm riêng.

4. **Bảo vệ toàn bộ API Quản trị & Giám sát**:
   - Toàn bộ các route quản trị và giám sát (thiết bị, chuyến hàng, truy vấn telemetry, sự kiện, batches, verify, seal, anchor, reconcile, demo) đều yêu cầu header `Authorization: Bearer <access_token>`.
   - Ingestion telemetry có chữ ký (`POST /api/v1/shipments/{id}/telemetry`) giữ nguyên xác thực độc lập bằng chữ ký ECDSA P-256 từ thiết bị phần cứng, không yêu cầu JWT và không bị JWT thay thế.

---

## 2. API Contract: Đăng nhập & Xác thực

### 2.1 Endpoint Đăng nhập

- **URL**: `POST /api/v1/auth/login`
- **Public**: Có
- **Content-Type**: `application/json`

#### Request Body
```json
{
  "username": "admin",
  "password": "StrongAdminPassword123!"
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
    "message": "Invalid username or password"
  }
}
```

#### Response Vượt quá Rate Limit (`429 Too Many Requests`)
- Header: `Retry-After: 60`
- Body:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many failed login attempts. Please try again later."
  }
}
```

#### Response Lỗi định dạng Request (`422 Unprocessable Entity`)
Trả về theo chuẩn FastAPI validation error envelope.

---

### 2.2 Sử dụng Bearer Token

Gửi kèm token trong header HTTP của mọi request cần xác thực:
```http
Authorization: Bearer <access_token>
```

- Thời hạn hiệu lực: Mặc định 30 phút (`JWT_ACCESS_TOKEN_EXPIRE_MINUTES`).
- Khi token hết hạn hoặc không hợp lệ: Backend trả về `401 Unauthorized` với header `WWW-Authenticate: Bearer` và thông báo lỗi an toàn `Could not validate credentials` (không lộ lý do chi tiết cho client bên ngoài).
- Logout: Không có endpoint thu hồi phía server (stateless JWT). Phía client thực hiện logout bằng cách xóa token khỏi bộ nhớ / `sessionStorage`.

---

## 3. Ma trận Route: Public vs Protected

| Phương thức | Route | Xác thực | Ghi chú |
|---|---|---|---|
| `GET` | `/api/v1/health` | **Public** | Kiểm tra liveness |
| `GET` | `/api/v1/ready` | **Public** | Kiểm tra database readiness |
| `POST` | `/api/v1/auth/login` | **Public** | Đăng nhập Admin (Rate limited: 5 req/phút/IP) |
| `POST` | `/api/v1/shipments/{id}/telemetry` | **Public (Device)** | Xác thực qua ECDSA P-256 SPKI PEM của device |
| `POST` | `/api/v1/devices` | **Bearer JWT** | Đăng ký thiết bị |
| `GET` | `/api/v1/devices` | **Bearer JWT** | Danh sách thiết bị & trạng thái |
| `POST` | `/api/v1/devices/{device_id}/assignments` | **Bearer JWT** | Gán/hủy gán thiết bị vào chuyến hàng |
| `POST` | `/api/v1/devices/{device_id}/keys` | **Bearer JWT** | Nạp Public Key P-256 cho thiết bị |
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
| `POST` | `/api/v1/batches/{batch_id}/anchor` | **Bearer JWT** | Đưa batch lên Data Integrity Contract |
| `POST` | `/api/v1/batches/{batch_id}/retry` | **Bearer JWT** | Thử lại neo batch |
| `POST` | `/api/v1/shipments/{id}/insurance/reconcile` | **Bearer JWT** | Đối soát bằng chứng bảo hiểm |
| `POST` | `/api/v1/demo/shipments/{id}/scenario` | **Bearer JWT** | Chỉ khả dụng trong môi trường development |

---

## 4. Biến môi trường Backend cần cấu hình

Thêm vào file `.env` của Backend (hoặc cấu hình Environment trên dịch vụ lưu trữ):

```dotenv
# Duy nhất một tài khoản Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ThayBangMatKhauManhItNhat16KyTu!

# JWT Token Configuration (Khóa bí mật tối thiểu 32 ký tự ngẫu nhiên)
JWT_SECRET_KEY=c3f1e948a27b4d1e8c9501a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30

# Proxy tin cậy (ngăn IP spoofing qua header X-Forwarded-For)
TRUSTED_PROXIES=127.0.0.1,::1
```

> **Cảnh báo an toàn**:
> - Không dùng giá trị mặc định, từ khóa yếu như `changeme`, `placeholder`, `<...>`, hoặc khóa bí mật dưới 32 ký tự. Backend sẽ kiểm tra và dừng khởi động ngay lập tức nếu phát hiện.
> - Tuyệt đối không commit file `.env` thật chứa mật khẩu/secret vào Git repository.

---

## 5. Hướng dẫn bàn giao & Các hạng mục cần cập nhật ở các phân hệ khác

Vì lượt thực hiện này **CHỈ** được phép sửa đổi trong thư mục `backend/`, các phân hệ bên ngoài chưa được cập nhật và cần thực hiện trong các lượt tiếp theo:

### 5.1 Phân hệ Frontend (`frontend/`)
Hiện tại frontend gửi `X-Admin-Key` hoặc chưa có cơ chế lưu/gửi JWT token. Do đó, các request gọi API quản trị từ frontend sẽ nhận `401 Unauthorized` cho đến khi hoàn thành các cập nhật sau:
1. **API Client & Request Interceptor**:
   - `frontend/src/api/client.ts`: Xóa bỏ việc đọc `VITE_ADMIN_API_KEY` và header `X-Admin-Key`. Thêm interceptor tự động đính kèm `Authorization: Bearer <token>` lấy từ state / `sessionStorage`.
   - Bắt mã lỗi `401 Unauthorized`: Điều hướng người dùng về màn hình đăng nhập và xóa token hết hạn.
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
   - Cập nhật tài liệu OpenAPI và REST contract sang cơ chế Bearer Token.
3. **Firmware ESP32 / Wokwi Simulator (`device/README.md`)**:
   - Không cần thay đổi logic nạp khóa hoặc gửi telemetry, vì endpoint `POST /api/v1/shipments/{id}/telemetry` vẫn dùng cơ chế chữ ký số P-256 độc lập.

---

## 6. Kết quả nghiệm thu kiểm thử (Backend Test Suite)

Toàn bộ 163 bài kiểm thử trong `backend/tests/` đã được chạy xác minh:
- **149 passed**
- **14 skipped** (các kiểm thử MySQL live server chỉ chạy khi có cờ `RUN_MYSQL_TESTS=1` hoặc testnet live)
- **0 failed**

Các bộ kiểm thử mới và cập nhật tiêu biểu:
- `backend/tests/test_auth_jwt.py` (46 tests):
  - Đăng nhập thành công, nhận token và payload chuẩn.
  - Từ chối mật khẩu sai, username sai, thiếu trường request (422).
  - Rate limiting (5 attempts/phút), trả về 429 và `Retry-After`.
  - Kháng giả mạo header `X-Forwarded-For` từ client không tin cậy.
  - Fail-closed khi startup với cấu hình thiếu, rỗng, placeholder hoặc secret dưới 32 bytes.
  - Token sai chữ ký, hết hạn, sai thuật toán (`none`), sai `sub`, thiếu `sub`/`iat`/`exp`.
  - Ma trận route: Toàn bộ route admin trả 401 khi không có Bearer token hợp lệ; xác nhận `X-Admin-Key` cũ bị từ chối.
  - Xác nhận signed telemetry độc lập hoàn toàn với JWT Admin.
  - Xác nhận endpoint demo bị ẩn (404) trong production.
  - CORS preflight (`OPTIONS`) hoạt động thông suốt với header `Authorization` và `Content-Type`.
