#!/bin/bash
set -euo pipefail

CIRCUIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$CIRCUIT_DIR/build"
KEYS_DIR="$CIRCUIT_DIR/keys"

mkdir -p "$KEYS_DIR"

if [ ! -f "$BUILD_DIR/withdrawal.r1cs" ]; then
  echo "Error: Circuit not compiled. Run 'pnpm build' first."
  exit 1
fi

echo "==> Phase 1: Powers of Tau (BN254)"
npx snarkjs powersoftau new bn128 16 "$KEYS_DIR/pot16_0000.ptau" -v

echo "==> Phase 1: Contribute"
npx snarkjs powersoftau contribute "$KEYS_DIR/pot16_0000.ptau" "$KEYS_DIR/pot16_0001.ptau" \
  --name="SKAUS dev contribution" -v -e="skaus-dev-entropy-$(date +%s)"

echo "==> Phase 1: Prepare for phase 2"
npx snarkjs powersoftau prepare phase2 "$KEYS_DIR/pot16_0001.ptau" "$KEYS_DIR/pot16_final.ptau" -v

echo "==> Phase 2: Setup"
npx snarkjs groth16 setup "$BUILD_DIR/withdrawal.r1cs" "$KEYS_DIR/pot16_final.ptau" "$KEYS_DIR/withdrawal_0000.zkey"

echo "==> Phase 2: Contribute"
npx snarkjs zkey contribute "$KEYS_DIR/withdrawal_0000.zkey" "$KEYS_DIR/withdrawal_final.zkey" \
  --name="SKAUS dev contribution" -v -e="skaus-zkey-entropy-$(date +%s)"

echo "==> Export verification key"
npx snarkjs zkey export verificationkey "$KEYS_DIR/withdrawal_final.zkey" "$KEYS_DIR/verification_key.json"

echo "==> Export Solidity verifier (reference)"
npx snarkjs zkey export solidityverifier "$KEYS_DIR/withdrawal_final.zkey" "$KEYS_DIR/Verifier.sol"

echo "==> Trusted setup complete."
echo "    Keys in $KEYS_DIR/"
echo "    - withdrawal_final.zkey (proving key)"
echo "    - verification_key.json (verification key)"
