const { buildPoseidon } = require("circomlibjs");
const snarkjs = require("snarkjs");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const DEPTH = 20;
const BUILD_DIR = path.join(__dirname, "../build");
const KEYS_DIR = path.join(__dirname, "../keys");

function randomFieldElement() {
  return BigInt("0x" + crypto.randomBytes(31).toString("hex"));
}

async function computeZeroHashes(poseidon, depth) {
  const zeros = new Array(depth + 1);
  zeros[0] = BigInt(0);
  for (let i = 1; i <= depth; i++) {
    zeros[i] = poseidon.F.toObject(poseidon([zeros[i - 1], zeros[i - 1]]));
  }
  return zeros;
}

async function computeMerklePath(poseidon, commitment, index, depth) {
  const zeros = await computeZeroHashes(poseidon, depth);
  const pathElements = [];
  const pathIndices = [];

  let currentHash = commitment;
  let idx = index;

  for (let level = 0; level < depth; level++) {
    if (idx % 2 === 0) {
      pathElements.push(zeros[level]);
      pathIndices.push(0);
      currentHash = poseidon.F.toObject(
        poseidon([currentHash, zeros[level]])
      );
    } else {
      pathElements.push(zeros[level]);
      pathIndices.push(1);
      currentHash = poseidon.F.toObject(
        poseidon([zeros[level], currentHash])
      );
    }
    idx = Math.floor(idx / 2);
  }

  return { pathElements, pathIndices, root: currentHash };
}

async function main() {
  console.log("Loading Poseidon...");
  const poseidon = await buildPoseidon();

  const secret = randomFieldElement();
  const nullifier = randomFieldElement();
  const amount = BigInt(100_000_000); // 100 USDC
  const fee = BigInt(300_000); // 0.3%
  const recipient = randomFieldElement();

  console.log("Computing commitment...");
  const commitment = poseidon.F.toObject(
    poseidon([secret, nullifier, amount])
  );

  console.log("Computing nullifier hash...");
  const nullifierHash = poseidon.F.toObject(poseidon([nullifier]));

  console.log("Building Merkle proof for leaf at index 0...");
  const { pathElements, pathIndices, root } = await computeMerklePath(
    poseidon,
    commitment,
    0,
    DEPTH
  );

  const input = {
    merkleRoot: root.toString(),
    nullifierHash: nullifierHash.toString(),
    recipient: recipient.toString(),
    amount: amount.toString(),
    fee: fee.toString(),
    secret: secret.toString(),
    nullifier: nullifier.toString(),
    merklePath: pathElements.map((e) => e.toString()),
    pathIndices: pathIndices.map((e) => e.toString()),
  };

  console.log("\nCircuit inputs prepared:");
  console.log("  commitment:", commitment.toString().slice(0, 20) + "...");
  console.log("  nullifierHash:", nullifierHash.toString().slice(0, 20) + "...");
  console.log("  merkleRoot:", root.toString().slice(0, 20) + "...");
  console.log("  amount:", amount.toString());
  console.log("  fee:", fee.toString());

  const wasmPath = path.join(BUILD_DIR, "withdrawal_js", "withdrawal.wasm");
  const zkeyPath = path.join(KEYS_DIR, "withdrawal_final.zkey");
  const vkeyPath = path.join(KEYS_DIR, "verification_key.json");

  if (!fs.existsSync(wasmPath)) {
    console.log("\n[SKIP] Circuit WASM not found — run 'pnpm build' first");
    console.log("Input JSON saved for manual testing.");
    fs.writeFileSync(
      path.join(__dirname, "test_input.json"),
      JSON.stringify(input, null, 2)
    );
    return;
  }

  console.log("\nGenerating proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath
  );

  console.log("Proof generated successfully!");
  console.log("  Public signals:", publicSignals.length, "values");

  console.log("\nVerifying proof...");
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

  console.log("Proof valid:", valid);

  if (!valid) {
    console.error("VERIFICATION FAILED!");
    process.exit(1);
  }

  console.log("\nAll tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
