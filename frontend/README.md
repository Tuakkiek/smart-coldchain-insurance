# Frontend — Smart Cold Chain Insurance Dashboard

Luồng hiện tại: tạo lô hàng bằng tên, nhận `shipment_id` UUID, chọn và gán ESP32-01 đến ESP32-10 có sẵn. Không có đăng ký/xóa thiết bị. Xem [hướng dẫn local](../docs/local-devices.md).

Giao diện giám sát chuỗi cung ứng lạnh, dữ liệu telemetry cảm biến (nhiệt độ, độ ẩm), vị trí mô phỏng tuyến đường, cảnh báo vi phạm ngưỡng nhiệt độ và trạng thái bồi thường bảo hiểm tự động trên Blockchain.

Được phát triển theo lộ trình tại [ROADMAP_TTDK_FRONTEND_QA.md](../ROADMAP_TTDK_FRONTEND_QA.md) và hệ thống thiết kế [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

---

## 1. Công nghệ sử dụng

- **Core:** React 18 + TypeScript + Vite.
- **Routing:** React Router v6.
- **Icon:** Lucide React (chuẩn outline tối giản).
- **Styling:** CSS Tokens & Modern Responsive Layout (phong cách Apple tối giản, rõ ràng, trung thực với dữ liệu).
- **API Client:** Lớp client duy nhất kết nối REST API Backend `/api/v1` chuẩn RESTful.

---

## 2. Cài đặt và Chạy

### 2.1 Cài đặt dependencies

Từ thư mục `frontend/`:

```bash
npm install
```

### 2.2 Cấu hình môi trường

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Các biến môi trường:
- `VITE_API_BASE_URL`: Địa chỉ REST API Backend (mặc định development: `http://localhost:8000`; production dùng URL Render đã cấu hình). Không trộn `localhost` với `127.0.0.1` vì refresh cookie được phân tách theo hostname.

### 2.3 Khởi chạy máy chủ phát triển (Dev Server)

```bash
npm run dev
```

Truy cập trên trình duyệt tại: `http://localhost:5173` (hoặc cổng hiển thị trên console).

### 2.4 Kiểm tra build và types

```bash
npm run build
```

---

### 2.5. Đăng nhập Admin / JWT

- Mở `/login`, nhập username/password của **Admin duy nhất đã cấu hình ở Backend**. Frontend gọi JSON `POST /api/v1/auth/login`; không cấu hình username/password/JWT secret trong `VITE_*`.
- Access token được giữ trong bộ nhớ và `localStorage` với key `coldchain_admin_session`; key cùng tên trong `sessionStorage` được dọn khi migrate. API client tự gửi `Authorization: Bearer <access_token>` cho API quản trị/giám sát.
- Refresh token được lưu phía Frontend dưới dạng cookie `HttpOnly` do trình duyệt quản lý nên JavaScript không thể đọc trực tiếp. Login, refresh và logout dùng `credentials: 'include'`; các request API thường dùng `credentials: 'omit'`.
- Reload trang khôi phục access token còn hạn. Client chủ động dùng refresh cookie để lấy access token mới trước khi token hiện tại hết hạn; các request đồng thời dùng chung một refresh promise. Request đã gửi không được tự động phát lại khi nhận `401`; khi đó phiên local bị xóa và người dùng quay về Login.
- F5 không bắt buộc gọi refresh nếu access token còn hơn 60 giây. Khi refresh gặp lỗi mạng hoặc backend tạm lỗi, client giữ token còn hạn và thử lại sau 15 giây; refresh trả `401` hoặc token hết hạn thì kết thúc phiên.
- Hai hostname riêng `*.onrender.com` là khác site. Backend cần `REFRESH_COOKIE_SAMESITE=none`, `REFRESH_COOKIE_SECURE=true`, `REFRESH_COOKIE_DOMAIN=` và `CORS_ORIGINS` đúng origin frontend. Đăng nhập lại sau khi đổi cấu hình để trình duyệt nhận cookie mới.
- Nút **Đăng xuất** gọi Backend để revoke/xóa refresh cookie và luôn xóa access token local, kể cả khi Backend tạm thời không kết nối được. Login/refresh/logout không tự retry.
- Sai thông tin đăng nhập trả `401`; `429` hiển thị thời gian chờ từ `Retry-After` và khóa nút tới lúc thử lại. Không tự retry POST login. Mật khẩu giữ nguyên khoảng trắng khi gửi, không lưu/log sau khi submit.
- Backend cho phép CORS đúng frontend origin với `Authorization`/`Content-Type` và expose `Retry-After`. Production dùng HTTPS và static host phải rewrite đường dẫn SPA (như `/login`, `/devices`) về `index.html`.
- Login luôn dùng **Backend thật**. ESP32/telemetry giữ cơ chế xác thực P-256 riêng, không dùng JWT Admin.

Chạy kiểm thử auth và production build từ `frontend/`:

```bash
npm test
npm run build
```

Tests dùng fetch fixtures, không truy cập deployment thật hoặc giao dịch Blockchain. Bao gồm localStorage migration, startup refresh, login/logout, refresh chủ động thành công/thất bại, refresh đồng thời, không replay request, route guard và response trả về muộn sau đổi phiên.

Vitest 5 yêu cầu Node.js `^22.12.0 || ^24.0.0 || >=26.0.0`; môi trường kiểm chứng hiện tại dùng Node.js 22.18.0.

---

## 3. Cấu trúc thư mục

```text
frontend/
├── public/                 # Assets tĩnh (icon, favicon)
├── src/
│   ├── api/                # Lớp gọi REST API duy nhất (client, shipments, events, devices, integrity)
│   ├── components/         # Shared components
│   │   ├── layout/         # AppShell, Sidebar, TopBar, PageHeader
│   │   ├── ui/             # Button, Card, Badge, Input
│   │   ├── feedback/       # LoadingState, EmptyState, ErrorState, ConnectionStatus
│   │   └── data-display/   # MetricCard, StatusBadge
│   ├── pages/              # OverviewPage, ShipmentsPage, ShipmentDetailPage, EventsPage, DevicesPage, DataIntegrityPage
│   ├── styles/             # tokens.css (Design tokens), globals.css
│   ├── types/              # TypeScript types chuẩn khớp docs/contracts/api-v1.md
│   ├── App.tsx             # Định tuyến SPA
│   └── main.tsx            # Entry point
├── .env.example            # Mẫu cấu hình môi trường
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 4. Các màn hình chính

1. **Tổng quan (Overview - `/`):**
   - 4 thẻ thống kê: Tổng số lô hàng, Đang vận chuyển, Lô hàng ngoài ngưỡng nhiệt độ, Lô hàng đã kích hoạt bảo hiểm.
   - Danh sách lô hàng cập nhật mới nhất.
   - Bảng cảnh báo vi phạm thời gian thực.
2. **Danh sách lô hàng (`/shipments`):**
   - Tìm kiếm theo mã, loại hàng, địa điểm.
   - Lọc theo trạng thái (`in_transit`, `insurance_triggered`, `sensor_data_gap`, `created`).
3. **Chi tiết lô hàng (`/shipments/:id`):**
   - Thông tin lộ trình, loại hàng, khoảng nhiệt độ cho phép `[temp_min_c, temp_max_c]`.
   - Telemetry gần nhất (nhiệt độ, độ ẩm, thiết bị đo).
   - Nhãn rõ ràng: **"Vị trí mô phỏng từ Backend"** (không gây hiểu nhầm GPS thực).
   - Lịch sử mẫu đo và dòng thời gian sự kiện (timeline).
   - Trạng thái hợp đồng bảo hiểm và transaction hash Blockchain.
4. **Sự kiện & Vi phạm (`/events`):**
   - Tập hợp các sự kiện `TEMPERATURE_BREACH_STARTED`, `INSURANCE_TRIGGERED`, `SENSOR_DATA_GAP`.

---

## 5. Nguyên tắc an toàn & Ranh giới

- **Không gọi trực tiếp thiết bị ESP32** hoặc RPC Blockchain từ trình duyệt.
- Mọi dữ liệu vị trí phải mang nhãn **"Vị trí mô phỏng từ Backend"**.
- Trạng thái bảo hiểm và Blockchain do Backend quản lý và trả về qua REST API; Frontend không tự kết luận đã chi trả khi chưa có xác nhận từ Backend.
- Không lưu private key hoặc seed phrase trong Frontend.


Local Vite mặc định gọi `http://localhost:8000` khi không đặt `VITE_API_BASE_URL`; production vẫn dùng Backend được cấu hình, không tự fallback. Admin đăng nhập bằng tài khoản đã seed trong MySQL/Aiven; `.env` Backend chỉ cung cấp credential khởi tạo lần đầu.
