// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Exercises rejected native transfers and a reentrant payout callback.
contract NativePayoutReceiver {
    address public immutable insurance;
    bool public rejectPayment;
    bool public attemptReentry;
    bytes4 public reentryError;

    constructor(address target) {
        insurance = target;
    }

    function configure(bool reject, bool reenter) external {
        rejectPayment = reject;
        attemptReentry = reenter;
    }

    receive() external payable {
        require(!rejectPayment, "Payment rejected");
        if (attemptReentry) {
            (bool success, bytes memory result) = insurance.call{value: msg.value}(
                abi.encodeWithSignature(
                    "createPolicy(bytes32,address,uint256,uint256)",
                    keccak256("reentry"), address(this), msg.value, block.timestamp + 1 days
                )
            );
            require(!success, "Reentry succeeded");
            reentryError = bytes4(result);
        }
    }
}
