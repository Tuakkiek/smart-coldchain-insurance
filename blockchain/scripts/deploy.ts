import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer, oracleAccount] = await ethers.getSigners();

  console.log("=== Deploy Smart Cold Chain Insurance ===");
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Oracle:    ${oracleAccount.address}`);

  // 1. Deploy MockInsuranceToken — 1,000,000 token (18 decimals)
  const initialSupply = ethers.parseEther("1000000");
  const MockToken = await ethers.getContractFactory("MockInsuranceToken");
  const token = await MockToken.deploy(initialSupply);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`MockInsuranceToken deployed at: ${tokenAddress}`);

  // 2. Deploy ColdChainInsurance
  const Insurance = await ethers.getContractFactory("ColdChainInsurance");
  const insurance = await Insurance.deploy(tokenAddress, oracleAccount.address);
  await insurance.waitForDeployment();
  const insuranceAddress = await insurance.getAddress();
  console.log(`ColdChainInsurance  deployed at: ${insuranceAddress}`);

  // 3. Lưu thông tin deployment
  const network = await ethers.provider.getNetwork();
  const deployment = {
    network: "localhost",
    chainId: Number(network.chainId),
    contracts: {
      MockInsuranceToken: {
        address: tokenAddress,
        deployer: deployer.address,
      },
      ColdChainInsurance: {
        address: insuranceAddress,
        deployer: deployer.address,
        oracle: oracleAccount.address,
      },
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
  console.log("\nDeployment info saved to deployments/localhost.json");
  console.log("\n=== Deploy hoàn tất ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

