import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("ColdChainInsurance", function () {
  // ─── Fixture ─────────────────────────────────────────────────────
  async function deployFixture() {
    const [owner, oracle, beneficiary, stranger, insurer2] = await ethers.getSigners();

    // Deploy MockInsuranceToken
    const initialSupply = ethers.parseEther("1000000");
    const MockToken = await ethers.getContractFactory("MockInsuranceToken");
    const token = await MockToken.deploy(initialSupply);
    await token.waitForDeployment();

    // Deploy ColdChainInsurance
    const Insurance = await ethers.getContractFactory("ColdChainInsurance");
    const insurance = await Insurance.deploy(
      await token.getAddress(),
      oracle.address
    );
    await insurance.waitForDeployment();

    // Dữ liệu demo
    const shipmentId = "8b4fb8a2-2996-4da2-90b9-35019517f56f";
    const shipmentKey = ethers.keccak256(ethers.toUtf8Bytes(shipmentId));
    const payoutAmount = ethers.parseEther("1000");
    const expiry =
      (await ethers.provider.getBlock("latest"))!.timestamp + 86400 * 30;
    const evidenceHash = ethers.keccak256(
      ethers.toUtf8Bytes("c3afece0-1668-4f96-aad6-58349f8f0a64")
    );
    const detectedAt =
      (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    return {
      token,
      insurance,
      owner,
      oracle,
      beneficiary,
      stranger,
      insurer2,
      shipmentKey,
      payoutAmount,
      expiry,
      evidenceHash,
      detectedAt,
    };
  }

  /** Helper: approve + createPolicy */
  async function createPolicyHelper(fixture: Awaited<ReturnType<typeof deployFixture>>) {
    const { token, insurance, owner, beneficiary, shipmentKey, payoutAmount, expiry } = fixture;
    const insuranceAddr = await insurance.getAddress();
    await token.connect(owner).approve(insuranceAddr, payoutAmount);
    await insurance
      .connect(owner)
      .createPolicy(shipmentKey, beneficiary.address, payoutAmount, expiry);
  }

  // ─── Deployment Tests ────────────────────────────────────────────

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      const { insurance, owner } = await loadFixture(deployFixture);
      expect(await insurance.owner()).to.equal(owner.address);
    });

    it("Should set the correct oracle", async function () {
      const { insurance, oracle } = await loadFixture(deployFixture);
      expect(await insurance.oracle()).to.equal(oracle.address);
    });

    it("Should set the correct payout token", async function () {
      const { insurance, token } = await loadFixture(deployFixture);
      expect(await insurance.payoutToken()).to.equal(await token.getAddress());
    });

    it("Should reject zero address in constructor", async function () {
      const { token, oracle } = await loadFixture(deployFixture);
      const Insurance = await ethers.getContractFactory("ColdChainInsurance");
      await expect(
        Insurance.deploy(ethers.ZeroAddress, oracle.address)
      ).to.be.revertedWithCustomError(Insurance, "ColdChain__ZeroAddress");

      await expect(
        Insurance.deploy(await token.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(Insurance, "ColdChain__ZeroAddress");
    });
  });

  // ─── createPolicy Tests ──────────────────────────────────────────

  describe("createPolicy", function () {
    it("Should create a policy successfully", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, owner, beneficiary, shipmentKey, payoutAmount, expiry } = fixture;

      await createPolicyHelper(fixture);

      const policy = await insurance.getPolicy(shipmentKey);
      expect(policy.insurer).to.equal(owner.address);
      expect(policy.beneficiary).to.equal(beneficiary.address);
      expect(policy.payoutAmount).to.equal(payoutAmount);
      expect(policy.expiry).to.equal(expiry);
      expect(policy.status).to.equal(1); // Active
    });

    it("Should emit PolicyCreated event", async function () {
      const { token, insurance, owner, beneficiary, shipmentKey, payoutAmount, expiry } =
        await loadFixture(deployFixture);

      await token.connect(owner).approve(await insurance.getAddress(), payoutAmount);
      await expect(
        insurance.connect(owner).createPolicy(shipmentKey, beneficiary.address, payoutAmount, expiry)
      )
        .to.emit(insurance, "PolicyCreated")
        .withArgs(shipmentKey, owner.address, beneficiary.address, payoutAmount, expiry);
    });

    it("Should reject duplicate shipment key with custom error", async function () {
      const fixture = await loadFixture(deployFixture);
      const { token, insurance, owner, beneficiary, shipmentKey, payoutAmount, expiry } = fixture;

      await createPolicyHelper(fixture);

      // Thử tạo lại cùng shipmentKey
      await token.connect(owner).approve(await insurance.getAddress(), payoutAmount);
      await expect(
        insurance.connect(owner).createPolicy(shipmentKey, beneficiary.address, payoutAmount, expiry)
      )
        .to.be.revertedWithCustomError(insurance, "ColdChain__PolicyAlreadyExists")
        .withArgs(shipmentKey);
    });

    it("Should reject zero beneficiary address with custom error", async function () {
      const { token, insurance, owner, shipmentKey, payoutAmount, expiry } =
        await loadFixture(deployFixture);

      await token.connect(owner).approve(await insurance.getAddress(), payoutAmount);
      await expect(
        insurance
          .connect(owner)
          .createPolicy(shipmentKey, ethers.ZeroAddress, payoutAmount, expiry)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__ZeroAddress");
    });

    it("Should reject zero payout amount with custom error", async function () {
      const { insurance, owner, beneficiary, shipmentKey, expiry } =
        await loadFixture(deployFixture);

      await expect(
        insurance.connect(owner).createPolicy(shipmentKey, beneficiary.address, 0, expiry)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__InvalidPayoutAmount");
    });

    it("Should reject expired policy with custom error", async function () {
      const { token, insurance, owner, beneficiary, shipmentKey, payoutAmount } =
        await loadFixture(deployFixture);

      await token.connect(owner).approve(await insurance.getAddress(), payoutAmount);
      await expect(
        insurance.connect(owner).createPolicy(shipmentKey, beneficiary.address, payoutAmount, 1) // timestamp = 1 (quá khứ)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__InvalidExpiry");
    });

    it("Should lock tokens in contract", async function () {
      const fixture = await loadFixture(deployFixture);
      const { token, insurance, payoutAmount } = fixture;

      await createPolicyHelper(fixture);

      const contractBalance = await token.balanceOf(await insurance.getAddress());
      expect(contractBalance).to.equal(payoutAmount);
    });
  });

  // ─── reportViolation Tests ───────────────────────────────────────

  describe("reportViolation", function () {
    it("Should payout successfully when called by oracle", async function () {
      const fixture = await loadFixture(deployFixture);
      const { token, insurance, oracle, beneficiary, shipmentKey, payoutAmount, evidenceHash, detectedAt } = fixture;

      await createPolicyHelper(fixture);

      const balanceBefore = await token.balanceOf(beneficiary.address);
      await insurance
        .connect(oracle)
        .reportViolation(shipmentKey, evidenceHash, detectedAt);
      const balanceAfter = await token.balanceOf(beneficiary.address);

      expect(balanceAfter - balanceBefore).to.equal(payoutAmount);
    });

    it("Should emit InsurancePaid event", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, oracle, beneficiary, shipmentKey, payoutAmount, evidenceHash, detectedAt } = fixture;

      await createPolicyHelper(fixture);

      await expect(
        insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt)
      )
        .to.emit(insurance, "InsurancePaid")
        .withArgs(shipmentKey, beneficiary.address, payoutAmount, evidenceHash, detectedAt);
    });

    it("Should set policy status to PaidOut", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, oracle, shipmentKey, evidenceHash, detectedAt } = fixture;

      await createPolicyHelper(fixture);
      await insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt);

      const policy = await insurance.getPolicy(shipmentKey);
      expect(policy.status).to.equal(2); // PaidOut
    });

    it("Should store evidenceHash and detectedAt", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, oracle, shipmentKey, evidenceHash, detectedAt } = fixture;

      await createPolicyHelper(fixture);
      await insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt);

      const policy = await insurance.getPolicy(shipmentKey);
      expect(policy.evidenceHash).to.equal(evidenceHash);
      expect(policy.detectedAt).to.equal(detectedAt);
    });

    it("Should reject non-oracle caller with custom error", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, stranger, shipmentKey, evidenceHash, detectedAt } = fixture;

      await createPolicyHelper(fixture);

      await expect(
        insurance.connect(stranger).reportViolation(shipmentKey, evidenceHash, detectedAt)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__CallerNotOracle");
    });

    it("Should reject duplicate payout with custom error", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, oracle, shipmentKey, evidenceHash, detectedAt } = fixture;

      await createPolicyHelper(fixture);
      await insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt);

      // Gọi lần hai — phải bị từ chối
      await expect(
        insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__PolicyNotActive");
    });

    it("Should reject unknown policy with custom error", async function () {
      const { insurance, oracle, evidenceHash, detectedAt } =
        await loadFixture(deployFixture);

      const fakeKey = ethers.keccak256(ethers.toUtf8Bytes("nonexistent-shipment"));
      await expect(
        insurance.connect(oracle).reportViolation(fakeKey, evidenceHash, detectedAt)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__PolicyNotActive");
    });

    it("Should reject reportViolation after policy expiry", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, oracle, shipmentKey, evidenceHash, detectedAt, expiry } = fixture;

      await createPolicyHelper(fixture);

      // Nhảy thời gian vượt quá hạn policy
      await time.increaseTo(expiry + 1);

      await expect(
        insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__PolicyExpired");
    });
  });

  // ─── refundExpiredPolicy Tests ───────────────────────────────────

  describe("refundExpiredPolicy", function () {
    it("Should allow insurer to refund tokens when policy expired safely", async function () {
      const fixture = await loadFixture(deployFixture);
      const { token, insurance, owner, shipmentKey, payoutAmount, expiry } = fixture;

      await createPolicyHelper(fixture);

      // Nhảy thời gian qua hạn policy
      await time.increaseTo(expiry + 10);

      const balanceBefore = await token.balanceOf(owner.address);
      await expect(insurance.connect(owner).refundExpiredPolicy(shipmentKey))
        .to.emit(insurance, "PolicyRefunded")
        .withArgs(shipmentKey, owner.address, payoutAmount);

      const balanceAfter = await token.balanceOf(owner.address);
      expect(balanceAfter - balanceBefore).to.equal(payoutAmount);

      const policy = await insurance.getPolicy(shipmentKey);
      expect(policy.status).to.equal(3); // Refunded
    });

    it("Should allow owner to trigger refund for insurer", async function () {
      const fixture = await loadFixture(deployFixture);
      const { token, insurance, owner, stranger, shipmentKey, payoutAmount, expiry } = fixture;

      // stranger là insurer
      await token.transfer(stranger.address, payoutAmount);
      await token.connect(stranger).approve(await insurance.getAddress(), payoutAmount);
      await insurance
        .connect(stranger)
        .createPolicy(shipmentKey, fixture.beneficiary.address, payoutAmount, expiry);

      await time.increaseTo(expiry + 10);

      const balanceBefore = await token.balanceOf(stranger.address);
      // owner gọi refund thay cho stranger
      await insurance.connect(owner).refundExpiredPolicy(shipmentKey);
      const balanceAfter = await token.balanceOf(stranger.address);

      expect(balanceAfter - balanceBefore).to.equal(payoutAmount);
    });

    it("Should reject refund if policy has not expired yet", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, owner, shipmentKey } = fixture;

      await createPolicyHelper(fixture);

      // Chưa hết hạn
      await expect(
        insurance.connect(owner).refundExpiredPolicy(shipmentKey)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__PolicyNotExpired");
    });

    it("Should reject refund by unauthorized stranger", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, stranger, shipmentKey, expiry } = fixture;

      await createPolicyHelper(fixture);
      await time.increaseTo(expiry + 10);

      await expect(
        insurance.connect(stranger).refundExpiredPolicy(shipmentKey)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__CallerNotInsurer");
    });

    it("Should reject duplicate refund", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, owner, shipmentKey, expiry } = fixture;

      await createPolicyHelper(fixture);
      await time.increaseTo(expiry + 10);

      await insurance.connect(owner).refundExpiredPolicy(shipmentKey);

      // Thử refund lần hai
      await expect(
        insurance.connect(owner).refundExpiredPolicy(shipmentKey)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__PolicyNotActive");
    });

    it("Should reject refund for already PaidOut policy", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, oracle, owner, shipmentKey, evidenceHash, detectedAt, expiry } = fixture;

      await createPolicyHelper(fixture);
      await insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt);

      await time.increaseTo(expiry + 10);

      await expect(
        insurance.connect(owner).refundExpiredPolicy(shipmentKey)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__PolicyNotActive");
    });
  });

  // ─── View Helpers & Solvency Tests ───────────────────────────────

  describe("View Helpers & Solvency", function () {
    it("Should return correct isPolicyActive status", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, shipmentKey, expiry } = fixture;

      // Trước khi tạo
      expect(await insurance.isPolicyActive(shipmentKey)).to.be.false;

      // Sau khi tạo
      await createPolicyHelper(fixture);
      expect(await insurance.isPolicyActive(shipmentKey)).to.be.true;

      // Sau khi hết hạn
      await time.increaseTo(expiry + 1);
      expect(await insurance.isPolicyActive(shipmentKey)).to.be.false;
    });

    it("Should return correct getContractBalance", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, payoutAmount } = fixture;

      expect(await insurance.getContractBalance()).to.equal(0);

      await createPolicyHelper(fixture);
      expect(await insurance.getContractBalance()).to.equal(payoutAmount);
    });
  });

  // ─── setOracle Tests ─────────────────────────────────────────────

  describe("setOracle", function () {
    it("Should allow owner to update oracle", async function () {
      const { insurance, owner, stranger } = await loadFixture(deployFixture);

      await insurance.connect(owner).setOracle(stranger.address);
      expect(await insurance.oracle()).to.equal(stranger.address);
    });

    it("Should emit OracleUpdated event", async function () {
      const { insurance, owner, oracle, stranger } = await loadFixture(deployFixture);

      await expect(insurance.connect(owner).setOracle(stranger.address))
        .to.emit(insurance, "OracleUpdated")
        .withArgs(oracle.address, stranger.address);
    });

    it("Should reject non-owner caller with custom error", async function () {
      const { insurance, stranger } = await loadFixture(deployFixture);

      await expect(
        insurance.connect(stranger).setOracle(stranger.address)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__CallerNotOwner");
    });

    it("Should reject zero address with custom error", async function () {
      const { insurance, owner } = await loadFixture(deployFixture);

      await expect(
        insurance.connect(owner).setOracle(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__ZeroAddress");
    });
  });
});
