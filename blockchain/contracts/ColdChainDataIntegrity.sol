// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ColdChainDataIntegrity
 * @notice Module A: Smart contract neo giữ Merkle Root bất biến của các lô telemetry đã đóng gói (sealed batches).
 *         - Quản lý quyền ANCHORER (Backend service account).
 *         - Lưu trữ metadata tối thiểu của batch: shipmentKey, deviceKey, merkleRoot, sequence bounds, recordCount.
 *         - Ngăn chặn ghi đè (immutable root commitment), chống neo trùng lặp (duplicate batchKey).
 *         - Cung cấp hàm tra cứu và xác thực tính toàn vẹn (verifyBatch).
 * @dev Quy tắc MERKLE-v1:
 *        - leaf = SHA256(0x00 || canonical_record_utf8)
 *        - parent = SHA256(0x01 || left_32_bytes || right_32_bytes)
 *        - merkleRoot: bytes32
 */
contract ColdChainDataIntegrity {
    // ─── Custom Errors ───────────────────────────────────────────────
    error ColdChain__CallerNotOwner();
    error ColdChain__CallerNotAnchorer();
    error ColdChain__ZeroAddress();
    error ColdChain__InvalidBatchKey();
    error ColdChain__InvalidMerkleRoot();
    error ColdChain__InvalidRecordCount();
    error ColdChain__InvalidSequenceRange(uint64 firstSequence, uint64 lastSequence);
    error ColdChain__BatchAlreadyExists(bytes32 batchKey);
    error ColdChain__BatchNotFound(bytes32 batchKey);

    // ─── Data Structures ─────────────────────────────────────────────

    struct Batch {
        bytes32 shipmentKey;
        bytes32 deviceKey;
        bytes32 merkleRoot;
        uint64 firstSequence;
        uint64 lastSequence;
        uint32 recordCount;
        uint64 anchoredAt;
        address anchoredBy;
    }

    // ─── State Variables ─────────────────────────────────────────────

    /// @notice Địa chỉ owner/admin quản trị hợp đồng.
    address public owner;

    /// @notice Địa chỉ anchorer được ủy quyền gọi anchorBatch (Backend signer).
    address public anchorer;

    /// @notice Mapping từ batchKey -> Batch metadata
    mapping(bytes32 => Batch) private batches;

    // ─── Events ──────────────────────────────────────────────────────

    event BatchAnchored(
        bytes32 indexed batchKey,
        bytes32 indexed shipmentKey,
        bytes32 indexed deviceKey,
        bytes32 merkleRoot,
        uint32 recordCount,
        address anchoredBy
    );

    event AnchorerUpdated(
        address indexed previousAnchorer,
        address indexed newAnchorer
    );

    // ─── Modifiers ───────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert ColdChain__CallerNotOwner();
        _;
    }

    modifier onlyAnchorer() {
        if (msg.sender != anchorer) revert ColdChain__CallerNotAnchorer();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────

    /**
     * @param _anchorer Địa chỉ Backend signer có quyền neo batch Merkle root.
     */
    constructor(address _anchorer) {
        if (_anchorer == address(0)) revert ColdChain__ZeroAddress();
        owner = msg.sender;
        anchorer = _anchorer;
    }

    // ─── Admin Functions ─────────────────────────────────────────────

    /**
     * @notice Thay đổi địa chỉ anchorer. Chỉ owner được gọi.
     * @param _newAnchorer Địa chỉ anchorer mới.
     */
    function setAnchorer(address _newAnchorer) external onlyOwner {
        if (_newAnchorer == address(0)) revert ColdChain__ZeroAddress();
        address prev = anchorer;
        anchorer = _newAnchorer;
        emit AnchorerUpdated(prev, _newAnchorer);
    }

    // ─── Core Functions ──────────────────────────────────────────────

    /**
     * @notice Neo một batch Merkle Root lên blockchain.
     *         Chỉ authorized anchorer mới được gọi.
     * @param _batchKey keccak256(UTF8(batch_id)) — Khóa định danh duy nhất của batch
     * @param _shipmentKey keccak256(UTF8(shipment_id))
     * @param _deviceKey keccak256(UTF8(device_id))
     * @param _merkleRoot Root 32 bytes tính theo chuẩn MERKLE-v1 (SHA-256)
     * @param _firstSequence Số sequence đầu tiên trong batch
     * @param _lastSequence Số sequence cuối cùng trong batch
     * @param _recordCount Số lượng bản ghi hợp lệ trong batch
     */
    function anchorBatch(
        bytes32 _batchKey,
        bytes32 _shipmentKey,
        bytes32 _deviceKey,
        bytes32 _merkleRoot,
        uint64 _firstSequence,
        uint64 _lastSequence,
        uint32 _recordCount
    ) external onlyAnchorer {
        if (_batchKey == bytes32(0)) revert ColdChain__InvalidBatchKey();
        if (_merkleRoot == bytes32(0)) revert ColdChain__InvalidMerkleRoot();
        if (_recordCount == 0) revert ColdChain__InvalidRecordCount();
        if (_firstSequence > _lastSequence) {
            revert ColdChain__InvalidSequenceRange(_firstSequence, _lastSequence);
        }

        // Chống ghi đè hoặc neo trùng lặp cùng batchKey
        if (batches[_batchKey].anchoredAt != 0) {
            revert ColdChain__BatchAlreadyExists(_batchKey);
        }

        batches[_batchKey] = Batch({
            shipmentKey: _shipmentKey,
            deviceKey: _deviceKey,
            merkleRoot: _merkleRoot,
            firstSequence: _firstSequence,
            lastSequence: _lastSequence,
            recordCount: _recordCount,
            anchoredAt: uint64(block.timestamp),
            anchoredBy: msg.sender
        });

        emit BatchAnchored(
            _batchKey,
            _shipmentKey,
            _deviceKey,
            _merkleRoot,
            _recordCount,
            msg.sender
        );
    }

    // ─── View Functions ──────────────────────────────────────────────

    /**
     * @notice Tra cứu thông tin metadata của batch đã neo.
     * @param _batchKey Khóa định danh của batch
     * @return Batch struct chứa đầy đủ metadata
     */
    function getBatch(bytes32 _batchKey) external view returns (Batch memory) {
        Batch memory b = batches[_batchKey];
        if (b.anchoredAt == 0) revert ColdChain__BatchNotFound(_batchKey);
        return b;
    }

    /**
     * @notice Xác minh xem một candidate root có khớp với root đã neo hay không.
     * @param _batchKey Khóa định danh của batch
     * @param _candidateRoot Root Merkle cần đối chiếu
     * @return matchResult True nếu candidate root khớp với on-chain root
     */
    function verifyBatch(bytes32 _batchKey, bytes32 _candidateRoot)
        external
        view
        returns (bool matchResult)
    {
        Batch memory b = batches[_batchKey];
        if (b.anchoredAt == 0) revert ColdChain__BatchNotFound(_batchKey);
        return (b.merkleRoot == _candidateRoot);
    }

    /**
     * @notice Kiểm tra nhanh xem batchKey đã tồn tại trên chain hay chưa.
     * @param _batchKey Khóa định danh của batch
     * @return exists True nếu batch đã được neo
     */
    function batchExists(bytes32 _batchKey) external view returns (bool exists) {
        return (batches[_batchKey].anchoredAt != 0);
    }
}
