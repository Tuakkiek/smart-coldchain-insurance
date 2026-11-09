# Hướng dẫn Deploy Smart Cold Chain Insurance lên Render

Tài liệu hướng dẫn triển khai toàn diện hệ thống **Smart Cold Chain Insurance** lên nền tảng [Render](https://render.com), bao gồm:
1. **Backend Web Service**: FastAPI + Uvicorn kết nối External MySQL (Aiven).
2. **Frontend Static Site**: React + Vite + TypeScript.

---

## 1. Chuẩn bị trước khi Deploy

- Toàn bộ source code đã được push lên Git repository (GitHub/GitLab).
- Đã có tài khoản trên [Render](https://render.com).
- Cơ sở dữ liệu **MySQL Cloud** (ví dụ [Aiven MySQL](https://aiven.io)) đã được tạo và có thông tin kết nối (Host, Port, User, Password, Database).

---

## 2. Triển khai Backend (FastAPI Web Service)

### Bước 2.1: Tạo Web Service trên Render
1. Đăng nhập vào Render Dashboard: https://dashboard.render.com
2. Nhấn **New +** ở góc trên bên phải → chọn **Web Service**.
3. Chọn kho lưu trữ GitHub của dự án `smart-coldchain-insurance` và nhấn **Connect**.

### Bước 2.2: Cấu hình thông số Build & Deploy
Điền các trường cấu hình như sau:

| Mục | Giá trị |
|---|---|
| **Name** | `smart-coldchain-insurance` (hoặc tên bạn chọn) |
| **Region** | `Singapore` (tối ưu độ trễ cho người dùng tại Việt Nam) |
| **Branch** | `main` (hoặc nhánh bạn muốn deploy) |
| **Root Directory** | `backend` *(rất quan trọng: phải chỉ rõ thư mục backend)* |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | `Free` (hoặc gói trả phí tùy nhu cầu) |

### Bước 2.3: Thiết lập Environment Variables (Biến môi trường)
Kéo xuống mục **Environment Variables** (hoặc tab **Environment**), nhấn **Add Environment Variable** và thêm các biến:

```dotenv
PYTHON_VERSION=3.11.9
APP_ENV=development
LOG_LEVEL=INFO
SENSOR_GAP_MINUTES=5
INTEGRITY_BATCH_MAX_RECORDS=100
INTEGRITY_BATCH_MAX_AGE_MINUTES=5

# Cấu hình kết nối MySQL ngoài Render (ví dụ Aiven)
MYSQL_HOST=<your-aiven-host>
MYSQL_PORT=<your-aiven-port>
MYSQL_DATABASE=defaultdb
MYSQL_USER=avnadmin
MYSQL_PASSWORD=<your-aiven-password>

# CORS: Cho phép cả local dev lẫn domain frontend Render
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://<your-frontend-subdomain>.onrender.com

# Cấu hình Blockchain (tùy chọn, để false nếu chạy demo thông thường)
BLOCKCHAIN_ENABLED=false
```

> [!NOTE]
> - Nếu dùng Aiven MySQL, hệ thống tự động thiết lập kết nối SSL TLS (`verify_mode=none` nếu không chỉ định `MYSQL_SSL_CA`).
> - Nếu muốn dùng CA cert của Aiven để xác thực chứng chỉ (`aiven-ca.pem`):
>   1. Tại mục **Secret Files** trên Render, thêm file tên `aiven-ca.pem` và dán nội dung chứng chỉ CA vào.
>   2. Đường dẫn file trên Render sẽ là `/etc/secrets/aiven-ca.pem`.
>   3. Thêm biến môi trường: `MYSQL_SSL_CA=/etc/secrets/aiven-ca.pem`.

### Bước 2.4: Cấu hình Health Check Path
- Mở rộng mục **Advanced**.
- Tìm mục **Health Check Path**, nhập: `/api/v1/health`
- Nhấn **Create Web Service**.

Render sẽ tiến hành build và khởi chạy. Khi hoàn tất, bạn sẽ nhận được URL Backend, ví dụ:
`https://smart-coldchain-insurance.onrender.com`

Kiểm tra nhanh bằng trình duyệt hoặc curl:
```bash
curl https://smart-coldchain-insurance.onrender.com/api/v1/health
# Kết quả mong đợi: {"status":"ok"}
```

---

## 3. Triển khai Frontend (React Static Site)

### Bước 3.1: Tạo Static Site trên Render
1. Tại Render Dashboard, nhấn **New +** → chọn **Static Site**.
2. Chọn cùng repository GitHub của dự án và nhấn **Connect**.

### Bước 3.2: Cấu hình thông số Static Site

| Mục | Giá trị |
|---|---|
| **Name** | `smart-coldchain-frontend` |
| **Branch** | `main` |
| **Root Directory** | `frontend` *(chỉ định thư mục frontend)* |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |

### Bước 3.3: Thiết lập Environment Variables cho Frontend
Thêm các biến môi trường cho Frontend:

```dotenv
# Trỏ đến URL Backend vừa tạo ở Bước 2
VITE_API_BASE_URL=https://smart-coldchain-insurance.onrender.com
VITE_USE_MOCK=false
VITE_ENABLE_DEMO=true
```

### Bước 3.4: Cấu hình SPA Routing (Redirects / Rewrites)
Ứng dụng sử dụng React Router DOM để điều hướng trang (`/shipments`, `/devices`, `/integrity`, `/events`). Để không bị lỗi 404 khi người dùng F5 hoặc truy cập trực tiếp URL con:

1. Trong trang cài đặt của Static Site, chọn tab **Redirects/Rewrites**.
2. Nhấn **Add Rule**:
   - **Type**: `Rewrite`
   - **Source**: `/*`
   - **Destination**: `/index.html`
3. Nhấn **Save Changes**.

Nhấn **Create Static Site** (hoặc **Manual Deploy** → **Clear build cache & deploy**).
Sau vài phút, Render sẽ cấp cho bạn URL Frontend, ví dụ:
`https://smart-coldchain-frontend.onrender.com`

---

## 4. Đồng bộ CORS giữa Frontend và Backend

Sau khi đã có URL Frontend chính thức (ví dụ: `https://smart-coldchain-frontend.onrender.com`):
1. Quay lại **Web Service Backend** trên Render Dashboard.
2. Vào tab **Environment**.
3. Cập nhật biến `CORS_ORIGINS`:
   ```text
   http://localhost:5173,https://smart-coldchain-frontend.onrender.com
   ```
4. Nhấn **Save Changes**. Render sẽ tự động redeploy Backend trong vài giây.

---

## 5. Lưu ý quan trọng khi dùng Render Free Tier

1. **Hiện tượng Cold Start (Ngủ đông)**:
   - Trên gói miễn phí của Render, sau 15 phút không có request nào, Web Service sẽ tạm thời chuyển sang trạng thái ngủ (spin down).
   - Khi có request mới (người dùng mở web hoặc gửi telemetry), Render cần khoảng **30 - 50 giây** để khởi động lại service.
   - Frontend đã được tích hợp cơ chế nhận biết `RENDER_COLD_START_TIMEOUT` và thông báo người dùng chờ đợi thay vì báo lỗi hệ thống/lỗi cảm biến.

2. **Dữ liệu MySQL không bị mất**:
   - Do hệ thống sử dụng MySQL bên ngoài (Aiven Cloud Managed MySQL) nên toàn bộ telemetry, thiết bị, lô hàng và sự kiện bảo hiểm được lưu trữ bền vững, độc lập với vòng đời của container Render.

