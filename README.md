# SKAUS — Privacy-Preserving Payments on Solana

A privacy-preserving payment infrastructure built on Solana using stealth addresses, ZK proofs, and encrypted routing.

## Architecture

```
Sender (any wallet) → SKAUS Gateway → Stealth Pool (on-chain) → ZK Withdrawal → Recipient (fresh wallet)
```

- **Stealth Pool**: Shared liquidity pool with Pedersen commitments and ZK withdrawals
- **ZK Circuit**: Groth16 proof (Circom) for private withdrawal with nullifier-based double-spend prevention
- **Universal Pay Links**: Static URL/QR — sender needs no SKAUS install
- **Relayer Network**: Gas abstraction so recipients don't link wallets

## Project Structure

```
skaus/
├── programs/
│   └── stealth-pool/       # Anchor program (Rust) — deposit, withdraw, admin
├── circuits/
│   └── withdrawal/          # Circom ZK circuit — Groth16 withdrawal proof
├── packages/
│   ├── crypto/              # Stealth address, commitment, encryption (TypeScript)
│   └── types/               # Shared types and constants
├── apps/
│   ├── web/                 # Next.js web app — sender UI, recipient dashboard
│   └── gateway/             # Fastify API — relayer, pay link resolution
├── tests/                   # Integration tests
├── docs/                    # Architecture and plan documents
└── config/                  # Environment configurations
```

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm >= 9
- Rust + Cargo
- Solana CLI + Anchor CLI
- Circom 2.0 (for circuit compilation)

### Install Dependencies

```bash
pnpm install
```

### Build Programs

```bash
anchor build
```

### Run Tests

```bash
anchor test
```

### Start Development Servers

```bash
# Gateway API
pnpm dev:gateway

# Web App
pnpm dev:web
```

### Build ZK Circuits

```bash
pnpm build:circuits
```

## Development Phases (Plan A)

- [x] Stealth Pool program (deposit + withdraw instructions)
- [x] Groth16 circuit (Circom) + trusted setup scripts
- [x] On-chain verifier integration
- [x] Basic web app with wallet connect (sender flow)
- [x] Recipient dashboard for scanning + withdrawing
- [ ] USDC-only on devnet (requires Solana CLI + deployed program)

## Key Technologies

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Anchor (Rust) on Solana |
| ZK Circuits | Circom 2.0 + snarkjs (Groth16) |
| On-Chain Verifier | groth16-solana / alt_bn128 precompiles |
| Encryption | ChaCha20-Poly1305 (XChaCha20) |
| Key Derivation | ECDH on Curve25519 (x25519) |
| Backend | Fastify (Node.js) |
| Frontend | Next.js 14 + TailwindCSS |
| Wallet Support | @solana/wallet-adapter |

## License

Private — All rights reserved.
