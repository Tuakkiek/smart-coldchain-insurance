# Frontend — Smart Cold Chain Insurance Dashboard

Giao diện giám sát chuỗi cung ứng lạnh, dữ liệu telemetry cảm biến (nhiệt độ, độ ẩm), vị trí mô phỏng tuyến đường, cảnh báo vi phạm ngưỡng nhiệt độ và trạng thái bồi thường bảo hiểm tự động trên Blockchain.

Được phát triển theo lộ trình tại [ROADMAP_TTDK_FRONTEND_QA.md](../ROADMAP_TTDK_FRONTEND_QA.md) và hệ thống thiết kế [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

---

## 1. Công nghệ sử dụng

- **Core:** React 18 + TypeScript + Vite.
- **Routing:** React Router v6.
- **Icon:** Lucide React (chuẩn outline tối giản).
- **Styling:** CSS Tokens & Modern Responsive Layout (phong cách Apple tối giản, rõ ràng, trung thực với dữ liệu).
- **API Client:** Lớp client duy nhất kết nối REST API Backend `/api/v1` cùng Mock Adapter độc lập cho môi trường phát triển / demo.

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
- `VITE_API_BASE_URL`: Địa chỉ REST API Backend (mặc định: `https://smart-coldchain-insurance.onrender.com` hoặc `http://localhost:8000` khi chạy local).
- `VITE_USE_MOCK`: Bật dữ liệu Mock độc lập (`true` hoặc `false`). Hữu ích khi Backend chưa chạy hoặc muốn demo nhanh 3 kịch bản chuẩn.
- `VITE_ENABLE_DEMO`: Cho phép hiển thị tab Demo kịch bản (`true` hoặc `false`).

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

## 3. Cấu trúc thư mục

```text
frontend/
├── public/                 # Assets tĩnh (icon, favicon)
├── src/
│   ├── api/                # Lớp gọi REST API duy nhất (client, shipments, events, demo)
│   ├── components/         # Shared components
│   │   ├── layout/         # AppShell, Sidebar, TopBar, PageHeader
│   │   ├── ui/             # Button, Card, Badge, Input
│   │   ├── feedback/       # LoadingState, EmptyState, ErrorState, ConnectionStatus
│   │   └── data-display/   # MetricCard, StatusBadge
│   ├── mocks/              # Mock adapter và fixtures chuẩn (3 tình huống: bình thường, vi phạm, kích hoạt bảo hiểm)
│   ├── pages/              # OverviewPage, ShipmentsPage, ShipmentDetailPage, EventsPage, DemoPage
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
5. **Khu vực Demo (`/demo`):**
   - Thực thi kịch bản kiểm thử "Nhiệt độ vượt ngưỡng" và "Khôi phục bình thường".
   - Khóa nút chống click trùng khi kịch bản đang chạy, hiển thị phản hồi từ Backend.

---

## 5. Nguyên tắc an toàn & Ranh giới

- **Không gọi trực tiếp thiết bị ESP32** hoặc RPC Blockchain từ trình duyệt.
- Mọi dữ liệu vị trí phải mang nhãn **"Vị trí mô phỏng từ Backend"**.
- Trạng thái bảo hiểm và Blockchain do Backend quản lý và trả về qua REST API; Frontend không tự kết luận đã chi trả khi chưa có xác nhận từ Backend.
- Không lưu private key hoặc seed phrase trong Frontend.

