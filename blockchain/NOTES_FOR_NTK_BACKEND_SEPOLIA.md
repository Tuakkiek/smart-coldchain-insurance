# Ghi chú kỹ thuật cho NTK (Backend) khi chuyển từ Hardhat sang Sepolia + Alchemy + Remix

> **Người viết:** Member 2 (NTD) — *Không sửa trực tiếp `backend/`; tài liệu này tổng hợp các điểm NTK cần kiểm tra/điều chỉnh ở Backend để chạy trơn tru trên Ethereum Sepolia (`11155111`) qua Alchemy RPC.*

---

## 1. Lỗi nghiêm trọng tiềm ẩn: `get_logs(from_block=0, ...)` trên Alchemy Sepolia

- **Vị trí hiện tại:**
  - `backend/app/integrations/blockchain_adapter.py` dòng **117–119** (`Web3BlockchainAdapter.prepare_report`):
    ```python
    logs = contract.events.InsurancePaid().get_logs(
        from_block=0, argument_filters={"shipmentKey": shipment_key},
    )
    ```
  - `backend/app/integrations/blockchain_adapter.py` dòng **265–267** (`Web3IntegrityAdapter.anchored_transaction_hash`):
    ```python
    logs = contract.events.BatchAnchored().get_logs(
        from_block=0, argument_filters={"batchKey": batch_key},
    )
    ```
- **Vấn đề:** Trên Hardhat local chỉ có vài chục block nên `from_block=0` chạy bình thường. Trên **Sepolia** (hàng triệu block), **Alchemy Free Tier giới hạn rất chặt phạm vi block của `eth_getLogs`**, nên gọi `from_block=0` khi retry/reconcile sẽ bị Alchemy trả lỗi HTTP 400 / block range exceeded.
- **Hướng giải quyết đề xuất cho NTK:**
  1. NTD sẽ ghi rõ `deployBlockNumber` của từng contract trong `blockchain/deployments/sepolia.json` sau khi deploy bằng Remix + MetaMask.
  2. NTK bổ sung biến config (ví dụ `BLOCKCHAIN_START_BLOCK` hoặc query theo từng chunk `from_block` gần `latest` / từ `deployBlockNumber` trong phạm vi Alchemy cho phép) thay vì hardcode `from_block=0`.

---

## 2. Định dạng file ABI JSON khi nhận từ Remix

- **Vị trí hiện tại:** `backend/app/integrations/blockchain_adapter.py` dòng **90–91** và **180–181**:
  ```python
  abi = json.load(artifact_file)["abi"]
  ```
- **Vấn đề:** Backend đang kỳ vọng file JSON có dạng object `{"contractName": "...", "abi": [...]}` (giống `backend/app/integrations/abi/*.json`). Trong khi đó, nút **Copy ABI** của Remix IDE xuất ra **mảng JSON thuần `[...]`** (giống `blockchain/deployments/abi/*.abi.json`).
- **Hướng giải quyết:**
  - **Phía NTD:** Sẽ chuẩn hóa/bọc lại thành `{"contractName": "...", "abi": [...]}` bằng script `blockchain/scripts_py/validate_remix_abi.py` trước khi bàn giao.
  - **Phía NTK (khuyên làm thêm để an toàn):** Hỗ trợ đọc linh hoạt cả 2 dạng trong `_contract()`: nếu JSON load ra là `list` thì dùng trực tiếp, nếu là `dict` thì lấy `data["abi"]`.

---

## 3. Cấu hình Confirmations & Receipt Timeout cho Sepolia

- **Vị trí hiện tại:** `backend/.env.example` dòng **33–47** và `backend/app/core/config.py` dòng **129–134**:
  - `BLOCKCHAIN_NETWORK=localhost`
  - `BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545`
  - `BLOCKCHAIN_CHAIN_ID=31337`
  - `BLOCKCHAIN_CONFIRMATIONS=1`
  - `BLOCKCHAIN_RECEIPT_TIMEOUT_SECONDS=15`
- **Vấn đề:** Thời gian tạo block trung bình của Sepolia là ~12 giây/block. Để timeout 15 giây với 2 confirmations (~24–36 giây) sẽ khiến request gần như luôn rơi vào `BLOCKCHAIN_PENDING` trong lần gọi đầu.
- **Hướng giải quyết đề xuất cho NTK:**
  - Khi chuyển env sang Sepolia, đặt:
    - `BLOCKCHAIN_NETWORK=sepolia`
    - `BLOCKCHAIN_CHAIN_ID=11155111`
    - `BLOCKCHAIN_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<ALCHEMY_API_KEY>`
    - `BLOCKCHAIN_CONFIRMATIONS=2`
    - `BLOCKCHAIN_RECEIPT_TIMEOUT_SECONDS=120` (hoặc xử lý pending bất đồng bộ qua outbox + reconcile endpoint).

---

## 4. Cơ chế Gas (`gasPrice` legacy vs EIP-1559)

- **Vị trí hiện tại:** `backend/app/integrations/blockchain_adapter.py` dòng **133–134** (`gas: 300000`, `gasPrice: web3.eth.gas_price`) và dòng **226–227** (`gas: 400000`, `gasPrice: web3.eth.gas_price`).
- **Vấn đề:** Trên Sepolia khi phí nền (`baseFee`) dao động đột ngột, transaction dùng `gasPrice` bằng đúng giá tức thời (không có buffer / không dùng EIP-1559 `maxFeePerGas` + `maxPriorityFeePerGas`) dễ bị kẹt trong mempool lâu.
- **Hướng giải quyết đề xuất cho NTK:** Cân nhắc chuyển `build_transaction` sang EIP-1559 (`maxFeePerGas`, `maxPriorityFeePerGas` với hệ số dự phòng nhẹ) hoặc nhân buffer (ví dụ `1.2x`) cho gas price trên testnet.

---

## 5. Bộ test E2E local cũ trong `backend/tests/` vẫn gọi Hardhat artifacts

- **Vị trí hiện tại:** `backend/tests/test_integrity_anchor_local.py` và `backend/tests/test_blockchain_local.py` đang đọc bytecode từ `blockchain/artifacts/contracts/...` để tự deploy lên node `127.0.0.1:8545`.
- **Hướng giải quyết:** Giữ các file đó như legacy opt-in hoặc bổ sung bộ test mock RPC / opt-in Sepolia (`chainId == 11155111`) theo đúng kế hoạch Phase 4/6 mới mà không phụ thuộc Hardhat node.
