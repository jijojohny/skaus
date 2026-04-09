# SKAUS — End-to-End Production Architecture

> Complete system architecture for a privacy-preserving payment and identity layer on Solana.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Map](#2-component-map)
3. [Data Flow](#3-data-flow)
4. [Technology Stack](#4-technology-stack)
5. [On-Chain Programs](#5-on-chain-programs)
6. [Off-Chain Services](#6-off-chain-services)
7. [ZK Circuit Pipeline](#7-zk-circuit-pipeline)
8. [Key Hierarchy & Cryptography](#8-key-hierarchy--cryptography)
9. [Infrastructure & Deployment](#9-infrastructure--deployment)
10. [Cross-Plan Dependencies](#10-cross-plan-dependencies)
11. [Security Architecture](#11-security-architecture)
12. [Production Roadmap](#12-production-roadmap)
13. [Cost Analysis](#13-cost-analysis)
14. [Risk Matrix](#14-risk-matrix)

---

## 1. System Overview

SKAUS is a **privacy-preserving payment and identity layer** on Solana that delivers:

- **Independent privacy**: Recipients have shielded balances regardless of sender onboarding status.
- **Stealth Pool architecture**: Shared address pools + encrypted routing + ZK withdrawals make transactions cryptographically unlinkable.
- **Creator-first UX**: Link-in-bio payment experience as simple as sharing a URL.
- **Programmable compliance**: Opt-in disclosure, not default surveillance.

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Privacy by default** | All payments route through Stealth Pool; no direct wallet-to-wallet transfers |
| **Sender simplicity** | Any Solana wallet works; no SKAUS install for payers |
| **Compliance as opt-in** | Viewing keys and disclosure packages, never mandatory surveillance |
| **Transparency where it matters** | Public anonymity set metrics, monthly transparency reports |
| **Cost efficiency** | ZK Compression for profiles + Merkle trees at sub-cent costs |

---

## 2. Component Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SKAUS SYSTEM MAP                               │
│                                                                         │
│  ════════════════════════ ON-CHAIN (Solana) ════════════════════════    │
│                                                                         │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐    │
│  │ Stealth Pool   │  │ Name Registry  │  │ Delayed Withdrawal     │    │
│  │ Program (A)    │  │ Program (B)    │  │ Program (E)            │    │
│  │                │  │                │  │                        │    │
│  │ • deposit()    │  │ • register()   │  │ • request_delayed()    │    │
│  │ • withdraw()   │  │ • rotate()     │  │ • execute_delayed()    │    │
│  │ • verify_zk()  │  │ • resolve()    │  │ • cancel_delayed()     │    │
│  └───────┬────────┘  └───────┬────────┘  └───────────┬────────────┘    │
│          │                   │                        │                  │
│  ┌───────┴───────────────────┴────────────────────────┴──────────┐     │
│  │                    Solana Runtime (SVM)                         │     │
│  │     alt_bn128 precompiles │ ZK Compression (Light Protocol)    │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  ════════════════════════ OFF-CHAIN ═══════════════════════════════     │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ Gateway API  │  │ Relayer      │  │ Indexer      │  │ Policy   │  │
│  │ (Fastify)    │  │ Service      │  │ Service      │  │ Engine   │  │
│  │              │  │              │  │              │  │ (Lit)    │  │
│  │ • Pay links  │  │ • Submit tx  │  │ • Deposits   │  │          │  │
│  │ • Profiles   │  │ • Gas abstxn │  │ • Names      │  │ • ACC    │  │
│  │ • Requests   │  │ • Fee deduct │  │ • Profiles   │  │ • PKP    │  │
│  │ • Dashboard  │  │              │  │ • Metrics    │  │ • Actions│  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬─────┘  │
│         │                 │                  │                │        │
│  ┌──────┴─────────────────┴──────────────────┴────────────────┴──┐    │
│  │                    Shared Infrastructure                       │    │
│  │   PostgreSQL │ Redis │ BullMQ │ Helius │ IPFS/Arweave         │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ════════════════════════ CLIENT ══════════════════════════════════     │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ Web App      │  │ Embed Widget │  │ Creator      │                  │
│  │ (Next.js)    │  │ (Preact)     │  │ Dashboard    │                  │
│  │              │  │              │  │ (Next.js)    │                  │
│  │ • Pay page   │  │ • Tip jar    │  │              │                  │
│  │ • Profile    │  │ • <10KB      │  │ • Earnings   │                  │
│  │ • ZK prover  │  │              │  │ • Webhooks   │                  │
│  │   (WASM)     │  │              │  │ • Privacy    │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow

### 3.1 Payment Flow (Sender → Recipient)

```
Step 1: Sender visits skaus.pay/alice
         │
Step 2:  ├─► Gateway resolves "alice" → NameRecord → StealthMetaAddress
         │
Step 3:  ├─► Web app derives ephemeral deposit key via ECDH
         │   shared_secret = ECDH(sender_ephemeral, alice_scan_pubkey)
         │   deposit_key = alice_spend_pubkey + Hash(shared_secret) * G
         │
Step 4:  ├─► Web app computes Pedersen commitment
         │   commitment = PedersenHash(secret || nullifier || amount || mint)
         │
Step 5:  ├─► Web app encrypts routing metadata with Lit (Plan C)
         │   encrypted_note = Lit.encrypt(metadata, recipient_only_ACC)
         │
Step 6:  ├─► Sender signs deposit transaction (any Solana wallet)
         │   StealthPool.deposit(amount, commitment, encrypted_note, mint)
         │
Step 7:  ├─► Transaction confirmed on Solana
         │
Step 8:  ├─► Indexer detects new DepositNote
         │   Notification engine alerts recipient (Plan D)
         │
Step 9:  ├─► Recipient's client decrypts note via Lit
         │   Recovers: secret, nullifier, amount
         │
Step 10: └─► Recipient generates ZK proof and withdraws
             Option A: Instant withdrawal (0.4% fee)
             Option B: Delayed withdrawal (lower fee, Plan E)
             Option C: Batched withdrawal (next 6h window, Plan E)
```

### 3.2 Identity Resolution Flow

```
Input: "alice.skaus" or skaus.pay/alice
         │
         ├─► Compute PDA: seeds = ["name", Poseidon("alice")]
         │
         ├─► Fetch NameRecord on-chain
         │   Contains: StealthMetaAddress { scan_pubkey, spend_pubkey, version }
         │
         ├─► Fetch CompressedProfile via ZK Compression indexer
         │   Contains: display name, bio, payment config, tiers, links
         │
         └─► Render profile page with payment widget
```

### 3.3 Compliance Flow

```
Recipient decides to disclose (opt-in)
         │
         ├─► Select disclosure scope (time range, tokens, level)
         │
         ├─► Generate disclosure package (Plan C)
         │   • Decrypt own deposit notes for the period
         │   • Generate aggregate ZK proofs
         │   • Package at chosen disclosure level
         │
         ├─► Encrypt package for auditor via Lit
         │   ACC: auditor_pubkey AND before_expiry
         │
         └─► Deliver encrypted package to auditor
             Auditor decrypts via Lit → verifies proofs → completes audit
```

---

## 4. Technology Stack

### 4.1 Core Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Blockchain** | Solana | 1.18+ | Settlement, program execution |
| **Smart Contracts** | Anchor | 0.30+ | Program framework (Rust) |
| **State Compression** | Light Protocol (ZK Compression) | Latest | Sub-cent profile storage |
| **ZK Circuits** | Circom 2.0 | 2.1+ | Groth16 withdrawal circuits |
| **ZK Prover** | snarkjs | 0.7+ | WASM-based client-side proving |
| **On-Chain Verifier** | groth16-solana + alt_bn128 | — | Native Solana ZK verification |
| **Encryption** | Lit Protocol (Datil) | Latest | Threshold encryption, ACCs, PKPs |
| **Key Derivation** | ECDH (Curve25519) | — | Stealth address derivation |
| **Symmetric Encryption** | ChaCha20-Poly1305 | — | Deposit note encryption |

### 4.2 Backend Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **API Server** | Node.js + Fastify | Low-latency gateway + relayer |
| **Database** | PostgreSQL 16 | Payment requests, webhook configs, encrypted data |
| **Cache** | Redis 7 | Metrics, sessions, rate limiting |
| **Queue** | BullMQ | Webhook delivery, batch processing |
| **Indexer** | Helius DAS + custom geyser plugin | Real-time on-chain event monitoring |
| **Search** | Meilisearch | Profile discovery (future) |
| **Object Storage** | IPFS / Arweave | Profile media, transparency reports |

### 4.3 Frontend Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Web App** | Next.js 14 (App Router) | SSR profile pages, payment UI |
| **Wallet Adapter** | @solana/wallet-adapter | Universal wallet connection |
| **Styling** | TailwindCSS | Responsive, modern UI |
| **ZK Prover** | snarkjs WASM | Client-side proof generation |
| **Embed Widget** | Preact | Lightweight tip jar widget (<10KB) |
| **Charts** | Recharts | Anonymity set dashboard |

---

## 5. On-Chain Programs

### 5.1 Program Inventory

| Program | Purpose | Plan | Estimated Size |
|---------|---------|------|---------------|
| `skaus_stealth_pool` | Core deposit/withdraw with ZK verification | A | ~3,000 lines Rust |
| `skaus_name_registry` | @name.skaus registration and resolution | B | ~1,500 lines Rust |
| `skaus_delayed_withdraw` | Time-delayed and batched withdrawals | E | ~1,200 lines Rust |
| `skaus_policy` | On-chain withdrawal policies and limits | C, E | ~800 lines Rust |

### 5.2 Program Interaction Diagram

```
                    ┌─────────────────────┐
                    │  skaus_name_registry │
                    │  (resolve name →     │
                    │   stealth meta addr) │
                    └──────────┬──────────┘
                               │ provides deposit target
                               ▼
┌──────────────────┐    ┌─────────────────────┐    ┌────────────────────┐
│  skaus_policy    │───►│  skaus_stealth_pool  │◄───│ skaus_delayed_     │
│  (enforce limits,│    │  (deposit, withdraw, │    │ withdraw           │
│   jurisdiction)  │    │   verify ZK proofs)  │    │ (scheduled exits)  │
└──────────────────┘    └─────────────────────┘    └────────────────────┘
```

### 5.3 Account Space Budget

| Account Type | Size (bytes) | Rent (SOL) | Compressed? |
|-------------|-------------|-----------|------------|
| StealthPool (global) | 512 | 0.004 | No (frequently read) |
| DepositNote | 256 | 0.002 | Yes (via ZK Compression) |
| NullifierRegistry | 32KB (bitmap) | 0.23 | No (frequently written) |
| NameRecord | 384 | 0.003 | No (frequently resolved) |
| CompressedProfile | 2-8 KB | ~$0.0001 | Yes (ZK Compression) |
| DelayedWithdrawal | 512 | 0.004 | No (temporary, reclaimed) |
| WithdrawalPolicy | 256 | 0.002 | No (rarely updated) |

---

## 6. Off-Chain Services

### 6.1 Service Architecture

```
                         ┌─────────────┐
                         │  Load        │
                         │  Balancer    │
                         │  (Nginx/CF)  │
                         └──────┬──────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
        ┌───────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
        │ Gateway API  │ │ Gateway API│ │ Gateway API │
        │ Instance 1   │ │ Instance 2 │ │ Instance 3  │
        └───────┬──────┘ └─────┬──────┘ └──────┬──────┘
                │               │               │
        ┌───────┴───────────────┴───────────────┴────────┐
        │                 Shared State                     │
        │  ┌──────────┐  ┌───────┐  ┌──────────────────┐ │
        │  │PostgreSQL│  │ Redis │  │ BullMQ Workers   │ │
        │  │ (primary │  │ (cache│  │ (webhook, batch, │ │
        │  │  + read  │  │  rate │  │  notification)   │ │
        │  │  replicas)│  │  limit)│  │                  │ │
        │  └──────────┘  └───────┘  └──────────────────┘ │
        └────────────────────────────────────────────────┘
                                │
                        ┌───────▼───────┐
                        │   Indexer      │
                        │   (Helius +   │
                        │    custom)    │
                        └───────────────┘
```

### 6.2 Service Responsibilities

| Service | Responsibilities | Scaling Strategy |
|---------|-----------------|-----------------|
| **Gateway API** | Pay link resolution, profile SSR, payment request CRUD, dashboard API | Horizontal (stateless, behind LB) |
| **Relayer Service** | Submit withdrawal txs, gas abstraction, fee deduction | Horizontal (per-region) |
| **Indexer Service** | Monitor on-chain events, update metrics, trigger notifications | Single leader + follower (event ordering) |
| **Webhook Worker** | Deliver webhooks with retry, dead letter processing | Horizontal (BullMQ consumers) |
| **Batch Crank** | Execute delayed withdrawals at scheduled windows | Single per window (leader election) |
| **Metrics Aggregator** | Compute privacy scores, pool health, anomaly detection | Single (periodic computation) |

---

## 7. ZK Circuit Pipeline

### 7.1 Circuit Inventory

| Circuit | Purpose | Plan | Public Inputs | Est. Constraints |
|---------|---------|------|--------------|-----------------|
| `withdrawal` | Prove deposit ownership + nullifier | A | merkle_root, nullifier_hash, recipient, amount, fee | ~25,000 |
| `withdrawal_cap` | Prove total < limit without revealing amounts | C | policy_hash, period, compliance_result | ~15,000 |
| `badge_threshold` | Prove payment ≥ tier minimum | D | tier_threshold, creator_hash | ~5,000 |
| `aggregate_sum` | Prove sum of values for disclosure | C | expected_sum, period | ~20,000 |

### 7.2 Trusted Setup

```
Phase 1: Powers of Tau (BN254)
├── Use existing community ceremony (Hermez/Tornado)
├── Contributes to security of all Groth16 circuits
└── One-time, reusable across circuits

Phase 2: Circuit-specific
├── Per-circuit contribution ceremony
├── Minimum 10 independent contributors
├── All contributions logged + verified
└── Final ceremony hash published on-chain
```

### 7.3 Prover Performance Targets

| Circuit | Client-Side (WASM) | Server-Side (native) | Proof Size |
|---------|-------------------|---------------------|-----------|
| `withdrawal` | 3-5 seconds | 0.5-1 second | 128 bytes |
| `withdrawal_cap` | 2-3 seconds | 0.3-0.5 second | 128 bytes |
| `badge_threshold` | 1-2 seconds | 0.1-0.3 second | 128 bytes |
| `aggregate_sum` | 2-4 seconds | 0.4-0.8 second | 128 bytes |

### 7.4 Verification Costs (On-Chain)

| Operation | Compute Units | Transaction Size |
|-----------|-------------|-----------------|
| Groth16 verify (alt_bn128) | ~200,000 CU | ~400 bytes |
| Merkle proof verify (Poseidon) | ~50,000 CU | ~640 bytes (depth 20) |
| Nullifier check (bitmap) | ~5,000 CU | ~40 bytes |
| **Total withdrawal tx** | **~255,000 CU** | **~1,100 bytes** |

Fits within Solana's 1.4M CU per-transaction limit with room to spare.

---

## 8. Key Hierarchy & Cryptography

### 8.1 Recipient Key Tree

```
Master Seed (BIP-39 mnemonic or ed25519 keypair)
│
├── Solana Authority Key (ed25519)
│   └── Signs on-chain transactions, owns NameRecord
│
├── Scan Key (Curve25519)
│   └── Detects incoming deposits (ECDH with sender ephemeral)
│   └── Per-link derivation: scan_key + Hash("skaus_path" || index) * G
│
├── Spend Key (Curve25519)
│   └── Authorizes withdrawals (used in ZK circuit witness)
│   └── Per-link derivation: spend_key + Hash("skaus_path" || index) * G
│
├── View Key (derived from Scan Key)
│   ├── Full View Key → all deposit details for all time
│   └── Scoped View Keys → limited by time range / amount / token
│
└── Encryption Key (X25519, derived from master)
    └── Encrypts/decrypts off-chain data (payment requests, profile drafts)
```

### 8.2 Stealth Address Protocol

```
Sender side:
  1. Generate ephemeral keypair: (r, R = r*G)
  2. Compute shared secret: S = r * scan_pubkey
  3. Derive deposit key: P = spend_pubkey + Hash(S) * G
  4. Publish R as part of encrypted note

Recipient side:
  1. For each new deposit, try: S' = scan_privkey * R
  2. Compute: P' = spend_pubkey + Hash(S') * G
  3. If P' matches deposit commitment's pubkey → this deposit is for us
  4. Compute spend private key: p = spend_privkey + Hash(S')
```

### 8.3 Encryption Layers

| Layer | Algorithm | Key | Protects |
|-------|----------|-----|----------|
| Deposit note | ChaCha20-Poly1305 | ECDH shared secret | Routing metadata (sender → recipient) |
| Lit threshold | AES-256-GCM (Lit internal) | Distributed across Lit nodes | Access-controlled decryption |
| Off-chain storage | ChaCha20-Poly1305 | Derived from master key | Payment requests, profile drafts |
| Disclosure packages | Lit threshold encryption | ACC-controlled | Audit bundles for specific auditors |
| Webhook secrets | HMAC-SHA256 | Per-webhook random key | Webhook payload integrity |

---

## 9. Infrastructure & Deployment

### 9.1 Production Infrastructure

| Component | Provider | Specs | Redundancy |
|-----------|---------|-------|-----------|
| **API Servers** | AWS ECS / Fly.io | 2 vCPU, 4GB RAM × 3 | Multi-AZ, auto-scaling |
| **PostgreSQL** | AWS RDS / Supabase | db.r6g.large, 100GB | Primary + read replica |
| **Redis** | AWS ElastiCache | cache.r6g.large | Cluster mode, 2 replicas |
| **Solana RPC** | Helius / Triton | Dedicated node | Multi-provider failover |
| **CDN** | Cloudflare | — | Global edge |
| **DNS** | Cloudflare | — | DDoS protection |
| **Monitoring** | Grafana + Prometheus | — | — |
| **Logging** | Datadog / Loki | — | 30-day retention |
| **Secrets** | AWS Secrets Manager | — | Encrypted at rest |

### 9.2 CI/CD Pipeline

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Git Push │────►│  CI      │────►│  Staging  │────►│  Mainnet │
│  (GitHub) │     │  (GH     │     │  Deploy   │     │  Deploy  │
│           │     │  Actions)│     │  (devnet) │     │  (manual)│
└──────────┘     └──────────┘     └──────────┘     └──────────┘

CI Steps:
1. Lint + typecheck (Rust + TypeScript)
2. Unit tests (anchor test, jest)
3. Circuit tests (circom compile + witness gen)
4. Integration tests (local validator)
5. Build artifacts (programs, frontend, circuits)
6. Deploy to devnet staging
7. Run E2E tests against devnet
8. Manual approval → mainnet deploy
```

### 9.3 Solana Program Deployment

```bash
# Build verified (for audit trail)
anchor build --verifiable

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet (multisig-controlled)
anchor deploy --provider.cluster mainnet-beta \
  --program-id <PROGRAM_ID> \
  --upgrade-authority <MULTISIG_ADDRESS>
```

---

## 10. Cross-Plan Dependencies

```
                Plan A                    Plan B
            (Core Payment)            (Identity)
                 │                        │
                 │  Stealth Pool ◄────────┘ Name resolves to
                 │  provides deposit         stealth meta-address
                 │  + withdraw
                 │
          ┌──────┼──────┐
          │      │      │
          ▼      ▼      ▼
       Plan C  Plan D  Plan E
      (Policy) (Creator)(Trust)
          │      │      │
          │      │      │
          └──────┼──────┘
                 │
          All depend on
          Plan A pool
          primitives
```

### Dependency Matrix

| Feature | Depends On | Blocks |
|---------|-----------|--------|
| **A1: Stealth Pool** | Solana runtime, ZK circuits | Everything |
| **A2: ZK Withdrawal** | A1, Circom circuits | B3 (payment requests), C3 (disclosure), E3 (delayed exits) |
| **A3: Relayer** | A2 | D1 (tip jar UX, gas abstraction) |
| **B1: Name Registry** | Solana runtime | B2 (profiles), B3 (payment requests) |
| **B2: Compressed Profiles** | B1, Light Protocol | D1 (tip jar), D5 (dashboard) |
| **B3: Payment Requests** | A1, B1 | D3 (notification triggers) |
| **C1: Lit Encryption** | Lit SDK | C2 (disclosure), C3 (policies) |
| **C2: Disclosure Packages** | C1, A2 | — (opt-in feature) |
| **C3: Policy Enforcement** | C1, A1 | E1 (rate limits) |
| **D1: Tip Jar** | A1, B2, A3 | D2 (embeddable widget) |
| **D2: Webhooks** | A1 indexer events | — |
| **D3: Badges** | A1, Metaplex Bubblegum | — |
| **E1: Anonymity Metrics** | A1 events | E2 (dashboard UI) |
| **E2: Delayed Exits** | A2 | — |
| **E3: Risk Controls** | A1 | — |

---

## 11. Security Architecture

### 11.1 Threat Model

| Threat Category | Specific Threat | Likelihood | Impact | Mitigation |
|----------------|----------------|------------|--------|-----------|
| **Smart Contract** | Reentrancy / logic bug | Medium | Critical | Anchor framework, formal audit |
| **ZK Circuits** | Soundness violation | Low | Critical | Trusted setup ceremony, audit, formal verification |
| **Key Management** | Recipient key compromise | Medium | High | Key derivation from master seed, hardware wallet support |
| **Privacy** | Timing analysis | High | Medium | Delayed exits, batched windows, deposit tiers |
| **Privacy** | Amount correlation | Medium | Medium | Fixed deposit tiers, split deposits |
| **Privacy** | Graph analysis (on-chain) | Medium | Medium | Stealth addresses, pool architecture |
| **Availability** | Relayer downtime | Medium | Low | Self-relay fallback, multiple relayers |
| **Compliance** | Regulatory action | Medium | High | Viewing keys, disclosure packages, jurisdiction controls |
| **Infrastructure** | RPC node failure | Medium | Medium | Multi-provider failover (Helius + Triton) |
| **Ecosystem** | Lit Protocol downtime | Low | High | Fallback to direct ECDH encryption (degraded mode) |

### 11.2 Audit Plan

| Scope | Auditor Type | Timeline | Priority |
|-------|-------------|----------|----------|
| Stealth Pool program | Smart contract auditor (Sec3, OtterSec, Neodyme) | Before mainnet | P0 |
| ZK withdrawal circuit | ZK-specialized auditor | Before mainnet | P0 |
| Cryptographic protocol | Academic review (stealth address + commitment scheme) | Pre-launch | P0 |
| Off-chain services | Penetration tester | Pre-launch | P1 |
| Frontend | Web security audit (XSS, CSRF, wallet interactions) | Pre-launch | P1 |
| Lit integration | Integration review | Pre-launch | P1 |

### 11.3 Incident Response

```
Level 1 (Info):     Log + monitor
Level 2 (Warning):  Alert team + investigate within 4h
Level 3 (Critical): Pause affected component + investigate immediately
Level 4 (Emergency): Pause all pools + war room + public comms within 1h

Emergency contacts: Protocol multisig (3-of-5)
Circuit breaker: On-chain admin can pause deposit/withdraw instructions
```

---

## 12. Production Roadmap

### Phase 0: Foundation (Weeks 1-4)

| Task | Plan | Owner |
|------|------|-------|
| Repo setup, CI/CD, linting, test harness | — | Infra |
| Circom circuit: withdrawal proof | A | ZK |
| Anchor program: StealthPool skeleton | A | Smart Contract |
| Anchor program: NameRegistry skeleton | B | Smart Contract |
| Next.js app scaffold + wallet adapter | — | Frontend |

### Phase 1: Core Payment MVP (Weeks 5-10)

| Task | Plan | Owner |
|------|------|-------|
| StealthPool deposit + withdraw (USDC) | A | Smart Contract |
| Groth16 trusted setup + verifier integration | A | ZK |
| Stealth meta-address derivation (sender flow) | A | Frontend |
| Deposit scanning + decryption (recipient flow) | A | Backend |
| Basic pay link (skaus.pay/alice) | A, B | Frontend |
| Name registration + resolution | B | Smart Contract |
| Single relayer service | A | Backend |
| **Milestone: Devnet demo — send USDC privately via link** | | |

### Phase 2: Identity + Profiles (Weeks 11-14)

| Task | Plan | Owner |
|------|------|-------|
| ZK Compression integration (Light Protocol) | B | Smart Contract |
| Compressed profile CRUD | B | Backend |
| SSR profile page rendering | B | Frontend |
| Payment request creation + link generation | B | Backend |
| Per-link deposit paths | B | Smart Contract |
| Lit SDK integration + basic encryption | C | Backend |
| **Milestone: Full link-in-bio with profile + payment** | | |

### Phase 3: Policy + Creator (Weeks 15-20)

| Task | Plan | Owner |
|------|------|-------|
| Lit-gated deposit metadata encryption | C | Backend |
| Viewing key issuance + scoped disclosure | C | Backend |
| Tip jar configuration + UI | D | Frontend |
| Webhook delivery engine | D | Backend |
| Fee breakdown display | D | Frontend |
| SOL pool support | A | Smart Contract |
| **Milestone: Creator-ready product with notifications** | | |

### Phase 4: Trust + Hardening (Weeks 21-26)

| Task | Plan | Owner |
|------|------|-------|
| Anonymity set metrics + dashboard | E | Full-stack |
| Delayed withdrawal program + UI | E | Smart Contract + Frontend |
| Batched exit windows + crank | E | Backend |
| Amount caps + jurisdiction controls | E | Smart Contract |
| Disclosure package generator | C | Backend |
| Supporter badge (compressed NFT) | D | Smart Contract |
| **Milestone: Auditable, trust-signaling product** | | |

### Phase 5: Audit + Launch (Weeks 27-32)

| Task | Plan | Owner |
|------|------|-------|
| Smart contract audit (StealthPool, NameRegistry) | A, B | External |
| ZK circuit audit | A | External |
| Penetration testing | — | External |
| Transparency report v1 | E | Backend |
| Embeddable widget | D | Frontend |
| Multi-relayer network | A | Backend |
| Mainnet deployment | — | Infra |
| **Milestone: Production launch on Solana mainnet** | | |

---

## 13. Cost Analysis

### 13.1 Per-Transaction Costs

| Operation | Solana Fee | State Cost | Total |
|-----------|-----------|-----------|-------|
| Deposit (into pool) | ~0.000005 SOL | ~$0.0001 (compressed note) | ~$0.001 |
| Instant Withdrawal | ~0.000005 SOL | Nullifier bitmap update | ~$0.001 |
| Delayed Withdrawal Request | ~0.000005 SOL | 0.004 SOL rent (reclaimed) | ~$0.001 |
| Name Registration | ~0.000005 SOL | 0.003 SOL rent | ~$0.45 (one-time) |
| Profile Update | ~0.000005 SOL | ~$0.0001 (compressed) | ~$0.001 |

### 13.2 Infrastructure Costs (Monthly Estimate)

| Component | Monthly Cost |
|-----------|-------------|
| API Servers (3× ECS) | $150-300 |
| PostgreSQL (RDS) | $100-200 |
| Redis (ElastiCache) | $80-150 |
| Helius RPC (dedicated) | $200-500 |
| Cloudflare (CDN + DNS) | $20-50 |
| Monitoring (Grafana Cloud) | $50-100 |
| Lit Protocol usage | ~$50-100 (based on decryption volume) |
| **Total** | **$650-1,400/month** |

### 13.3 One-Time Costs

| Item | Estimated Cost |
|------|---------------|
| Smart contract audit | $50,000-150,000 |
| ZK circuit audit | $30,000-80,000 |
| Trusted setup ceremony | ~$5,000 (infrastructure) |
| Penetration testing | $15,000-30,000 |
| **Total** | **$100,000-265,000** |

---

## 14. Risk Matrix

| Risk | Probability | Impact | Mitigation | Owner |
|------|------------|--------|-----------|-------|
| ZK circuit vulnerability | Low | Critical | Formal verification + audit | ZK Lead |
| Smart contract exploit | Medium | Critical | Anchor best practices + audit + bug bounty | SC Lead |
| Lit Protocol deprecation/downtime | Low | High | Abstraction layer; fallback to direct ECDH | Backend Lead |
| Light Protocol (ZK Compression) breaking changes | Medium | Medium | Pin SDK versions; maintain migration path | SC Lead |
| Regulatory crackdown on privacy tools | Medium | High | Compliance features (Plans C, E); legal counsel | Product Lead |
| Low anonymity set (chicken-and-egg) | High | Medium | Incentivize early deposits; fee discounts for delays | Growth Lead |
| Groth16 trusted setup compromise | Very Low | Critical | Use community ceremony; plan migration to PLONK | ZK Lead |
| Solana congestion / priority fees | Medium | Low | Priority fee estimation; retry logic | Backend Lead |
| Key management UX friction | High | Medium | Seed phrase education; hardware wallet support; social recovery (future) | Frontend Lead |
| Competitor launches first | Medium | Medium | Speed to market; differentiate on compliance + creator UX | Product Lead |

---

## Appendix: File Index

| Document | Path | Coverage |
|----------|------|---------|
| Feature Overview | `docs/plans.md` | High-level feature list (A-E) |
| Core Payment Rail | `docs/planA.md` | Stealth Pool, ZK circuits, pay links, relayer |
| Identity & Discovery | `docs/planB.md` | Name registry, compressed profiles, payment requests |
| Policy & Access Control | `docs/planC.md` | Lit encryption, disclosure packages, rate policies |
| Creator & Growth | `docs/planD.md` | Tip jars, webhooks, badges, stablecoin UX |
| Trust & Credibility | `docs/planE.md` | Anonymity metrics, delayed exits, risk controls |
| **System Architecture** | `docs/architecture.md` | **This document — end-to-end production blueprint** |
