# Blockchain — Smart Cold Chain Insurance

Smart Contract quản lý dữ liệu toàn vẹn (**Module A — `ColdChainDataIntegrity`**) và chính sách bảo hiểm chuỗi lạnh bằng native **`SepoliaETH`** (**Module B — `ColdChainInsurance`**) trên mạng **Ethereum Sepolia (`11155111`)**.

> ⚠️ **Demo only** — `SepoliaETH` trong project này chỉ là coin testnet miễn phí, không có giá trị tiền thật. Không kết nối ví/tài khoản có tài sản thật.
>
> Luồng hiện tại dùng `shipment_id` UUID và bộ thiết bị cố định `ESP32-01` đến `ESP32-10` (xem [hướng dẫn local](../docs/local-devices.md)). `ColdChainInsurance` dùng native `SepoliaETH` (`constructor` nhận `Oracle`, `createPolicy` gửi kèm `msg.value`).

---

## Tài liệu hướng dẫn nhanh

- **Bàn giao cấu hình `.env` & vai trò ví cho Backend (NTK):** [HANDOFF_SEPOLIA.md](HANDOFF_SEPOLIA.md) · [deployments/sepolia.json](deployments/sepolia.json)
- **Hướng dẫn Demo E2E & thao tác Remix + MetaMask cho người mới (NTK, TTDK):** [REMIX_TEST_SCENARIOS.md](REMIX_TEST_SCENARIOS.md)
- **Giải thích kiến trúc, Merkle Tree & liên kết Backend ↔ Blockchain từ đầu:** [BLOCKCHAIN_EXPLAINED.md](BLOCKCHAIN_EXPLAINED.md)
- **Hướng dẫn Compile / Deploy Remix & Python Tooling:** [REMIX_SETUP.md](REMIX_SETUP.md) · [compiler-settings.json](compiler-settings.json)
- **Đặc tả kỹ thuật tích hợp (ABI, Keys, Events, Errors, Outbox):** [INTEGRATION.md](INTEGRATION.md)

---

## Stack & Công cụ

- **Solidity** (`^0.8.24`, compile bằng Remix `0.8.36+commit.8a079791`, optimizer `200`, `evmVersion: osaka`)
- **OpenZeppelin** Contracts `v5.6.1` (`ReentrancyGuard`)
- **Remix IDE + Browser Extension (MetaMask)** trên mạng **Ethereum Sepolia (`11155111`)**
- **Python Web3.py Tooling** (`web3==7.12.0`, `python-dotenv==1.1.0`) — không cần cài Node.js

## Cấu trúc thư mục

```text
blockchain/
├── contracts/
│   ├── ColdChainDataIntegrity.sol    # Module A: Merkle root anchoring & verification
│   └── ColdChainInsurance.sol        # Module B: Native SepoliaETH insurance policy & payout
├── deployments/
│   ├── sepolia.json                  # Manifest chính thức trên Ethereum Sepolia (11155111)
│   └── abi/
│       ├── ColdChainDataIntegrity.json      # Wrapped ABI {"contractName", "abi"} cho Backend
│       ├── ColdChainDataIntegrity.abi.json  # Pure ABI array
│       ├── ColdChainInsurance.json          # Wrapped ABI {"contractName", "abi"} cho Backend
│       ├── ColdChainInsurance.abi.json      # Pure ABI array
│       └── contract-interfaces.json         # Bảng tổng hợp functions, events, custom errors
├── scripts_py/
│   ├── preflight_sepolia.py          # Kiểm tra kết nối RPC, số dư ví & state on-chain
│   ├── create_sepolia_manifest.py    # Sinh file deployments/sepolia.json (không chứa secrets)
│   └── validate_remix_abi.py         # Đối chiếu ABI xuất từ Remix với Backend
├── ABI.md                            # Lưu trữ ABI sau mỗi lần compile trên Remix
├── BLOCKCHAIN_EXPLAINED.md           # Giải thích toàn diện nguyên lý Merkle & liên kết Backend
├── HANDOFF_SEPOLIA.md                # Hướng dẫn điền .env & phân vai ví cho NTK
├── INTEGRATION.md                    # Đặc tả giao thức & quy tắc tích hợp Backend
├── REMIX_SETUP.md                    # Hướng dẫn compile & deploy trên Remix IDE
├── REMIX_TEST_SCENARIOS.md           # Kịch bản Demo E2E & tự thực hành trên Remix + MetaMask
├── compiler-settings.json            # Cấu hình compiler & SHA-256 checksum nguồn
├── requirements.txt                  # Thư viện Python cho scripts_py/
└── .env.example                      # Mẫu cấu hình môi trường Sepolia (không chứa secrets)
```

## Cài đặt & Kiểm tra bằng Python (tùy chọn)

```bash
pip install -r blockchain/requirements.txt

# Kiểm tra kết nối Sepolia, số dư ví Owner/Anchorer/Oracle, bytecode & role on-chain:
python blockchain/scripts_py/preflight_sepolia.py --manifest blockchain/deployments/sepolia.json
```

## Tóm tắt Smart Contracts đang chạy trên Sepolia (`11155111`)

### 1. `ColdChainDataIntegrity` (`0xE04F6f1bb80C438D356E0547ec10337F33ecD81f`)
- **Merkle-v1 Protocol:** `SHA-256(0x00 || canonical_record_utf8)` cho lá và `SHA-256(0x01 || left || right)` cho node cha.
- Keys (`batchKey`, `shipmentKey`, `deviceKey`) dùng `keccak256(UTF8(id))`.

| Hàm | Ai gọi | Mô tả |
|---|---|---|
| `anchorBatch(...)` | Anchorer (Backend `0xd2D6...`) | Neo Merkle root, `recordCount`, sequence bounds cho batch |
| `getBatch(batchKey)` | Public view | Trả về tuple thông tin batch |
| `verifyBatch(batchKey, root)` | Public view | So khớp candidate Merkle root với root bất biến on-chain |
| `batchExists(batchKey)` | Public view | Kiểm tra batch đã được neo hay chưa |
| `setAnchorer(newAnchorer)` | Owner (`0x6607...`) | Cập nhật địa chỉ anchorer |

### 2. `ColdChainInsurance` (`0x13Cb896302ea78146EF5eb1E28bFfC1073b8ea9F`)
- Sử dụng trực tiếp native **`SepoliaETH`** (mức gợi ý demo cho ví `2–10 ETH`: **`0.01 SepoliaETH` = `10000000000000000` `wei`** = `10 Finney`).

| Hàm | Ai gọi | Mô tả |
|---|---|---|
| `createPolicy(...)` (`payable`) | Insurer / Owner (`0x6607...`) | Tạo policy và gửi kèm `SepoliaETH` khóa làm quỹ bảo hiểm |
| `reportViolation(...)` | Oracle (Backend `0x7747...`) | Báo vi phạm hợp lệ, tự động chuyển `SepoliaETH` cho `beneficiary` |
| `refundExpiredPolicy(...)` | Insurer / Owner | Hoàn lại `SepoliaETH` khi chuyến hàng an toàn và hết hạn |
| `setOracle(newOracle)` | Owner (`0x6607...`) | Cập nhật địa chỉ oracle |
| `getPolicy(shipmentKey)` | Public view | Đọc chi tiết policy (tuple 7 giá trị) |
| `isPolicyActive(shipmentKey)` | Public view | Kiểm tra policy còn hoạt động và chưa hết hạn |
| `getContractBalance()` | Public view | Xem số dư `SepoliaETH` (`wei`) đang giữ trong contract |
