// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../ColdChainInsurance.sol";

/**
 * @title MaliciousReentrantToken
 * @notice Mock token độc hại dùng để kiểm thử khả năng chống tấn công Reentrancy và xử lý lỗi transfer.
 */
contract MaliciousReentrantToken is ERC20 {
    ColdChainInsurance public targetInsurance;
    bytes32 public attackShipmentKey;
    bytes32 public attackEvidenceHash;
    uint256 public attackDetectedAt;
    bool public attackOnTransfer;
    bool public attackOnTransferFrom;
    bool public shouldFailTransfer;

    constructor() ERC20("MaliciousToken", "BAD") {
        _mint(msg.sender, 1000000 ether);
    }

    function setTarget(
        address _insurance,
        bytes32 _shipmentKey,
        bytes32 _evidenceHash,
        uint256 _detectedAt
    ) external {
        targetInsurance = ColdChainInsurance(_insurance);
        attackShipmentKey = _shipmentKey;
        attackEvidenceHash = _evidenceHash;
        attackDetectedAt = _detectedAt;
    }

    function setAttackOnTransfer(bool _enable) external {
        attackOnTransfer = _enable;
    }

    function setAttackOnTransferFrom(bool _enable) external {
        attackOnTransferFrom = _enable;
    }

    function setShouldFailTransfer(bool _fail) external {
        shouldFailTransfer = _fail;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (shouldFailTransfer) {
            return false;
        }

        if (attackOnTransfer && address(targetInsurance) != address(0)) {
            attackOnTransfer = false;
            targetInsurance.reportViolation(attackShipmentKey, attackEvidenceHash, attackDetectedAt);
        }

        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (attackOnTransferFrom && address(targetInsurance) != address(0)) {
            attackOnTransferFrom = false;
            // Cố gắng tấn công reentrancy gọi lại createPolicy
            targetInsurance.createPolicy(
                keccak256("reentrant-attack-key"),
                address(0x123),
                100 ether,
                block.timestamp + 1000
            );
        }

        return super.transferFrom(from, to, amount);
    }
}
