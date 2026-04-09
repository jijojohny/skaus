#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROGRAM_NAME="stealth_pool"
DEPLOY_DIR="$ROOT_DIR/target/deploy"

echo "================================================"
echo "  SKAUS Stealth Pool — Devnet Deployment"
echo "================================================"

# 1. Check prerequisites
echo ""
echo "[1/7] Checking prerequisites..."
command -v solana >/dev/null 2>&1 || { echo "Error: solana CLI not found"; exit 1; }
command -v anchor >/dev/null 2>&1 || { echo "Error: anchor CLI not found"; exit 1; }

CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $NF}')
echo "  Solana cluster: $CLUSTER"

if [[ "$CLUSTER" != *"devnet"* ]]; then
  echo "  Switching to devnet..."
  solana config set --url devnet
fi

WALLET=$(solana config get | grep "Keypair Path" | awk '{print $NF}')
echo "  Wallet: $WALLET"

BALANCE=$(solana balance --lamports 2>/dev/null || echo "0")
echo "  Balance: $BALANCE"

if [[ $(echo "$BALANCE" | awk '{print $1}') -lt 2000000000 ]]; then
  echo "  Warning: Balance low. Requesting airdrop..."
  solana airdrop 2 || echo "  Airdrop may have failed (rate limited). Ensure you have >= 2 SOL."
fi

# 2. Build the program with devnet-mock feature
echo ""
echo "[2/7] Building program..."
cd "$ROOT_DIR"
anchor build --no-idl -- --features devnet-mock

# 3. Get program keypair
echo ""
echo "[3/7] Checking program keypair..."
KEYPAIR_PATH="$DEPLOY_DIR/${PROGRAM_NAME}-keypair.json"
if [ ! -f "$KEYPAIR_PATH" ]; then
  echo "  No program keypair found. Generating one..."
  solana-keygen new --no-bip39-passphrase -o "$KEYPAIR_PATH"
fi

PROGRAM_ID=$(solana-keygen pubkey "$KEYPAIR_PATH")
echo "  Program ID: $PROGRAM_ID"

# 4. Update Anchor.toml with the program ID
echo ""
echo "[4/7] Syncing program ID in Anchor.toml..."
anchor keys sync 2>/dev/null || true
echo "  Done"

# 5. Rebuild with correct program ID if needed
DECLARED_ID=$(grep "declare_id!" "$ROOT_DIR/programs/stealth-pool/src/lib.rs" | head -1 | sed 's/.*"\(.*\)".*/\1/')
if [ "$DECLARED_ID" != "$PROGRAM_ID" ]; then
  echo ""
  echo "  Program ID mismatch — rebuilding..."
  echo "  Declared: $DECLARED_ID"
  echo "  Actual:   $PROGRAM_ID"
  # Update declare_id in lib.rs
  sed -i "s/declare_id!(\".*\")/declare_id!(\"$PROGRAM_ID\")/" "$ROOT_DIR/programs/stealth-pool/src/lib.rs"
  anchor build --no-idl -- --features devnet-mock
fi

# 6. Deploy
echo ""
echo "[5/7] Deploying to devnet..."
SO_PATH="$DEPLOY_DIR/${PROGRAM_NAME}.so"
if [ ! -f "$SO_PATH" ]; then
  echo "Error: Program binary not found at $SO_PATH"
  exit 1
fi

echo "  Binary size: $(du -h "$SO_PATH" | awk '{print $1}')"
solana program deploy \
  --program-id "$KEYPAIR_PATH" \
  "$SO_PATH" \
  --url devnet \
  --with-compute-unit-price 1

# 7. Verify
echo ""
echo "[6/7] Verifying deployment..."
solana program show "$PROGRAM_ID" --url devnet

# 8. Update config files
echo ""
echo "[7/7] Updating config files..."

# Update .env.example
sed -i "s/STEALTH_POOL_PROGRAM_ID=.*/STEALTH_POOL_PROGRAM_ID=$PROGRAM_ID/" "$ROOT_DIR/.env.example" 2>/dev/null || true
sed -i "s/STEALTH_POOL_PROGRAM_ID=.*/STEALTH_POOL_PROGRAM_ID=$PROGRAM_ID/" "$ROOT_DIR/config/.env.development" 2>/dev/null || true

echo ""
echo "================================================"
echo "  Deployment Complete!"
echo "  Program ID: $PROGRAM_ID"
echo "  Cluster:    devnet"
echo "================================================"
echo ""
echo "Next steps:"
echo "  1. Initialize a pool: Run the init script or use the SDK"
echo "  2. Set up the gateway: STEALTH_POOL_PROGRAM_ID=$PROGRAM_ID"
echo "  3. Run circuits setup:  cd circuits/withdrawal && pnpm setup"
echo "  4. Fund the relayer wallet for gas sponsoring"
