import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  ColdChainDataIntegrity,
  ColdChainInsurance,
  MockInsuranceToken,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Phase 6 — Backend Oracle & Integrity Integration Readiness Tests
 *
 * Kiểm chứng toàn diện phía Smart Contract cho quá trình tích hợp với Backend:
 * - Ánh xạ chính xác payload từ Backend `IntegrationOutbox` (ANCHOR_BATCH) sang Module A
 * - Bảo vệ chống anchor trùng lặp khi Outbox retry sau lỗi RPC timeout (E14)
 * - Phát hiện dữ liệu MySQL bị giả mạo qua verifyBatch và tính bất biến của on-chain root (E08, E09, E19)
 * - Phân quyền Anchorer & Oracle nghiêm ngặt (E13, E15)
 * - Chống chi trả trùng lặp (double payout) và ranh giới hết hạn policy (E16, E17)
 * - Tương thích tuyệt đối với `Web3BlockchainAdapter` (`getPolicy` tuple layout & `InsurancePaid` logs)
 */
describe("Phase 6: Backend Oracle & Integrity Integration Readiness", function () {
  let token: MockInsuranceToken;
  let dataIntegrity: ColdChainDataIntegrity;
  let insurance: ColdChainInsurance;

  let owner: SignerWithAddress;
  let insurer: SignerWithAddress;
  let oracle: SignerWithAddress;
  let anchorer: SignerWithAddress;
  let beneficiary: SignerWithAddress;
  let attacker: SignerWithAddress;

  // Dữ liệu khớp định dạng Backend (batch_service.py & shipments.py)
  const shipmentId = "8b4fb8a2-2996-4da2-90b9-35019517f56f";
  const deviceId = "ESP32-001";
  const batchId = "9f1c2d3e-4a5b-6c7d-8e9f-001122334455";
  const eventId = "c3afece0-1668-4f96-aad6-58349f8f0a64";

  const shipmentKey = ethers.keccak256(ethers.toUtf8Bytes(shipmentId));
  const deviceKey = ethers.keccak256(ethers.toUtf8Bytes(deviceId));
  const batchKey = ethers.keccak256(ethers.toUtf8Bytes(batchId));
  const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes(eventId));

  // Payload mẫu giống hệt Backend IntegrationOutbox (ANCHOR_BATCH)
  const outboxPayload = {
    batch_id: batchId,
    shipment_id: shipmentId,
    device_id: deviceId,
    merkle_root: "0x5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae37",
    first_sequence: 1524,
    last_sequence: 1526,
    record_count: 3,
    hash_version: "MERKLE-v1",
  };

  const payoutAmount = ethers.parseEther("500");

  beforeEach(async function () {
    [owner, insurer, oracle, anchorer, beneficiary, attacker] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("MockInsuranceToken");
    token = await TokenFactory.deploy(ethers.parseEther("1000000"));
    await token.waitForDeployment();

    // Cấp token cho insurer để ký quỹ policy
    await token.transfer(insurer.address, ethers.parseEther("10000"));

    const DataIntegrityFactory = await ethers.getContractFactory("ColdChainDataIntegrity");
    dataIntegrity = await DataIntegrityFactory.deploy(anchorer.address);
    await dataIntegrity.waitForDeployment();

    const InsuranceFactory = await ethers.getContractFactory("ColdChainInsurance");
    insurance = await InsuranceFactory.deploy(await token.getAddress(), oracle.address);
    await insurance.waitForDeployment();
  });

  async function createActivePolicy(durationSeconds = 3600): Promise<number> {
    const now = await time.latest();
    const expiry = now + durationSeconds;
    await token.connect(insurer).approve(await insurance.getAddress(), payoutAmount);
    await insurance
      .connect(insurer)
      .createPolicy(shipmentKey, beneficiary.address, payoutAmount, expiry);
    return expiry;
  }

  async function anchorOutboxBatch(): Promise<void> {
    await dataIntegrity.connect(anchorer).anchorBatch(
      ethers.keccak256(ethers.toUtf8Bytes(outboxPayload.batch_id)),
      ethers.keccak256(ethers.toUtf8Bytes(outboxPayload.shipment_id)),
      ethers.keccak256(ethers.toUtf8Bytes(outboxPayload.device_id)),
      outboxPayload.merkle_root,
      outboxPayload.first_sequence,
      outboxPayload.last_sequence,
      outboxPayload.record_count
    );
  }

  describe("1. Backend Outbox (ANCHOR_BATCH) -> Module A Mapping & Tamper Detection", function () {
    it("Should anchor Backend IntegrationOutbox payload and confirm via BatchAnchored event & getBatch", async function () {
      const tx = await dataIntegrity.connect(anchorer).anchorBatch(
        batchKey,
        shipmentKey,
        deviceKey,
        outboxPayload.merkle_root,
        outboxPayload.first_sequence,
        outboxPayload.last_sequence,
        outboxPayload.record_count
      );
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      // Xác minh Event BatchAnchored khớp metadata Backend
      const events = await dataIntegrity.queryFilter(
        dataIntegrity.filters.BatchAnchored(batchKey)
      );
      expect(events).to.have.lengthOf(1);
      expect(events[0].args.shipmentKey).to.equal(shipmentKey);
      expect(events[0].args.deviceKey).to.equal(deviceKey);
      expect(events[0].args.merkleRoot).to.equal(outboxPayload.merkle_root);
      expect(events[0].args.recordCount).to.equal(outboxPayload.record_count);
      expect(events[0].args.anchoredBy).to.equal(anchorer.address);

      // Đối chiếu state on-chain trước khi Backend gắn DATA_ANCHORED
      const onChainBatch = await dataIntegrity.getBatch(batchKey);
      expect(onChainBatch.merkleRoot).to.equal(outboxPayload.merkle_root);
      expect(onChainBatch.firstSequence).to.equal(outboxPayload.first_sequence);
      expect(onChainBatch.lastSequence).to.equal(outboxPayload.last_sequence);
    });

    it("E14: Should prevent duplicate anchor when Backend outbox retries after RPC timeout", async function () {
      await anchorOutboxBatch();

      // Backend check batchExists trước khi retry hoặc contract tự revert nếu retry gửi lại tx
      expect(await dataIntegrity.batchExists(batchKey)).to.be.true;

      await expect(anchorOutboxBatch())
        .to.be.revertedWithCustomError(dataIntegrity, "ColdChain__BatchAlreadyExists")
        .withArgs(batchKey);
    });

    it("E08 / E09 / E19: Should detect MySQL tampering via verifyBatch and keep on-chain root immutable", async function () {
      await anchorOutboxBatch();

      // Dữ liệu nguyên bản khớp 100%
      expect(await dataIntegrity.verifyBatch(batchKey, outboxPayload.merkle_root)).to.be.true;

      // Giả sử 1 bản ghi trong MySQL bị chỉnh sửa nhiệt độ -> recomputed root thay đổi
      const recomputedTamperedRoot = ethers.keccak256(
        ethers.toUtf8Bytes("tampered-mysql-record-root")
      );
      expect(await dataIntegrity.verifyBatch(batchKey, recomputedTamperedRoot)).to.be.false;

      // Không thể ghi đè batchKey bằng root giả mạo để che dấu lỗi
      await expect(
        dataIntegrity.connect(anchorer).anchorBatch(
          batchKey,
          shipmentKey,
          deviceKey,
          recomputedTamperedRoot,
          outboxPayload.first_sequence,
          outboxPayload.last_sequence,
          outboxPayload.record_count
        )
      )
        .to.be.revertedWithCustomError(dataIntegrity, "ColdChain__BatchAlreadyExists")
        .withArgs(batchKey);

      // Root on-chain vẫn giữ nguyên giá trị gốc ban đầu
      const batchAfterTamperAttempt = await dataIntegrity.getBatch(batchKey);
      expect(batchAfterTamperAttempt.merkleRoot).to.equal(outboxPayload.merkle_root);
    });

    it("E13: Should reject anchorBatch from unauthorized caller (Wrong ANCHORER)", async function () {
      await expect(
        dataIntegrity.connect(attacker).anchorBatch(
          batchKey,
          shipmentKey,
          deviceKey,
          outboxPayload.merkle_root,
          outboxPayload.first_sequence,
          outboxPayload.last_sequence,
          outboxPayload.record_count
        )
      ).to.be.revertedWithCustomError(dataIntegrity, "ColdChain__CallerNotAnchorer");
    });

    it("Should support rotating ANCHORER role safely via setAnchorer", async function () {
      const newAnchorer = attacker; // dùng signer khác làm anchorer mới
      await expect(dataIntegrity.connect(owner).setAnchorer(newAnchorer.address))
        .to.emit(dataIntegrity, "AnchorerUpdated")
        .withArgs(anchorer.address, newAnchorer.address);

      // Anchorer cũ mất quyền ngay lập tức
      await expect(anchorOutboxBatch()).to.be.revertedWithCustomError(
        dataIntegrity,
        "ColdChain__CallerNotAnchorer"
      );

      // Anchorer mới hoạt động bình thường
      await expect(
        dataIntegrity.connect(newAnchorer).anchorBatch(
          batchKey,
          shipmentKey,
          deviceKey,
          outboxPayload.merkle_root,
          outboxPayload.first_sequence,
          outboxPayload.last_sequence,
          outboxPayload.record_count
        )
      ).to.emit(dataIntegrity, "BatchAnchored");
    });
  });

  describe("2. Backend Oracle Integration -> Module B Payout, Idempotency & Error Matrix", function () {
    it("Should verify full pipeline: Anchored Evidence -> Authorized Oracle Payout -> Backend Adapter Reconciliation", async function () {
      await createActivePolicy(3600);
      await anchorOutboxBatch();

      // 1. Giả lập Backend xác nhận bằng chứng đã anchored trước khi báo vi phạm
      const evidenceVerified = await dataIntegrity.verifyBatch(batchKey, outboxPayload.merkle_root);
      expect(evidenceVerified).to.be.true;

      // 2. Oracle gọi reportViolation
      const detectedAt = await time.latest();
      const beneficiaryBalanceBefore = await token.balanceOf(beneficiary.address);

      const tx = await insurance
        .connect(oracle)
        .reportViolation(shipmentKey, evidenceHash, detectedAt);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      // 3. Kiểm tra balance delta của beneficiary
      const beneficiaryBalanceAfter = await token.balanceOf(beneficiary.address);
      expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(payoutAmount);
      expect(await insurance.getContractBalance()).to.equal(0n);

      // 4. Đối chiếu layout `getPolicy` khớp 100% với `Web3BlockchainAdapter` (indices 0..6)
      // policy[4] == 2 (PaidOut), policy[5] == evidenceHash, policy[6] == detectedAt
      const policyTuple = await insurance.getPolicy(shipmentKey);
      expect(policyTuple[0]).to.equal(insurer.address);
      expect(policyTuple[1]).to.equal(beneficiary.address);
      expect(policyTuple[2]).to.equal(payoutAmount);
      expect(policyTuple[4]).to.equal(2n);
      expect(policyTuple[5]).to.equal(evidenceHash);
      expect(policyTuple[6]).to.equal(BigInt(detectedAt));

      // 5. Đối chiếu lọc event `InsurancePaid` theo indexed shipmentKey (như prepare_report trong Python)
      const paidLogs = await insurance.queryFilter(
        insurance.filters.InsurancePaid(shipmentKey)
      );
      expect(paidLogs).to.have.lengthOf(1);
      expect(paidLogs[0].transactionHash).to.equal(receipt?.hash);
      expect(paidLogs[0].args.evidenceHash).to.equal(evidenceHash);
      expect(paidLogs[0].args.detectedAt).to.equal(BigInt(detectedAt));
      expect(paidLogs[0].args.payoutAmount).to.equal(payoutAmount);
    });

    it("E15: Should reject reportViolation when called by wrong Oracle", async function () {
      await createActivePolicy(3600);
      const detectedAt = await time.latest();

      await expect(
        insurance.connect(attacker).reportViolation(shipmentKey, evidenceHash, detectedAt)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__CallerNotOracle");
    });

    it("E16: Should guarantee zero double payout when retrying same policy/event", async function () {
      await createActivePolicy(3600);
      const detectedAt = await time.latest();

      await insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt);
      const balanceAfterFirst = await token.balanceOf(beneficiary.address);

      await expect(
        insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt)
      )
        .to.be.revertedWithCustomError(insurance, "ColdChain__PolicyNotActive")
        .withArgs(shipmentKey, 2);

      expect(await token.balanceOf(beneficiary.address)).to.equal(balanceAfterFirst);
    });

    it("E17: Should reject reportViolation on expired policy and allow safe refund afterwards", async function () {
      const expiry = await createActivePolicy(60);
      await time.increaseTo(expiry + 1);

      const detectedAt = expiry - 10;
      await expect(
        insurance.connect(oracle).reportViolation(shipmentKey, evidenceHash, detectedAt)
      ).to.be.revertedWithCustomError(insurance, "ColdChain__PolicyExpired");

      // Sau expiry, insurer được hoàn lại toàn bộ tiền ký quỹ
      const insurerBefore = await token.balanceOf(insurer.address);
      await expect(insurance.connect(insurer).refundExpiredPolicy(shipmentKey))
        .to.emit(insurance, "PolicyRefunded")
        .withArgs(shipmentKey, insurer.address, payoutAmount);
      expect(await token.balanceOf(insurer.address) - insurerBefore).to.equal(payoutAmount);
    });
  });
});

