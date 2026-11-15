import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Script đối chiếu Event Logs & Contract State trực tiếp trên chain (Phase 6):
 * - Liệt kê toàn bộ sự kiện BatchAnchored (Module A) và PolicyCreated / InsurancePaid / PolicyRefunded (Module B)
 * - Hỗ trợ tra cứu chi tiết theo SHIPMENT_ID hoặc BATCH_ID từ Backend:
 *     $env:SHIPMENT_ID="..."; $env:BATCH_ID="..."; npx hardhat run scripts/inspect-onchain.ts --network localhost
 */
async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", "localhost.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Không tìm thấy deployments/localhost.json. Vui lòng chạy `npm run deploy` trước.");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const network = await ethers.provider.getNetwork();
  const blockNumber = await ethers.provider.getBlockNumber();

  const token = await ethers.getContractAt(
    "MockInsuranceToken",
    deployment.contracts.MockInsuranceToken.address
  );
  const dataIntegrity = await ethers.getContractAt(
    "ColdChainDataIntegrity",
    deployment.contracts.ColdChainDataIntegrity.address
  );
  const insurance = await ethers.getContractAt(
    "ColdChainInsurance",
    deployment.contracts.ColdChainInsurance.address
  );

  console.log("=================================================");
  console.log("=== Đối chiếu Trạng thái On-Chain & Event Logs ===");
  console.log("=================================================");
  console.log(`Network Chain ID:   ${network.chainId}`);
  console.log(`Latest Block:       ${blockNumber}`);
  console.log(`Contract Escrow:    ${ethers.formatEther(await insurance.getContractBalance())} MINS`);

  // 1. Module A Events
  const batchEvents = await dataIntegrity.queryFilter(dataIntegrity.filters.BatchAnchored(), 0, "latest");
  console.log(`\n--- [Module A] BatchAnchored Events (${batchEvents.length}) ---`);
  for (const ev of batchEvents) {
    console.log(`  • Block #${ev.blockNumber} | Tx: ${ev.transactionHash}`);
    console.log(`    batchKey:    ${ev.args.batchKey}`);
    console.log(`    shipmentKey: ${ev.args.shipmentKey}`);
    console.log(`    merkleRoot:  ${ev.args.merkleRoot} (${ev.args.recordCount} records)`);
  }

  // 2. Module B Events
  const createdEvents = await insurance.queryFilter(insurance.filters.PolicyCreated(), 0, "latest");
  const paidEvents = await insurance.queryFilter(insurance.filters.InsurancePaid(), 0, "latest");
  const refundedEvents = await insurance.queryFilter(insurance.filters.PolicyRefunded(), 0, "latest");

  console.log(`\n--- [Module B] PolicyCreated Events (${createdEvents.length}) ---`);
  for (const ev of createdEvents) {
    console.log(`  • Block #${ev.blockNumber} | Tx: ${ev.transactionHash}`);
    console.log(`    shipmentKey: ${ev.args.shipmentKey}`);
    console.log(`    beneficiary: ${ev.args.beneficiary} | payout: ${ethers.formatEther(ev.args.payoutAmount)} MINS`);
  }

  console.log(`\n--- [Module B] InsurancePaid Events (${paidEvents.length}) ---`);
  for (const ev of paidEvents) {
    const benBalance = await token.balanceOf(ev.args.beneficiary);
    console.log(`  • Block #${ev.blockNumber} | Tx: ${ev.transactionHash}`);
    console.log(`    shipmentKey:  ${ev.args.shipmentKey}`);
    console.log(`    evidenceHash: ${ev.args.evidenceHash} | detectedAt: ${ev.args.detectedAt}`);
    console.log(`    payout:       ${ethers.formatEther(ev.args.payoutAmount)} MINS -> Beneficiary Balance: ${ethers.formatEther(benBalance)} MINS`);
  }

  console.log(`\n--- [Module B] PolicyRefunded Events (${refundedEvents.length}) ---`);
  for (const ev of refundedEvents) {
    console.log(`  • Block #${ev.blockNumber} | Tx: ${ev.transactionHash}`);
    console.log(`    shipmentKey: ${ev.args.shipmentKey} | amount: ${ethers.formatEther(ev.args.amount)} MINS`);
  }

  // 3. Tra cứu cụ thể nếu có SHIPMENT_ID hoặc BATCH_ID
  const targetBatchId = process.env.BATCH_ID?.trim();
  if (targetBatchId) {
    const bKey = ethers.keccak256(ethers.toUtf8Bytes(targetBatchId));
    console.log(`\n--- Tra cứu Batch ID: ${targetBatchId} (${bKey}) ---`);
    if (await dataIntegrity.batchExists(bKey)) {
      const b = await dataIntegrity.getBatch(bKey);
      console.log(`  merkleRoot:    ${b.merkleRoot}`);
      console.log(`  sequences:     ${b.firstSequence} -> ${b.lastSequence} (${b.recordCount} records)`);
      console.log(`  anchoredAt:    ${new Date(Number(b.anchoredAt) * 1000).toISOString()}`);
    } else {
      console.log("  [NOT FOUND] Batch chưa được neo trên chain.");
    }
  }

  const targetShipmentId = process.env.SHIPMENT_ID?.trim();
  if (targetShipmentId) {
    const sKey = ethers.keccak256(ethers.toUtf8Bytes(targetShipmentId));
    console.log(`\n--- Tra cứu Shipment ID: ${targetShipmentId} (${sKey}) ---`);
    const p = await insurance.getPolicy(sKey);
    const statusLabels = ["NotExist", "Active", "PaidOut", "Refunded"];
    console.log(`  status:       ${statusLabels[Number(p.status)] || p.status}`);
    console.log(`  beneficiary:  ${p.beneficiary}`);
    console.log(`  payoutAmount: ${ethers.formatEther(p.payoutAmount)} MINS`);
    console.log(`  evidenceHash: ${p.evidenceHash}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

