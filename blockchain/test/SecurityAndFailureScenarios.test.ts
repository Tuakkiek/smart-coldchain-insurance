import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Security and Failure Scenarios (Phase 4)", function () {
  async function deploySecurityFixture() {
    const [owner, oracle, beneficiary, attacker, stranger] = await ethers.getSigners();

    // Deploy native ETH insurance
    const Insurance = await ethers.getContractFactory("ColdChainInsurance");
    const insurance = await Insurance.deploy(oracle.address);
    await insurance.waitForDeployment();

    // Deploy DataIntegrity contract
    const DataIntegrity = await ethers.getContractFactory("ColdChainDataIntegrity");
    const dataIntegrity = await DataIntegrity.deploy(oracle.address);
    await dataIntegrity.waitForDeployment();

    const shipmentId = "8b4fb8a2-2996-4da2-90b9-35019517f56f";
    const shipmentKey = ethers.keccak256(ethers.toUtf8Bytes(shipmentId));
    const payoutAmount = ethers.parseEther("0.05");
    const latestBlock = await ethers.provider.getBlock("latest");
    const currentTimestamp = latestBlock!.timestamp;
    const expiry = currentTimestamp + 3600; // 1 hour
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("event-violation-001"));
    const detectedAt = currentTimestamp + 1800;

    // Approve & fund policy

    await insurance.connect(owner).createPolicy(shipmentKey, beneficiary.address, payoutAmount, expiry, { value: payoutAmount });

    return {
      insurance,
      dataIntegrity,
      owner,
      oracle,
      beneficiary,
      attacker,
      stranger,
      shipmentKey,
      payoutAmount,
      expiry,
      evidenceHash,
      detectedAt,
      currentTimestamp,
    };
  }

  describe("Native ETH callbacks", function () {
    async function receiverFixture() {
      const fixture = await loadFixture(deploySecurityFixture);
      const Receiver = await ethers.getContractFactory("NativePayoutReceiver");
      const receiver = await Receiver.deploy(await fixture.insurance.getAddress());
      const key = ethers.keccak256(ethers.toUtf8Bytes("native-receiver-policy"));
      await fixture.insurance.connect(fixture.owner).createPolicy(
        key, await receiver.getAddress(), fixture.payoutAmount, fixture.expiry,
        { value: fixture.payoutAmount },
      );
      return { ...fixture, receiver, key };
    }

    it("blocks reentrant policy creation during a native payout", async function () {
      const { insurance, oracle, receiver, key, evidenceHash, detectedAt, payoutAmount } = await receiverFixture();
      await receiver.configure(false, true);
      await insurance.connect(oracle).reportViolation(key, evidenceHash, detectedAt);
      expect(await receiver.reentryError()).to.equal(ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10));
      expect((await insurance.getPolicy(key)).status).to.equal(2);
      expect(await ethers.provider.getBalance(await receiver.getAddress())).to.equal(payoutAmount);
      expect((await insurance.getPolicy(ethers.id("reentry"))).status).to.equal(0);
    });

    it("rolls back policy state if the beneficiary rejects native ETH", async function () {
      const { insurance, oracle, receiver, key, evidenceHash, detectedAt, payoutAmount } = await receiverFixture();
      await receiver.configure(true, false);
      await expect(insurance.connect(oracle).reportViolation(key, evidenceHash, detectedAt))
        .to.be.revertedWithCustomError(insurance, "ColdChain__ETHTransferFailed");
      expect((await insurance.getPolicy(key)).status).to.equal(1);
      expect((await insurance.getPolicy(key)).evidenceHash).to.equal(ethers.ZeroHash);
      expect(await insurance.getContractBalance()).to.equal(payoutAmount * 2n);
    });
  });

  // ─── 3. Expiry Boundary Conditions ──────────────────────────────────
  describe("Expiry Boundary Conditions", function () {
    it("Should reject createPolicy when expiry is in the past or now", async function () {
      const { insurance, owner, beneficiary, payoutAmount } = await loadFixture(deploySecurityFixture);

      const latestTime = (await ethers.provider.getBlock("latest"))!.timestamp;
      const key = ethers.keccak256(ethers.toUtf8Bytes("boundary-shipment-1"));


      // expiry <= block.timestamp
      await expect(
        insurance.connect(owner).createPolicy(key, beneficiary.address, payoutAmount, latestTime, { value: payoutAmount })
      ).to.be.revertedWithCustomError(insurance, "ColdChain__InvalidExpiry");
    });

    it("Should allow reportViolation before policy expiry", async function () {
      const {
          insurance,
        oracle,
        beneficiary,
        owner,
        payoutAmount,
        evidenceHash,
        detectedAt,
      } = await loadFixture(deploySecurityFixture);

      const key = ethers.keccak256(ethers.toUtf8Bytes("boundary-shipment-exact"));
      const latestTime = (await ethers.provider.getBlock("latest"))!.timestamp;
      const exactExpiry = latestTime + 500;


      await insurance.connect(owner).createPolicy(key, beneficiary.address, payoutAmount, exactExpiry, { value: payoutAmount });

      // Tiến thời gian đến trước hạn 100s
      await time.increaseTo(exactExpiry - 100);

      await expect(
        insurance.connect(oracle).reportViolation(key, evidenceHash, detectedAt)
      ).to.emit(insurance, "InsurancePaid");

      const policy = await insurance.getPolicy(key);
      expect(policy.status).to.equal(2); // PaidOut
    });

    it("Should reject reportViolation when policy is strictly expired", async function () {
      const {
          insurance,
        oracle,
        beneficiary,
        owner,
        payoutAmount,
        evidenceHash,
        detectedAt,
      } = await loadFixture(deploySecurityFixture);

      const key = ethers.keccak256(ethers.toUtf8Bytes("boundary-shipment-expired"));
      const latestTime = (await ethers.provider.getBlock("latest"))!.timestamp;
      const exactExpiry = latestTime + 200;


      await insurance.connect(owner).createPolicy(key, beneficiary.address, payoutAmount, exactExpiry, { value: payoutAmount });

      // Nhảy thời gian qua exactExpiry
      await time.increaseTo(exactExpiry + 10);

      await expect(
        insurance.connect(oracle).reportViolation(key, evidenceHash, detectedAt)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__PolicyExpired");
    });

    it("Should reject refundExpiredPolicy when policy is still active and not expired", async function () {
      const {
          insurance,
        owner,
        beneficiary,
        payoutAmount,
      } = await loadFixture(deploySecurityFixture);

      const key = ethers.keccak256(ethers.toUtf8Bytes("boundary-shipment-refund"));
      const latestTime = (await ethers.provider.getBlock("latest"))!.timestamp;
      const exactExpiry = latestTime + 500;


      await insurance.connect(owner).createPolicy(key, beneficiary.address, payoutAmount, exactExpiry, { value: payoutAmount });

      // Đang còn trong hạn -> chưa được hoàn tiền
      await expect(
        insurance.connect(owner).refundExpiredPolicy(key)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__PolicyNotExpired");

      // Nhảy qua hạn -> cho phép hoàn tiền
      await time.increaseTo(exactExpiry + 10);
      await expect(
        insurance.connect(owner).refundExpiredPolicy(key)
      ).to.emit(insurance, "PolicyRefunded");
    });
  });

  // ─── 4. Solvency Enforcement ────────────────────────────────────────
  describe("Solvency Enforcement", function () {
    it("Should track contract ETH balance accurately", async function () {
      const { insurance, payoutAmount } = await loadFixture(deploySecurityFixture);
      expect(await insurance.getContractBalance()).to.equal(payoutAmount);
    });
  });

  // ─── 5. Data Integrity: Same Root for Different Batches ─────────────
  describe("Data Integrity Edge Cases", function () {
    it("Should allow two different batches to anchor identical Merkle roots", async function () {
      const { dataIntegrity, oracle } = await loadFixture(deploySecurityFixture);

      const batchKey1 = ethers.keccak256(ethers.toUtf8Bytes("batch-shipment-A"));
      const batchKey2 = ethers.keccak256(ethers.toUtf8Bytes("batch-shipment-B"));
      const shipmentKeyA = ethers.keccak256(ethers.toUtf8Bytes("shipment-A"));
      const shipmentKeyB = ethers.keccak256(ethers.toUtf8Bytes("shipment-B"));
      const deviceKey = ethers.keccak256(ethers.toUtf8Bytes("ESP32-01"));
      const sharedRoot = "0x5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae37";

      // Anchor batch 1
      await dataIntegrity.connect(oracle).anchorBatch(
        batchKey1,
        shipmentKeyA,
        deviceKey,
        sharedRoot,
        1n,
        3n,
        3
      );

      // Anchor batch 2 với cùng sharedRoot nhưng khác batchKey
      await expect(
        dataIntegrity.connect(oracle).anchorBatch(
          batchKey2,
          shipmentKeyB,
          deviceKey,
          sharedRoot,
          10n,
          12n,
          3
        )
      ).to.emit(dataIntegrity, "BatchAnchored");

      expect(await dataIntegrity.verifyBatch(batchKey1, sharedRoot)).to.be.true;
      expect(await dataIntegrity.verifyBatch(batchKey2, sharedRoot)).to.be.true;
    });
  });
});
