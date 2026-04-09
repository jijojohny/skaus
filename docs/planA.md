# Plan A — Core Payment Rail

> Technical implementation plan for SKAUS's privacy-preserving payment infrastructure on Solana.

---

## 1. Architecture Overview

```
┌──────────────┐    Static URL / QR     ┌──────────────────┐
│  Sender      │ ──────────────────────► │  SKAUS Gateway   │
│  (any wallet)│   (no skaus install)    │  (off-chain API) │
└──────────────┘                         └────────┬─────────┘
                                                  │
                              Derive ephemeral    │  Encrypt routing
                              deposit address     │  metadata
                                                  ▼
                                         ┌────────────────────┐
                                         │   Stealth Pool      │
                                         │   (on-chain program)│
                                         └────────┬───────────┘
                                                  │
                                   ZK withdrawal  │  Nullifier-based
                                   proof verified │  unlinkability
                                                  ▼
                                         ┌────────────────────┐
                                         │  Recipient Wallet   │
                                         │  (private balance)  │
                                         └────────────────────┘
```

## 2. On-Chain Programs (Solana / Anchor)

### 2.1 Stealth Pool Program

**Program ID:** Deployed on Solana mainnet-beta (devnet for testnet)

**Core Accounts:**

| Account | Type | Description |
|---------|------|-------------|
| `StealthPool` | PDA | Global pool state — total deposits, current anonymity set size, fee accumulator |
| `DepositNote` | PDA seeded by `[pool, deposit_hash]` | Individual deposit record — commitment hash, token mint, amount tier, timestamp |
| `NullifierRegistry` | PDA | Bitmap / sparse set tracking spent nullifiers to prevent double-withdrawals |
| `FeeVault` | Token Account | Protocol fee accumulator (configurable basis points) |

**Instructions:**

```rust
// 1. Deposit — callable by ANY Solana wallet (no skaus account needed)
pub fn deposit(
    ctx: Context<Deposit>,
    amount: u64,
    commitment: [u8; 32],   // Pedersen commitment: H(secret, nullifier, amount)
    encrypted_note: Vec<u8>, // ChaCha20-Poly1305 encrypted routing metadata
    token_mint: Pubkey,      // USDC mint or SOL (native)
) -> Result<()>;

// 2. Withdraw — callable only with valid ZK proof
pub fn withdraw(
    ctx: Context<Withdraw>,
    proof: ZkProof,          // Groth16 or PLONK proof
    nullifier_hash: [u8; 32],
    recipient: Pubkey,       // Can be a fresh wallet each time
    amount: u64,
    merkle_root: [u8; 32],  // Root at time of deposit (for inclusion proof)
) -> Result<()>;

// 3. Admin — governance-controlled
pub fn update_pool_config(
    ctx: Context<AdminUpdate>,
    fee_bps: Option<u16>,
    min_deposit: Option<u64>,
    max_deposit: Option<u64>,
) -> Result<()>;
```

### 2.2 Commitment Scheme

Each deposit produces a **Pedersen commitment**:

```
commitment = PedersenHash(secret || nullifier || amount || token_mint)
```

- `secret`: 32-byte random, known only to recipient
- `nullifier`: 32-byte random, derived from recipient's stealth key + deposit index
- `amount`: deposit amount (fixed tiers for stronger anonymity: 10, 100, 1000 USDC)
- `token_mint`: SPL token mint address

Commitments are inserted into an **incremental Merkle tree** (depth 20 = ~1M leaves) stored via ZK Compression state.

### 2.3 ZK Withdrawal Circuit

**Circuit (Circom / Halo2):**

```
Public Inputs:
  - merkle_root          // Which state root we're proving against
  - nullifier_hash       // Hash of nullifier to prevent double-spend
  - recipient            // Destination pubkey
  - amount               // Withdrawal amount
  - fee                  // Protocol fee deducted

Private Inputs (witness):
  - secret               // Known only to recipient
  - nullifier            // Pre-image of nullifier_hash
  - merkle_path[20]      // Sibling hashes for inclusion proof
  - path_indices[20]     // Left/right indicators

Constraints:
  1. commitment = PedersenHash(secret || nullifier || amount || token_mint)
  2. nullifier_hash = Poseidon(nullifier)
  3. MerkleProof(commitment, merkle_path, path_indices) == merkle_root
  4. amount > fee
  5. RangeCheck(amount, 64 bits)
```

**Proof System Selection:**

| System | Proof Size | Verification Cost | Prover Time | Recommendation |
|--------|-----------|-------------------|-------------|----------------|
| Groth16 | 128 bytes | ~200K CU | 2-5s (client) | **MVP — smallest on-chain footprint** |
| PLONK | 400 bytes | ~500K CU | 1-3s (client) | V2 — no trusted setup |
| Halo2 | 500 bytes | ~600K CU | 1-2s (client) | V3 — recursive composition |

**MVP choice: Groth16** via `snarkjs` WASM prover in browser, with a one-time trusted setup ceremony (Powers of Tau + phase-2 contribution).

### 2.4 On-Chain Verification

Use the **Solana groth16-solana** verifier (or custom via `alt_bn128` syscalls):

```rust
use groth16_solana::Groth16Verifier;

pub fn verify_withdrawal(proof: &ZkProof, public_inputs: &[u8; 256]) -> bool {
    let vk = include_bytes!("../keys/verification_key.bin");
    Groth16Verifier::new(vk)
        .verify(proof, public_inputs)
        .is_ok()
}
```

Solana's `alt_bn128_*` precompiles (enabled since v1.16) provide native BN254 curve operations at ~100K CU per pairing, making Groth16 verification feasible within a single transaction.

## 3. Universal Pay Link (Off-Chain Gateway)

### 3.1 Link Structure

```
https://skaus.pay/{username}
https://skaus.pay/{username}?amount=50&token=USDC&memo=invoice-42
```

**QR encodes:**
```json
{
  "v": 1,
  "recipient_meta_address": "base58_stealth_meta_address",
  "pool": "pool_program_id",
  "network": "mainnet-beta",
  "amount": null,
  "token": "USDC",
  "memo_encrypted": "base64_chacha20_ciphertext"
}
```

### 3.2 Sender Flow (No SKAUS Install Required)

1. Sender scans QR or clicks link → lands on SKAUS web app
2. Web app derives **ephemeral deposit address** from recipient's stealth meta-address:
   ```
   ephemeral_pubkey = recipient_scan_key * sender_ephemeral_secret
   deposit_tag = Hash(shared_secret || deposit_index)
   ```
3. Sender connects **any Solana wallet** (Phantom, Solflare, Backpack, etc.)
4. Web app constructs `deposit` transaction with:
   - Commitment (computed client-side)
   - Encrypted note (recipient's scan key encrypts routing data)
5. Sender signs and submits — single standard Solana transaction
6. Sender receives confirmation; no further interaction needed

### 3.3 Recipient Flow

1. Recipient's SKAUS client scans pool for new `DepositNote` accounts
2. Tries decrypting each note with their scan private key
3. Successfully decrypted notes reveal: `secret`, `nullifier`, `amount`
4. Recipient can withdraw at any time by generating a ZK proof
5. Withdrawal goes to a **fresh wallet** (unlinkable to the pay link)

## 4. Compliance Viewport (Minimum Viable)

### 4.1 Viewing Key Architecture

```
Recipient Key Hierarchy:
├── Master Key (ed25519)
│   ├── Scan Key (for detecting incoming deposits)
│   ├── Spend Key (for authorizing withdrawals)
│   └── View Key (for selective disclosure)
│       ├── Full View Key → sees all amounts + counterparties
│       └── Scoped View Key → sees only specific time range or amount range
```

### 4.2 Compliance Artifacts

| Artifact | What it proves | Who can generate |
|----------|---------------|-----------------|
| **Viewing Credential** | Auditor can decrypt deposit notes for a specific recipient in a time window | Recipient issues to auditor |
| **ZK Proof of Rule** | "Total withdrawals in period P ≤ limit L" without revealing individual txns | Recipient generates, anyone verifies |
| **Attestation Bundle** | Package of viewing credential + proofs for a specific compliance request | Recipient compiles on-demand |

### 4.3 Implementation

```typescript
// Recipient issues a scoped viewing key
function issueViewingCredential(
  recipientMasterKey: Keypair,
  auditorPubkey: PublicKey,
  scope: {
    startTime: number;
    endTime: number;
    tokenMints?: PublicKey[];
    maxAmount?: number;
  }
): EncryptedViewingCredential {
  const scopedKey = deriveViewKey(recipientMasterKey, scope);
  return encryptForAuditor(scopedKey, auditorPubkey);
}

// ZK proof of aggregate rule
function proveWithdrawalLimit(
  withdrawals: Withdrawal[],
  limit: bigint,
  period: { start: number; end: number }
): ZkProof {
  // Circuit proves: sum(withdrawals in period) <= limit
  // Without revealing individual withdrawal amounts
  return generateProof(withdrawalLimitCircuit, {
    withdrawals,
    limit,
    period,
  });
}
```

## 5. Token Support

### 5.1 MVP Tokens

| Token | Mint | Pool |
|-------|------|------|
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | Dedicated USDC pool |
| SOL | Native | Dedicated SOL pool (wrapped internally) |

### 5.2 Pool-Per-Token Design

Each supported token gets its own Stealth Pool instance. This:
- Keeps anonymity sets token-specific (mixing USDC and SOL would leak info)
- Allows independent fee configurations per token
- Enables token-specific deposit tiers

### 5.3 Fixed Deposit Tiers (Anonymity Optimization)

| Tier | USDC Amount | SOL Amount |
|------|-------------|------------|
| Micro | 10 USDC | 0.1 SOL |
| Small | 100 USDC | 1 SOL |
| Medium | 1,000 USDC | 10 SOL |
| Large | 10,000 USDC | 100 SOL |

Deposits are split into tier-sized notes. A $250 deposit → 2×100 + 5×10 = 7 notes.

## 6. Fee Structure

| Fee Type | Amount | Recipient |
|----------|--------|-----------|
| Deposit Fee | 0 bps | — |
| Withdrawal Fee | 30 bps (0.3%) | Protocol treasury |
| Relayer Fee | 10 bps (0.1%) | Relayer operator |
| Solana Tx Fee | ~5000 lamports | Solana validators |

Relayer is optional: users can self-relay withdrawals, but using a relayer prevents linking the gas-paying wallet to the withdrawal destination.

## 7. Relayer Network

### 7.1 Purpose

Relayers submit withdrawal transactions on behalf of recipients so the recipient doesn't need SOL in their fresh withdrawal wallet (which would create a link).

### 7.2 Architecture

```
Recipient (browser)                   Relayer Service
    │                                      │
    ├─ Generate ZK proof ──────────────►  │
    ├─ Sign withdrawal intent ──────────► │
    │                                      ├─ Verify proof off-chain
    │                                      ├─ Submit tx to Solana
    │                                      ├─ Deduct relayer fee from withdrawal
    │                                      └─ Return tx signature
    │  ◄──────────────────────────────────┤
```

### 7.3 Relayer API

```
POST /relay/withdraw
{
  "proof": "base64_groth16_proof",
  "public_inputs": {
    "merkle_root": "...",
    "nullifier_hash": "...",
    "recipient": "...",
    "amount": "...",
    "fee": "..."
  }
}

Response: { "tx_signature": "...", "status": "confirmed" }
```

## 8. Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Double-spend | Nullifier registry — each deposit can only be withdrawn once |
| Front-running | Commitment scheme — deposit details are hidden until withdrawal |
| Timing analysis | Fixed deposit tiers + optional delayed withdrawal (Plan E) |
| Merkle root staleness | On-chain root history (last 100 roots accepted) |
| Relayer censorship | Multiple independent relayers; self-relay fallback |
| Quantum threat | Post-quantum migration path: Merkle-tree signatures for key hierarchy |

## 9. Development Phases

### Phase 1: Testnet MVP (Weeks 1-6)
- [ ] Stealth Pool program (deposit + withdraw instructions)
- [ ] Groth16 circuit (Circom) + trusted setup
- [ ] On-chain verifier integration
- [ ] Basic web app with wallet connect (sender flow)
- [ ] Recipient CLI for scanning + withdrawing
- [ ] USDC-only on devnet

### Phase 2: Pay Link + Relayer (Weeks 7-10)
- [ ] Universal pay link generation + QR
- [ ] Stealth meta-address derivation
- [ ] Relayer service (single operator)
- [ ] SOL support
- [ ] Basic compliance: viewing key issuance

### Phase 3: Production Hardening (Weeks 11-14)
- [ ] Formal audit of ZK circuits
- [ ] Formal audit of Solana program
- [ ] Merkle tree migration to ZK Compression
- [ ] Multi-relayer network
- [ ] Mainnet deployment

## 10. Dependencies & Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Smart Contracts | Anchor (Rust) | Solana-native, auditable |
| ZK Circuits | Circom 2.0 + snarkjs | Mature Groth16 tooling, WASM prover |
| On-chain Verifier | groth16-solana / alt_bn128 syscalls | Native Solana precompiles |
| State Compression | ZK Compression (Light Protocol) | Sub-cent cost for Merkle tree leaves |
| Encryption | ChaCha20-Poly1305 (libsodium) | Fast, AEAD, browser-compatible |
| Key Derivation | ECDH on Curve25519 | Compatible with Solana ed25519 keys |
| Backend API | Node.js / Fastify | Low-latency relayer + gateway |
| Frontend | Next.js + @solana/wallet-adapter | Universal wallet support |
| Indexer | Helius DAS / custom geyser plugin | Real-time deposit detection |
