import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

describe("ColdChainDataIntegrity", function () {
  // ─── Merkle v1 Helper (TypeScript Implementation) ──────────────────
  function sha256(buffer: Buffer): Buffer {
    return crypto.createHash("sha256").update(buffer).digest();
  }

  function leafHashFromCanonicalUtf8(canonicalUtf8: string): Buffer {
    return sha256(Buffer.concat([Buffer.from([0x00]), Buffer.from(canonicalUtf8, "utf-8")]));
  }

  function computeMerkleRoot(leaves: Buffer[]): Buffer {
    if (leaves.length === 0) throw new Error("empty batch");
    let level = [...leaves];
    while (level.length > 1) {
      if (level.length % 2 === 1) {
        level.push(level[level.length - 1]);
      }
      const nextLevel: Buffer[] = [];
      for (let i = 0; i < level.length; i += 2) {
        nextLevel.push(sha256(Buffer.concat([Buffer.from([0x01]), level[i], level[i + 1]])));
      }
      level = nextLevel;
    }
    return level[0];
  }

  // ─── Cross-language Golden Vectors Test ────────────────────────────
  describe("Cross-language MERKLE-v1 Golden Vectors", function () {
    const fixturePath = path.join(
      __dirname,
      "..",
      "..",
      "backend",
      "tests",
      "fixtures",
      "protocol_vectors_v1.json"
    );

    let vectors: any;
    before(function () {
      expect(fs.existsSync(fixturePath), "Fixture file must exist").to.be.true;
      vectors = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    });

    it("Should compute exact leaf hashes matching Python golden vectors", function () {
      const records = vectors.records;
      for (let i = 0; i < records.length; i++) {
        // Build canonical UTF-8 JSON projection matching Python canonical_record_bytes
        const req = records[i].request;
        const canonicalObj = {
          device_id: req.device_id,
          firmware_version: req.firmware_version,
          humidity_milli_pct: req.humidity_milli_pct,
          key_id: req.key_id,
          payload_version: req.payload_version,
          received_at: records[i].received_at,
          recorded_at: req.recorded_at,
          sequence_number: req.sequence_number,
          shipment_id: req.shipment_id,
          signature: req.signature,
          temperature_milli_c: req.temperature_milli_c,
        };
        // Keys must be in ASCII ascending order
        const sortedKeys = Object.keys(canonicalObj).sort();
        const jsonEntries = sortedKeys.map(
          (k) => `"${k}":${JSON.stringify((canonicalObj as any)[k])}`
        );
        const canonicalUtf8 = `{${jsonEntries.join(",")}}`;

        const computedLeaf = "0x" + leafHashFromCanonicalUtf8(canonicalUtf8).toString("hex");
        expect(computedLeaf).to.equal(vectors.leaf_hashes[i]);
      }
    });

    it("Should compute Merkle roots matching Python golden roots for 1, 2, and 3 leaves", function () {
      const leaves = vectors.leaf_hashes.map((h: string) => Buffer.from(h.replace("0x", ""), "hex"));

      // 1 leaf root
      const root1 = "0x" + computeMerkleRoot([leaves[0]]).toString("hex");
      expect(root1).to.equal(vectors.roots["1"]);

      // 2 leaves root
      const root2 = "0x" + computeMerkleRoot([leaves[0], leaves[1]]).toString("hex");
      expect(root2).to.equal(vectors.roots["2"]);

      // 3 leaves root (odd leaf duplicate)
      const root3 = "0x" + computeMerkleRoot([leaves[0], leaves[1], leaves[2]]).toString("hex");
      expect(root3).to.equal(vectors.roots["3"]);
    });
  });

  // ─── Contract Fixture ──────────────────────────────────────────────
  async function deployDataIntegrityFixture() {
    const [owner, anchorer, stranger] = await ethers.getSigners();

    const DataIntegrity = await ethers.getContractFactory("ColdChainDataIntegrity");
    const contract = await DataIntegrity.deploy(anchorer.address);
    await contract.waitForDeployment();

    const batchId = "batch-20261105-001";
    const batchKey = ethers.keccak256(ethers.toUtf8Bytes(batchId));
    const shipmentId = "8b4fb8a2-2996-4da2-90b9-35019517f56f";
    const shipmentKey = ethers.keccak256(ethers.toUtf8Bytes(shipmentId));
    const deviceId = "ESP32-001";
    const deviceKey = ethers.keccak256(ethers.toUtf8Bytes(deviceId));

    // Golden root for 3 records from protocol_vectors_v1.json
    const merkleRoot = "0x5706c737b9d61c51fee11fca1da56f8a6f9986c220afa0b1e875908857a1ae37";
    const firstSequence = 1524n;
    const lastSequence = 1526n;
    const recordCount = 3;

    return {
      contract,
      owner,
      anchorer,
      stranger,
      batchKey,
      shipmentKey,
      deviceKey,
      merkleRoot,
      firstSequence,
      lastSequence,
      recordCount,
    };
  }

  // ─── Deployment Tests ────────────────────────────────────────────
  describe("Deployment", function () {
    it("Should set correct owner and anchorer", async function () {
      const { contract, owner, anchorer } = await loadFixture(deployDataIntegrityFixture);
      expect(await contract.owner()).to.equal(owner.address);
      expect(await contract.anchorer()).to.equal(anchorer.address);
    });

    it("Should reject zero address anchorer in constructor", async function () {
      const DataIntegrity = await ethers.getContractFactory("ColdChainDataIntegrity");
      await expect(
        DataIntegrity.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(DataIntegrity, "ColdChain__ZeroAddress");
    });
  });

  // ─── Admin Tests ─────────────────────────────────────────────────
  describe("setAnchorer", function () {
    it("Should allow owner to update anchorer", async function () {
      const { contract, owner, stranger } = await loadFixture(deployDataIntegrityFixture);
      await contract.connect(owner).setAnchorer(stranger.address);
      expect(await contract.anchorer()).to.equal(stranger.address);
    });

    it("Should emit AnchorerUpdated event", async function () {
      const { contract, owner, anchorer, stranger } = await loadFixture(deployDataIntegrityFixture);
      await expect(contract.connect(owner).setAnchorer(stranger.address))
        .to.emit(contract, "AnchorerUpdated")
        .withArgs(anchorer.address, stranger.address);
    });

    it("Should reject non-owner caller", async function () {
      const { contract, stranger } = await loadFixture(deployDataIntegrityFixture);
      await expect(
        contract.connect(stranger).setAnchorer(stranger.address)
      ).to.be.revertedWithCustomError(contract, "ColdChain__CallerNotOwner");
    });

    it("Should reject zero address", async function () {
      const { contract, owner } = await loadFixture(deployDataIntegrityFixture);
      await expect(
        contract.connect(owner).setAnchorer(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(contract, "ColdChain__ZeroAddress");
    });
  });

  // ─── Core anchorBatch Tests ──────────────────────────────────────
  describe("anchorBatch", function () {
    it("Should anchor a batch successfully and emit BatchAnchored", async function () {
      const {
        contract,
        anchorer,
        batchKey,
        shipmentKey,
        deviceKey,
        merkleRoot,
        firstSequence,
        lastSequence,
        recordCount,
      } = await loadFixture(deployDataIntegrityFixture);

      await expect(
        contract
          .connect(anchorer)
          .anchorBatch(
            batchKey,
            shipmentKey,
            deviceKey,
            merkleRoot,
            firstSequence,
            lastSequence,
            recordCount
          )
      )
        .to.emit(contract, "BatchAnchored")
        .withArgs(batchKey, shipmentKey, deviceKey, merkleRoot, recordCount, anchorer.address);

      expect(await contract.batchExists(batchKey)).to.be.true;

      const batch = await contract.getBatch(batchKey);
      expect(batch.shipmentKey).to.equal(shipmentKey);
      expect(batch.deviceKey).to.equal(deviceKey);
      expect(batch.merkleRoot).to.equal(merkleRoot);
      expect(batch.firstSequence).to.equal(firstSequence);
      expect(batch.lastSequence).to.equal(lastSequence);
      expect(batch.recordCount).to.equal(recordCount);
      expect(batch.anchoredBy).to.equal(anchorer.address);
      expect(batch.anchoredAt).to.be.greaterThan(0);
    });

    it("Should reject unauthorized anchorer caller", async function () {
      const {
        contract,
        stranger,
        batchKey,
        shipmentKey,
        deviceKey,
        merkleRoot,
        firstSequence,
        lastSequence,
        recordCount,
      } = await loadFixture(deployDataIntegrityFixture);

      await expect(
        contract
          .connect(stranger)
          .anchorBatch(
            batchKey,
            shipmentKey,
            deviceKey,
            merkleRoot,
            firstSequence,
            lastSequence,
            recordCount
          )
      ).to.be.revertedWithCustomError(contract, "ColdChain__CallerNotAnchorer");
    });

    it("Should reject duplicate batchKey (immutable root commitment)", async function () {
      const {
        contract,
        anchorer,
        batchKey,
        shipmentKey,
        deviceKey,
        merkleRoot,
        firstSequence,
        lastSequence,
        recordCount,
      } = await loadFixture(deployDataIntegrityFixture);

      await contract
        .connect(anchorer)
        .anchorBatch(
          batchKey,
          shipmentKey,
          deviceKey,
          merkleRoot,
          firstSequence,
          lastSequence,
          recordCount
        );

      // Thử neo lại cùng batchKey -> phải revert
      await expect(
        contract
          .connect(anchorer)
          .anchorBatch(
            batchKey,
            shipmentKey,
            deviceKey,
            merkleRoot,
            firstSequence,
            lastSequence,
            recordCount
          )
      )
        .to.be.revertedWithCustomError(contract, "ColdChain__BatchAlreadyExists")
        .withArgs(batchKey);
    });

    it("Should reject zero batchKey", async function () {
      const {
        contract,
        anchorer,
        shipmentKey,
        deviceKey,
        merkleRoot,
        firstSequence,
        lastSequence,
        recordCount,
      } = await loadFixture(deployDataIntegrityFixture);

      await expect(
        contract
          .connect(anchorer)
          .anchorBatch(
            ethers.ZeroHash,
            shipmentKey,
            deviceKey,
            merkleRoot,
            firstSequence,
            lastSequence,
            recordCount
          )
      ).to.be.revertedWithCustomError(contract, "ColdChain__InvalidBatchKey");
    });

    it("Should reject zero merkleRoot", async function () {
      const {
        contract,
        anchorer,
        batchKey,
        shipmentKey,
        deviceKey,
        firstSequence,
        lastSequence,
        recordCount,
      } = await loadFixture(deployDataIntegrityFixture);

      await expect(
        contract
          .connect(anchorer)
          .anchorBatch(
            batchKey,
            shipmentKey,
            deviceKey,
            ethers.ZeroHash,
            firstSequence,
            lastSequence,
            recordCount
          )
      ).to.be.revertedWithCustomError(contract, "ColdChain__InvalidMerkleRoot");
    });

    it("Should reject zero recordCount", async function () {
      const {
        contract,
        anchorer,
        batchKey,
        shipmentKey,
        deviceKey,
        merkleRoot,
        firstSequence,
        lastSequence,
      } = await loadFixture(deployDataIntegrityFixture);

      await expect(
        contract
          .connect(anchorer)
          .anchorBatch(
            batchKey,
            shipmentKey,
            deviceKey,
            merkleRoot,
            firstSequence,
            lastSequence,
            0
          )
      ).to.be.revertedWithCustomError(contract, "ColdChain__InvalidRecordCount");
    });

    it("Should reject inverted sequence range (firstSequence > lastSequence)", async function () {
      const {
        contract,
        anchorer,
        batchKey,
        shipmentKey,
        deviceKey,
        merkleRoot,
        recordCount,
      } = await loadFixture(deployDataIntegrityFixture);

      await expect(
        contract
          .connect(anchorer)
          .anchorBatch(
            batchKey,
            shipmentKey,
            deviceKey,
            merkleRoot,
            2000n, // firstSequence
            1000n, // lastSequence < firstSequence
            recordCount
          )
      )
        .to.be.revertedWithCustomError(contract, "ColdChain__InvalidSequenceRange")
        .withArgs(2000n, 1000n);
    });
  });

  // ─── Verification & Query Tests ──────────────────────────────────
  describe("Verification and Retrieval", function () {
    it("Should return true when candidate root matches anchored root", async function () {
      const {
        contract,
        anchorer,
        batchKey,
        shipmentKey,
        deviceKey,
        merkleRoot,
        firstSequence,
        lastSequence,
        recordCount,
      } = await loadFixture(deployDataIntegrityFixture);

      await contract
        .connect(anchorer)
        .anchorBatch(
          batchKey,
          shipmentKey,
          deviceKey,
          merkleRoot,
          firstSequence,
          lastSequence,
          recordCount
        );

      expect(await contract.verifyBatch(batchKey, merkleRoot)).to.be.true;
    });

    it("Should return false when candidate root does not match (tampered)", async function () {
      const {
        contract,
        anchorer,
        batchKey,
        shipmentKey,
        deviceKey,
        merkleRoot,
        firstSequence,
        lastSequence,
        recordCount,
      } = await loadFixture(deployDataIntegrityFixture);

      await contract
        .connect(anchorer)
        .anchorBatch(
          batchKey,
          shipmentKey,
          deviceKey,
          merkleRoot,
          firstSequence,
          lastSequence,
          recordCount
        );

      const fakeRoot = ethers.keccak256(ethers.toUtf8Bytes("tampered-data-root"));
      expect(await contract.verifyBatch(batchKey, fakeRoot)).to.be.false;
    });

    it("Should revert verifyBatch for unknown batchKey (distinguishing unknown from mismatch)", async function () {
      const { contract } = await loadFixture(deployDataIntegrityFixture);
      const fakeBatchKey = ethers.keccak256(ethers.toUtf8Bytes("nonexistent-batch"));
      const candidateRoot = ethers.keccak256(ethers.toUtf8Bytes("some-root"));

      await expect(
        contract.verifyBatch(fakeBatchKey, candidateRoot)
      )
        .to.be.revertedWithCustomError(contract, "ColdChain__BatchNotFound")
        .withArgs(fakeBatchKey);
    });

    it("Should revert getBatch for unknown batchKey", async function () {
      const { contract } = await loadFixture(deployDataIntegrityFixture);
      const fakeBatchKey = ethers.keccak256(ethers.toUtf8Bytes("nonexistent-batch"));

      await expect(contract.getBatch(fakeBatchKey))
        .to.be.revertedWithCustomError(contract, "ColdChain__BatchNotFound")
        .withArgs(fakeBatchKey);
    });

    it("Should return false from batchExists for unknown batchKey", async function () {
      const { contract } = await loadFixture(deployDataIntegrityFixture);
      const fakeBatchKey = ethers.keccak256(ethers.toUtf8Bytes("nonexistent-batch"));
      expect(await contract.batchExists(fakeBatchKey)).to.be.false;
    });
  });
});
