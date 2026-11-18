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
      oracle.address
    );
    await insurance.waitForDeployment();

    // Dữ liệu demo
    const shipmentId = "8b4fb8a2-2996-4da2-90b9-35019517f56f";
    const shipmentKey = ethers.keccak256(ethers.toUtf8Bytes(shipmentId));
    const payoutAmount = ethers.parseEther("0.05");
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

  /** Helper: createPolicy with native ETH escrow */
  async function createPolicyHelper(fixture: Awaited<ReturnType<typeof deployFixture>>) {
    const { token, insurance, owner, beneficiary, shipmentKey, payoutAmount, expiry } = fixture;
    const insuranceAddr = await insurance.getAddress();

    await insurance
      .connect(owner)
      .createPolicy(shipmentKey, beneficiary.address, payoutAmount, expiry, { value: payoutAmount });
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

    it("Should start with no native ETH escrow", async function () {
      const { insurance } = await loadFixture(deployFixture);
      expect(await ethers.provider.getBalance(await insurance.getAddress())).to.equal(0);
    });

    it("Should reject zero address in constructor", async function () {
      const Insurance = await ethers.getContractFactory("ColdChainInsurance");
      await expect(
        Insurance.deploy(ethers.ZeroAddress)
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


      await expect(
        insurance.connect(owner).createPolicy(shipmentKey, beneficiary.address, payoutAmount, expiry, { value: payoutAmount })
      )
        .to.emit(insurance, "PolicyCreated")
        .withArgs(shipmentKey, owner.address, beneficiary.address, payoutAmount, expiry);
    });

    it("Should reject duplicate shipment key with custom error", async function () {
      const fixture = await loadFixture(deployFixture);
      const { token, insurance, owner, beneficiary, shipmentKey, payoutAmount, expiry } = fixture;

      await createPolicyHelper(fixture);

      // Thử tạo lại cùng shipmentKey

      await expect(
        insurance.connect(owner).createPolicy(shipmentKey, beneficiary.address, payoutAmount, expiry, { value: payoutAmount })
      )
        .to.be.revertedWithCustomError(insurance, "ColdChain__PolicyAlreadyExists")
        .withArgs(shipmentKey);
    });

    it("Should reject zero beneficiary address with custom error", async function () {
      const { token, insurance, owner, shipmentKey, payoutAmount, expiry } =
        await loadFixture(deployFixture);


      await expect(
        insurance
          .connect(owner)
          .createPolicy(shipmentKey, ethers.ZeroAddress, payoutAmount, expiry, { value: payoutAmount })
      ).to.be.revertedWithCustomError(insurance, "ColdChain__ZeroAddress");
    });

    it("Should reject zero payout amount with custom error", async function () {
      const { insurance, owner, beneficiary, shipmentKey, expiry } =
        await loadFixture(deployFixture);

      await expect(
        insurance.connect(owner).createPolicy(shipmentKey, beneficiary.address, 0, expiry, { value: 0 })
      ).to.be.revertedWithCustomError(insurance, "ColdChain__InvalidPayoutAmount");
    });

    it("Should reject expired policy with custom error", async function () {
      const { token, insurance, owner, beneficiary, shipmentKey, payoutAmount } =
        await loadFixture(deployFixture);


      await expect(
        insurance.connect(owner).createPolicy(shipmentKey, beneficiary.address, payoutAmount, 1, { value: payoutAmount }) // timestamp = 1 (quá khứ)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__InvalidExpiry");
    });

    it("Should lock native ETH in contract", async function () {
      const fixture = await loadFixture(deployFixture);
      const { token, insurance, payoutAmount } = fixture;

      await createPolicyHelper(fixture);

      const contractBalance = await ethers.provider.getBalance(await insurance.getAddress());
      expect(contractBalance).to.equal(payoutAmount);
    });
  });

  // ─── reportViolation Tests ───────────────────────────────────────

  describe("reportViolation", function () {
    it("Should payout successfully when called by oracle", async function () {
      const fixture = await loadFixture(deployFixture);
      const { token, insurance, oracle, beneficiary, shipmentKey, payoutAmount, evidenceHash, detectedAt } = fixture;

      await createPolicyHelper(fixture);

      const balanceBefore = await ethers.provider.getBalance(beneficiary.address);
      await insurance
        .connect(oracle)
        .reportViolation(shipmentKey, evidenceHash, detectedAt);
      const balanceAfter = await ethers.provider.getBalance(beneficiary.address);

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

      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const transaction = insurance.connect(owner).refundExpiredPolicy(shipmentKey);
      await expect(transaction)
        .to.emit(insurance, "PolicyRefunded")
        .withArgs(shipmentKey, owner.address, payoutAmount);
      const receipt = await (await transaction).wait();
      const balanceAfter = await ethers.provider.getBalance(owner.address);
      expect(balanceAfter - balanceBefore + receipt!.fee).to.equal(payoutAmount);

      const policy = await insurance.getPolicy(shipmentKey);
      expect(policy.status).to.equal(3); // Refunded
    });

    it("Should allow owner to trigger refund for insurer", async function () {
      const fixture = await loadFixture(deployFixture);
      const { token, insurance, owner, stranger, shipmentKey, payoutAmount, expiry } = fixture;

      // stranger là insurer


      await insurance
        .connect(stranger)
        .createPolicy(shipmentKey, fixture.beneficiary.address, payoutAmount, expiry, { value: payoutAmount });

      await time.increaseTo(expiry + 10);

      const balanceBefore = await ethers.provider.getBalance(stranger.address);
      // owner gọi refund thay cho stranger
      await insurance.connect(owner).refundExpiredPolicy(shipmentKey);
      const balanceAfter = await ethers.provider.getBalance(stranger.address);

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

  // ─── Backend Gateway Compatibility Tests ─────────────────────────

  describe("Backend Gateway Compatibility", function () {
    it("Should return policy tuple layout matching backend adapter indices", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, owner, beneficiary, shipmentKey, payoutAmount, expiry, evidenceHash, detectedAt, oracle } = fixture;

      await createPolicyHelper(fixture);
      await insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt);

      const policyTuple = await insurance.getPolicy(shipmentKey);

      // Index 0: insurer
      expect(policyTuple[0]).to.equal(owner.address);
      // Index 1: beneficiary
      expect(policyTuple[1]).to.equal(beneficiary.address);
      // Index 2: payoutAmount
      expect(policyTuple[2]).to.equal(payoutAmount);
      // Index 3: expiry
      expect(policyTuple[3]).to.equal(expiry);
      // Index 4: status (2 = PaidOut) - used by backend adapter line 81
      expect(policyTuple[4]).to.equal(2);
      // Index 5: evidenceHash - used by backend adapter line 82
      expect(policyTuple[5]).to.equal(evidenceHash);
      // Index 6: detectedAt - used by backend adapter line 82
      expect(policyTuple[6]).to.equal(detectedAt);
    });

    it("Should allow querying InsurancePaid log filtered by indexed shipmentKey", async function () {
      const fixture = await loadFixture(deployFixture);
      const { insurance, oracle, beneficiary, shipmentKey, payoutAmount, evidenceHash, detectedAt } = fixture;

      await createPolicyHelper(fixture);
      await insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt);

      // Backend adapter line 85 uses contract.events.InsurancePaid().get_logs(argument_filters={"shipmentKey": shipment_key})
      const filter = insurance.filters.InsurancePaid(shipmentKey);
      const logs = await insurance.queryFilter(filter);

      expect(logs.length).to.equal(1);
      expect(logs[0].args.shipmentKey).to.equal(shipmentKey);
      expect(logs[0].args.beneficiary).to.equal(beneficiary.address);
      expect(logs[0].args.payoutAmount).to.equal(payoutAmount);
      expect(logs[0].args.evidenceHash).to.equal(evidenceHash);
      expect(logs[0].args.detectedAt).to.equal(detectedAt);
    });
  });

  // ─── MockInsuranceToken Tests ────────────────────────────────────

  describe("MockInsuranceToken", function () {
    it("Should allow owner to mint tokens", async function () {
      const { token, owner, beneficiary } = await loadFixture(deployFixture);
      const mintAmount = ethers.parseEther("500");

      const balanceBefore = await token.balanceOf(beneficiary.address);
      await token.connect(owner).mint(beneficiary.address, mintAmount);
      const balanceAfter = await token.balanceOf(beneficiary.address);

      expect(balanceAfter - balanceBefore).to.equal(mintAmount);
    });

    it("Should reject non-owner mint with custom error", async function () {
      const { token, stranger } = await loadFixture(deployFixture);
      const mintAmount = ethers.parseEther("500");

      await expect(
        token.connect(stranger).mint(stranger.address, mintAmount)
      ).to.be.revertedWithCustomError(token, "MockToken__CallerNotOwner");
    });

    it("Should reject mint to zero address with custom error", async function () {
      const { token, owner } = await loadFixture(deployFixture);
      const mintAmount = ethers.parseEther("500");

      await expect(
        token.connect(owner).mint(ethers.ZeroAddress, mintAmount)
      ).to.be.revertedWithCustomError(token, "MockToken__ZeroAddress");
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
