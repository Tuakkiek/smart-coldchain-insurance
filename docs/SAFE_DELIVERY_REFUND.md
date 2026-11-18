# Safe delivery và hoàn ký quỹ

## Luồng vận hành

`POST /api/v1/shipments/{shipment_id}/complete` yêu cầu Admin JWT. Backend khóa dòng shipment,
chuyển trạng thái sang `delivered`, ghi `delivered_at` UTC và sự kiện
`SHIPMENT_DELIVERED`, rồi commit trước khi gọi RPC. Từ thời điểm đó cả hai endpoint telemetry
đều trả `409 SHIPMENT_COMPLETED`; không có telemetry, violation hoặc Merkle batch mới được tạo.

Đánh giá cuối là fail-closed:

- `VIOLATED`: policy nhiệt độ đã trigger hoặc payout/evidence đang/đã được xử lý.
- `INCOMPLETE`: không có dữ liệu, dữ liệu không ký, sequence gap, breach chưa kết thúc,
  Merkle chưa khớp/chưa neo, hoặc policy chưa được xác nhận on-chain.
- `SAFE`: toàn bộ telemetry có chữ ký, liên tục, đã nằm trong batch khớp và neo on-chain,
  policy đang được xác nhận. Chỉ trạng thái này mới tạo outbox `REFUND_POLICY`.

Outbox lưu signed raw transaction và transaction hash trước khi broadcast. Vì vậy retry sau mất
kết nối RPC tiếp tục cùng giao dịch, không tạo lần hoàn tiền thứ hai.

## Deploy contract bằng Remix (Sepolia)

1. Mở `blockchain/contracts/ColdChainInsurance.sol` trong Remix, compiler `0.8.24`, bật optimizer.
2. Deploy với constructor `_oracle` là địa chỉ của `BLOCKCHAIN_ORACLE_PRIVATE_KEY`.
3. Copy ABI compiler mới vào `backend/app/integrations/abi/ColdChainInsurance.json` (file trong
   repository đã chứa `completeSafeDelivery`).
4. Cập nhật Backend:

   ```env
   BLOCKCHAIN_CONTRACT_ADDRESS=0x...
   BLOCKCHAIN_INSURANCE_CONTRACT_VERSION=safe_delivery_v2
   BLOCKCHAIN_DEPLOY_BLOCK=<block deploy>
   BLOCKCHAIN_ORACLE_PRIVATE_KEY=<secret>
   ```

5. Chạy `alembic upgrade head`, restart Backend, tạo policy mới trên contract mới rồi kiểm tra
   địa chỉ contract/oracle/chain id trước demo.

Contract cũ phải giữ `BLOCKCHAIN_INSURANCE_CONTRACT_VERSION=legacy`. Backend sẽ không giả lập hoàn
sớm; policy chỉ được hoàn qua `refundExpiredPolicy` sau expiry và UI hiển thị `WAITING_EXPIRY`.

## Kiểm tra demo

Gửi telemetry ký hợp lệ, seal/verify/anchor batch, nhấn **Xác nhận đã giao hàng**, rồi kiểm tra:
shipment ở đích 100%, telemetry bị đóng, kết quả `SAFE`, refund chuyển `PENDING` sang `CONFIRMED`,
transaction Etherscan có event `SafeDeliveryCompleted` và `PolicyRefunded`.
