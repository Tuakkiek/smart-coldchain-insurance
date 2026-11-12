import * as fs from "fs";
import * as path from "path";

/**
 * Script trích xuất và bàn giao ABI (Artifact & ABI Handoff):
 * - Đọc artifacts đã compile từ Hardhat
 * - Xuất ABI thuần túy sang `blockchain/deployments/abi/`
 * - Tạo metadata tổng hợp signatures, events, custom errors cho Backend (Python) và Frontend
 */
async function main() {
  console.log("=================================================");
  console.log("=== Bàn giao ABI & Artifacts (Phase 5) ===");
  console.log("=================================================");

  const artifactsBase = path.join(__dirname, "..", "artifacts", "contracts");
  const targetDir = path.join(__dirname, "..", "deployments", "abi");

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const contracts = [
    {
      name: "ColdChainDataIntegrity",
      artifactPath: path.join(
        artifactsBase,
        "ColdChainDataIntegrity.sol",
        "ColdChainDataIntegrity.json"
      ),
    },
    {
      name: "ColdChainInsurance",
      artifactPath: path.join(
        artifactsBase,
        "ColdChainInsurance.sol",
        "ColdChainInsurance.json"
      ),
    },
    {
      name: "MockInsuranceToken",
      artifactPath: path.join(
        artifactsBase,
        "MockInsuranceToken.sol",
        "MockInsuranceToken.json"
      ),
    },
  ];

  const summary: Record<string, any> = {};

  for (const contract of contracts) {
    if (!fs.existsSync(contract.artifactPath)) {
      throw new Error(`Không tìm thấy artifact: ${contract.artifactPath}. Vui lòng compile trước.`);
    }

    const artifact = JSON.parse(fs.readFileSync(contract.artifactPath, "utf-8"));
    const abi = artifact.abi;

    // 1. Ghi file ABI thuần
    const abiOutputPath = path.join(targetDir, `${contract.name}.abi.json`);
    fs.writeFileSync(abiOutputPath, JSON.stringify(abi, null, 2));
    console.log(`[OK] Đã xuất ABI: deployments/abi/${contract.name}.abi.json (${abi.length} items)`);

    // 2. Phân loại signature để tạo tài liệu tra cứu
    const functions = abi
      .filter((item: any) => item.type === "function")
      .map(
        (f: any) =>
          `${f.name}(${f.inputs.map((i: any) => `${i.type} ${i.name}`).join(", ")}) -> (${f.outputs.map((o: any) => o.type).join(", ")})`
      );

    const events = abi
      .filter((item: any) => item.type === "event")
      .map(
        (e: any) =>
          `event ${e.name}(${e.inputs.map((i: any) => `${i.type}${i.indexed ? " indexed" : ""} ${i.name}`).join(", ")})`
      );

    const errors = abi
      .filter((item: any) => item.type === "error")
      .map(
        (er: any) =>
          `error ${er.name}(${er.inputs.map((i: any) => `${i.type} ${i.name}`).join(", ")})`
      );

    summary[contract.name] = {
      functions,
      events,
      errors,
    };
  }

  // 3. Ghi file summary
  const summaryPath = path.join(targetDir, "contract-interfaces.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`[OK] Đã xuất bảng tra cứu interface: deployments/abi/contract-interfaces.json`);

  console.log("\n=== TỔNG HỢP INTERFACES SMART CONTRACTS ===");
  for (const [name, meta] of Object.entries(summary)) {
    console.log(`\n--- ${name} ---`);
    console.log(`Functions (${meta.functions.length}):`);
    meta.functions.forEach((f: string) => console.log(`  - ${f}`));
    console.log(`Events (${meta.events.length}):`);
    meta.events.forEach((e: string) => console.log(`  - ${e}`));
    console.log(`Custom Errors (${meta.errors.length}):`);
    meta.errors.forEach((er: string) => console.log(`  - ${er}`));
  }

  console.log("\n=================================================");
  console.log("=== Bàn giao ABI & Artifacts hoàn tất thành công! ===");
  console.log("=================================================");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
