// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ColdChainInsurance
 * @notice Smart contract quản lý chính sách bảo hiểm chuỗi lạnh (cold chain).
 *         - Quản lý policy theo shipmentKey (bytes32).
 *         - Hạn chế quyền gọi reportViolation cho oracle address.
 *         - Tự động chi trả token demo khi nhận sự kiện vi phạm hợp lệ.
 *         - Chống gửi trùng (duplicate payout).
 * @dev Contract MVP — chỉ dùng trên local chain hoặc testnet.
 *      Backend đóng vai trò oracle gửi giao dịch có bằng chứng tham chiếu.
 *      Quy tắc:
 *        - shipmentKey = keccak256(UTF8(shipment_id))
 *        - evidenceHash = keccak256(UTF8(event_id))
 *        - detectedAt = Unix timestamp giây UTC
 */
contract ColdChainInsurance is ReentrancyGuard {
    // ─── Custom Errors ───────────────────────────────────────────────
    error ColdChain__CallerNotOwner();
    error ColdChain__CallerNotOracle();
    error ColdChain__ZeroAddress();
    error ColdChain__PolicyAlreadyExists(bytes32 shipmentKey);
    error ColdChain__InvalidPayoutAmount();
    error ColdChain__InvalidExpiry(uint256 expiry, uint256 currentTimestamp);
    error ColdChain__PolicyNotActive(bytes32 shipmentKey, PolicyStatus currentStatus);
    error ColdChain__PolicyExpired(uint256 expiry, uint256 currentTimestamp);
    error ColdChain__TokenTransferFailed();

    // ─── State Variables ─────────────────────────────────────────────

    /// @notice Địa chỉ owner (admin), người deploy contract.
    address public owner;

    /// @notice Địa chỉ oracle được cấp quyền gọi reportViolation.
    address public oracle;

    /// @notice Token ERC-20 demo dùng cho chi trả bảo hiểm.
    IERC20 public payoutToken;

    // ─── Data Structures ─────────────────────────────────────────────

    /// @notice Trạng thái policy
    enum PolicyStatus {
        NotExist,   // 0 — chưa tồn tại
        Active,     // 1 — đã đăng ký và được cấp vốn, còn hiệu lực
        PaidOut     // 2 — đã chi trả
    }

    /// @notice Thông tin một policy bảo hiểm
    struct Policy {
        address beneficiary;    // Địa chỉ nhận bồi thường
        uint256 payoutAmount;   // Số token demo chi trả
        uint256 expiry;         // Unix timestamp hết hạn
        PolicyStatus status;    // Trạng thái hiện tại
        bytes32 evidenceHash;   // Hash bằng chứng (chỉ ghi khi chi trả)
        uint256 detectedAt;     // Thời điểm phát hiện vi phạm (chỉ ghi khi chi trả)
    }

    /// @notice Mapping từ shipmentKey -> Policy
    mapping(bytes32 => Policy) public policies;

    // ─── Events ──────────────────────────────────────────────────────

    /// @notice Phát khi policy mới được tạo thành công
    event PolicyCreated(
        bytes32 indexed shipmentKey,
        address indexed beneficiary,
        uint256 payoutAmount,
        uint256 expiry
    );

    /// @notice Phát khi chi trả bảo hiểm thành công
    event InsurancePaid(
        bytes32 indexed shipmentKey,
        address indexed beneficiary,
        uint256 payoutAmount,
        bytes32 evidenceHash,
        uint256 detectedAt
    );

    /// @notice Phát khi oracle address được cập nhật
    event OracleUpdated(
        address indexed previousOracle,
        address indexed newOracle
    );

    // ─── Modifiers ───────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert ColdChain__CallerNotOwner();
        _;
    }

    modifier onlyOracle() {
        if (msg.sender != oracle) revert ColdChain__CallerNotOracle();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────

    /**
     * @param _payoutToken Địa chỉ MockInsuranceToken đã deploy.
     * @param _oracle Địa chỉ oracle ban đầu (Backend signer).
     */
    constructor(address _payoutToken, address _oracle) {
        if (_payoutToken == address(0) || _oracle == address(0)) {
            revert ColdChain__ZeroAddress();
        }

        owner = msg.sender;
        payoutToken = IERC20(_payoutToken);
        oracle = _oracle;
    }

    // ─── Admin Functions ─────────────────────────────────────────────

    /**
     * @notice Cập nhật địa chỉ oracle. Chỉ owner mới được gọi.
     * @param _newOracle Địa chỉ oracle mới.
     */
    function setOracle(address _newOracle) external onlyOwner {
        if (_newOracle == address(0)) revert ColdChain__ZeroAddress();
        address prev = oracle;
        oracle = _newOracle;
        emit OracleUpdated(prev, _newOracle);
    }

    // ─── Core Functions ──────────────────────────────────────────────

    /**
     * @notice Đăng ký một policy bảo hiểm mới cho shipment.
     *         Caller phải approve đủ token cho contract trước khi gọi.
     * @param _shipmentKey keccak256(UTF8(shipment_id)) — khóa duy nhất
     * @param _beneficiary Địa chỉ nhận bồi thường khi vi phạm
     * @param _payoutAmount Số token demo chi trả
     * @param _expiry Unix timestamp (giây) hết hạn policy
     */
    function createPolicy(
        bytes32 _shipmentKey,
        address _beneficiary,
        uint256 _payoutAmount,
        uint256 _expiry
    ) external nonReentrant {
        if (policies[_shipmentKey].status != PolicyStatus.NotExist) {
            revert ColdChain__PolicyAlreadyExists(_shipmentKey);
        }
        if (_beneficiary == address(0)) revert ColdChain__ZeroAddress();
        if (_payoutAmount == 0) revert ColdChain__InvalidPayoutAmount();
        if (_expiry <= block.timestamp) {
            revert ColdChain__InvalidExpiry(_expiry, block.timestamp);
        }

        // Chuyển token từ insurer (msg.sender) vào contract để khóa vốn
        bool transferred = payoutToken.transferFrom(msg.sender, address(this), _payoutAmount);
        if (!transferred) revert ColdChain__TokenTransferFailed();

        // Lưu policy
        policies[_shipmentKey] = Policy({
            beneficiary: _beneficiary,
            payoutAmount: _payoutAmount,
            expiry: _expiry,
            status: PolicyStatus.Active,
            evidenceHash: bytes32(0),
            detectedAt: 0
        });

        emit PolicyCreated(_shipmentKey, _beneficiary, _payoutAmount, _expiry);
    }

    /**
     * @notice Báo cáo vi phạm nhiệt độ và kích hoạt chi trả bảo hiểm.
     *         Chỉ oracle (Backend) được gọi.
     * @param _shipmentKey keccak256(UTF8(shipment_id))
     * @param _evidenceHash keccak256(UTF8(event_id)) — tham chiếu bản ghi off-chain
     * @param _detectedAt Unix timestamp giây UTC khi Backend phát hiện vi phạm
     */
    function reportViolation(
        bytes32 _shipmentKey,
        bytes32 _evidenceHash,
        uint256 _detectedAt
    ) external onlyOracle nonReentrant {
        Policy storage policy = policies[_shipmentKey];

        // Kiểm tra policy tồn tại và đang hoạt động
        if (policy.status != PolicyStatus.Active) {
            revert ColdChain__PolicyNotActive(_shipmentKey, policy.status);
        }

        // Kiểm tra policy chưa hết hạn
        if (block.timestamp > policy.expiry) {
            revert ColdChain__PolicyExpired(policy.expiry, block.timestamp);
        }

        // Cập nhật trạng thái TRƯỚC khi transfer (Checks-Effects-Interactions)
        policy.status = PolicyStatus.PaidOut;
        policy.evidenceHash = _evidenceHash;
        policy.detectedAt = _detectedAt;

        // Chuyển token cho beneficiary
        bool transferred = payoutToken.transfer(policy.beneficiary, policy.payoutAmount);
        if (!transferred) revert ColdChain__TokenTransferFailed();

        emit InsurancePaid(
            _shipmentKey,
            policy.beneficiary,
            policy.payoutAmount,
            _evidenceHash,
            _detectedAt
        );
    }

    // ─── View Functions ──────────────────────────────────────────────

    /**
     * @notice Đọc thông tin policy theo shipmentKey.
     * @param _shipmentKey keccak256(UTF8(shipment_id))
     * @return beneficiary Địa chỉ nhận bồi thường
     * @return payoutAmount Số token chi trả
     * @return expiry Thời hạn policy
     * @return status Trạng thái policy (0=NotExist, 1=Active, 2=PaidOut)
     * @return evidenceHash Hash bằng chứng (bytes32(0) nếu chưa chi trả)
     * @return detectedAt Thời điểm phát hiện (0 nếu chưa chi trả)
     */
    function getPolicy(bytes32 _shipmentKey)
        external
        view
        returns (
            address beneficiary,
            uint256 payoutAmount,
            uint256 expiry,
            PolicyStatus status,
            bytes32 evidenceHash,
            uint256 detectedAt
        )
    {
        Policy storage p = policies[_shipmentKey];
        return (
            p.beneficiary,
            p.payoutAmount,
            p.expiry,
            p.status,
            p.evidenceHash,
            p.detectedAt
        );
    }
}
