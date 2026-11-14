import os

from dotenv import load_dotenv
from web3 import Web3

# 1. Đọc cấu hình từ file .env
load_dotenv()

RPC_URL = os.getenv("SEPOLIA_RPC_URL")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")

# 2. Kiểm tra cấu hình
if not all([RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS]):
    raise ValueError("Thiếu thông tin trong file .env")

# 3. Kết nối Ethereum Sepolia
w3 = Web3(Web3.HTTPProvider(RPC_URL))

if not w3.is_connected():
    raise ConnectionError("Không thể kết nối Ethereum Sepolia")

print("Kết nối Ethereum thành công!")

# 4. Kiểm tra đúng mạng Sepolia
chain_id = w3.eth.chain_id

if chain_id != 11155111:
    raise ValueError(f"Sai mạng Blockchain. Chain ID: {chain_id}")

print("Đang sử dụng Ethereum Sepolia!")

# 5. Khởi tạo tài khoản từ Private Key
account = w3.eth.account.from_key(PRIVATE_KEY)

print("Địa chỉ ví:", account.address)

# 6. Kiểm tra số dư ví
balance = w3.eth.get_balance(account.address)

print(
    "Số dư Sepolia ETH:",
    w3.from_wei(balance, "ether")
)

# 7. Kiểm tra địa chỉ Smart Contract
if not Web3.is_address(CONTRACT_ADDRESS):
    raise ValueError("Contract Address không hợp lệ")

contract_address = Web3.to_checksum_address(CONTRACT_ADDRESS)

contract_code = w3.eth.get_code(contract_address)

if len(contract_code) == 0:
    raise ValueError("Không tìm thấy Smart Contract tại địa chỉ này")

print("Đã tìm thấy Smart Contract!")
print("Contract Address:", contract_address)

print("\nHOÀN THÀNH KIỂM TRA!")