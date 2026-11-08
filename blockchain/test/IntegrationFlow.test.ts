import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import * as fs from "fs";
import * as path from "path";

describe("IntegrationFlow: DataIntegrity -> Insurance Payout (Phase 4)", function () {
  async function deployIntegrationFixture() {
    const [deployer, anchorer, oracle, beneficiary, stranger] = await ethers.getSigners();

    // 1. Deploy MockInsuranceToken
    const MockToken = await ethers.getContractFactory("MockInsuranceToken");
    const token = await MockToken.deploy(ethers.parseEther("1000000"));
    await token.waitForDeployment();

    // 2. Deploy ColdChainDataIntegrity (Module A)
    const DataIntegrity = await ethers.getContractFactory("ColdChainDataIntegrity");
    const dataIntegrity = await DataIntegrity.deploy(anchorer.address);
    await dataIntegrity.waitForDeployment();

    // 3. Deploy ColdChainInsurance (Module B)
    const Insurance = await ethers.getContractFactory("ColdChainInsurance");
    const insurance = await Insurance.deploy(await token.getAddress(), oracle.address);
    await insurance.waitForDeployment();

    // 4. Load Golden Vectors for Merkle root
    const fixturePath = path.join(
      __dirname,
      "..",
      "..",
      "backend",
      "tests",
      "fixtures",
      "protocol_vectors_v1.json"
    );
    const vectors = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const goldenMerkleRoot = vectors.roots["3"]; // 3 records root

    const shipmentId = "8b4fb8a2-2996-4da2-90b9-35019517f56f";
    const shipmentKey = ethers.keccak256(ethers.toUtf8Bytes(shipmentId));
    const deviceId = "ESP32-001";
    const deviceKey = ethers.keccak256(ethers.toUtf8Bytes(deviceId));
    const batchId = "batch-sealed-20261105-001";
    const batchKey = ethers.keccak256(ethers.toUtf8Bytes(batchId));

    const payoutAmount = ethers.parseEther("5000"); // 5000 MINS
    const latestBlock = await ethers.provider.getBlock("latest");
    const expiry = latestBlock!.timestamp + 86400 * 7; // 7 days

    const violationEventId = "c3afece0-1668-4f96-aad6-58349f8f0a64";
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes(violationEventId));
    const detectedAt = latestBlock!.timestamp + 1800;

    return {
      token,
      dataIntegrity,
      insurance,
      deployer,
      anchorer,
      oracle,
      beneficiary,
      stranger,
      shipmentKey,
      deviceKey,
      batchKey,
      goldenMerkleRoot,
      payoutAmount,
      expiry,
      evidenceHash,
      detectedAt,
    };
  }

  it("Should execute complete E2E lifecycle: Policy Creation -> Batch Anchoring -> Integrity Check -> Payout", async function () {
    const {
      token,
      dataIntegrity,
      insurance,
      deployer,
      anchorer,
      oracle,
      beneficiary,
      shipmentKey,
      deviceKey,
      batchKey,
      goldenMerkleRoot,
      payoutAmount,
      expiry,
      evidenceHash,
      detectedAt,
    } = await loadFixture(deployIntegrationFixture);

    // ─── Bước 1: Khởi tạo Policy & Ký quỹ token ───────────────────
    const insuranceAddr = await insurance.getAddress();
    await token.connect(deployer).approve(insuranceAddr, payoutAmount);

    await expect(
      insurance.connect(deployer).createPolicy(shipmentKey, beneficiary.address, payoutAmount, expiry)
    )
      .to.emit(insurance, "PolicyCreated")
      .withArgs(shipmentKey, deployer.address, beneficiary.address, payoutAmount, expiry);

    expect(await insurance.isPolicyActive(shipmentKey)).to.be.true;
    expect(await token.balanceOf(insuranceAddr)).to.equal(payoutAmount);

    // ─── Bước 2: Neo Merkle Root của Batch Telemetry lên Chain ────
    await expect(
      dataIntegrity
        .connect(anchorer)
        .anchorBatch(
          batchKey,
          shipmentKey,
          deviceKey,
          goldenMerkleRoot,
          1524n, // firstSequence
          1526n, // lastSequence
          3      // recordCount
        )
    )
      .to.emit(dataIntegrity, "BatchAnchored")
      .withArgs(batchKey, shipmentKey, deviceKey, goldenMerkleRoot, 3, anchorer.address);

    expect(await dataIntegrity.batchExists(batchKey)).to.be.true;

    // ─── Bước 3: Backend xác minh tính toàn vẹn On-chain ──────────
    const isIntegrityValid = await dataIntegrity.verifyBatch(batchKey, goldenMerkleRoot);
    expect(isIntegrityValid).to.be.true;

    // ─── Bước 4: Vi phạm nhiệt độ xảy ra -> Oracle kích hoạt chi trả
    const beneficiaryBalanceBefore = await token.balanceOf(beneficiary.address);

    await expect(
      insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt)
    )
      .to.emit(insurance, "InsurancePaid")
      .withArgs(shipmentKey, beneficiary.address, payoutAmount, evidenceHash, detectedAt);

    // ─── Bước 5: Xác nhận quyền lợi bảo hiểm đã được chuyển giao ──
    const beneficiaryBalanceAfter = await token.balanceOf(beneficiary.address);
    expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(payoutAmount);

    const policy = await insurance.getPolicy(shipmentKey);
    expect(policy.status).to.equal(2); // PaidOut
    expect(policy.evidenceHash).to.equal(evidenceHash);
    expect(policy.detectedAt).to.equal(detectedAt);

    // ─── Bước 6: Chống chi trả trùng lặp (Idempotency / Anti-duplicate)
    await expect(
      insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt)
    ).to.be.revertedWithCustomError(insurance, "ColdChain__PolicyNotActive");
  });

  it("Should detect tampered data and prevent valid integrity proof", async function () {
    const {
      dataIntegrity,
      anchorer,
      shipmentKey,
      deviceKey,
      batchKey,
      goldenMerkleRoot,
    } = await loadFixture(deployIntegrationFixture);

    // Neo batch gốc hợp lệ
    await dataIntegrity
      .connect(anchorer)
      .anchorBatch(batchKey, shipmentKey, deviceKey, goldenMerkleRoot, 1524n, 1526n, 3);

    // Giả lập kẻ gian sửa đổi dữ liệu nhiệt độ trong database -> tính ra candidateRoot bị lệch
    const tamperedRoot = ethers.keccak256(ethers.toUtf8Bytes("tampered-telemetry-data"));

    const verifyResult = await dataIntegrity.verifyBatch(batchKey, tamperedRoot);
    expect(verifyResult).to.be.false;
  });
});
