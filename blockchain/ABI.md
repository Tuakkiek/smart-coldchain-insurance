MockInsuranceToken: [
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "initialSupply",
				"type": "uint256"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "spender",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "allowance",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "needed",
				"type": "uint256"
			}
		],
		"name": "ERC20InsufficientAllowance",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "sender",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "balance",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "needed",
				"type": "uint256"
			}
		],
		"name": "ERC20InsufficientBalance",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "approver",
				"type": "address"
			}
		],
		"name": "ERC20InvalidApprover",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "receiver",
				"type": "address"
			}
		],
		"name": "ERC20InvalidReceiver",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "sender",
				"type": "address"
			}
		],
		"name": "ERC20InvalidSender",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "spender",
				"type": "address"
			}
		],
		"name": "ERC20InvalidSpender",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "MockToken__CallerNotOwner",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "MockToken__ZeroAddress",
		"type": "error"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "spender",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			}
		],
		"name": "Approval",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "from",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			}
		],
		"name": "Transfer",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "spender",
				"type": "address"
			}
		],
		"name": "allowance",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "spender",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			}
		],
		"name": "approve",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "account",
				"type": "address"
			}
		],
		"name": "balanceOf",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "decimals",
		"outputs": [
			{
				"internalType": "uint8",
				"name": "",
				"type": "uint8"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "mint",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "name",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "symbol",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "totalSupply",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			}
		],
		"name": "transfer",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "from",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			}
		],
		"name": "transferFrom",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]
ColdChainDataIntegrity: [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_anchorer",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "batchKey",
				"type": "bytes32"
			}
		],
		"name": "ColdChain__BatchAlreadyExists",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "batchKey",
				"type": "bytes32"
			}
		],
		"name": "ColdChain__BatchNotFound",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "ColdChain__CallerNotAnchorer",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "ColdChain__CallerNotOwner",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "ColdChain__InvalidBatchKey",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "ColdChain__InvalidMerkleRoot",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "ColdChain__InvalidRecordCount",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "uint64",
				"name": "firstSequence",
				"type": "uint64"
			},
			{
				"internalType": "uint64",
				"name": "lastSequence",
				"type": "uint64"
			}
		],
		"name": "ColdChain__InvalidSequenceRange",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "ColdChain__ZeroAddress",
		"type": "error"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "previousAnchorer",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "newAnchorer",
				"type": "address"
			}
		],
		"name": "AnchorerUpdated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "batchKey",
				"type": "bytes32"
			},
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "shipmentKey",
				"type": "bytes32"
			},
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "deviceKey",
				"type": "bytes32"
			},
			{
				"indexed": false,
				"internalType": "bytes32",
				"name": "merkleRoot",
				"type": "bytes32"
			},
			{
				"indexed": false,
				"internalType": "uint32",
				"name": "recordCount",
				"type": "uint32"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "anchoredBy",
				"type": "address"
			}
		],
		"name": "BatchAnchored",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_batchKey",
				"type": "bytes32"
			},
			{
				"internalType": "bytes32",
				"name": "_shipmentKey",
				"type": "bytes32"
			},
			{
				"internalType": "bytes32",
				"name": "_deviceKey",
				"type": "bytes32"
			},
			{
				"internalType": "bytes32",
				"name": "_merkleRoot",
				"type": "bytes32"
			},
			{
				"internalType": "uint64",
				"name": "_firstSequence",
				"type": "uint64"
			},
			{
				"internalType": "uint64",
				"name": "_lastSequence",
				"type": "uint64"
			},
			{
				"internalType": "uint32",
				"name": "_recordCount",
				"type": "uint32"
			}
		],
		"name": "anchorBatch",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "anchorer",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_batchKey",
				"type": "bytes32"
			}
		],
		"name": "batchExists",
		"outputs": [
			{
				"internalType": "bool",
				"name": "exists",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_batchKey",
				"type": "bytes32"
			}
		],
		"name": "getBatch",
		"outputs": [
			{
				"components": [
					{
						"internalType": "bytes32",
						"name": "shipmentKey",
						"type": "bytes32"
					},
					{
						"internalType": "bytes32",
						"name": "deviceKey",
						"type": "bytes32"
					},
					{
						"internalType": "bytes32",
						"name": "merkleRoot",
						"type": "bytes32"
					},
					{
						"internalType": "uint64",
						"name": "firstSequence",
						"type": "uint64"
					},
					{
						"internalType": "uint64",
						"name": "lastSequence",
						"type": "uint64"
					},
					{
						"internalType": "uint32",
						"name": "recordCount",
						"type": "uint32"
					},
					{
						"internalType": "uint64",
						"name": "anchoredAt",
						"type": "uint64"
					},
					{
						"internalType": "address",
						"name": "anchoredBy",
						"type": "address"
					}
				],
				"internalType": "struct ColdChainDataIntegrity.Batch",
				"name": "",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_newAnchorer",
				"type": "address"
			}
		],
		"name": "setAnchorer",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_batchKey",
				"type": "bytes32"
			},
			{
				"internalType": "bytes32",
				"name": "_candidateRoot",
				"type": "bytes32"
			}
		],
		"name": "verifyBatch",
		"outputs": [
			{
				"internalType": "bool",
				"name": "matchResult",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]
ColdChainInsurance: [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_oracle",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [],
		"name": "ColdChain__CallerNotInsurer",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "ColdChain__CallerNotOracle",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "ColdChain__CallerNotOwner",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "available",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "required",
				"type": "uint256"
			}
		],
		"name": "ColdChain__ContractInsufficientBalance",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "ColdChain__ETHTransferFailed",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "sent",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "expected",
				"type": "uint256"
			}
		],
		"name": "ColdChain__IncorrectETHDeposit",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "expiry",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "currentTimestamp",
				"type": "uint256"
			}
		],
		"name": "ColdChain__InvalidExpiry",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "ColdChain__InvalidPayoutAmount",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "shipmentKey",
				"type": "bytes32"
			}
		],
		"name": "ColdChain__PolicyAlreadyExists",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "expiry",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "currentTimestamp",
				"type": "uint256"
			}
		],
		"name": "ColdChain__PolicyExpired",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "shipmentKey",
				"type": "bytes32"
			},
			{
				"internalType": "enum ColdChainInsurance.PolicyStatus",
				"name": "currentStatus",
				"type": "uint8"
			}
		],
		"name": "ColdChain__PolicyNotActive",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "expiry",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "currentTimestamp",
				"type": "uint256"
			}
		],
		"name": "ColdChain__PolicyNotExpired",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "ColdChain__ZeroAddress",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_shipmentKey",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "_beneficiary",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "_payoutAmount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "_expiry",
				"type": "uint256"
			}
		],
		"name": "createPolicy",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "ReentrancyGuardReentrantCall",
		"type": "error"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "shipmentKey",
				"type": "bytes32"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "beneficiary",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "payoutAmount",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "bytes32",
				"name": "evidenceHash",
				"type": "bytes32"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "detectedAt",
				"type": "uint256"
			}
		],
		"name": "InsurancePaid",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "previousOracle",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "newOracle",
				"type": "address"
			}
		],
		"name": "OracleUpdated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "shipmentKey",
				"type": "bytes32"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "insurer",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "beneficiary",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "payoutAmount",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "expiry",
				"type": "uint256"
			}
		],
		"name": "PolicyCreated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "shipmentKey",
				"type": "bytes32"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "insurer",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "PolicyRefunded",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_shipmentKey",
				"type": "bytes32"
			}
		],
		"name": "refundExpiredPolicy",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_shipmentKey",
				"type": "bytes32"
			},
			{
				"internalType": "bytes32",
				"name": "_evidenceHash",
				"type": "bytes32"
			},
			{
				"internalType": "uint256",
				"name": "_detectedAt",
				"type": "uint256"
			}
		],
		"name": "reportViolation",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_newOracle",
				"type": "address"
			}
		],
		"name": "setOracle",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getContractBalance",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "balance",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_shipmentKey",
				"type": "bytes32"
			}
		],
		"name": "getPolicy",
		"outputs": [
			{
				"internalType": "address",
				"name": "insurer",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "beneficiary",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "payoutAmount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "expiry",
				"type": "uint256"
			},
			{
				"internalType": "enum ColdChainInsurance.PolicyStatus",
				"name": "status",
				"type": "uint8"
			},
			{
				"internalType": "bytes32",
				"name": "evidenceHash",
				"type": "bytes32"
			},
			{
				"internalType": "uint256",
				"name": "detectedAt",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_shipmentKey",
				"type": "bytes32"
			}
		],
		"name": "isPolicyActive",
		"outputs": [
			{
				"internalType": "bool",
				"name": "active",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "oracle",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "",
				"type": "bytes32"
			}
		],
		"name": "policies",
		"outputs": [
			{
				"internalType": "address",
				"name": "insurer",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "beneficiary",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "payoutAmount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "expiry",
				"type": "uint256"
			},
			{
				"internalType": "enum ColdChainInsurance.PolicyStatus",
				"name": "status",
				"type": "uint8"
			},
			{
				"internalType": "bytes32",
				"name": "evidenceHash",
				"type": "bytes32"
			},
			{
				"internalType": "uint256",
				"name": "detectedAt",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]