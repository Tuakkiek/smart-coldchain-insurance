import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Script tạo dữ liệu demo: tạo 1 policy mẫu cho shipment ID demo.
 * Chạy sau khi đã deploy contract (cần deployments/localhost.json).
 */
async function main() {
  // Đọc deployment info
  const deploymentPath = path.join(__dirname, "..", "deployments", "localhost.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployments/localhost.json not found. Run deploy.ts first.");
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));

  const [deployer, oracleAccount, beneficiaryAccount] = await ethers.getSigners();

  console.log("=== Seed Demo Data ===");
  console.log(`Deployer (insurer): ${deployer.address}`);
  console.log(`Oracle:             ${oracleAccount.address}`);
  console.log(`Beneficiary:        ${beneficiaryAccount.address}`);

  // Kết nối contract
  const token = await ethers.getContractAt(
    "MockInsuranceToken",
    deployment.contracts.MockInsuranceToken.address
  );
  const insurance = await ethers.getContractAt(
    "ColdChainInsurance",
    deployment.contracts.ColdChainInsurance.address
  );

  // Tạo demo policy
  const demoShipmentId = "8b4fb8a2-2996-4da2-90b9-35019517f56f"; // UUID mẫu từ api-v1.md
  const shipmentKey = ethers.keccak256(ethers.toUtf8Bytes(demoShipmentId));
  const payoutAmount = ethers.parseEther("1000"); // 1000 token demo
  const expiry = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 ngày

  console.log(`\nShipment ID:  ${demoShipmentId}`);
  console.log(`Shipment Key: ${shipmentKey}`);

  // Approve token cho contract
  const insuranceAddress = await insurance.getAddress();
  console.log("\n1. Approving token for insurance contract...");
  const approveTx = await token.approve(insuranceAddress, payoutAmount);
  await approveTx.wait();
  console.log("   ✓ Approved");

  // Tạo policy
  console.log("2. Creating policy...");
  const createTx = await insurance.createPolicy(
    shipmentKey,
    beneficiaryAccount.address,
    payoutAmount,
    expiry
  );
  const createReceipt = await createTx.wait();
  console.log(`   ✓ Policy created (tx: ${createReceipt?.hash})`);

  // Đọc lại policy để xác nhận
  const policy = await insurance.getPolicy(shipmentKey);
  console.log("\n3. Policy info:");
  console.log(`   Beneficiary:  ${policy.beneficiary}`);
  console.log(`   Payout:       ${ethers.formatEther(policy.payoutAmount)} MINS`);
  console.log(`   Expiry:       ${new Date(Number(policy.expiry) * 1000).toISOString()}`);
  console.log(`   Status:       ${["NotExist", "Active", "PaidOut"][Number(policy.status)]}`);

  console.log("\n=== Seed demo hoàn tất ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

