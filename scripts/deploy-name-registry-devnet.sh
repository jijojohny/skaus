#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROGRAM_NAME="name_registry"
DEPLOY_DIR="$ROOT_DIR/target/deploy"

echo "================================================"
echo "  SKAUS Name Registry — Devnet Deployment"
echo "================================================"

# 1. Check prerequisites
echo ""
echo "[1/6] Checking prerequisites..."
command -v solana >/dev/null 2>&1 || { echo "Error: solana CLI not found"; exit 1; }
command -v cargo-build-sbf >/dev/null 2>&1 || { echo "Error: cargo-build-sbf not found. Install via: cargo install solana-cargo-build-sbf"; exit 1; }

CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $NF}')
echo "  Solana cluster: $CLUSTER"

if [[ "$CLUSTER" != *"devnet"* ]]; then
  echo "  Switching to devnet..."
  solana config set --url devnet
fi

WALLET=$(solana config get | grep "Keypair Path" | awk '{print $NF}')
echo "  Wallet: $WALLET"

PUBKEY=$(solana-keygen pubkey "$WALLET")
echo "  Authority: $PUBKEY"

BALANCE=$(solana balance 2>/dev/null || echo "0 SOL")
echo "  Balance: $BALANCE"

# 2. Ensure program keypair exists
echo ""
echo "[2/6] Checking program keypair..."
mkdir -p "$DEPLOY_DIR"
KEYPAIR_PATH="$DEPLOY_DIR/${PROGRAM_NAME}-keypair.json"
if [ ! -f "$KEYPAIR_PATH" ]; then
  echo "  Generating new program keypair..."
  solana-keygen new --no-bip39-passphrase -o "$KEYPAIR_PATH" --force
fi

PROGRAM_ID=$(solana-keygen pubkey "$KEYPAIR_PATH")
echo "  Program ID: $PROGRAM_ID"

# 3. Update declare_id! if needed
DECLARED_ID=$(grep "declare_id!" "$ROOT_DIR/programs/name-registry/src/lib.rs" | head -1 | sed 's/.*"\(.*\)".*/\1/')
if [ "$DECLARED_ID" != "$PROGRAM_ID" ]; then
  echo ""
  echo "  Updating declare_id! in lib.rs..."
  echo "  Old: $DECLARED_ID"
  echo "  New: $PROGRAM_ID"
  sed -i "s/declare_id!(\".*\")/declare_id!(\"$PROGRAM_ID\")/" "$ROOT_DIR/programs/name-registry/src/lib.rs"
fi

# 4. Build the program
echo ""
echo "[3/6] Building name_registry program..."
cd "$ROOT_DIR"

# Use cargo-build-sbf directly to avoid the anchor IDL generation bug
cargo build-sbf \
  --manifest-path programs/name-registry/Cargo.toml \
  --sbf-out-dir target/deploy

SO_PATH="$DEPLOY_DIR/${PROGRAM_NAME}.so"
if [ ! -f "$SO_PATH" ]; then
  echo "Error: Program binary not found at $SO_PATH"
  echo "  Available .so files:"
  ls -la "$DEPLOY_DIR"/*.so 2>/dev/null || echo "  (none)"
  exit 1
fi

echo "  Binary size: $(du -h "$SO_PATH" | awk '{print $1}')"

# 5. Deploy
echo ""
echo "[4/6] Deploying to devnet..."
solana program deploy \
  --program-id "$KEYPAIR_PATH" \
  "$SO_PATH" \
  --url devnet \
  --with-compute-unit-price 1

# 6. Verify
echo ""
echo "[5/6] Verifying deployment..."
solana program show "$PROGRAM_ID" --url devnet

# 7. Update config files
echo ""
echo "[6/6] Updating config files..."
sed -i "s/NAME_REGISTRY_PROGRAM_ID=.*/NAME_REGISTRY_PROGRAM_ID=$PROGRAM_ID/" "$ROOT_DIR/.env.example" 2>/dev/null || true
sed -i "s/name_registry = \".*\"/name_registry = \"$PROGRAM_ID\"/" "$ROOT_DIR/Anchor.toml" 2>/dev/null || true
sed -i "s/declare_id!(\".*\")/declare_id!(\"$PROGRAM_ID\")/" "$ROOT_DIR/programs/name-registry/src/lib.rs" 2>/dev/null || true

echo ""
echo "================================================"
echo "  Name Registry Deployment Complete!"
echo "  Program ID: $PROGRAM_ID"
echo "  Cluster:    devnet"
echo "================================================"
echo ""
echo "Next steps:"
echo "  1. Initialize the registry:"
echo "     npx tsx scripts/init-name-registry-devnet.ts"
echo ""
echo "  2. Register a test name:"
echo "     npx tsx scripts/init-name-registry-devnet.ts --register alice"
echo ""
echo "  3. Update your .env:"
echo "     NAME_REGISTRY_PROGRAM_ID=$PROGRAM_ID"
