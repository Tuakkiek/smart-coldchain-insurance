// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockInsuranceToken
 * @notice Token ERC-20 demo dùng để mô phỏng chi trả bảo hiểm trên local chain.
 *         Token này KHÔNG đại diện giá trị VND hoặc tiền thật.
 * @dev Chỉ dùng cho mục đích phát triển và kiểm thử.
 *      Owner có thể mint token tùy ý — không dùng trong production.
 */
contract MockInsuranceToken is ERC20 {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "MockToken: caller is not owner");
        _;
    }

    /**
     * @param initialSupply Tổng số token ban đầu (đơn vị nhỏ nhất, 18 decimals).
     */
    constructor(uint256 initialSupply) ERC20("MockInsuranceToken", "MINS") {
        owner = msg.sender;
        _mint(msg.sender, initialSupply);
    }

    /**
     * @notice Mint thêm token cho mục đích demo/test.
     * @param to Địa chỉ nhận token.
     * @param amount Số lượng token (đơn vị nhỏ nhất).
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

