#!/bin/bash
set -euo pipefail

CIRCUIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$CIRCUIT_DIR/build"

mkdir -p "$BUILD_DIR"

echo "==> Compiling withdrawal circuit..."
circom "$CIRCUIT_DIR/withdrawal.circom" \
  --r1cs \
  --wasm \
  --sym \
  --output "$BUILD_DIR"

echo "==> Circuit info:"
npx snarkjs r1cs info "$BUILD_DIR/withdrawal.r1cs"

echo "==> Build complete. Artifacts in $BUILD_DIR/"
echo "    - withdrawal.r1cs"
echo "    - withdrawal_js/withdrawal.wasm"
echo "    - withdrawal.sym"
