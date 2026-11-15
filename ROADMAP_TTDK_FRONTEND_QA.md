# ROADMAP THÀNH VIÊN 3 — Frontend, Dashboard và Kiểm thử giao diện

> **Dự án:** `smart-coldchain-insurance`  
> **Thành viên:** TTDK — Member 3: **Frontend & QA**  
> **Quyền sở hữu:** `frontend/`; phối hợp nghiệm thu hợp đồng API do NTK quản lý.  
> **Mục tiêu:** Xây dựng Dashboard responsive quan sát lô hàng lạnh, telemetry ESP32 đã được Backend xác minh, tình trạng thiết bị, tính toàn vẹn dữ liệu/Merkle batch, bằng chứng anchoring trên Blockchain và trạng thái chi trả bảo hiểm demo.  
> **Kiến trúc nâng cấp:** **IoT Data Integrity + Blockchain Data Anchoring + Smart Contract Insurance + Public FastAPI Backend on Render**.  
> **Trạng thái tài liệu:** Roadmap triển khai; **không** có nghĩa các tính năng, API, contract hoặc URL public đã được triển khai.

> **Điều chỉnh thiết kế demo 2026-11-15:** Đồng bộ với [roadmap NTK](ROADMAP_NTK_IOT_BACKEND.md) và [roadmap NTD](ROADMAP_NTD_BLOCKCHAIN_SMART_CONTRACT.md). Repo đã có `RegisterDeviceModal`, `DevicesPage`, `CreateShipmentModal`, API client và mocks. Form device hiện yêu cầu public key/key ID/shipment cùng lúc; Backend chưa có `GET /devices` dù client/mock đã tham chiếu. Lượt này **chỉ sửa roadmap**, giữ nguyên checkbox/tiến độ, không coi UI mock hoặc phần thiết kế mới là API đã triển khai.

> **Thiết kế mục tiêu 2026-11-15 — PLANNED:** **một Admin từ Backend env → Login/JWT → Bearer REST API**, Backend **Web3.py → Alchemy HTTPS RPC → Ethereum Sepolia `11155111`**, contracts compile/test/deploy bằng **Remix + MetaMask**. Không phụ thuộc Hardhat/local node/`31337`, không dùng `ADMIN_API_KEY` hoặc `X-Admin-Key` trong flow mới. Các kết quả/checkbox lịch sử giữ nguyên, không phải bằng chứng JWT/Sepolia đã chạy. Lượt này chỉ sửa ba roadmap, không sửa `.env`, source/client, API thực thi hay deploy.

**Đối chiếu tĩnh mới thay mô tả baseline cũ ở trên:** Backend đã có DTO ID/tên, `GET /devices`, DeviceOut/key status/current shipment và `AdminSession` cho create shipment/verify. `RegisterDeviceModal` đã gửi ID/tên nhưng còn ô nhập/lưu Admin key; client lưu key trong localStorage. Chưa có login JWT, runtime còn API key/local defaults. Tái sử dụng phần đăng ký đã có, bỏ ô nhập key và chuyển auth đồng bộ; kiểm chứng API/MySQL trước nghiệm thu, không tự tick hoàn thành. Chi tiết [NTK §3.2.1](ROADMAP_NTK_IOT_BACKEND.md#321-login-của-duy-nhất-admin--contract-mới-planned).

### Quy trình Admin tối giản dùng chung

**Admin đăng nhập → nhận JWT → đăng ký thiết bị → đăng ký chuyến hàng → liên kết thiết bị với chuyến hàng → cấp khóa cho ESP32 → ESP32 ký/gửi → Backend xác minh Public Key → MySQL → Merkle Root → Web3.py → Alchemy RPC → Ethereum Sepolia → Insurance.**

- Form device chỉ có `device_id = "ESP32-001"`, `device_name = "Cold Chain Sensor 01"` và nút đăng ký; list có tên/ID, trạng thái đã/chưa có public key, chuyến hiện gán hoặc "Chưa gán".
- Form chuyến nhập **mã `SHIP-001` vào `code`**, điểm đi/đến, loại hàng, min/max, thời lượng và VND. Backend tạo **`id` UUID v4 chữ thường**; UI hiển thị mã dễ đọc nhưng dùng UUID trả về cho route, dropdown gán và mọi request `shipment_id`. Không chuyển sang ký chuỗi `SHIP-001` thay UUID.
- Liên kết bằng hai lựa chọn device/chuyến và nút "Liên kết". Mỗi device chỉ có **một assignment active**, nhiều device có thể cùng chuyến. Đổi chuyến bằng bỏ gán cũ (`active=false`) rồi gán mới; Backend bảo đảm ràng buộc, UI xử lý `409 DEVICE_ALREADY_ASSIGNED`.
- Cấp khóa bằng **script Python của NTK trên máy tin cậy**: tạo cặp P-256 riêng/device → private key vào `device/cold_chain_device/config.h` → nạp USB → chỉ public key SPKI PEM qua API admin. Frontend chỉ refetch key status; không có form sinh/nhập/hiển thị private key, không cần form dán public PEM/rotation. Không PKI, OTA hay remote provisioning.
- Monitoring giữ nhiệt độ/độ ẩm theo chuyến và `device_id`, `received_at`, chữ ký/sequence, Merkle/Blockchain/insurance theo API. Frontend chỉ gọi **FastAPI REST**, không trực tiếp ký hoặc gửi telemetry của ESP32, gọi DB hay Blockchain RPC.
- Device được gửi khi đã đăng ký/active, đúng assignment active, có `key_id` active trong MySQL, format/chữ ký **ECDSA P-256 + SHA-256** đúng và sequence hợp lệ. `has_public_key=true` không đồng nghĩa đã flash thành công hoặc đã có dữ liệu hợp lệ.

Contract request/response/lỗi mục tiêu: [NTK §3.6](ROADMAP_NTK_IOT_BACKEND.md#36-contract-mục-tiêu-cho-đăng-ký-gán-chuyến-và-cấp-khóa--jwt-chưa-triển-khai); schema/migration do NTK quản lý ở Phase 3. Merkle Tree, Data Integrity, Blockchain Anchoring và Insurance Oracle giữ nguyên; không thêm contract đăng ký thiết bị.

---

## 1. Phạm vi và ranh giới sở hữu

### 1.1. Bạn chịu trách nhiệm

- Xây dựng **Frontend React + Vite + TypeScript**, responsive desktop và mobile; điều hướng, layout, accessibility và UI states.
- Thêm **Login/Logout cho duy nhất Admin**, lưu Access Token trong state hoặc sessionStorage cho demo, Bearer API client/route guard và xử lý 401/hết hạn đăng nhập lại; không Register/Forgot Password/tạo Admin/đa vai trò/quản lý tài khoản.
- Xây dựng **Dashboard tổng quan**, danh sách/chi tiết lô hàng, biểu đồ nhiệt độ/độ ẩm, timeline cảnh báo và bản đồ vị trí **mô phỏng từ Backend**.
- Đơn giản hóa **Admin**: đăng ký ID/tên device, tạo chuyến theo mã nghiệp vụ, danh sách device/chuyến, dropdown gán và trạng thái public key; dùng lại modal/page hiện có, không xây hệ quản trị vòng đời IoT.
- Bổ sung màn hình **Device Integrity**: nhận dạng thiết bị, trạng thái xác thực chữ ký, sequence, missing ranges, heartbeat, online/offline và firmware version nếu API có trả.
- Bổ sung màn hình **Data Integrity**: thống kê verified/invalid/missing records, danh sách batch, Merkle root, trạng thái anchor, kết quả đối chiếu và cảnh báo dữ liệu bị thay đổi.
- Bổ sung khu vực **Blockchain & Insurance** phân biệt transaction **Data Anchoring**, **Violation/Oracle** và **Demo Payout**.
- Gọi **REST API duy nhất qua Backend FastAPI**; thiết kế API client, typed DTO, error handling, polling/refetch hợp lý.
- Kết nối với **URL public thực tế của FastAPI trên Render**, tách cấu hình local/mock/production; kiểm tra CORS và tình huống cold start.
- Làm **Frontend QA**, mock/contract tests, smoke test, E2E test và kịch bản demo 12 tình huống tối thiểu theo prompt nâng cấp.
- Bàn giao wireframe/screenshots, `frontend/README.md`, hướng dẫn build/deploy, test report và checklist trình diễn cho cả nhóm.

### 1.2. Ranh giới không được vượt qua

- **Không** sửa `device/`, `backend/` hoặc `docs/contracts/api-v1.md` (NTK — Member 1 sở hữu); thay đổi contract phải đề xuất qua issue/PR và được NTK chốt.
- **Không** sửa `blockchain/`, ABI, access control hoặc logic Solidity (NTD — Member 2 sở hữu).
- **Không** giao tiếp trực tiếp ESP32, MySQL, Blockchain RPC hay contract từ trình duyệt để thực hiện nghiệp vụ. Frontend chỉ sử dụng REST API do NTK công bố.
- **Không** tự xác minh ECDSA, tự suy ra `DATA_VERIFIED` từ payload thô, tự tính Merkle root để thay kết luận của Backend, tự ghi trạng thái anchor/payout thành công.
- **Không** đặt private key, seed phrase, RPC admin secret, database credential hay API key bí mật vào mã Frontend, `.env` dùng Vite hoặc browser local storage.
- **Không** tự sinh GPS thật, lịch sử đo thật, transaction hash thật hay kết quả thanh toán thật khi API không có dữ liệu.
- **Không** bật các thao tác gây thay đổi dữ liệu bảo hiểm hoặc demo tampering trên public production; demo sử dụng Backend dev/demo và dữ liệu thử nghiệm riêng.

### 1.3. Thư mục được phép sở hữu (gợi ý, giữ repo hiện có nếu đang phù hợp)

```text
frontend/
├── public/
├── src/
│   ├── api/
│   │   ├── client.ts                   # Base URL, HTTP/error, timeout
│   │   ├── auth.ts                     # Đề xuất: POST login, token phiên, 401/logout
│   │   ├── devices.ts                  # Register/list/assign, key status, health
│   │   ├── shipments.ts                # Shipment CRUD/read
│   │   ├── telemetry.ts                # Telemetry history
│   │   ├── integrity.ts                # Summary, batches, verification
│   │   ├── insurance.ts                # Policy/payout read-only
│   │   ├── blockchain.ts               # Transaction status read-only
│   │   └── demo.ts                     # Chỉ dùng khi Backend cho phép
│   ├── components/
│   │   ├── layout/
│   │   ├── status/
│   │   ├── charts/
│   │   └── feedback/
│   ├── features/
│   │   ├── auth/                       # Đề xuất: chỉ Login/Logout, không Sign Up
│   │   ├── dashboard/
│   │   ├── shipments/
│   │   ├── telemetry/
│   │   ├── devices/
│   │   ├── integrity/
│   │   ├── blockchain/
│   │   ├── insurance/
│   │   └── demo/
│   ├── pages/
│   ├── types/                         # DTO theo OpenAPI / api-v1.md
│   ├── mocks/                         # Fixtures chỉ dùng khi bật mock
│   ├── hooks/                         # Polling/query hooks
│   ├── utils/
│   └── main.tsx
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example                      # Placeholder, không chứa secret
├── README.md
└── package.json
```

- Không bắt buộc tạo mọi file ngay Phase 0; chỉ tạo khi bắt đầu sử dụng.
- Tách `api/` (network/DTO) khỏi `features/` (UI/logic trình bày), tránh component gọi `fetch()` tùy ý.
- **Member 3 chỉ sở hữu `frontend/`;** các tài liệu kiến trúc/tích hợp dùng chung được NTK/NTD cập nhật theo quyền sở hữu đã thống nhất.

---

## 2. Kiến trúc, quy ước kỹ thuật và hợp đồng dữ liệu

### 2.1. Sơ đồ tích hợp Frontend trong kiến trúc mới

```text
ESP32 + Sensors
    │ Signed telemetry (ECDSA P-256), sequence_number, timestamp
    ▼
FastAPI Backend — NTK (local / Render public)
    ├─ Một Admin trong env → POST /auth/login → JWT Bearer cho Admin/monitoring
    ├─ Xác minh device signature, sequence, replay/gap/offline
    ├─ Ghi toàn bộ accepted telemetry + metadata vào external MySQL
    ├─ Seal canonical Merkle batch và lưu integrity/audit metadata
    ├─ Web3.py ─► Alchemy HTTPS RPC ─► Data Integrity Contract trên Sepolia 11155111 — NTD
    └─ Violation detection (15 phút liên tục)
          └─ Authorized Oracle ─► Insurance Contract — NTD

Frontend — TTDK
    └─ Login → Access Token → HTTPS REST /api/v1 + Authorization: Bearer ─► FastAPI
          ├─ Admin: register device ID/name, create shipment code → UUID, assign device
          ├─ Shipments + temperature/humidity + vị trí mô phỏng
          ├─ Devices + signature/sequence/availability
          ├─ Integrity batches + on-chain verification status
          └─ Insurance eligibility + payout receipt/status
```

**Nhiệm vụ của Frontend là thể hiện bằng chứng và trạng thái mà Backend đã xác minh**, không biến Web Browser thành Oracle hoặc dịch vụ kiểm tra chữ ký song song.

NTD compile/test/deploy bằng Remix + MetaMask, NTK giữ Alchemy RPC/khóa Ethereum trong Backend; Alchemy chỉ cung cấp RPC, không database telemetry/blockchain riêng. Trình duyệt không cần ví/Web3/Alchemy SDK cho nghiệp vụ; chỉ mở link Sepolia Etherscan. Node.js tiếp tục dùng cho React Vite, không yêu cầu cho công việc Smart Contract.

### 2.2. Công nghệ và nguyên tắc giữ từ Roadmap gốc

1. **Stack:** React + Vite + TypeScript, router theo nhu cầu, Leaflet cho bản đồ; có thể dùng thư viện biểu đồ phù hợp sau khi thống nhất dependency, không bắt buộc đổi stack hiện có.
2. **Backend API:** một API client tập trung, `VITE_API_BASE_URL` chứa prefix `/api/v1` nếu chốt theo NTK; **không nhân đôi `/api/v1`** khi gọi endpoint.
3. **Source of truth:** `docs/contracts/api-v1.md` + OpenAPI do NTK cung cấp; TypeScript DTO, enums, pagination và error response phải khớp phiên bản đã chốt. Không tự chốt schema mới chỉ vì mock cần nó.
4. **Vị trí:** chỉ dùng `latitude`, `longitude`, `location_source`, `progress_pct` do Backend cung cấp; `location_source === "backend_simulated"` phải gắn nhãn **“Vị trí mô phỏng từ Backend”**. Không tuyên bố GPS thực.
5. **Thời gian:** `received_at` do Backend tạo là mốc thời gian authoritative để tính 15 phút vi phạm; `recorded_at` từ thiết bị chỉ để tham khảo/đối chiếu, có thể lệch giờ hoặc gói đến trễ.
6. **Bảo hiểm:** threshold và `violation_duration_minutes` thuộc từng shipment; demo mặc định **15 phút liên tục có dữ liệu đủ điều kiện**, không phải cứ nhiệt độ vượt ngưỡng một mẫu là được chi trả.
7. **Blockchain:** không ghi từng telemetry lên chain; chỉ lưu commitment theo batch và nghiệp vụ bảo hiểm. `insured_amount_vnd` không tương đương số token demo chuyển trên local/testnet.
8. **Không giả thành công:** `transaction_hash` chỉ chứng tỏ có tham chiếu đến một giao dịch; status payout thành công phải dựa vào Backend đã đối chiếu receipt, event/state và confirmations theo quy tắc NTK/NTD.
9. **Mock:** chỉ dùng trong môi trường được bật rõ `VITE_USE_MOCKS=true` (tên biến là **đề xuất**, chốt theo code); hiển thị nhãn `MOCK DATA`, không âm thầm fallback khi API thực mất kết nối.
10. **Độ tin cậy:** khi RPC lỗi, anchor pending, Render spin down hoặc MySQL tạm mất kết nối thì UI phải phân biệt nguồn lỗi và không tự đổi kết luận về dữ liệu cảm biến.

### 2.3. Định nghĩa trạng thái — nhất quán với NTK và NTD

| Nhóm | Trường API đề xuất | Giá trị / cách thể hiện |
|---|---|---|
| Chữ ký thiết bị | `signature_status` | `VALID`, `INVALID`, `UNKNOWN_KEY` — chỉ Backend xác định |
| Dữ liệu telemetry | `data_status` | `DATA_VERIFIED`, `DATA_INCOMPLETE`, `INVALID` |
| Độ đầy đủ | `completeness_status` | `COMPLETE`, `DATA_INCOMPLETE`, `OFFLINE`, `UNKNOWN` |
| Đối chiếu batch | `verification_status` | `NOT_CHECKED`, `MATCHED`, `DATA_INTEGRITY_FAILED` |
| Anchoring | `anchor_status` | `NOT_READY`, `BLOCKCHAIN_PENDING`, `DATA_ANCHORED`, `BLOCKCHAIN_FAILED` |
| Eligibility bảo hiểm | Thuộc `insurance` | `EVIDENCE_PENDING` khi breach đủ điều kiện nhưng evidence chờ integrity/anchor |
| Thanh toán demo | `payout_status` | `NOT_ELIGIBLE`, `EVIDENCE_PENDING`, `PENDING`, `CONFIRMED`, `FAILED` |
| Khả dụng Backend | Kết quả request/health | `ONLINE`, `UNAVAILABLE`, `DEGRADED` **chỉ là state trình bày**, không tự đưa vào enum API nếu chưa chốt |

**Quy tắc hiển thị bắt buộc:**

- `DATA_VERIFIED` = Backend đã kiểm tra chữ ký và chấp nhận dữ liệu theo protocol; **không phải** `DATA_ANCHORED`.
- `DATA_ANCHORED` = batch root được ghi nhận on-chain **sau** receipt thành công, đối chiếu root và số confirmations yêu cầu; **không phải** bằng chứng cảm biến vật lý chắc chắn đúng.
- `MATCHED` = root của batch tính lại khớp root đã sealed/on-chain tại lần xác minh; **khác** với `DATA_ANCHORED` và không thay thế `signature_status`.
- `DATA_INTEGRITY_FAILED` = Merkle root tính lại không khớp; hiển thị cảnh báo nổi bật, thời điểm verify, batch liên quan, hạn chế dùng làm bằng chứng bảo hiểm.
- `DATA_INCOMPLETE` = có gap hoặc thiếu dữ liệu; **không** tự coi là temperature violation, không tự payout.
- `BLOCKCHAIN_PENDING`/`BLOCKCHAIN_FAILED` = riêng cho luồng anchor. Giao dịch insurance có trường/trạng thái payout riêng; không gộp 2 transaction vào một nút “đã xác nhận”.
- Một batch có thể `DATA_ANCHORED` **đồng thời** shipment có `DATA_INCOMPLETE` vì một đoạn sequence bị thiếu; UI phải hiển thị **hai trục độc lập**.
- Hiển thị `UNKNOWN` hoặc `N/A` khi Backend chưa có đủ bằng chứng; không ép giá trị null thành `VALID`, `COMPLETE`, `0 missing`, `CONFIRMED` hay `ONLINE`.

Các tên trên là nhóm ý nghĩa/nhãn UI. Giữ wire enum hiện có: telemetry `completeness_status=COMPLETE/DATA_INCOMPLETE`, health theo shipment `telemetry_status=UNKNOWN/ONLINE/OFFLINE`; không đưa offline vào completeness hoặc tạo `data_status` mới chỉ cho đăng ký demo. Mapping payout và nguồn tx xem §2.4.

### 2.4. Ví dụ ShipmentDetail khi tạo chuyến (fixture theo DTO hiện có)

```json
{
  "id": "8b4fb8a2-2996-4da2-90b9-35019517f56f",
  "code": "SHIP-001",
  "cargo_type": "vaccine",
  "status": "created",
  "origin": {"name": "Kho A", "latitude": 10.03, "longitude": 105.77},
  "destination": {"name": "Điểm nhận B", "latitude": 10.05, "longitude": 105.81},
  "temp_min_c": 2.0,
  "temp_max_c": 8.0,
  "violation_duration_minutes": 15,
  "latest_telemetry": null,
  "location": null,
  "insurance": {
    "insured_amount_vnd": 10000000,
    "status": "active",
    "payout_status": "not_requested"
  },
  "blockchain": null,
  "created_at": "2026-11-15T03:00:00Z"
}
```

- Đây là **fixture theo ShipmentDetail hiện có**, không phải kết quả gọi API/deploy trong lượt này. DeviceView mới xem §2.6 và NTK §3.6; không yêu cầu thêm object `device_integrity` hoặc counters vào ShipmentDetail chỉ để đổi quy trình đăng ký.
- Sau khi có dữ liệu, hiển thị `latest_telemetry.signature_status`, `sequence_number`, `completeness_status` và missing range theo DTO thực. Device health lấy từ `/shipments/{id}/devices`, integrity từ `/shipments/{id}/integrity`; counters/heartbeat/firmware thiếu thì `N/A`, không tự đặt field.
- API payout hiện có `not_requested / evidence_pending / pending / paid / failed`; nhãn UI tương ứng `NOT_ELIGIBLE / EVIDENCE_PENDING / PENDING / CONFIRMED / FAILED`. Giữ enum trên wire, không yêu cầu Backend đổi hoa/thường. `paid` chỉ được báo khi Backend xác nhận chain.
- Anchor tx lấy từ batch `anchor_transaction.transaction_hash`; insurance tx lấy từ ShipmentDetail `blockchain.transaction_hash`. Hai nguồn tách biệt, không gộp hoặc ép API đổi thành field phẳng mới. Bản ghi sai chữ ký chỉ ở audit được phân quyền, không hiển thị như accepted telemetry.

### 2.5. REST endpoint dùng lại và phần cần NTK bổ sung

| Method | Endpoint | Tính năng / quyền / trạng thái code |
|---|---|---|
| `POST` | `/api/v1/auth/login` | **Public login:** `{username, password}` → `200 {access_token, token_type: "bearer"}`; **mới, chưa triển khai** |
| `POST` | `/api/v1/devices` | **Admin JWT:** `{device_id, device_name}` → `201 DeviceView`; DTO đã có, auth mới chưa có |
| `GET` | `/api/v1/devices` | **Admin JWT:** `{items: DeviceView[], total}`; đã có trong code, chưa xác nhận deploy |
| `GET` | `/api/v1/devices/{device_id}` | **Admin JWT:** DeviceView/key/assignment metadata đã có; đối chiếu client và thay auth |
| `POST` | `/api/v1/shipments` | **Admin JWT:** DTO shipment → `201 ShipmentDetail` có `id` UUID; đã có `AdminSession`, cần thay auth |
| `GET` | `/api/v1/shipments` | Có; danh sách `{items, total}` để hiển thị và chọn chuyến, chưa có pagination v1 |
| `POST` | `/api/v1/devices/{device_id}/assignments` | **Admin UI:** `{shipment_id: UUID, active: true/false}` → `200 DeviceView`; có, cần chặn nhiều active/device |
| `POST` | `/api/v1/devices/{device_id}/keys` | **Script NTK, ngoài browser:** `{key_id, public_key_pem}` → `201 DeviceView`; có, không thêm form khóa |
| `POST` | `/api/v1/shipments/{shipment_id}/telemetry` | **ESP32/simulator, ngoài browser:** signed v1 với UUID/key ID → `201`, duplicate hợp lệ `200`; giữ protocol |
| `GET` | `/api/v1/shipments/{shipment_id}` | Có; chi tiết, location và **insurance/blockchain payout metadata**, dùng thay `/insurance` riêng |
| `GET` | `/api/v1/shipments/{shipment_id}/devices` | Có; online/offline, last seen/sequence theo chuyến, dùng thay device `/health` chưa có |
| `GET` | `/api/v1/shipments/{shipment_id}/telemetry` | Có; nhiệt độ/độ ẩm/`received_at`, signed status/missing range khi có |
| `GET` | `/api/v1/shipments/{shipment_id}/events` | Có; timeline cảnh báo/violation/evidence/integrity |
| `GET` | `/api/v1/shipments/{shipment_id}/integrity` | Có; batch/root/anchor/verification; không giả có counters chưa được trả |
| `GET` | `/api/v1/shipments/{shipment_id}/batches` | Có; giữ path batch list thực tế |
| `GET` | `/api/v1/batches/{batch_id}` | Có; Merkle root, count, anchor transaction, verification |
| `POST` | `/api/v1/batches/{batch_id}/verify` | Có `AdminSession`; nút gọi bằng JWT sau khi NTK đổi dependency |
| `POST` | `/api/v1/shipments/{shipment_id}/batches/seal`, `/api/v1/batches/{batch_id}/anchor`, `/api/v1/shipments/{shipment_id}/insurance/reconcile` | Đã có Admin routes; JWT cho seal/retry/reconcile khi UI cần, không cấp quyền blockchain owner |
| `GET` | `/api/v1/health`, `/api/v1/ready` | Có; health/readiness an toàn |
| `POST` | `/api/v1/demo/shipments/{shipment_id}/scenario` | Có `normal`/`temperature_breach` ở dev; scenario khác chỉ khi NTK triển khai |

**API dành cho actor khác, không tạo form browser:** `POST /api/v1/devices/{device_id}/keys` đã có; script NTK login rồi gửi `{key_id, public_key_pem}` cùng **JWT Bearer**, nhận `201 DeviceView`. Không thêm `/public-key`; UI chỉ refetch status. POST telemetry do ESP32/simulator ký ECDSA P-256 và gửi, không dùng JWT Admin, `201` cho mẫu mới/`200` duplicate hợp lệ; React không sinh chữ ký hoặc nhận private key. Token/password Admin không được ghi vào `config.h`.

**Auth mục tiêu — chưa triển khai:** chỉ một Admin cấu hình ở Backend qua `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET_KEY`; React có Login rồi dùng `Authorization: Bearer <jwt_token>`. Tất cả API Admin và monitoring trong bảng (GET device/shipment/telemetry/events/integrity/batches, create/PATCH/assignment, verify/seal/retry/reconcile, demo dev) được Backend bảo vệ bằng dependency JWT chung. Public tối thiểu: login, health/readiness; POST signed telemetry dùng P-256 riêng. Xóa UI nhập API key, các getter/setter/header cũ và storage `coldchain_admin_api_key`; không fallback API key. Không `VITE_*` chứa credential. State/sessionStorage giữ token của phiên demo; không lưu password hoặc JWT trong localStorage/log/URL. Backend kiểm tra token thật; route guard/ẩn nút/CORS chỉ hỗ trợ UX.

**Không tạo route trùng:** giữ `/assignments`, `/keys`, `/shipments/{id}/batches`, `/batches/{id}`. Device `/missing-sequences`, signed heartbeat, audit endpoint và transaction endpoint riêng chưa có không phải blocker cho demo; dùng missing range/last_seen/events/batch/ShipmentDetail thực tế. Không đổi Merkle/Oracle để phục vụ UI.

**Quy ước xử lý API:** `401` token/credential sai hoặc hết hạn (về Login), `403` thao tác không được phép; `404` không thấy object; `409` conflict (`DEVICE_EXISTS`, `DUPLICATE_SHIPMENT_CODE`, `KEY_EXISTS`, `DEVICE_ALREADY_ASSIGNED` đã có code); `422` validation; `429` rate limit; `500/503` lỗi dịch vụ. Giữ envelope `{"error":{"code":"...","message":"...","details":[]}}`, correlation header `X-Request-ID`. Phân biệt CORS/timeout/cold start với Backend trả lỗi; không tự gán `BLOCKCHAIN_FAILED` vì browser timeout.

### 2.6. DeviceView và schema tối thiểu dùng chung với NTK/NTD

Contract chi tiết và JSON mẫu ở NTK §3.6; DTO mục tiêu:

```typescript
type DeviceView = {
  device_id: string;
  device_name: string;
  status: 'active' | 'revoked';
  has_public_key: boolean;
  current_shipment_id: string | null; // UUID, join shipments.id để hiện code
  last_sequence_number: number;
  last_seen_at: string | null;
  keys: { key_id: string; status: 'active' | 'revoked' }[];
  assignments: { shipment_id: string; active: boolean }[];
};
```

Đây là **contract dùng chung**; `DeviceOut` Backend hiện đã có các field khi đọc code, client/types vẫn cần đối chiếu phiên bản và JWT. Đăng ký chỉ gửi `{"device_id":"ESP32-001","device_name":"Cold Chain Sensor 01"}`. Device mới trả `has_public_key=false`, `current_shipment_id=null`, `keys=[]`, `assignments=[]`; `status=active` chưa có nghĩa đã được phép gửi telemetry. Gán bằng `{"shipment_id":"8b4fb8a2-2996-4da2-90b9-35019517f56f","active":true}`, nhận cùng view có UUID chuyến hiện gán. Script upload public key xong UI refetch; không private key hoặc suy ra board đã flash. Backend deploy cũ thiếu field thì báo chưa hỗ trợ, không tự đánh dấu key đã cấp.

MySQL do NTK quản lý: `devices.id` (API gọi `device_id`, thêm `device_name`), `device_keys` (public PEM, PK device/key), `device_assignments` (PK device/shipment, active và constraint một active/device), `shipments.id` UUID/`code` unique; signed receipt giữ unique device/sequence. `has_public_key` và `current_shipment_id` là field suy ra từ quan hệ, không phải cột private-key hay nguồn dữ liệu do UI tự ghi. TTDK không tạo DB/schema khác trong mock; fixtures phải bao gồm trạng thái chưa key/chưa gán và lỗi constraint.

---

## 3. Màn hình MVP và quy tắc UI/UX

### 3.1. Dashboard tổng quan — giữ chức năng gốc và bổ sung integrity

- Các thẻ KPI: tổng lô hàng, đang vận chuyển, đang vi phạm, đang chờ xử lý bảo hiểm, đã chi trả demo theo kết quả Backend.
- Các thẻ Integrity: thiết bị online/offline, **Verified Records**, **Invalid Records**, **Missing Records**, batch đang pending, batch đã anchored, batch phát hiện `DATA_INTEGRITY_FAILED`.
- Timeline cảnh báo gần nhất: nhiệt độ vượt ngưỡng, sensor gap, unknown key/signature invalid (chỉ theo audit được phân quyền), anchoring failed, payout pending/confirmed.
- Bộ lọc thời gian, shipment và trạng thái nếu API hỗ trợ; không dùng số KPI tính từ **một trang kết quả phân trang** như thể toàn hệ thống.
- Banner trạng thái kết nối Backend, thời điểm cập nhật dữ liệu gần nhất; không nhầm kết nối Backend với thiết bị đang online.

**Empty/error:** chưa có shipment, chưa có batch, chưa có heartbeat, API chậm/cold start, API không khả dụng đều phải có thông báo riêng, không hiển thị KPI 0 sai ngữ nghĩa.

### 3.2. Danh sách và chi tiết lô hàng — giữ từ Roadmap gốc

- Form "Tạo chuyến hàng": mã chuyến (`code`, ví dụ `SHIP-001`), `cargo_type`, điểm đi/đến, min/max, `violation_duration_minutes` (mặc định 15), `insured_amount_vnd`; tận dụng `CreateShipmentModal` và DTO hiện có. Có thể chọn tuyến mẫu có tọa độ để giảm thao tác; vẫn gửi đủ origin/destination như API, không thêm dịch vụ mới.
- Gửi `POST /shipments` bằng quyền admin, xử lý code trùng `409`, min/max/thời lượng/số tiền sai `422`; sau `201` thêm/refetch danh sách. Lưu `id` UUID do server trả, hiển thị `code` cho người dùng, không yêu cầu người dùng nhập UUID hay dùng code làm path ID. Tạo shipment chưa đồng nghĩa policy đã fund trên chain; trạng thái bảo hiểm do API quyết định.
- Danh sách: mã lô hàng, loại hàng, trạng thái, nhiệt độ gần nhất, khoảng cho phép, tiến độ vận chuyển, integrity/insurance badge, tìm kiếm/lọc, pagination.
- Chi tiết: thông tin nơi đi/đến, nhiệt độ/độ ẩm, `recorded_at` và `received_at` tách rõ, thời điểm cuối, trạng thái dữ liệu và các sự kiện liên quan.
- Biểu đồ telemetry: đường nhiệt độ, độ ẩm, dải nhiệt độ cho phép; đánh dấu khoảng gián đoạn thay vì nối đường liên tục qua **gap** làm người xem hiểu nhầm có quan sát liên tục.
- Bản đồ Leaflet: route/marker từ API, `progress_pct`, vị trí mới nhất; nhãn **“Vị trí mô phỏng từ Backend”** khi `location_source = "backend_simulated"`. Không nội suy GPS ở Frontend khi thiếu tọa độ.
- Timeline nghiệp vụ: telemetry được nhận → cảnh báo → đủ điều kiện vi phạm **liên tục 15 phút** → bằng chứng đủ điều kiện/đang chờ → gửi Insurance tx → receipt/chi trả (nếu có).
- Hiển thị giá trị hợp đồng `insured_amount_vnd` riêng với số **demo token** nếu Backend có cung cấp; không đổi hoặc gắn tỷ giá không có trong contract.
- Chi tiết có danh sách tất cả device đang gán từ API; telemetry nhiều device hiển thị rõ `device_id`, không ghép chuỗi sequence của các thiết bị thành một chuỗi liên tục giả.

### 3.3. Admin thiết bị, liên kết chuyến hàng và Device Integrity

**Đăng ký và danh sách thiết bị — bắt buộc cho demo:**

- Sửa `RegisterDeviceModal` thành **hai trường ID và tên** + nút "Đăng ký thiết bị"; bỏ public-key PEM, key ID và shipment khỏi form đăng ký gộp. Kiểm tra ID/tên theo NTK §3.6; loading/disable khi gửi, thông báo trùng ID/không đủ quyền, chỉ báo thành công khi API trả `201`.
- List từ `GET /devices`: `device_id`, `device_name`, "Đã có public key"/"Chưa cấp public key" theo `has_public_key`, mã chuyến hiện gán (join UUID với `shipments.id`/`code`) hoặc "Chưa gán". Thiếu API thật hiển thị chưa hỗ trợ/lỗi, không tự dùng dữ liệu mock.
- Trạng thái public key chỉ đọc. Hướng dẫn ngắn "Chạy script provisioning trên máy tin cậy, nạp USB rồi làm mới danh sách"; không thêm form tạo/nhập/hiển thị private key, dán public PEM hay quản trị chứng chỉ. Metadata `key_id` có thể hiện trong phần kỹ thuật nếu API có; không bắt buộc panel PEM/copy key cho MVP.

**Liên kết thiết bị — bắt buộc cho demo:**

- Hai dropdown lấy từ `GET /devices` và `GET /shipments`, nhãn ID/tên device và mã chuyến, giá trị chuyến là UUID; một nút "Liên kết" gọi `/devices/{device_id}/assignments` với `active=true`.
- Cho phép gán device chưa có key; list vẫn báo chưa cấp key và không được hiểu là đã gửi được telemetry. Cùng cặp gán lại là thành công idempotent theo API; không thêm dòng trùng trên UI.
- Device đã gán chuyến khác: báo `409 DEVICE_ALREADY_ASSIGNED`, refetch quan hệ thật. Khi cần đổi chuyến, thao tác "Bỏ liên kết" gọi cùng endpoint `active=false`, sau đó gán mới; không ngầm chuyển chuyến, không reset counter hoặc sửa history. Giữ state đúng khi request thất bại.
- Hiển thị `ESP32-001 → SHIP-001` bằng dữ liệu Backend; một chuyến có danh sách nhiều device. UI không tự bảo đảm constraint bằng cách lọc dropdown; Backend phải chặn race/gán hai chuyến.

**Giám sát — dùng các phần đã có:**

- Hiển thị nhiệt độ/độ ẩm theo shipment, `device_id`, signed status/sequence/missing range và `last_seen_at`; dùng `/shipments/{id}/devices` để lấy `UNKNOWN/ONLINE/OFFLINE`. Firmware, heartbeat và gap lifecycle chỉ hiển thị khi API thực có, không bắt buộc endpoint mới để hoàn tất đăng ký demo.
- `signature_status` chỉ do Backend xác minh; invalid/unknown key có thể chỉ ở audit được phân quyền, không hiển thị như accepted telemetry. Phân biệt **device offline**, **telemetry gap** và **Backend unreachable**.
- Không thêm nút tự gán "Đã xác minh", không ký telemetry hoặc nhập private key trong React. Luồng gửi dữ liệu do ESP32/simulator riêng của NTK; không dùng form telemetry thủ công để tạo dữ liệu `DATA_VERIFIED` trên production.

**Hành vi cảnh báo:** khi phát hiện gap, hiển thị dải sequence bị thiếu và mức độ ảnh hưởng đến điều kiện 15 phút; không tự coi đây là bồi thường. Khi API trả null/unknown, dùng "Chưa xác định".

### 3.4. Data Integrity — màn hình/bảng mới

- Tổng `total_records` (nếu Backend trả), `verified_records`, `invalid_records`, `missing_records`; ghi rõ **missing** là số sequence kỳ vọng thiếu, không nhất thiết là các dòng MySQL đã lưu.
- Bảng batch có `batch_id`, `shipment_id`, `device_id`, `batch_start_time`, `batch_end_time`, `record_count`, `first_sequence_number`, `last_sequence_number`, `hash_version`, `merkle_root`, `anchor_status`, `verification_status`.
- Chi tiết batch hiển thị **Merkle root dạng `0x` + 64 ký tự hex** (nếu đã có), copy hash, network, contract address đã cấu hình, `anchor_tx_hash`, `anchored_at` và `last_verified_at` theo API.
- Hiển thị `NOT_READY`, `BLOCKCHAIN_PENDING`, `DATA_ANCHORED`, `BLOCKCHAIN_FAILED` theo trục **anchoring**; `NOT_CHECKED`, `MATCHED`, `DATA_INTEGRITY_FAILED` theo trục **verification**.
- Với quyền phù hợp, nút "Kiểm tra lại tính toàn vẹn" **chỉ** gọi `POST /api/v1/batches/{batch_id}/verify`; có loading, thông báo kết quả, xử lý `401/403/409/429/503`. NTK cần rà quyền route hiện có trước public; UI không tự hash dữ liệu hoặc tuyên bố kết quả Backend.
- `DATA_INTEGRITY_FAILED`: cảnh báo có batch, thời điểm, lý do/nguồn đối chiếu được Backend cung cấp, link sang audit nếu được cấp quyền; không tự đưa ra kết luận cảm biến bị phá hoại.
- Nếu anchor chưa có transaction, hiển thị "Chưa gửi"/"Đang chờ" đúng state; không render explorer link từ `null` hoặc dummy hash.

**Giới hạn kỹ thuật cần ghi trong tooltip:** `MERKLE-v1` của NTK dùng canonical record SHA-256, leaf/node domain separation; Smart Contract chỉ lưu root `bytes32`, không xác nhận nhiệt độ thực tế. Frontend **không** thực hiện Merkle proof hoặc tuyên bố "đã verify từng leaf on-chain" nếu Backend/Contract chưa hỗ trợ.

### 3.5. Blockchain & Insurance — phân biệt ba luồng

| Luồng | Trigger và thông tin UI | Điều kiện hiển thị thành công |
|---|---|---|
| **Data Anchoring** | `BatchAnchored` / `anchor_transaction_hash`, Merkle root, `batch_id`, chain/network | `DATA_ANCHORED` từ Backend (receipt + on-chain root + confirmations) |
| **Violation/Oracle** | Event vi phạm, evidence/policy reference, Oracle submission nếu có | Backend xác nhận oracle transaction/event đúng; **không** đồng nghĩa tiền đã chuyển |
| **Insurance Payout** | Policy, beneficiary public reference, demo token amount, `insurance_transaction_hash`, `payout_status` | `CONFIRMED` chỉ sau receipt + `InsurancePaid`/contract state và kiểm chứng chống payout trùng |

- Hai hash transaction **bắt buộc tách biệt về hiển thị**: anchor từ batch `anchor_transaction.transaction_hash`, payout từ ShipmentDetail `blockchain.transaction_hash`. Nếu UI đặt tên nội bộ `anchor_transaction_hash`/`insurance_transaction_hash`, chỉ là mapping trình bày, không yêu cầu Backend đổi field.
- Mỗi giao dịch hiển thị loại/status, **Ethereum Sepolia / chain ID `11155111`**, submitted/confirmed time và confirmations theo API. Với đúng network/tx hợp lệ, link `https://sepolia.etherscan.io/tx/<transaction_hash>`; address link `/address/<contract_address>`. Chỉ tạo link từ hex hợp lệ và base URL allowlist, không RPC/browser-wallet transaction. Mock tx phải có nhãn, không dựng explorer link như giao dịch thật.
- `PENDING` ≠ `CONFIRMED`; tx hash hoặc explorer page tồn tại **không** đủ kết luận payout.
- Ghi nhãn rõ **Local/Testnet Token — không phải tiền thật**. Không gọi Smart Contract trực tiếp hoặc để frontend ký transaction.
- Khi `DATA_INCOMPLETE`/`DATA_INTEGRITY_FAILED`/`EVIDENCE_PENDING`, UI phải cho thấy lý do không tự payout và chính sách cần có evidence hợp lệ; không suy diễn thiếu dữ liệu là nhiệt độ sai ngưỡng.

### 3.6. Demo Control Panel — giữ và mở rộng có kiểm soát

- Giữ hai kịch bản cũ: `normal`, `temperature_breach`.
- Bổ sung **kịch bản kiểm thử hiển thị**: chữ ký sai, duplicate, sequence gap, offline, seal/anchor batch, integrity verify, tamper trên **DB demo**, blockchain hash mismatch, payout, tx pending/failed.
- **Không tự phát minh `scenario` string mới.** NTK phải công bố trong `api-v1.md` endpoint, danh sách scenario cho phép, quyền gọi và môi trường. Khi chưa có API demo thì chỉ chạy **mock fixtures có nhãn**, không giả gọi API thành công.
- Chỉ bật điều khiển demo nếu Backend xác nhận `APP_ENV=development`/môi trường demo riêng và actor có quyền. `APP_ENV=production` public phải tắt endpoint demo; frontend production phải ẩn điều khiển kể cả người dùng đoán được URL.
- Khi kịch bản đang chạy: disable button chống bấm trùng, có progress và trạng thái thất bại/trùng lặp; reset/seed lại DB demo bằng **Backend** theo tài liệu, không cho browser tác động thẳng database.
- Trình diễn 15 phút liên tục bằng **virtual clock trong backend dev/test**, không thay đổi luật tính bằng `received_at` của production.
- Cảnh báo rằng demo sửa đổi record/bằng chứng chỉ được thực hiện trên **môi trường và dữ liệu cô lập**; không chạy tampering trên production.

### 3.7. Quy chuẩn UI/UX, responsive và accessibility

- Bố cục desktop: sidebar/navigation + bảng, biểu đồ, bản đồ và panel integrity; mobile: điều hướng gọn, KPI dạng card, bảng chuyển sang danh sách/scroll ngang có chủ đích.
- Hiển thị trạng thái bằng **icon + chữ + màu**; không phụ thuộc màu sắc duy nhất. Badge màu chỉ dành cho trạng thái mang ý nghĩa, tránh mọi trường đều có badge rực rỡ.
- Trạng thái cần thiết cho mọi screen: `loading`, `success`, `empty`, `offline`, `error`, `permission_denied`, `unknown`, `mock`.
- Dùng UTC ISO 8601 trong API và chuyển sang giờ địa phương khi hiển thị **kèm nhãn múi giờ**; không lấy client clock thay cho `received_at` để suy ra breach duration.
- Tooltip giải thích khác nhau giữa signature verified, record hash, anchored, verification result và insurance paid; nội dung rõ ràng với người xem không chuyên blockchain.
- Chống tràn hash/ID dài, hỗ trợ copy, keyboard navigation, focus-visible, aria-label cho nút icon, contrast cơ bản; kiểm thử bảng/data chart với dữ liệu nhiều và data null.

### 3.8. Login/Logout một Admin — mới, chưa triển khai

- Chỉ màn hình Login: **Username, Password, nút Login, thông báo lỗi**; không Register/Sign Up, Forgot Password, thêm Admin, đổi mật khẩu, nhiều vai trò hoặc quản lý phiên phức tạp. Credential chỉ do Backend cấu hình; không hardcode, prefill password thật hay lộ JWT secret.
- Gọi JSON `POST /api/v1/auth/login` theo NTK §3.2.1; `200 {"access_token":"<jwt_token>","token_type":"bearer"}` thì giữ token trong state hoặc **sessionStorage** cho demo và điều hướng Dashboard. Sai credential `401` thông báo chung; `429` hiển thị thời gian thử lại, không tự retry login. Password chỉ trong request login HTTPS, xóa state password khi xong; token chỉ trong Authorization khi gọi API, không log/screenshot/URL.
- Route cần đăng nhập có guard; API client tự gắn Bearer cho Admin/monitoring request. Backend kiểm tra chữ ký/`exp`/subject/alg; client có thể đọc `exp` chỉ để hỗ trợ UX, không tự kết luận token hợp lệ bằng decode.
- Khi token hết hạn hoặc API trả **401**, xóa token và dữ liệu/cache Admin, hủy polling/request đang chạy và đưa về Login; chặn response cũ ghi đè dữ liệu sau logout. `403` là bị từ chối quyền/thao tác, không tự gửi lại bằng credential cũ. Không refresh token tự động, đăng nhập lại khi hết hạn.
- Nút **Logout** xóa state/sessionStorage/cache và về Login; logout cục bộ không thu hồi JWT đã phát ở Backend, token còn hạn tới `exp` (demo không có session DB/revocation service). Không cần API logout riêng.
- Không hiển thị password, JWT secret hoặc private key ESP32/Ethereum. JWT FastAPI không tự cấp quyền Owner/Oracle/anchorer; không kết nối ví trình duyệt để thay auth. Thiết bị vẫn ký P-256 độc lập, không dùng credential Admin.

---

## 4. Roadmap theo Phase — điều chỉnh theo dependency kỹ thuật

> **Ước lượng là ngày công tham khảo, không phải cam kết lịch bàn giao.** Phần lớn UI có thể làm bằng mock contract từ Phase 0/1; **không chờ Blockchain hoàn thành** rồi mới phát triển. Tuy nhiên chỉ nghiệm thu tích hợp thật khi NTK/NTD đã bàn giao tương ứng.

| Phase | Phần việc | Ước lượng | Điều kiện bắt đầu | Bàn giao |
|---|---|---:|---|---|
| **0** | Frontend Architecture & API Contract | 1–2 ngày | Roadmap/Repo/NTK draft API | Layout, routes, API mapping, wireframe |
| **1** | Login/JWT, TypeScript API Client & Mock Fixtures | 2–3 ngày, ước lượng lại cho auth | Login/API contract NTK | Login/Logout/route guard/Bearer client, fixtures |
| **2** | Dashboard, tạo/list chuyến, Telemetry & Map | 3–5 ngày | Phase 1 | Form code/UUID, shipment list/detail, charts/Leaflet |
| **3** | Admin đăng ký/list/gán device + Device Integrity | 2–3 ngày | DeviceView/assignments/schema từ NTK | Form hai trường, key status, dropdown gán, monitoring |
| **4** | Data Integrity & Merkle Batch UI | 2–4 ngày | Batch/verification schema từ NTK | Batch list/detail, verification/alerts |
| **5** | Blockchain, Insurance & Demo UI | 2–4 ngày | Event/status schema NTK; NTD ABI handoff qua NTK | Separate transaction/payout views, demo panel |
| **6** | Render Public API Integration & Hardening | 2–3 ngày | NTK Phase 7 public URL thực, external MySQL/CORS | Frontend production config, live smoke test |
| **7** | E2E Testing, Security & Demo | 2–4 ngày | Các luồng API/chain đã sẵn sàng | Test report, screenshots, demo checklist |

### Phase 0 — Frontend Architecture & API Contract

**Việc cần làm**

- [ ] Kiểm tra cây `frontend/` hiện có, package/lockfile, thư viện đang dùng trước khi tạo thêm file; không tự tuyên bố repo đã có module nào.
- [ ] Tạo/tiếp tục nhánh `feat/frontend-dashboard`; thống nhất cách PR và ownership với NTK/NTD.
- [ ] Nhận `docs/contracts/api-v1.md` draft và OpenAPI từ NTK; ghi bảng endpoint → màn hình → field → error → quyền truy cập.
- [ ] Đọc mô tả `SIGNED-TELEMETRY-v1`, `MERKLE-v1`, status schema của NTK và ABI/event semantics của NTD **qua Backend contract**, không tự tạo một chuỗi trạng thái mới.
- [ ] Chốt các màn hình: **Login**, Dashboard, Shipments, Shipment Detail, Devices, Integrity Batches/Details, Blockchain/Insurance, Demo Panel (dev-only); Logout trên navigation. Không Register/Forgot Password/quản lý tài khoản.
- [ ] Khóa auth NTK §3.2.1/TTDK §3.8: một Admin, login JSON/JWT Access Token có TTL, Bearer cho monitoring/Admin, state/sessionStorage, 401 hết hạn đăng nhập lại và 429 login. Không refresh/OAuth/MFA/session DB; bỏ Admin API key/UI nhập key/localStorage cũ khi đổi client.
- [ ] Chốt network hiển thị **Ethereum Sepolia `11155111`**, Etherscan links, ABI/events/receipt semantics từ deployment Remix qua NTK; QA dùng Backend Web3.py/Alchemy, không yêu cầu Hardhat Node hoặc browser RPC.
- [ ] Chốt flow §3.2–3.3 với NTK: ID/tên, `code`/UUID, list/key status, một active/device đã có code; cần regression MySQL/public và JWT thay auth cũ. Provisioning script/USB ngoài browser vẫn là task mới; không coi mock là deploy thật.
- [ ] Khởi tạo/kiểm tra React + Vite + TypeScript, route layout, design tokens/responsive structure, loading/error/empty skeleton.
- [ ] Chốt cách phân biệt `signature_status`, `data_status`, `completeness_status`, `verification_status`, `anchor_status`, `payout_status` trong UI.
- [ ] Viết wireframe nhanh và xác nhận trải nghiệm chính với nhóm; giữ sẵn vị trí cho trạng thái backend/Render.
- [ ] Viết `.env.example` placeholder và `frontend/README.md` bước chạy local cơ bản.

**Definition of Done**

- [ ] Frontend chạy được từ README trên máy sạch; routing và layout responsive hoạt động.
- [ ] Có mapping endpoint/schema v1 và mock contract; không còn field nào được **âm thầm tự đặt** thay cho API.
- [ ] NTK xác nhận field/status hoặc ghi issue TBC; NTD biết frontend chỉ đọc state qua Backend.
- [ ] Mock và production được cấu hình tách, không dùng URL Render giả như URL thật.
- [ ] Wireframe có đúng form đăng ký device hai trường, form shipment và dropdown gán; không có luồng private-key/provisioning trong React hoặc yêu cầu contract registry mới.
- [ ] Wireframe có Login/Logout duy nhất Admin; mọi màn hình dữ liệu cần đăng nhập, lỗi 401/429 rõ và auth/chain migration còn `PLANNED`, không dùng mock làm bằng chứng triển khai.

### Phase 1 — Login/JWT, TypeScript API Client & Mock Fixtures

**Việc cần làm**

- [ ] Cập nhật `types/api.ts` và module hiện có cho Shipment/Telemetry/DeviceView §2.6, request đăng ký `{device_id, device_name}` và assignment `{shipment_id, active}`; giữ types integrity/insurance/transaction theo API thực. Không giữ DTO gộp key/assignment trong form đăng ký mới.
- [ ] **Mới:** thêm Login username/password, gọi `/auth/login`, nhận `{access_token, token_type}`, token state/sessionStorage và chuyển Dashboard; Logout/route guard/401/expiry/cache cleanup theo §3.8. Không form đăng ký tài khoản hoặc credential thứ hai.
- [ ] **Mới:** thay admin-key client/getter/setter/localStorage bằng Bearer interceptor chung; bỏ storage `coldchain_admin_api_key`, header/fallback cũ và mọi UI yêu cầu thêm API key. Không lưu password/JWT secret vào browser config; không thêm `VITE_ADMIN_*`/`VITE_JWT_*`.
- [ ] Nếu dùng công cụ sinh types từ OpenAPI, ghi command và version; không sửa types sinh tự động mà không cập nhật source contract.
- [ ] API client đọc `VITE_API_BASE_URL`, áp dụng đúng prefix, timeout/abort, error normalization, pagination/filter, retry an toàn cho GET; **không** retry POST tác động nghiệp vụ khi chưa có idempotency contract.
- [ ] Tách API modules `devices`, `shipments`, `telemetry`, `integrity`, `insurance`, `blockchain`, `demo` theo endpoint đã chốt.
- [ ] Tạo fixtures cho: normal, temperature breach chưa đủ 15 phút, continuous 15 phút đủ evidence, invalid signature, duplicate, sequence gap, device offline, anchored/matched, tampered batch, pending/failed anchor, pending/confirmed payout.
- [ ] Thêm fixtures cho device chưa key/chưa gán, đã gán/chưa key, đã key/chưa telemetry, nhiều device một chuyến, trùng ID/code, gán sai/đồng thời trả `409`; `has_public_key` và `current_shipment_id` khớp keys/assignments. Giữ UUID trong request, `SHIP-001` chỉ ở code/nhãn.
- [ ] Dùng lại API modules/routes §2.5; `POST /keys` thuộc script NTK login/JWT, không form key-generation. Client gửi Bearer cho Admin/monitoring, không JWT cho ESP32; test login/health public và các request cần auth riêng.
- [ ] Fixture/tests auth: login đúng/sai/429, token thiếu/expired/tampered/subject sai, 401 giữa polling, reload sessionStorage, Logout rồi back/deep-link, response cũ sau logout, key cũ không được gửi; mock không tự chấp nhận mọi token như test auth Backend thật.
- [ ] `VITE_USE_MOCKS=true` chỉ là gợi ý cấu hình; mock adapter phải được bật tường minh, UI hiển thị `MOCK DATA` và **không fallback ngầm** khi API thật lỗi.
- [ ] Viết unit test mapping status, date formatting, missing/null field và xử lý error code.

**Definition of Done**

- [ ] Tất cả sample JSON đã công bố deserialize được sang types phù hợp và không bỏ qua lỗi schema quan trọng.
- [ ] Mock UI chạy được khi Backend/Blockchain chưa sẵn sàng; có nhãn rõ nguồn dữ liệu.
- [ ] Có error component/tách `401/403/404/409/422/429/503`, timeout và network error.
- [ ] TypeScript build/typecheck pass; danh sách enum/schema chờ NTK chốt được ghi issue công khai.
- [ ] Request/response đăng ký/gán/list khớp NTK §3.6 và mocks không trả thành công cho endpoint thật chưa có; error envelope/header khớp Backend.
- [ ] Login → Bearer API → Dashboard → Logout hoạt động; hết hạn/401 dừng request và về Login, không refresh. Không password/JWT ở log/URL/bundle/localStorage, không Register/Forgot Password; API-key cũ không cấp quyền và không được client gửi.

### Phase 2 — Dashboard, Shipments, Telemetry & Backend-simulated Map

**Việc cần làm**

- [ ] Xây layout tổng quan, navigation, connection banner, KPI, filter và danh sách shipment có loading/empty/error/retry.
- [ ] Tái sử dụng `CreateShipmentModal`: nhập `code`, cargo, origin/destination, min/max, thời lượng, VND; gửi admin `POST /shipments`, lưu UUID từ response, xử lý trùng code và dữ liệu sai. Mã chuyến hiển thị dễ đọc nhưng route/detail/dropdown dùng UUID; không coi tạo off-chain là policy funded trên chain.
- [ ] Trang shipment detail: hiển thị threshold, loại hàng, nguồn/đích, lịch sử và latest temperature/humidity với `received_at`/`recorded_at` tách biệt.
- [ ] Chart nhiệt độ/độ ẩm theo API; đánh dấu đường ngưỡng min/max, khoảng thiếu dữ liệu, thời điểm cảnh báo; không nối liền gap như dữ liệu liên tục.
- [ ] Leaflet hiển thị vị trí/trạng thái **từ Backend**; `location_source = backend_simulated` bắt buộc gắn nhãn. Không nhận GPS từ ESP32 hoặc client tự nội suy vị trí nguồn chân lý.
- [ ] Timeline từ `ShipmentEvent` phân biệt cảnh báo, đủ điều kiện, giao dịch pending và payout confirmed; 15 phút liên tục do Backend kết luận.
- [ ] Hiển thị số tiền bảo hiểm VND riêng với demo-token payout; không gắn tỷ giá tự tạo.
- [ ] Tách component và hooks; kiểm thử responsive desktop/mobile, long text, missing data, nhiều events.

**Definition of Done**

- [ ] Dashboard, list, detail, charts, map chạy với fixtures đã ký kết với NTK.
- [ ] Không có nhãn "GPS thực" khi vị trí mô phỏng; không có payout success giả.
- [ ] Ở shipment chưa có telemetry/position, UI hiển thị trạng thái chưa có dữ liệu hợp lý.
- [ ] Không phải sửa component lớn khi chuyển mock sang API client thật.
- [ ] Tạo/list chuyến thật qua API, giữ policy và ID hiện có; shipment mới có telemetry/location rỗng đúng nghĩa, tạo trùng code không xuất hiện dòng giả.

### Phase 3 — Admin đăng ký thiết bị, liên kết chuyến & Device Integrity

**Việc cần làm**

- [ ] Sửa `RegisterDeviceModal` thành `device_id`, `device_name`; bỏ public PEM/key ID/shipment bắt buộc. Gọi admin `POST /devices`, sau thành công refetch `GET /devices`, cho thấy device vừa tạo chưa key/chưa gán.
- [ ] List hiện ID/tên, key status từ `has_public_key`, mã chuyến từ `current_shipment_id`; dùng DeviceView §2.6. Điều chỉnh `DevicesPage`/`AdminDeviceDetailModal` để phần quản trị chính không đòi PEM/rotation/certificate; null key/chuyến phải hiển thị hợp lý.
- [ ] Thêm dropdown device/chuyến và nút liên kết; gọi `/assignments` với UUID/`active=true`, hiển thị quan hệ từ response. Khi đổi chuyến, bỏ gán `active=false` rồi gán mới; xử lý `409 DEVICE_ALREADY_ASSIGNED` bằng thông báo/refetch, không tự cập nhật quan hệ trước response thành công.
- [ ] Trạng thái cấp key chỉ refetch sau khi NTK chạy script/nạp USB/upload public key qua `/keys`. Không sinh/nhập/hiển thị private key hoặc tạo luồng upload key từ React; có key trong DB chưa phải `DATA_VERIFIED`.
- [ ] Dùng `GET /devices/{id}` admin và `GET /shipments/{id}/devices` hiện có cho monitoring; signed status/missing ranges từ telemetry. Endpoint riêng `/health`/`missing-sequences` theo device và signed heartbeat chưa có không chặn demo, không cần tạo mới chỉ cho màn hình này.
- [ ] Dùng riêng nhãn status thiết bị và status Backend; khi Render cold start, **không** đánh dấu tất cả thiết bị offline do request lỗi.
- [ ] Lập bảng/list các dải missing sequence và giải thích ảnh hưởng đến bằng chứng tính thời lượng breach; dữ liệu đến muộn có thể phục vụ audit nhưng không được UI tự sửa lại kết luận policy.
- [ ] Khi signature invalid/unknown key chỉ có trong audit được bảo vệ, phân quyền đúng; nếu không có quyền thì hiển thị trạng thái không khả dụng, **không** giả có accepted telemetry.
- [ ] Test thiết bị mất mạng, thiếu heartbeat, không có firmware version, nhiều thiết bị cùng shipment, sequence gap/trễ, 401/403.
- [ ] Test form ID/tên, trùng ID, key status false/true, device chưa gán, tạo shipment bằng code/UUID, gán nhiều device một chuyến, gán một device sang hai chuyến/race, bỏ gán/đổi chuyến và auth; schema fixtures khớp NTK, không secret trong Network/console/bundle.

**Definition of Done**

- [ ] Device Integrity UI phân biệt chữ ký, tính đầy đủ dữ liệu và khả dụng kết nối.
- [ ] Không giả mạo `DATA_VERIFIED`, không tự giải mã private key/verify chữ ký ở Frontend.
- [ ] Missing sequence hiển thị dựa trên Backend, không tự đoán từ các trang history không đầy đủ.
- [ ] Responsive và error states được test ở các trường hợp kể trên.
- [ ] Admin hoàn thành đăng ký device → tạo chuyến → gán bằng UI thật; script cấp key chạy ngoài browser, làm mới UI thấy key status đúng. Thiết bị thiếu key/assignment bị Backend từ chối; không báo đã gửi được chỉ vì đăng ký thành công.

### Phase 4 — Data Integrity & Merkle Batch UI

**Việc cần làm**

- [ ] Xây shipment integrity summary từ `GET /shipments/{id}/integrity`: total, verified, invalid, missing, batch status và integrity alerts.
- [ ] Bảng batches có filter/pagination nếu Backend hỗ trợ; chi tiết batch hiển thị `batch_id`, device/shipment, time range, count, first/last sequence, `merkle_root`, `hash_version`.
- [ ] Xây **hai nhóm hiển thị độc lập**: `anchor_status` (`BLOCKCHAIN_PENDING`/`DATA_ANCHORED`/...) và `verification_status` (`NOT_CHECKED`/`MATCHED`/`DATA_INTEGRITY_FAILED`).
- [ ] Nếu phù hợp quyền, tạo nút verify gọi Backend endpoint; không hash JSON trong Frontend, không gửi blockchain tx trực tiếp.
- [ ] Hiển thị tx hash anchor, chain/network, on-chain verification result và audit trail khi API đã trả, có copy và link explorer chỉ khi provider config cho phép.
- [ ] `DATA_INTEGRITY_FAILED` hiển thị lý do, batch affected và thời điểm xác minh; nếu batch chưa anchor, phân biệt mismatch với missing on-chain state.
- [ ] Test batch rỗng/chưa seal/chưa anchor/anchor pending/failed, one-leaf, batch có gap, root mismatch, thiếu quyền verify và timeout request.

**Definition of Done**

- [ ] UI thể hiện đúng tính toàn vẹn batch, không tuyên bố Blockchain xác nhận độ chính xác vật lý của sensor.
- [ ] Hash và Merkle root được copy nguyên vẹn, không tính lại ở client và không đổi byte encoding.
- [ ] `DATA_ANCHORED` không xuất hiện chỉ vì có `anchor_tx_hash`; `DATA_INTEGRITY_FAILED` không bị badge thành công che khuất.
- [ ] Có ít nhất một fixture có batch anchored nhưng shipment vẫn `DATA_INCOMPLETE` để chứng minh các trạng thái độc lập.

### Phase 5 — Blockchain, Insurance Event & Demo Panel

**Việc cần làm**

- [ ] Kết nối event/transaction DTO của NTK sau khi NTD bàn giao ABI/address/chain ID cho **Backend**, không kéo ABI/Web3 signer vào Frontend.
- [ ] Thiết kế view/tab phân biệt **Data Anchoring**, **Oracle/Violation**, **Insurance Payout** và tương ứng transaction hashes.
- [ ] Hiển thị `EVIDENCE_PENDING` khi bằng chứng có thể đủ nhiệt độ 15 phút nhưng chưa hoàn tất integrity/anchoring theo policy được nhóm xác nhận.
- [ ] Hiển thị `payout_status=CONFIRMED` chỉ theo kết luận Backend sau receipt/state/event; kiểm thử tx pending, reverted, duplicated, unauthorized Oracle và unknown policy.
- [ ] Giữ nút `normal`/`temperature_breach` ở môi trường dev/demo; thêm các scenario mới **chỉ** khi NTK xuất bản endpoint/enum thực tế.
- [ ] Panel demo hiển thị tiến độ từng bước, reset dựa trên server API dev với JWT Admin, message khi scenario chưa hỗ trợ; production vẫn bị khóa dù token hợp lệ.
- [ ] Kiểm tra link Sepolia Etherscan theo đúng chain `11155111` và loại giao dịch; Backend dùng Alchemy/Web3.py với ABI Remix. Không coi có tx hash là success, không hash mồi hoặc token demo thành tiền thật.

**Definition of Done**

- [ ] Không có giao dịch blockchain trực tiếp từ browser và không chứa private key trong bundle.
- [ ] Anchor success, insurance evidence accepted và payout confirmed được hiển thị là **ba kết luận khác nhau**.
- [ ] Demo 15 phút dùng Backend virtual clock trong dev/test, không hack frontend clock.
- [ ] Khi Blockchain thất bại, telemetry vẫn hiển thị từ MySQL và trạng thái nghiệp vụ không bị "success" giả.

### Phase 6 — Render Public API Integration, CORS & Production Build

**Việc cần làm**

- [ ] Nhận **URL Render thật** của NTK sau deployment, không dùng URL minh họa `https://smart-coldchain-api.onrender.com` như thể đã tồn tại.
- [ ] Cấu hình local `VITE_API_BASE_URL=http://localhost:8000/api/v1` và production `VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api/v1` **với placeholder thay bằng URL thật lúc triển khai**.
- [ ] Kiểm tra build frontend qua `npm run build` (hoặc script thực tế), kiểm tra bundle không chứa bí mật và không hardcode `localhost` ở production.
- [ ] Cung cấp **Frontend production origin** cho NTK cấu hình `CORS_ORIGINS` whitelist; test preflight/method/header với Browser. CORS **không phải auth**, admin/verify/demo route vẫn phải có auth.
- [ ] Smoke Login HTTPS → Bearer đọc/ghi Admin/monitoring → 401/expiry → login lại → Logout, preflight `Authorization`/`Content-Type`; không yêu cầu API key ngoài JWT. Backend thiếu auth config fail closed; không lộ password/JWT secret qua health/OpenAPI/error.
- [ ] Gọi `GET /api/v1/health` qua HTTPS công khai, thử list/shipments/telemetry/integrity/insurance endpoints theo quyền; kiểm thử đúng error schema.
- [ ] Kiểm tra external MySQL còn dữ liệu khi Render restart/redeploy; frontend không được kỳ vọng SQLite file/ephemeral filesystem làm nguồn lưu telemetry.
- [ ] Render Free (nếu dùng) có thể spin down/cold start: UI cần loading, timeout thông minh, nút retry và mô tả "Backend đang khởi động" khi đủ cơ sở; **không** tạo ping/heartbeat giả liên tục để né giới hạn gói dịch vụ.
- [ ] Dùng polling có giới hạn theo nhu cầu và tab visibility nếu thư viện hỗ trợ; hủy polling khi unmount/tab ẩn, không request bão hòa, không mặc định production là realtime 24/7.
- [ ] Đảm bảo demo endpoint không xuất hiện ở production build (và Backend tắt thật), không lộ lỗi stack trace/token/API keys từ console/log.
- [ ] Nếu deploy frontend lên static hosting riêng, ghi rõ domain thực tế và quy trình cập nhật env/bundle; việc deploy frontend **không thay thế** yêu cầu Backend chạy public trên Render.

**Definition of Done**

- [ ] Mở **frontend production URL thật** và truy cập được **FastAPI Render URL thật** qua HTTPS.
- [ ] CORS đúng origin, không lỗi mixed content; một shipment và integrity status hiển thị bằng dữ liệu API thật.
- [ ] Tắt mock hoàn toàn trong build production; khi API lỗi UI thể hiện lỗi thật, không âm thầm hiển thị mock.
- [ ] Render restart/cold start không biến device thành offline sai hoặc làm dữ liệu đã lưu biến mất khỏi UI sau khi API phục hồi.
- [ ] UI thật phản ánh Backend kết nối Sepolia qua Alchemy, có ít nhất anchor/payout receipt/state đúng từ deployment Remix; chưa có network/deploy thật phải ghi blocked, không mặc định node local đang chạy.

### Phase 7 — E2E QA, Security Review & Demo Handoff

**Việc cần làm**

- [ ] Xây test plan từ ma trận tại §6; kết hợp unit test UI, mock API integration, browser E2E (ví dụ Playwright nếu nhóm chốt).
- [ ] Test auth UI-31–UI-35 cùng NTK; mọi route đọc/ghi/quản trị cần JWT ở Backend, UI guard không thay auth. Kết quả login/mock pass không thay JWT integration pass.
- [ ] Xác nhận các flow với NTK: chữ ký hợp lệ/sai, replay/duplicate, sequence gap, offline, root verify/mismatch, mất Backend, 15-minute breach, payout pending/confirmed.
- [ ] Chạy thêm flow đăng ký/gán/cấp key ở UI-23–UI-30: UI thật + script/simulator đã đăng ký; đối chiếu UUID, assignment và key status với API/MySQL của NTK, không dựa vào mock `PASS`.
- [ ] Xác nhận các flow với NTD **qua Backend**: `BatchAnchored`, duplicate batch, `InsurancePaid`, reverted/failed tx, one policy-one payout.
- [ ] Test accessible/responsive desktop-mobile, keyboard, màu/chữ, long hash, timezone, pagination/filter, null telemetry, 401/403/404/409/422/429/503.
- [ ] Rà network requests/console để tránh duplicate polling, memory leak, stale request, CORS, private data leak, secret nằm trong bundle.
- [ ] Unit/UI/API mock tests chạy offline, không giao dịch; Sepolia smoke/E2E chạy tường minh theo cờ/marker NTK/NTD, dataset riêng, ghi chain/deploy/receipt thật. Demo chính thức trên **Sepolia `11155111` + Render/MySQL**, không phụ thuộc Hardhat node; timeout/reorg/RPC 429 khó tái hiện dùng mock có nhãn.
- [ ] Viết `frontend/README.md` cuối: cài đặt, env local/prod, mock flag, API URL, chạy test, build, troubleshooting, demo limits và những điều không chứng minh được.
- [ ] Gửi bug list có bước tái hiện, request/response đã lọc secret, severity và owner; không tự sửa Backend/Blockchain nếu không có PR được duyệt.

**Definition of Done**

- [ ] Tất cả test case bắt buộc có kết quả `PASS` hoặc `BLOCKED` kèm lý do/owner; **không** báo `PASS` nếu thiếu API/contract thật.
- [ ] Có màn hình thể hiện riêng `DATA_VERIFIED`, `DATA_INCOMPLETE`, `DATA_ANCHORED`, `DATA_INTEGRITY_FAILED`, `BLOCKCHAIN_PENDING`, `BLOCKCHAIN_FAILED` và payout `CONFIRMED`.
- [ ] Demo end-to-end: signed telemetry → MySQL → Merkle batch → anchor confirmed → verified breach 15 phút → insurance tx confirmed (theo chính sách được chốt).
- [ ] Không có sai lệch ngôn ngữ về GPS mô phỏng, dữ liệu on-chain, tính liên tục vi phạm, payout demo/token thật hoặc public deployment.
- [ ] Flow demo bắt đầu từ Admin đăng ký ID/tên, tạo chuyến/code, gán UUID và provisioning local/USB; API thiếu/invalid/key chưa có có kết quả QA riêng, không đổi progress chỉ vì tài liệu đã cập nhật.
- [ ] Flow bắt đầu Login một Admin và kết thúc Logout; JWT không thay ECDSA, không ABI/role contract mới. Sepolia receipt/event/root/balance chứng minh anchored/paid; không dùng legacy Hardhat pass cho nghiệm thu mới.

---

## 5. Cross-Team Integration Contract & bàn giao theo mốc

### 5.1. NTK (Member 1) → TTDK (Member 3)

| Deliverable | Dùng vào việc gì | Phải có trước |
|---|---|---|
| `docs/contracts/api-v1.md` + OpenAPI | Sinh/check types, endpoints, error enum/auth | TTDK Phase 1 |
| Login schema, JWT TTL/401/429, protected route matrix và HTTPS/CORS Authorization | Login/Logout/guard/Bearer client, script ngoài browser | TTDK Phase 0/1; mới, chưa có runtime |
| Shipment + telemetry/route response | Dashboard, chart, simulated map | TTDK Phase 2 |
| Device registration metadata, health, missing sequences | Device Integrity UI | TTDK Phase 3 |
| DeviceView + register/list/assign §2.5–2.6; code/UUID, auth và lỗi conflict | Form ID/tên, key status, dropdown gán/bỏ gán; không UI private key | TTDK Phase 1/3 |
| Hướng dẫn script cấp P-256, config.h/USB, POST public key do NTK thực hiện | Hướng dẫn ngoài browser + refetch `has_public_key` | TTDK Phase 3/7 |
| Integrity summary + batch + audit + verify response | Batch UI, tamper alert | TTDK Phase 4 |
| Anchor vs insurance tx schema, receipt/confirmation | Blockchain & Insurance UI | TTDK Phase 5 |
| `payout_status` / `EVIDENCE_PENDING` semantics | Tránh payout success giả | TTDK Phase 5 |
| Demo scenarios, auth/capability flags và seed fixtures | Demo Panel đúng quyền | TTDK Phase 5/7 |
| **Public Render API URL thật** + `CORS_ORIGINS` đã mở đúng | Production integration | TTDK Phase 6 |
| Error/pagination/filter/timeout/health semantics | QA và reliability | Trước TTDK Phase 7 |

**NTK chịu trách nhiệm API và kết luận nghiệp vụ.** Không dùng API schema tạm làm nguồn chân lý sau khi đã chốt v1.

### 5.2. NTD (Member 2) → NTK (Member 1) → TTDK (Member 3)

NTD bàn giao cho **NTK** ABI xuất Remix đúng source/settings deploy, hai addresses/token trên **Sepolia `11155111`**, manifest/deploy receipts/compiler/dependency/constructor, `BatchAnchored`/`InsurancePaid`, ID/root vectors và confirmations. NTK tạo Alchemy app, Web3.py kiểm chứng root/payout rồi đưa **thông tin public cần hiển thị** sang REST cho TTDK. Không RPC key, ABI signer, private key hoặc quyền ký trong Frontend. Chi tiết [NTD Phase 5 và §7.3](ROADMAP_NTD_BLOCKCHAIN_SMART_CONTRACT.md#73-checklist-package-bàn-giao-cho-ntk).

- [ ] NTK xác nhận mapping anchor từ batch `anchor_transaction.transaction_hash` và payout từ shipment `blockchain.transaction_hash` là hai nguồn khác nhau; không đổi API chỉ vì tên nội bộ UI.
- [ ] NTK/NTD xác nhận `code=SHIP-001` là nhãn, UUID `shipments.id` là ID dùng trong `shipmentKey`; device/key/assignment chỉ ở Backend/MySQL, không có màn hình/transaction đăng ký ESP32 on-chain.
- [ ] NTK định nghĩa `anchor_status`, `verification_status`, `payout_status` và `EVIDENCE_PENDING` chính xác; TTDK không tự gom thành `SUCCESS` chung.
- [ ] Explorer base URL, chain label và xác nhận tx nếu có được Backend trả hoặc cấu hình public an toàn; browser không tự dùng RPC để tra state nghiệp vụ.
- [ ] Khi NTD đổi ABI/role/event, NTD cập nhật `blockchain/INTEGRATION.md` → NTK cập nhật adapter/API (nếu bị ảnh hưởng) → TTDK cập nhật types/UI, tests sau khi contract được approve.

### 5.3. TTDK (Member 3) → NTK (Member 1)

- [ ] Báo field/status nào thiếu trong API: `signature_status`, `last_sequence_number`, missing sequence, integrity counters, Merkle root, `anchor_status`, `verification_status`, payout/tx.
- [ ] Xác nhận DTO hai trường, DeviceView/key status/assignment conflict/UUID §2.6; nếu Backend đang deploy chưa có GET device list/field mới thì báo version mismatch, không fallback mock. Gửi bằng chứng UI đăng ký/gán trước cấp key, không yêu cầu nhập khóa.
- [ ] Cung cấp **Frontend local + production origins** để whitelist CORS; yêu cầu auth/permission cho admin read/verify và demo control.
- [ ] Gửi đề xuất pagination/filter/sorting cho list telemetry, batch, audit khi volume lớn.
- [ ] Gửi UI error requirements: correlation header `X-Request-ID`, envelope `error.code/message/details`, HTTP status, timeout/cold start, failed receipt, nullable fields; không giả có `request_id` hoặc `retryable` trong body hiện có.
- [ ] Gửi kịch bản QA/demo cần simulator/signed fixtures, virtual clock, sealed batch, tamper demo riêng và Blockchain failure flags.
- [ ] Gửi bug report và proof (network console đã ẩn secret, screenshots, expected/actual) qua issue/PR.

### 5.4. Mốc làm song song để tránh chờ nhau

1. **Khi NTK Phase 0:** TTDK Phase 0–1 làm API client + mock UI dựa trên draft; NTD Phase 0 khóa event/hash integration.
2. **Khi NTK Phase 2–3:** TTDK Phase 2–3 nối shipment/telemetry/device API thật; Member 2 triển khai contracts độc lập.
3. **Khi NTK Phase 4–5 + NTD Phase 1–5:** TTDK Phase 4 xây integrity UI bằng fixtures rồi nối batch/verify endpoints khi sẵn sàng.
4. **Khi NTK Phase 6 + NTD Phase 3–6:** TTDK Phase 5 hiển thị `EVIDENCE_PENDING`, oracle/insurance tx/payout theo response Backend.
5. **Khi NTK Phase 7:** TTDK Phase 6 kết nối Render public, xác minh CORS/env và cold start; NTD xác minh đúng network/contract deploy.
6. **Khi cả nhóm đủ chức năng:** TTDK Phase 7 chạy E2E, phân loại lỗi đúng owner. Không bắt frontend chạy blockchain RPC hoặc ép NTD sửa code frontend.

---

## 6. Ma trận QA và kịch bản trình diễn End-to-End

### 6.1. Các test case bắt buộc

| ID | Kịch bản | Kỳ vọng hiển thị ở Frontend | Phụ thuộc/owner bằng chứng |
|---|---|---|---|
| UI-01 | Signed telemetry hợp lệ | `signature_status=VALID`, `DATA_VERIFIED`, nhiệt độ/độ ẩm và `received_at` từ Backend | NTK verify/DB |
| UI-02 | Chữ ký sai | Thông báo/audit `INVALID` hoặc ingestion rejected; **không** xuất hiện như accepted telemetry | NTK verification/audit |
| UI-03 | Duplicate telemetry đúng nội dung | Không tăng accepted record count; có thể báo duplicate/idempotent theo API | NTK ingestion |
| UI-04 | Replay/cùng sequence nhưng nội dung khác | Error/alert conflict, không cập nhật latest verified sai | NTK anti-replay |
| UI-05 | Sequence gap | `DATA_INCOMPLETE`, missing sequence count/range; chart có khoảng thiếu | NTK sequence logic |
| UI-06 | Device offline | Hiển thị last seen/heartbeat và offline; không mặc định là temperature breach | NTK device health |
| UI-07 | Batch sealed + anchoring | Batch root + `BLOCKCHAIN_PENDING` → `DATA_ANCHORED` **chỉ khi confirm** | NTK adapter, NTD contract |
| UI-08 | Integrity verification khớp | `verification_status=MATCHED`, có thời điểm verify; không nói sensor vật lý chắc chắn đúng | NTK verify, NTD getBatch |
| UI-09 | Tamper bản ghi MySQL demo sau anchor | `DATA_INTEGRITY_FAILED` + audit alert; giữ original root hiển thị | NTK seed DB demo |
| UI-10 | Blockchain hash mismatch | Alert root mismatch/verification failed; không coi `DATA_ANCHORED` đủ chứng minh dữ liệu hiện tại nguyên vẹn | NTK/NTD verify |
| UI-11 | Nhiệt độ vượt ngưỡng **chưa đủ 15 phút** | Violation warning nhưng `payout_status=NOT_ELIGIBLE` (hoặc đúng enum NTK) | NTK violation service |
| UI-12 | Nhiệt độ vượt ngưỡng **15 phút liên tục và evidence hợp lệ** | Eligibility → `EVIDENCE_PENDING` (nếu chờ anchor) → tx payout → `CONFIRMED` sau receipt | NTK/NTD |
| UI-13 | Blockchain anchor tx pending | `BLOCKCHAIN_PENDING`, telemetry vẫn tồn tại và không hiển thị anchored thành công | NTK tx monitor |
| UI-14 | Blockchain tx reverted/failed | `BLOCKCHAIN_FAILED` hoặc insurance `FAILED` đúng loại tx; không báo payout | NTK/NTD |
| UI-15 | Trùng payout / reportViolation lặp | Chỉ một payout confirmed, event/tx không nhân đôi chi trả | NTD contract, NTK idempotency |
| UI-16 | Mất API/DB hoặc trả 503 | Hiển thị network/service error, retry; không tự hiển thị mock hoặc sửa status device | NTK deployment/DB |
| UI-17 | Render Free cold start/restart | Loading/retry phù hợp; phục hồi giữ dữ liệu từ MySQL, không suy diễn device lỗi | NTK Render + MySQL |
| UI-18 | Production demo endpoint bị khóa | Không hiển thị/nút không gọi được demo scenario; Backend vẫn từ chối truy cập | NTK env/auth, TTDK |
| UI-19 | Batch anchored nhưng có sequence gap | Cùng hiển thị `DATA_ANCHORED` và `DATA_INCOMPLETE`, không tô xanh toàn bộ shipment | NTK fixtures |
| UI-20 | Admin verify/audit không đủ quyền | 401/403 và thông báo rõ, không lộ dữ liệu audit hoặc nút admin hoạt động trái phép | NTK auth |
| UI-21 | Chưa có telemetry/batch/position | Empty state, không hardcode latest temperature, GPS, transaction hash | TTDK mock/E2E |
| UI-22 | Responsive + accessibility | Desktop/mobile không vỡ layout; icon có tên, badge có text, hash copy đúng | TTDK |
| UI-23 | Đăng ký `ESP32-001`/tên trước key/chuyến | `201`, list thấy tên/ID, "Chưa cấp public key", "Chưa gán"; không bắt dán PEM/chọn chuyến | NTK DTO/list mới; TTDK form |
| UI-24 | Tạo chuyến `SHIP-001` | Gửi `code`, nhận UUID, list hiển thị code; detail/dropdown dùng UUID, chưa có telemetry thì empty | NTK shipment/auth; TTDK |
| UI-25 | Chọn device + chuyến, bấm liên kết | `/assignments` nhận UUID/active; UI hiện `ESP32-001 → SHIP-001`; chưa key vẫn báo chưa sẵn sàng gửi | NTK assignment; TTDK |
| UI-26 | Một device gán hai chuyến/race, nhiều device cùng chuyến | `409 DEVICE_ALREADY_ASSIGNED` được hiển thị/refetch; nhiều device/chuyến được phép; cùng cặp idempotent | NTK transaction/MySQL; TTDK |
| UI-27 | NTK chạy script, USB, upload public key | Refetch thành "Đã có public key"; không private key trong form/Network/log/bundle; signed sample được Backend verify mới hiện VALID | NTK provisioning/ESP32; TTDK |
| UI-28 | Device chưa đăng ký/chưa gán/sai chuyến/thiếu hoặc revoked key | Simulator bị Backend từ chối, không accepted record/leaf/evidence giả trong UI | NTK ingest; TTDK monitoring |
| UI-29 | Bỏ gán rồi đổi chuyến, duplicate ID/code, API lỗi/401 | Quan hệ thật giữ đúng khi lỗi; history/sequence không bị UI reset; thông báo conflict/auth rõ, không success giả | NTK/TTDK |
| UI-30 | Backend chưa có GET device list/field mới | Hiển thị lỗi/chưa hỗ trợ khi dùng API thật, mock có nhãn riêng; không gắn PASS tích hợp | TTDK client/fixtures; NTK |
| UI-31 | Login một Admin đúng/sai, vượt số lần thử | 200 chuyển Dashboard/Bearer; sai 401 lỗi chung, 429 chờ theo server; không Register/Forgot Password | NTK login/limiter; TTDK |
| UI-32 | Token hết hạn/thiếu/sai chữ ký, 401 khi đang polling | Xóa token/cache, dừng polling, về Login; không refresh/fallback API key, response cũ không lộ data | NTK JWT; TTDK client/guard |
| UI-33 | Reload phiên, deep link, Logout rồi Back | Chỉ sessionStorage/state theo thiết kế; Logout xóa token/cache; route private cần login và Backend vẫn chặn request | TTDK + NTK auth |
| UI-34 | API key cũ / credential/secret bị nhúng | Client không gửi header cũ, Backend không nhận làm auth; bundle/log/URL không password/JWT secret/private key; token chỉ ở phiên demo | NTK + TTDK |
| UI-35 | ESP32 không JWT / Admin JWT không phải quyền chain | Signed telemetry hợp lệ vẫn nhận; JWT không thay P-256 hoặc cấp owner/Oracle/anchorer, không có User/Admin contract | NTK + NTD, TTDK QA |
| UI-36 | Sepolia thật và Alchemy timeout/429/pending/revert | Network `11155111`, Etherscan đúng tx; chỉ anchored/paid khi Backend xác minh receipt/event/state/root, lỗi API không tự đổi chain status | NTK/NTD Sepolia opt-in + RPC mocks |

**Quy trình QA:** mỗi test ghi `test_id`, môi trường (`mock`, `remix_vm`, `sepolia`, `render_public`; `legacy_hardhat` chỉ cho lịch sử), dataset, chain ID/addresses khi có, steps, expected/actual, receipt/Etherscan/screenshot đã lọc secret, `PASS/FAIL/NOT_TESTED/BLOCKED`, owner và issue. `mock=PASS`/legacy pass không thay Sepolia E2E pass. Unit tests không gửi tx; smoke testnet opt-in do NTK/NTD điều phối, không bắt mọi lần chạy E2E phải dùng gas.

### 6.2. Checklist demo đề xuất (12 tình huống theo prompt)

- [ ] **Login và chuẩn bị Admin/provisioning:** duy nhất Admin username/password → JWT → Dashboard → đăng ký ID/tên device → tạo code chuyến/lấy UUID → gán → script NTK tạo key/nạp USB/upload public key bằng Bearer → refetch. Không private key trong React, không JWT Admin trong ESP32; chỉ tiếp tục khi Backend verify mẫu ký thật.
- [ ] **1. Valid telemetry:** ESP32 hoặc simulator có chữ ký hợp lệ; Dashboard hiển thị mẫu được Backend chấp nhận.
- [ ] **2. Invalid signature:** Backend từ chối, UI/audit thể hiện sai chữ ký; mẫu không xuất hiện như verified.
- [ ] **3. Duplicate telemetry:** gửi lại cùng sequence/payload; thống kê accepted không tăng hai lần.
- [ ] **4. Sequence gap:** bỏ một số sequence có chủ đích; UI hiển thị missing count/range, không tính liên tục xuyên gap.
- [ ] **5. Device offline:** ngừng heartbeat/telemetry trong môi trường test; UI thể hiện last seen và offline riêng với tình trạng API.
- [ ] **6. Batch anchoring:** tạo/seal batch, root SHA-256/Merkle `MERKLE-v1`, pending → anchored sau receipt đúng.
- [ ] **7. Integrity verification:** verify batch và hiển thị `MATCHED`.
- [ ] **8. DB record tampering:** chỉnh dữ liệu **DB demo cô lập** sau anchor → `DATA_INTEGRITY_FAILED`; không sửa DB production.
- [ ] **9. Blockchain root mismatch:** tạo fixture root mismatch/đối chiếu sai đã kiểm soát; giao diện cảnh báo đúng nguyên nhân.
- [ ] **10. Temperature violation:** phát chuỗi vượt ngưỡng 15 phút **liên tục** theo virtual clock của Backend dev/test; không dùng gói thiếu/invalid làm bằng chứng.
- [ ] **11. Insurance payout:** Backend/Oracle báo event hợp lệ, testnet token được chuyển **chỉ** khi contract/receipt xác nhận; hiện `CONFIRMED`.
- [ ] **12. Pending Blockchain transaction:** giả lập/ngắt RPC theo test plan, hiển thị pending và telemetry vẫn còn MySQL; không tự báo thanh toán.
- [ ] **Kết thúc:** Logout/xóa token/cache và thử mở route private phải về Login; nếu hết hạn giữa demo thì đăng nhập lại, không nhập thêm API key.

**Thứ tự trình diễn 3–5 phút (bản rút gọn):** Admin đăng ký device/chuyến/gán → provisioning local/USB (có thể chuẩn bị trước và minh họa bước public key) → normal signed telemetry → gap hoặc invalid → batch/anchor → verify/tamper → 15-minute breach → evidence pending/confirmed payout → RPC pending. Nếu thiếu thời gian, dùng ảnh/video **đã chạy trên môi trường test** có nhãn; không dùng mock làm bằng chứng giao dịch thật.

### 6.3. Điều kiện kết thúc demo

- Có đường đi nhất quán: **Admin đăng ký device/chuyến → gán UUID → script cấp key/USB/public key API → ESP32 signed telemetry → FastAPI kiểm tra assignment/key/chữ ký/sequence → external MySQL → Merkle batch → anchor/verify → breach 15 phút → Insurance Contract demo-token payout**.
- Không có `InsurancePaid` thành công giả và không lấy `anchor tx` làm `payout tx`.
- Người xem phân biệt được **verified signature**, **anchored hash**, **integrity matched**, **complete data** và **insurance paid**.
- UI nhắc rõ **GPS mô phỏng**, **Blockchain không chứng minh cảm biến không bị can thiệp**, **local/testnet token không đại diện tiền thật**, **Render Free không bảo đảm realtime/SLA**.

---

## 7. Cấu hình môi trường, triển khai và vận hành UI

### 7.1. Biến môi trường Frontend (đề xuất, phải khớp code thực tế)

**`frontend/.env.example` — chỉ placeholder, không điền secret thật:**

```dotenv
# Development / local FastAPI
VITE_API_BASE_URL=http://localhost:8000/api/v1

# Mock phải bật tường minh; production luôn false
VITE_USE_MOCKS=false

# Nếu thêm cờ hiển thị panel demo, Backend vẫn phải tự chặn demo ở production
VITE_ENABLE_DEMO_UI=false
```

**Production (chỉ cấu hình sau khi NTK cung cấp URL thực tế):**

```dotenv
VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api/v1
VITE_USE_MOCKS=false
VITE_ENABLE_DEMO_UI=false
```

- Dòng URL trên chỉ là **placeholder**, không phải URL Render đã hoạt động; phải thay bằng domain NTK bàn giao.
- Biến `VITE_*` vào **browser bundle**, chỉ chứa cấu hình public. Không đặt `ADMIN_PASSWORD`, `JWT_SECRET_KEY`, `BLOCKCHAIN_ORACLE_PRIVATE_KEY`, `BACKEND_ANCHORER_PRIVATE_KEY`, `DATABASE_URL`, Alchemy RPC credentials hoặc private key thiết bị vào đây. Không cần biến Admin API key; Admin nhập username/password trên Login HTTPS.
- Nếu ứng dụng đang dùng công cụ config khác, điều chỉnh tên biến cho đúng code và cập nhật README; không tạo song song nhiều biến base URL có ý nghĩa khác nhau.
- Không hardcode `http://localhost:8000` vào production build; phân biệt local, demo và production.

### 7.2. CORS, authentication và API safety

- NTK cấu hình whitelist `CORS_ORIGINS` theo đúng domain/frontend origin thực tế. Preflight `OPTIONS`, allowed methods/headers/credentials phải khớp cơ chế auth đã thống nhất.
- CORS không thay authentication/authorization. Các endpoint admin/audit/verify và demo phải được bảo vệ ở Backend, không dựa vào việc ẩn nút Frontend.
- Kiểm thử preflight **`Authorization`/`Content-Type`** cho Login và Admin đọc/ghi/verify/retry/reconcile; Bearer thiếu/sai/hết hạn phải bị Backend chặn. Không còn header API key cũ/fallback, không đặt password/token Admin vào `config.h` hoặc bundle.
- Token giữ trong state hoặc sessionStorage cho demo; không password/JWT ở localStorage/log/URL. Logout/hết hạn/401 xóa token/cache và dừng polling; không refresh/session DB. Username/password chỉ request login HTTPS, Access Token chỉ Authorization cho API; mọi log/screenshot QA phải redacted.
- Render API public không đồng nghĩa mọi endpoint đều public. Khi gọi không đủ quyền, giao diện phải hiển thị 401/403 đúng thay vì cố lấy dữ liệu khác.

### 7.3. Render Free và xử lý trạng thái dịch vụ

- Backend chạy **Render Web Service** kết nối **MySQL external**; filesystem Render có thể ephemeral, không dùng SQLite trên Render production cho dữ liệu dài hạn.
- Nếu dùng Free Tier, instance có thể spin down lúc idle và request đầu sau idle có thể chậm. UI hiển thị progress/cold-start hint phù hợp, retry có giới hạn và không gửi hàng loạt request đồng thời.
- Có thể cache dữ liệu hiển thị theo chiến lược an toàn nhưng phải ghi "Cập nhật lần cuối ..." và phân biệt **stale** với **live**; không báo sai online/offline khi Backend chưa xác minh.
- Với polling: áp dụng interval hợp lý (do nhóm chốt), exponential backoff khi 429/503, cancel khi unmount, tránh poll API verify admin hoặc demo repeatedly; **không** dùng browser ping để cố giữ Render Free luôn thức.
- Luồng giao dịch Blockchain pending có thể mất thời gian; UI phản ánh status do Backend polling/worker/outbox cung cấp, không đợi HTTP request vô hạn.

### 7.4. Bước smoke test production tối thiểu

1. Kiểm tra `VITE_API_BASE_URL` là **URL Render thật + `/api/v1`**; mở `/health` bằng HTTPS.
2. Mở frontend từ **domain thật**, xem Network: không CORS/preflight error, không mixed content và không request localhost.
3. Đọc ít nhất một shipment từ API thật, chart từ telemetry MySQL, device/integrity state và blockchain status.
4. Xác nhận `BLOCKCHAIN_PENDING`, `DATA_ANCHORED`, `DATA_INTEGRITY_FAILED` và payout states hiển thị từ Backend, không từ fixture.
5. Kiểm tra khi Backend restart/cold start và khi API tạm trả lỗi; retry không thay data thành mock.
6. Bảo đảm production không mở demo/tamper/verify admin trái quyền, không lộ private key hay credential trong bundle và browser console.
7. Đăng ký device ID/tên, tạo chuyến/code, gán UUID bằng Admin UI; cấp key bằng script trên máy tin cậy, refetch trạng thái rồi gửi signed telemetry qua public HTTPS. Nếu DTO/list/constraint chưa deploy, ghi `BLOCKED` đúng owner, không lấy mock làm nghiệm thu.
8. Login/Logout/hết hạn/401/429 trên URL thật; Backend dùng Alchemy/Sepolia `11155111`, link Etherscan và receipt/state đúng. Không yêu cầu Hardhat/local node hoặc API key nhập thêm.

---

## 8. Security, Reliability, QA automation và quy tắc làm việc

### 8.1. Security checklist của TTDK

- [ ] TypeScript strict mode và validate dữ liệu API tại boundary khi cần (không chỉ tin types compile-time).
- [ ] Escape/sanitize output an toàn theo framework, tránh chèn HTML chưa kiểm soát; không render raw error stack.
- [ ] Không đưa private keys, blockchain signer, device credentials, DB URL hoặc secret vào repo/build/log/issue.
- [ ] Không gọi ESP32/DB/RPC/contract từ Frontend; mọi action nằm sau Backend auth/rate limit.
- [ ] Không cho frontend bấm retry POST quan trọng nhiều lần không có idempotency contract.
- [ ] Admin-only action bảo vệ ở Backend; UI kiểm tra quyền để hiển thị, nhưng không coi đó là security boundary.
- [ ] Không form private key/ký telemetry trong React; script NTK login/JWT upload public key. Không credential/secret trong `VITE_*`, không password/JWT localStorage/log/URL, không UI/header Admin API key; JWT chỉ state/sessionStorage phiên demo, Logout/401 cleanup.
- [ ] Audit/verification error message không lộ private device key hoặc raw secret; mask theo schema public.
- [ ] CORS origins/dev/production không wildcard tùy tiện khi credentials; HTTPS production và dependency audit phù hợp.

### 8.2. Reliability & UX checklist

- [ ] `loading`, `empty`, `error`, `stale`, `offline`, `permission_denied` và `unknown` được thiết kế nhất quán.
- [ ] Phân biệt Backend `unavailable` với device `OFFLINE` và blockchain `BLOCKCHAIN_FAILED`.
- [ ] Dữ liệu thiếu/invalid không nối thành một đường đo liên tục trên biểu đồ hoặc đủ điều kiện bảo hiểm.
- [ ] Mỗi key/enum status mới có mapping UI hoặc fallback "Trạng thái chưa hỗ trợ"; không default về success.
- [ ] Pagination/query/fetch dùng abort/cancel; không gây race update khi đổi shipment/filter.
- [ ] Transaction hash và Merkle root giữ nguyên exact bytes/hex trong copy; link explorer có whitelist cấu hình, không nối URL tùy tiện từ input không tin cậy.
- [ ] Có request ID/log context (nếu API trả), không ghi full telemetry nhạy cảm vào console production nếu không cần.
- [ ] Trình duyệt trên máy yếu/mobile vẫn đáp ứng khi telemetry nhiều (phân trang/downsampling từ Backend nếu cần; không tải vô hạn).

### 8.3. Quy tắc tránh xung đột code và contract

- Chỉ **TTDK** sửa `frontend/`; chỉ **NTK** sửa `device/`, `backend/`, `docs/contracts/api-v1.md`; chỉ **NTD** sửa `blockchain/` và `blockchain/INTEGRATION.md`.
- Commit theo Phase/feature nhỏ, PR có screenshot/test; không commit thẳng `main` hoặc các bản `.env` chứa secret.
- Với thay đổi API: tạo issue → NTK chỉnh `api-v1.md` + OpenAPI → TTDK update types/client/fixtures/tests → merge sau review. Không silently break schema.
- Với thay đổi ABI/hash/event: NTD cập nhật INTEGRATION → NTK adapter/API → TTDK UI mapping **nếu API thay đổi**; TTDK không sửa contract hoặc tự lấy ABI vào browser.
- Không đánh dấu Phase `DONE` chỉ vì mock UI đẹp; phải có DoD/Test evidence tương ứng.

---

## 9. Deliverables, quản lý tiến độ và tiêu chí nghiệm thu toàn bộ

### 9.1. Danh sách deliverables của TTDK

| Deliverable | Bắt buộc | Kiểm chứng |
|---|---|---|
| `frontend/` React + Vite + TypeScript | Có | Build/typecheck/lint hoạt động theo scripts đã chốt |
| `src/api/` typed REST client | Có | Đúng `api-v1.md`, xử lý timeout/error/auth |
| Login/Logout/route guard + Bearer API client | Có, mới | UI-31–UI-35, một Admin, không Register/Forgot Password/API key, token phiên và 401 cleanup |
| Dashboard + shipment list/detail | Có | API/mock đúng, responsive, empty/error |
| Admin device registration/list + shipment create + assign/unassign | Có | Form device hai trường, code/UUID đúng, key status, một active/device; UI-23–UI-30 có evidence |
| Typed DeviceView/register/assignment client + fixtures | Có | Khớp NTK §3.6, dùng `/assignments`, không form key hoặc alias API |
| Telemetry chart + Leaflet route mô phỏng | Có | Không dùng GPS thật/đường tự suy diễn khi API thiếu |
| Device Integrity UI | Có | Signature/sequence/gap/offline tách biệt |
| Data Integrity Batch UI | Có | Merkle root, anchor, verification và alerts rõ ràng |
| Blockchain + Insurance UI | Có | Anchor tx khác insurance tx; payout confirmed theo Backend |
| Demo Panel có điều kiện | Có cho local/dev | Ẩn khi production, chỉ gọi scenario Backend công bố |
| `.env.example` + `frontend/README.md` | Có | Không secret, local/prod config rõ |
| Mock fixtures + status mapping tests | Có | Chứng minh các trạng thái chính xác |
| Responsive/UI QA/E2E test report | Có | PASS/FAIL/BLOCKED + evidence/owner |
| Render API public integration | Có khi NTK deploy | Domain thật, CORS/HTTPS/health/smoke test |
| Demo checklist/screenshot/limitations | Có | Người khác chạy lại được theo runbook |

### 9.2. Definition of Done — cuối Roadmap

- [ ] TTDK đã triển khai Frontend UI đầy đủ theo APIs được **NTK chốt**, không có field tự phát không đồng nhất.
- [ ] Duy nhất Admin Login → JWT Bearer → Dashboard; Logout/expiry/401 xóa token/cache, không API key/đa vai trò/Register/Forgot Password. Backend kiểm tra token và limiter; ESP32 vẫn P-256 riêng, không token Admin trong firmware.
- [ ] Admin đăng ký device bằng ID/tên, tạo/list chuyến theo code, gán bằng dropdown UUID, xem device đang thuộc chuyến nào và trạng thái public key; nhiều device một chuyến nhưng không một device hai chuyến active.
- [ ] Provisioning hoàn toàn ngoài browser bằng script/USB của NTK; UI chỉ refetch key status. Mọi request/response theo NTK §3.6, không private key ở UI/Network/log/Git, không giả sẵn sàng gửi khi chưa assignment/key.
- [ ] Chức năng cũ được giữ: Dashboard, danh sách/chi tiết shipment, nhiệt độ/độ ẩm, bản đồ mô phỏng, timeline, chính sách 15 phút, demo token payout.
- [ ] Chức năng mới có: Device Integrity, signed telemetry status, sequence gap/heartbeat/offline, Data Integrity batches/Merkle, anchoring verify, tamper/mismatch alerts, UI trạng thái tx riêng.
- [ ] Có production build kết nối **public FastAPI Render thật** dùng **external MySQL**, không hardcode localhost/URL giả.
- [ ] Browser chỉ dùng Backend REST API, không private key, không ký blockchain tx, không truy cập ESP32/DB/RPC trực tiếp.
- [ ] Có test results cho ít nhất 12 demo scenarios nêu trong prompt; những case chưa có Backend/contract phải đánh dấu `BLOCKED`, không giả `PASS`.
- [ ] Không có payout thành công chỉ dựa vào `transaction_hash`; không tự coi data gap là vi phạm nhiệt độ.
- [ ] Không giới thiệu Blockchain là chứng minh nhiệt độ thực tế, vị trí mô phỏng là GPS thật hoặc token demo là tiền thật.
- [ ] README, screenshot, demo checklist, bug log và bàn giao cho nhóm hoàn chỉnh.

---

## 10. Các quyết định kỹ thuật còn cần xác nhận / blockers

| Nội dung | Ai chốt | Tại sao chưa thể coi là đã xong |
|---|---|---|
| API schema/auth/nullability và phần đăng ký cần đổi | **NTK** | Đã có DTO/routes; cần cập nhật OpenAPI/API contract cho §2.5–2.6 rồi xác minh tích hợp, không tự đổi enum hoặc coi pagination đã có |
| DTO ID/tên, list/DeviceView, assignment conflict và JWT migration | **NTK → TTDK** | Baseline đăng ký đã có code; cần regression/migration trên MySQL, client/modal/mocks dùng JWT và bằng chứng public deployment |
| Provisioning Python/USB, public key trong MySQL và mẫu signed đầu tiên | **NTK**, TTDK QA | Không thể xác nhận flash đúng chỉ từ `has_public_key`; cần script/board hoặc simulator đã đăng ký, không cần UI quản trị khóa |
| Danh sách demo scenarios và quyền gọi | **NTK** | Backend production phải tắt demo; không được tự tạo scenario trong UI |
| Signed telemetry/sequence/offline rules | **NTK** | UI chỉ hiển thị kết luận Backend, không tự suy ra chữ ký/gap |
| `MERKLE-v1`, batch membership, root, integrity verification semantics | **NTK + NTD** | Cần golden fixtures và API thực tế trước khi nghiệm thu cross-language |
| Sepolia `11155111`, Remix ABI/address/manifest, Alchemy Web3.py, receipt/confirmations | **NTD → NTK** | Stack đã chọn; chưa có bằng chứng deploy/smoke mới, không dùng legacy/local hay placeholder thay nghiệm thu |
| Evidence policy `PAYOUT_REQUIRES_ANCHORED_EVIDENCE` | **Cả nhóm, NTK chủ trì** | Nếu chốt true, `EVIDENCE_PENDING` chờ anchor trước khi gửi payout |
| Render service URL, MySQL provider, CORS frontend origin | **NTK + TTDK** | Không được giả định Render URL hoặc DB/Frontend domain đã có |
| UI library/chart library, client cache/polling, E2E framework | **TTDK**, thông báo nhóm | Ưu tiên stack đang có; chỉ bổ sung dependency sau đánh giá |
| Frontend hosting/public URL và triển khai auth đã chọn | **TTDK + NTK** | Một Admin/JWT đã chốt; còn login/dependency/client migration, domain thật/CORS/HTTPS và QA, không mở lại API-key flow |
| Bằng chứng kiểm thử E2E thực tế | **Cả nhóm** | Mock screenshots không chứng minh giao dịch, deployment hoặc firmware đã hoạt động |

**Hành động đầu tiên:** đối chiếu API/OpenAPI hiện có với NTK, chốt thay đổi §2.5–2.6 và flow §3.2–3.3; đơn giản hóa các modal/page/client đang có theo Phase 0–3. Xác nhận NTD giữ ABI/ID mapping và mọi Blockchain state qua Backend; không dựng lại các màn hình integrity/insurance không bị ảnh hưởng.

---

> **Ghi chú cập nhật:** Chỉ sửa ba roadmap: chuyển workflow sang Remix + Ethereum Sepolia + Alchemy + Web3.py và một Admin Login/JWT. Giữ `SIGNED-TELEMETRY-v1`, `MERKLE-v1`, đăng ký/gán/provisioning local/USB, rule 15 phút/evidence/anti-replay/chống payout trùng, các Phase và checkbox lịch sử. `.env`, source/schema/API/client thực thi, port tests và deployment chưa thay đổi; mọi nhiệm vụ mới chưa tự được tick. Runbook/README/API contract cũ cần owner cập nhật trước chạy flow mới; xem [bảng chuyển đổi và rủi ro NTD §12](ROADMAP_NTD_BLOCKCHAIN_SMART_CONTRACT.md#12-tóm-tắt-chuyển-đổi-và-rủi-ro-cần-kiểm-thử--dùng-chung-ba-roadmap).
