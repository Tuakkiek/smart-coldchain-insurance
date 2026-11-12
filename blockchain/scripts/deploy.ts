import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Script deploy toàn bộ smart contracts của hệ thống Smart Cold Chain Insurance:
 * 1. MockInsuranceToken (MINS) - ERC-20 token demo cho ký quỹ và chi trả bảo hiểm
 * 2. ColdChainDataIntegrity (Module A) - Neo Merkle root và xác thực tính toàn vẹn dữ liệu telemetry
 * 3. ColdChainInsurance (Module B) - Quản lý chính sách bảo hiểm, khóa quỹ và tự động chi trả
 */
async function main() {
  const [deployer, defaultOracle, defaultAnchorer] = await ethers.getSigners();

  const oracleAddress = process.env.ORACLE_ADDRESS || defaultOracle.address;
  const anchorerAddress = process.env.ANCHORER_ADDRESS || defaultAnchorer.address;

  console.log("=================================================");
  console.log("=== Deploy Smart Cold Chain Insurance (Phase 5) ===");
  console.log("=================================================");
  console.log(`Deployer (Admin):  ${deployer.address}`);
  console.log(`Oracle (Backend):  ${oracleAddress}`);
  console.log(`Anchorer (Backend): ${anchorerAddress}`);

  // 1. Deploy MockInsuranceToken — 1,000,000 token (18 decimals)
  const initialSupply = ethers.parseEther("1000000");
  const MockToken = await ethers.getContractFactory("MockInsuranceToken");
  const token = await MockToken.deploy(initialSupply);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`\n[1/3] MockInsuranceToken deployed:     ${tokenAddress}`);

  // 2. Deploy ColdChainDataIntegrity (Module A)
  const DataIntegrity = await ethers.getContractFactory("ColdChainDataIntegrity");
  const dataIntegrity = await DataIntegrity.deploy(anchorerAddress);
  await dataIntegrity.waitForDeployment();
  const dataIntegrityAddress = await dataIntegrity.getAddress();
  console.log(`[2/3] ColdChainDataIntegrity deployed: ${dataIntegrityAddress}`);

  // 3. Deploy ColdChainInsurance (Module B)
  const Insurance = await ethers.getContractFactory("ColdChainInsurance");
  const insurance = await Insurance.deploy(tokenAddress, oracleAddress);
  await insurance.waitForDeployment();
  const insuranceAddress = await insurance.getAddress();
  console.log(`[3/3] ColdChainInsurance deployed:     ${insuranceAddress}`);

  // 4. Lưu thông tin deployment vào deployments/localhost.json
  const network = await ethers.provider.getNetwork();
  const deployment = {
    network: "localhost",
    chainId: Number(network.chainId),
    contracts: {
      MockInsuranceToken: {
        address: tokenAddress,
        deployer: deployer.address,
      },
      ColdChainDataIntegrity: {
        address: dataIntegrityAddress,
        deployer: deployer.address,
        anchorer: anchorerAddress,
      },
      ColdChainInsurance: {
        address: insuranceAddress,
        deployer: deployer.address,
        oracle: oracleAddress,
        payoutToken: tokenAddress,
      },
    },
    roles: {
      deployer: deployer.address,
      oracle: oracleAddress,
      anchorer: anchorerAddress,
    },
    deployedAt: new Date().toISOString(),
    note: "Addresses only valid for this local chain session. Redeploy will change addresses.",
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(deploymentsDir, "localhost.json"),
    JSON.stringify(deployment, null, 2)
  );

  console.log("\n[OK] Deployment info saved to deployments/localhost.json");
  console.log("=== Deploy hoàn tất thành công! ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
