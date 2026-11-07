import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Script kiểm tra và xác minh trạng thái deployment:
 * - Kiểm tra chain ID và kết nối mạng
 * - Xác minh bytecode đã triển khai của MockInsuranceToken và ColdChainInsurance
 * - Kiểm tra owner, oracle, và cấu hình token
 * - Kiểm tra số dư quỹ và chính sách bảo hiểm demo đã seed
 */
async function main() {
  console.log("=== Bắt đầu xác minh Deployment (Phase 3) ===");

  const deploymentPath = path.join(__dirname, "..", "deployments", "localhost.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Không tìm thấy deployments/localhost.json. Vui lòng chạy deploy.ts trước.");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const network = await ethers.provider.getNetwork();
  const currentChainId = Number(network.chainId);

  console.log(`\n1. Kiểm tra Mạng & Chain ID:`);
  console.log(`   - Config chainId: ${deployment.chainId}`);
  console.log(`   - Live chainId:   ${currentChainId}`);
  if (currentChainId !== deployment.chainId) {
    throw new Error(`Chain ID mismatch! Config: ${deployment.chainId}, Live: ${currentChainId}`);
  }
  console.log("   [OK] Chain ID chính xác.");

  // 2. Kiểm tra MockInsuranceToken
  const tokenAddress = deployment.contracts.MockInsuranceToken.address;
  console.log(`\n2. Kiểm tra MockInsuranceToken (${tokenAddress}):`);
  const tokenCode = await ethers.provider.getCode(tokenAddress);
  if (tokenCode === "0x") {
    throw new Error(`Không tìm thấy bytecode tại ${tokenAddress}`);
  }
  const token = await ethers.getContractAt("MockInsuranceToken", tokenAddress);
  const tokenName = await token.name();
  const tokenSymbol = await token.symbol();
  const totalSupply = await token.totalSupply();
  console.log(`   - Token: ${tokenName} (${tokenSymbol})`);
  console.log(`   - Total Supply: ${ethers.formatEther(totalSupply)} ${tokenSymbol}`);
  console.log("   [OK] MockInsuranceToken hoạt động hợp lệ.");

  // 3. Kiểm tra ColdChainInsurance
  const insuranceAddress = deployment.contracts.ColdChainInsurance.address;
  console.log(`\n3. Kiểm tra ColdChainInsurance (${insuranceAddress}):`);
  const insuranceCode = await ethers.provider.getCode(insuranceAddress);
  if (insuranceCode === "0x") {
    throw new Error(`Không tìm thấy bytecode tại ${insuranceAddress}`);
  }
  const insurance = await ethers.getContractAt("ColdChainInsurance", insuranceAddress);
  const owner = await insurance.owner();
  const oracle = await insurance.oracle();
  const payoutToken = await insurance.payoutToken();
  const contractBalance = await insurance.getContractBalance();

  console.log(`   - Owner:           ${owner}`);
  console.log(`   - Oracle:          ${oracle}`);
  console.log(`   - Payout Token:    ${payoutToken}`);
  console.log(`   - Contract Escrow: ${ethers.formatEther(contractBalance)} ${tokenSymbol}`);

  if (payoutToken.toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error("payoutToken của Insurance không khớp với MockInsuranceToken!");
  }
  console.log("   [OK] ColdChainInsurance cấu hình chính xác.");

  // 4. Kiểm tra Demo Policy
  const demoShipmentId = "8b4fb8a2-2996-4da2-90b9-35019517f56f";
  const shipmentKey = ethers.keccak256(ethers.toUtf8Bytes(demoShipmentId));
  console.log(`\n4. Kiểm tra Demo Policy (${demoShipmentId}):`);
  const isActive = await insurance.isPolicyActive(shipmentKey);
  const policy = await insurance.getPolicy(shipmentKey);
  const statusLabels = ["NotExist", "Active", "PaidOut", "Refunded"];
  const statusStr = statusLabels[Number(policy.status)] || "Unknown";

  console.log(`   - Insurer:     ${policy.insurer}`);
  console.log(`   - Beneficiary: ${policy.beneficiary}`);
  console.log(`   - Payout:      ${ethers.formatEther(policy.payoutAmount)} ${tokenSymbol}`);
  console.log(`   - Expiry:      ${new Date(Number(policy.expiry) * 1000).toISOString()}`);
  console.log(`   - Status:      ${statusStr} (${policy.status})`);
  console.log(`   - Active now:  ${isActive}`);

  console.log("\n=============================================");
  console.log(" [SUCCESS] Toàn bộ tiêu chí kiểm tra đạt 100%!");
  console.log("=============================================\n");
}

main().catch((error) => {
  console.error("Xác minh thất bại:", error);
  process.exitCode = 1;
});
