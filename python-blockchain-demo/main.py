
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from web3 import Web3

load_dotenv()

w3 = Web3(Web3.HTTPProvider(os.getenv("SEPOLIA_RPC_URL")))

private_key = os.getenv("PRIVATE_KEY")
account = w3.eth.account.from_key(private_key)

abi = [
    {
        "type": "function",
        "name": "setMessage",
        "inputs": [{"name": "newMessage", "type": "string"}],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "getMessage",
        "inputs": [],
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "view"
    }
]

contract = w3.eth.contract(
    address=Web3.to_checksum_address(os.getenv("CONTRACT_ADDRESS")),
    abi=abi
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"]
)

class Message(BaseModel):
    message: str

@app.get("/get-message")
def get_message():
    message = contract.functions.getMessage().call()
    return {"message": message}

@app.post("/set-message")
def set_message(data: Message):
    transaction = contract.functions.setMessage(data.message).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "chainId": w3.eth.chain_id
    })

    signed = w3.eth.account.sign_transaction(transaction, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    return {
        "status": receipt.status,
        "tx_hash": tx_hash.hex()
    }
