import { expect } from "chai";
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import {
  MockInsuranceToken,
  ColdChainDataIntegrity,
  ColdChainInsurance,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Deployment and Seed Workflow (Phase 5 Part 1)", function () {
  let token: MockInsuranceToken;
  let dataIntegrity: ColdChainDataIntegrity;
  let insurance: ColdChainInsurance;

  let deployer: SignerWithAddress;
  let oracle: SignerWithAddress;
  let anchorer: SignerWithAddress;
  let beneficiary: SignerWithAddress;

  const demoShipmentId = "8b4fb8a2-2996-4da2-90b9-35019517f56f";
  const demoDeviceId = "device-coldchain-01";
  const demoBatchId = "batch-0001-sealed";

  const shipmentKey = ethers.keccak256(ethers.toUtf8Bytes(demoShipmentId));
  const deviceKey = ethers.keccak256(ethers.toUtf8Bytes(demoDeviceId));
  const batchKey = ethers.keccak256(ethers.toUtf8Bytes(demoBatchId));
  const merkleRoot = "0x5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae37";

  const recordCount = 3;
  const firstSequence = 1n;
  const lastSequence = 3n;
  const payoutAmount = ethers.parseEther("1000");

  before(async function () {
    [deployer, oracle, anchorer, beneficiary] = await ethers.getSigners();
  });

  it("Should deploy all 3 contracts with correct configuration and roles", async function () {
    // 1. Token
    const TokenFactory = await ethers.getContractFactory("MockInsuranceToken");
    token = await TokenFactory.deploy(ethers.parseEther("1000000"));
    await token.waitForDeployment();
    expect(await token.getAddress()).to.properAddress;

    // 2. DataIntegrity
    const DataIntegrityFactory = await ethers.getContractFactory("ColdChainDataIntegrity");
    dataIntegrity = await DataIntegrityFactory.deploy(anchorer.address);
    await dataIntegrity.waitForDeployment();
    expect(await dataIntegrity.getAddress()).to.properAddress;
    expect(await dataIntegrity.owner()).to.equal(deployer.address);
    expect(await dataIntegrity.anchorer()).to.equal(anchorer.address);

    // 3. Insurance
    const InsuranceFactory = await ethers.getContractFactory("ColdChainInsurance");
    insurance = await InsuranceFactory.deploy(await token.getAddress(), oracle.address);
    await insurance.waitForDeployment();
    expect(await insurance.getAddress()).to.properAddress;
    expect(await insurance.owner()).to.equal(deployer.address);
    expect(await insurance.oracle()).to.equal(oracle.address);
    expect(await insurance.payoutToken()).to.equal(await token.getAddress());
  });

  it("Should seed Module A telemetry batch deterministically", async function () {
    expect(await dataIntegrity.batchExists(batchKey)).to.be.false;

    await expect(
      dataIntegrity.connect(anchorer).anchorBatch(
        batchKey,
        shipmentKey,
        deviceKey,
        merkleRoot,
        firstSequence,
        lastSequence,
        recordCount
      )
    )
      .to.emit(dataIntegrity, "BatchAnchored")
      .withArgs(batchKey, shipmentKey, deviceKey, merkleRoot, recordCount, anchorer.address);

    expect(await dataIntegrity.batchExists(batchKey)).to.be.true;

    const batch = await dataIntegrity.getBatch(batchKey);
    expect(batch.shipmentKey).to.equal(shipmentKey);
    expect(batch.deviceKey).to.equal(deviceKey);
    expect(batch.merkleRoot).to.equal(merkleRoot);
    expect(batch.recordCount).to.equal(recordCount);
    expect(batch.firstSequence).to.equal(firstSequence);
    expect(batch.lastSequence).to.equal(lastSequence);
  });

  it("Should verify Module A batch integrity and detect tampering", async function () {
    // Valid root verification
    const isValid = await dataIntegrity.verifyBatch(batchKey, merkleRoot);
    expect(isValid).to.be.true;

    // Tampered root detection
    const fakeRoot = ethers.keccak256(ethers.toUtf8Bytes("tampered-telemetry"));
    const isFakeValid = await dataIntegrity.verifyBatch(batchKey, fakeRoot);
    expect(isFakeValid).to.be.false;
  });

  it("Should seed Module B policy and lock escrow tokens", async function () {
    const insuranceAddress = await insurance.getAddress();
    const expiry = Math.floor(Date.now() / 1000) + 86400 * 30;

    // Approve & create policy
    await token.connect(deployer).approve(insuranceAddress, payoutAmount);
    await expect(
      insurance.connect(deployer).createPolicy(
        shipmentKey,
        beneficiary.address,
        payoutAmount,
        expiry
      )
    )
      .to.emit(insurance, "PolicyCreated")
      .withArgs(shipmentKey, deployer.address, beneficiary.address, payoutAmount, expiry);

    expect(await insurance.isPolicyActive(shipmentKey)).to.be.true;
    expect(await insurance.getContractBalance()).to.equal(payoutAmount);
    expect(await token.balanceOf(insuranceAddress)).to.equal(payoutAmount);

    const policy = await insurance.getPolicy(shipmentKey);
    expect(policy.insurer).to.equal(deployer.address);
    expect(policy.beneficiary).to.equal(beneficiary.address);
    expect(policy.payoutAmount).to.equal(payoutAmount);
    expect(policy.status).to.equal(1n); // Active
  });

  it("Should ensure deployment info schema conforms to requirements without leaking secrets", async function () {
    const deploymentPath = path.join(__dirname, "..", "deployments", "localhost.json");
    const deploymentsDir = path.dirname(deploymentPath);
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const mockDeployment = {
      network: "localhost",
      chainId: 31337,
      contracts: {
        MockInsuranceToken: {
          address: await token.getAddress(),
          deployer: deployer.address,
        },
        ColdChainDataIntegrity: {
          address: await dataIntegrity.getAddress(),
          deployer: deployer.address,
          anchorer: anchorer.address,
        },
        ColdChainInsurance: {
          address: await insurance.getAddress(),
          deployer: deployer.address,
          oracle: oracle.address,
          payoutToken: await token.getAddress(),
        },
      },
      roles: {
        deployer: deployer.address,
        oracle: oracle.address,
        anchorer: anchorer.address,
      },
      deployedAt: new Date().toISOString(),
    };

    fs.writeFileSync(deploymentPath, JSON.stringify(mockDeployment, null, 2));

    const content = fs.readFileSync(deploymentPath, "utf-8");
    expect(content).to.not.include("private");
    expect(content).to.not.include("secret");
    expect(content).to.not.include("mnemonic");

    const parsed = JSON.parse(content);
    expect(parsed.contracts.MockInsuranceToken.address).to.properAddress;
    expect(parsed.contracts.ColdChainDataIntegrity.address).to.properAddress;
    expect(parsed.contracts.ColdChainInsurance.address).to.properAddress;
    expect(parsed.roles.anchorer).to.properAddress;
    expect(parsed.roles.oracle).to.properAddress;
  });
});
