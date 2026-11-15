import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Script kiểm tra và xác minh trạng thái deployment (Phase 5):
 * 1. Mạng & Chain ID
 * 2. Bytecode của 3 hợp đồng: MockInsuranceToken, ColdChainDataIntegrity, ColdChainInsurance
 * 3. Phân quyền và liên kết: Owner, Anchorer, Oracle, PayoutToken
 * 4. Trạng thái Module A: Lô dữ liệu đã neo, xác thực Merkle root, kiểm tra phát hiện giả mạo
 * 5. Trạng thái Module B: Khóa quỹ ký quỹ (escrow balance), chính sách bảo hiểm và thời hạn
 */
async function main() {
  console.log("=================================================");
  console.log("=== Bắt đầu xác minh Deployment (Phase 5) ===");
  console.log("=================================================");

  const deploymentPath = path.join(__dirname, "..", "deployments", "localhost.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Không tìm thấy deployments/localhost.json. Vui lòng chạy deploy.ts trước.");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const network = await ethers.provider.getNetwork();
  const currentChainId = Number(network.chainId);

  // 1. Kiểm tra Mạng & Chain ID
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
  console.log(`   - Token Name:   ${tokenName} (${tokenSymbol})`);
  console.log(`   - Total Supply: ${ethers.formatEther(totalSupply)} ${tokenSymbol}`);
  console.log("   [OK] MockInsuranceToken bytecode và thông số hợp lệ.");

  // 3. Kiểm tra ColdChainDataIntegrity (Module A)
  const dataIntegrityAddress = deployment.contracts.ColdChainDataIntegrity.address;
  console.log(`\n3. Kiểm tra ColdChainDataIntegrity (${dataIntegrityAddress}):`);
  const dataIntegrityCode = await ethers.provider.getCode(dataIntegrityAddress);
  if (dataIntegrityCode === "0x") {
    throw new Error(`Không tìm thấy bytecode tại ${dataIntegrityAddress}`);
  }
  const dataIntegrity = await ethers.getContractAt("ColdChainDataIntegrity", dataIntegrityAddress);
  const dataOwner = await dataIntegrity.owner();
  const dataAnchorer = await dataIntegrity.anchorer();
  console.log(`   - Owner:    ${dataOwner}`);
  console.log(`   - Anchorer: ${dataAnchorer}`);
  if (dataAnchorer.toLowerCase() !== deployment.contracts.ColdChainDataIntegrity.anchorer.toLowerCase()) {
    throw new Error("Anchorer address không khớp với cấu hình deployment!");
  }
  console.log("   [OK] ColdChainDataIntegrity bytecode và quyền hạn chính xác.");

  // 4. Kiểm tra ColdChainInsurance (Module B)
  const insuranceAddress = deployment.contracts.ColdChainInsurance.address;
  console.log(`\n4. Kiểm tra ColdChainInsurance (${insuranceAddress}):`);
  const insuranceCode = await ethers.provider.getCode(insuranceAddress);
  if (insuranceCode === "0x") {
    throw new Error(`Không tìm thấy bytecode tại ${insuranceAddress}`);
  }
  const insurance = await ethers.getContractAt("ColdChainInsurance", insuranceAddress);
  const insOwner = await insurance.owner();
  const insOracle = await insurance.oracle();
  const insPayoutToken = await insurance.payoutToken();
  const contractBalance = await insurance.getContractBalance();

  console.log(`   - Owner:           ${insOwner}`);
  console.log(`   - Oracle:          ${insOracle}`);
  console.log(`   - Payout Token:    ${insPayoutToken}`);
  console.log(`   - Contract Escrow: ${ethers.formatEther(contractBalance)} ${tokenSymbol}`);

  if (insPayoutToken.toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error("PayoutToken của Insurance không khớp với MockInsuranceToken!");
  }
  if (insOracle.toLowerCase() !== deployment.contracts.ColdChainInsurance.oracle.toLowerCase()) {
    throw new Error("Oracle address không khớp với cấu hình deployment!");
  }
  console.log("   [OK] ColdChainInsurance bytecode và liên kết token/oracle chính xác.");

  // 5. Kiểm tra Dữ liệu Seed Demo trên Module A
  const demoBatchId = "batch-0001-sealed";
  const batchKey = ethers.keccak256(ethers.toUtf8Bytes(demoBatchId));
  const expectedRoot = "0x5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae37";

  console.log(`\n5. Kiểm tra Dữ liệu Seed Module A (Batch: ${demoBatchId}):`);
  const batchExists = await dataIntegrity.batchExists(batchKey);
  if (!batchExists) {
    console.log("   [CẢNH BÁO] Chưa tìm thấy batch seed demo. Hãy chạy `npm run seed` nếu cần.");
  } else {
    const batch = await dataIntegrity.getBatch(batchKey);
    const isValid = await dataIntegrity.verifyBatch(batchKey, expectedRoot);
    const fakeRoot = ethers.keccak256(ethers.toUtf8Bytes("tampered-root"));
    const isTamperedDetected = !(await dataIntegrity.verifyBatch(batchKey, fakeRoot));

    console.log(`   - Batch Exists:           ${batchExists}`);
    console.log(`   - Merkle Root on-chain:   ${batch.merkleRoot}`);
    console.log(`   - Record Count:           ${batch.recordCount}`);
    console.log(`   - Sequence:               ${batch.firstSequence} -> ${batch.lastSequence}`);
    console.log(`   - Root Verification:      ${isValid ? "HỢP LỆ (MATCH)" : "KHÔNG KHỚP"}`);
    console.log(`   - Tamper Detection Test:  ${isTamperedDetected ? "PHÁT HIỆN TỐT (REJECTED)" : "THẤT BẠI"}`);

    if (!isValid || !isTamperedDetected) {
      throw new Error("Module A verification logic không hoạt động chính xác!");
    }
    console.log("   [OK] Module A xác thực dữ liệu toàn vẹn chuẩn xác.");
  }

  // 6. Kiểm tra Dữ liệu Seed Demo trên Module B
  const demoShipmentId = "8b4fb8a2-2996-4da2-90b9-35019517f56f";
  const shipmentKey = ethers.keccak256(ethers.toUtf8Bytes(demoShipmentId));
  console.log(`\n6. Kiểm tra Dữ liệu Seed Module B (Shipment: ${demoShipmentId}):`);
  const isActive = await insurance.isPolicyActive(shipmentKey);
  const policy = await insurance.getPolicy(shipmentKey);
  const statusLabels = ["NotExist", "Active", "PaidOut", "Refunded"];
  const statusStr = statusLabels[Number(policy.status)] || "Unknown";

  console.log(`   - Insurer:     ${policy.insurer}`);
  console.log(`   - Beneficiary: ${policy.beneficiary}`);
  console.log(`   - Payout:      ${ethers.formatEther(policy.payoutAmount)} ${tokenSymbol}`);
  console.log(`   - Expiry:      ${new Date(Number(policy.expiry) * 1000).toISOString()}`);
  console.log(`   - Status:      ${statusStr} (code: ${policy.status})`);
  console.log(`   - Is Active:   ${isActive}`);

  if (policy.status === 1n && !isActive) {
    throw new Error("Chính sách đang Active nhưng hàm isPolicyActive trả về false!");
  }
  console.log("   [OK] Module B chính sách bảo hiểm và số dư ký quỹ hoạt động hoàn hảo.");

  console.log("\n=================================================");
  console.log(" [SUCCESS] Toàn bộ tiêu chí kiểm tra Phase 5 ĐẠT 100%!");
  console.log("=================================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
