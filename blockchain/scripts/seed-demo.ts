import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Script tạo dữ liệu demo (deterministic):
 * 1. Module A: Neo 1 lô telemetry batch mẫu (Merkle root v1 3-leaves vector) vào ColdChainDataIntegrity.
 * 2. Module B: Ký quỹ và tạo 1 chính sách bảo hiểm mẫu cho shipment vào ColdChainInsurance.
 *
 * Yêu cầu: Đã chạy `npm run deploy` trước để tạo `deployments/localhost.json`.
 */
async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", "localhost.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Không tìm thấy deployments/localhost.json. Vui lòng chạy deploy.ts trước.");
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));

  const [deployer, oracleAccount, anchorerAccount, beneficiaryAccount] = await ethers.getSigners();

  console.log("=================================================");
  console.log("=== Seed Demo Data (Phase 5: Module A + B) ===");
  console.log("=================================================");
  console.log(`Insurer (Deployer):  ${deployer.address}`);
  console.log(`Oracle (Backend):    ${oracleAccount.address}`);
  console.log(`Anchorer (Backend):  ${anchorerAccount.address}`);
  console.log(`Beneficiary:         ${beneficiaryAccount.address}`);

  // 1. Kết nối smart contracts
  const token = await ethers.getContractAt(
    "MockInsuranceToken",
    deployment.contracts.MockInsuranceToken.address
  );
  const dataIntegrity = await ethers.getContractAt(
    "ColdChainDataIntegrity",
    deployment.contracts.ColdChainDataIntegrity.address
  );
  const insurance = await ethers.getContractAt(
    "ColdChainInsurance",
    deployment.contracts.ColdChainInsurance.address
  );

  // 2. Dữ liệu định danh mẫu (Deterministic IDs)
  const demoShipmentId = "8b4fb8a2-2996-4da2-90b9-35019517f56f"; // UUID mẫu từ api-v1.md
  const demoDeviceId = "device-coldchain-01";
  const demoBatchId = "batch-0001-sealed";

  const shipmentKey = ethers.keccak256(ethers.toUtf8Bytes(demoShipmentId));
  const deviceKey = ethers.keccak256(ethers.toUtf8Bytes(demoDeviceId));
  const batchKey = ethers.keccak256(ethers.toUtf8Bytes(demoBatchId));

  // Merkle root từ Python protocol_vectors_v1.json (3 leaves canonical record vector)
  const merkleRoot = "0x5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae37";
  const recordCount = 3;
  const firstSequence = 1n;
  const lastSequence = 3n;

  console.log("\n--- Thông tin định danh Demo ---");
  console.log(`Shipment ID:  ${demoShipmentId}`);
  console.log(`Shipment Key: ${shipmentKey}`);
  console.log(`Batch ID:     ${demoBatchId}`);
  console.log(`Batch Key:    ${batchKey}`);
  console.log(`Device Key:   ${deviceKey}`);
  console.log(`Merkle Root:  ${merkleRoot}`);

  // 3. Seed Module A: Neo batch vào ColdChainDataIntegrity
  console.log("\n--- [Module A] Neo Telemetry Batch ---");
  const alreadyAnchored = await dataIntegrity.batchExists(batchKey);
  if (alreadyAnchored) {
    console.log("   [INFO] Batch đã được neo trước đó. Bỏ qua để tránh duplicate error.");
  } else {
    // Kiểm tra signer anchorer
    const contractAnchorer = await dataIntegrity.anchorer();
    let anchorerSigner = anchorerAccount;
    if (contractAnchorer.toLowerCase() === deployer.address.toLowerCase()) {
      anchorerSigner = deployer;
    } else if (contractAnchorer.toLowerCase() === oracleAccount.address.toLowerCase()) {
      anchorerSigner = oracleAccount;
    }

    console.log(`   Neo batch bằng tài khoản Anchorer: ${anchorerSigner.address}`);
    const anchorTx = await dataIntegrity.connect(anchorerSigner).anchorBatch(
      batchKey,
      shipmentKey,
      deviceKey,
      merkleRoot,
      firstSequence,
      lastSequence,
      recordCount
    );
    const anchorReceipt = await anchorTx.wait();
    console.log(`   ✓ Batch anchored thành công (tx: ${anchorReceipt?.hash})`);
  }

  // 4. Seed Module B: Ký quỹ và tạo Policy vào ColdChainInsurance
  console.log("\n--- [Module B] Tạo Chính sách Bảo hiểm ---");
  const payoutAmount = ethers.parseEther("1000"); // 1,000 token MINS
  const expiry = Math.floor(Date.now() / 1000) + 86400 * 30; // Hiệu lực 30 ngày

  const policy = await insurance.getPolicy(shipmentKey);
  if (policy.status !== 0n) {
    console.log("   [INFO] Policy cho shipmentKey này đã tồn tại. Bỏ qua tạo mới.");
  } else {
    const insuranceAddress = await insurance.getAddress();
    console.log(`   1. Approve ${ethers.formatEther(payoutAmount)} MINS cho contract bảo hiểm...`);
    const approveTx = await token.connect(deployer).approve(insuranceAddress, payoutAmount);
    await approveTx.wait();
    console.log("      ✓ Approve hoàn tất.");

    console.log("   2. Tạo chính sách bảo hiểm (createPolicy)...");
    const createTx = await insurance.connect(deployer).createPolicy(
      shipmentKey,
      beneficiaryAccount.address,
      payoutAmount,
      expiry
    );
    const createReceipt = await createTx.wait();
    console.log(`      ✓ Policy created thành công (tx: ${createReceipt?.hash})`);
  }

  // 5. Hiển thị tóm tắt trạng thái sau khi seed
  const updatedBatch = await dataIntegrity.getBatch(batchKey);
  const updatedPolicy = await insurance.getPolicy(shipmentKey);
  const statusLabels = ["NotExist", "Active", "PaidOut", "Refunded"];

  console.log("\n=================================================");
  console.log("=== TÓM TẮT DỮ LIỆU SEED DEMO ===");
  console.log("=================================================");
  console.log("Module A (Data Integrity):");
  console.log(`   - Batch Key:     ${batchKey}`);
  console.log(`   - Merkle Root:   ${updatedBatch.merkleRoot}`);
  console.log(`   - Record Count:  ${updatedBatch.recordCount}`);
  console.log(`   - Sequence:      ${updatedBatch.firstSequence} -> ${updatedBatch.lastSequence}`);
  console.log(`   - Anchored At:   ${new Date(Number(updatedBatch.anchoredAt) * 1000).toISOString()}`);
  console.log("Module B (Insurance Policy):");
  console.log(`   - Shipment Key:  ${shipmentKey}`);
  console.log(`   - Insurer:       ${updatedPolicy.insurer}`);
  console.log(`   - Beneficiary:   ${updatedPolicy.beneficiary}`);
  console.log(`   - Payout Amount: ${ethers.formatEther(updatedPolicy.payoutAmount)} MINS`);
  console.log(`   - Expiry:        ${new Date(Number(updatedPolicy.expiry) * 1000).toISOString()}`);
  console.log(`   - Status:        ${statusLabels[Number(updatedPolicy.status)]}`);
  console.log("\n=== Seed Demo hoàn tất thành công! ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
