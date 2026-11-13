import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Script kiểm tra và xoay vòng quyền Anchorer (Module A) & Oracle (Module B).
 *
 * Cách sử dụng:
 * - Xem quyền hiện tại:
 *     npx hardhat run scripts/manage-roles.ts --network localhost
 * - Cập nhật Anchorer mới:
 *     $env:NEW_ANCHORER="0x..."; npx hardhat run scripts/manage-roles.ts --network localhost
 * - Cập nhật Oracle mới:
 *     $env:NEW_ORACLE="0x..."; npx hardhat run scripts/manage-roles.ts --network localhost
 */
async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", "localhost.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Không tìm thấy deployments/localhost.json. Vui lòng chạy `npm run deploy` trước.");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const [owner] = await ethers.getSigners();

  const dataIntegrity = await ethers.getContractAt(
    "ColdChainDataIntegrity",
    deployment.contracts.ColdChainDataIntegrity.address
  );
  const insurance = await ethers.getContractAt(
    "ColdChainInsurance",
    deployment.contracts.ColdChainInsurance.address
  );

  console.log("=================================================");
  console.log("=== Quản trị Phân quyền Anchorer & Oracle ===");
  console.log("=================================================");
  console.log(`Owner Signer: ${owner.address}`);
  console.log(`Current Anchorer (Module A): ${await dataIntegrity.anchorer()}`);
  console.log(`Current Oracle   (Module B): ${await insurance.oracle()}`);

  const newAnchorer = process.env.NEW_ANCHORER?.trim();
  const newOracle = process.env.NEW_ORACLE?.trim();
  let updated = false;

  if (newAnchorer) {
    if (!ethers.isAddress(newAnchorer) || newAnchorer === ethers.ZeroAddress) {
      throw new Error(`Địa chỉ NEW_ANCHORER không hợp lệ: ${newAnchorer}`);
    }
    console.log(`\n-> Đang cập nhật Anchorer sang: ${newAnchorer}...`);
    const tx = await dataIntegrity.connect(owner).setAnchorer(newAnchorer);
    const receipt = await tx.wait();
    console.log(`   [OK] AnchorerUpdated tx: ${receipt?.hash}`);
    deployment.contracts.ColdChainDataIntegrity.anchorer = newAnchorer;
    deployment.roles.anchorer = newAnchorer;
    updated = true;
  }

  if (newOracle) {
    if (!ethers.isAddress(newOracle) || newOracle === ethers.ZeroAddress) {
      throw new Error(`Địa chỉ NEW_ORACLE không hợp lệ: ${newOracle}`);
    }
    console.log(`\n-> Đang cập nhật Oracle sang: ${newOracle}...`);
    const tx = await insurance.connect(owner).setOracle(newOracle);
    const receipt = await tx.wait();
    console.log(`   [OK] OracleUpdated tx: ${receipt?.hash}`);
    deployment.contracts.ColdChainInsurance.oracle = newOracle;
    deployment.roles.oracle = newOracle;
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    console.log("\n[OK] Đã đồng bộ role mới vào deployments/localhost.json");
  } else {
    console.log("\n[INFO] Không có biến môi trường NEW_ANCHORER hoặc NEW_ORACLE. Chỉ hiển thị trạng thái hiện tại.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

