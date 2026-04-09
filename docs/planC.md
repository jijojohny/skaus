# Plan C — Policy & Access Control (Lit Protocol)

> Technical implementation plan for programmable disclosure, encrypted routing, and policy enforcement using Lit Protocol on Solana.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    SKAUS Policy Layer (Lit Protocol)                  │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ Lit-Gated         │  │ Disclosure        │  │ Rate/Velocity     │  │
│  │ Decryption        │  │ Packages          │  │ Policy Engine     │  │
│  │                   │  │                   │  │                   │  │
│  │ • Encrypted       │  │ • One-click audit │  │ • Daily withdraw  │  │
│  │   routing meta    │  │   bundle          │  │   caps            │  │
│  │ • Conditional     │  │ • Proofs + logs   │  │ • Amount limits   │  │
│  │   access: who,    │  │ • Opt-in, not     │  │   per tier        │  │
│  │   when, what      │  │   default         │  │ • Jurisdiction    │  │
│  │ • Time-locked     │  │   surveillance    │  │   enforcement     │  │
│  │   release         │  │                   │  │                   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬──────────┘  │
│           │                     │                      │              │
│           └─────────────────────┼──────────────────────┘              │
│                                 │                                     │
│                    ┌────────────▼────────────┐                        │
│                    │  Lit Network (PKP +     │                        │
│                    │  Lit Actions)           │                        │
│                    └────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. Lit Protocol Integration

### 2.1 What Lit Protocol Provides

| Capability | How SKAUS Uses It |
|-----------|------------------|
| **Threshold Encryption** | Deposit routing metadata encrypted so only the recipient (or authorized party) can decrypt |
| **Access Control Conditions (ACCs)** | Programmable rules: "decrypt if holder of NFT X", "decrypt after timestamp T", "decrypt if auditor pubkey Y signs" |
| **Programmable Key Pairs (PKPs)** | Protocol-level keys for automated policy enforcement without trusting a single server |
| **Lit Actions** | Serverless functions run inside Lit nodes — execute policy checks before releasing decryption shares |

### 2.2 Lit Network Configuration

```typescript
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitNetwork } from "@lit-protocol/constants";

const litClient = new LitNodeClient({
  litNetwork: LitNetwork.DatilDev,    // DatilDev → Datil (mainnet) for prod
  debug: false,
});

await litClient.connect();
```

### 2.3 Authentication with Solana

```typescript
import { AuthMethodType } from "@lit-protocol/constants";
import { LitAuthClient } from "@lit-protocol/lit-auth-client";

async function authenticateWithSolana(wallet: WalletAdapter): Promise<SessionSigs> {
  const authMethod = {
    authMethodType: AuthMethodType.SolanaSignMessage,
    accessToken: await wallet.signMessage(
      new TextEncoder().encode("Sign in to SKAUS Policy Layer")
    ),
  };
  
  const sessionSigs = await litClient.getSessionSigs({
    chain: "solana",
    authMethod,
    resourceAbilityRequests: [
      {
        resource: new LitAccessControlConditionResource("*"),
        ability: LitAbility.AccessControlConditionDecryption,
      },
    ],
  });
  
  return sessionSigs;
}
```

## 3. Lit-Gated Decryption

### 3.1 Encrypting Deposit Routing Metadata

When a sender deposits into the Stealth Pool, the routing metadata (who it's for, amount, secret) is encrypted so only the intended recipient can decrypt.

```typescript
interface RoutingMetadata {
  recipientScanKey: Uint8Array;
  secret: Uint8Array;          // 32-byte random for commitment
  nullifier: Uint8Array;       // 32-byte for withdrawal
  amount: bigint;
  tokenMint: string;
  memo?: string;
  senderHint?: string;         // Optional: encrypted sender identifier
  timestamp: number;
}

async function encryptRoutingMetadata(
  metadata: RoutingMetadata,
  recipientPubkey: string,
  accessControlConditions: AccsCondition[]
): Promise<EncryptedMetadata> {
  const { ciphertext, dataToEncryptHash } = await litClient.encrypt({
    accessControlConditions,
    dataToEncrypt: new TextEncoder().encode(JSON.stringify(metadata)),
  });
  
  return {
    ciphertext,
    dataToEncryptHash,
    accessControlConditions,
  };
}
```

### 3.2 Access Control Conditions

#### Recipient-Only Access (Default)

```typescript
const recipientOnlyCondition: AccsCondition[] = [
  {
    conditionType: "evmBasic",        // Lit uses EVM-style conditions even for Solana
    contractAddress: "",
    standardContractType: "",
    chain: "solana",
    method: "",
    parameters: [":userAddress"],
    returnValueTest: {
      comparator: "=",
      value: recipientSolanaAddress,
    },
  },
];
```

#### Recipient + Designated Auditor

```typescript
const recipientOrAuditorCondition: AccsCondition[] = [
  {
    conditionType: "evmBasic",
    chain: "solana",
    method: "",
    parameters: [":userAddress"],
    returnValueTest: {
      comparator: "=",
      value: recipientSolanaAddress,
    },
  },
  { operator: "or" },
  {
    conditionType: "evmBasic",
    chain: "solana",
    method: "",
    parameters: [":userAddress"],
    returnValueTest: {
      comparator: "=",
      value: auditorSolanaAddress,
    },
  },
];
```

#### Time-Locked Release

```typescript
const timeLockedCondition: AccsCondition[] = [
  {
    // Recipient can always decrypt
    conditionType: "evmBasic",
    chain: "solana",
    method: "",
    parameters: [":userAddress"],
    returnValueTest: {
      comparator: "=",
      value: recipientSolanaAddress,
    },
  },
  { operator: "or" },
  {
    // Anyone can decrypt after timestamp T (for dispute resolution)
    conditionType: "evmBasic",
    chain: "solana",
    method: "eth_getBlockByNumber",  // Lit uses block timestamp
    parameters: ["latest"],
    returnValueTest: {
      comparator: ">=",
      value: unlockTimestamp.toString(),
      key: "timestamp",
    },
  },
];
```

### 3.3 Decrypting Routing Metadata (Recipient Side)

```typescript
async function decryptRoutingMetadata(
  encryptedMetadata: EncryptedMetadata,
  sessionSigs: SessionSigs
): Promise<RoutingMetadata> {
  const { decryptedData } = await litClient.decrypt({
    ciphertext: encryptedMetadata.ciphertext,
    dataToEncryptHash: encryptedMetadata.dataToEncryptHash,
    accessControlConditions: encryptedMetadata.accessControlConditions,
    chain: "solana",
    sessionSigs,
  });
  
  return JSON.parse(new TextDecoder().decode(decryptedData));
}
```

## 4. Disclosure Packages

### 4.1 Overview

Disclosure packages are **opt-in audit bundles** that a recipient can generate for accountants, tax authorities, or platform compliance. They are never generated by default.

### 4.2 Package Schema

```typescript
interface DisclosurePackage {
  // Metadata
  id: string;                       // UUID
  generatedBy: string;              // @name.skaus
  generatedAt: number;              // Unix timestamp
  scope: DisclosureScope;
  
  // Evidence
  deposits: DisclosedDeposit[];
  withdrawals: DisclosedWithdrawal[];
  aggregateProofs: AggregateProof[];
  
  // Verification
  signedByRecipient: Uint8Array;    // Ed25519 signature over package hash
  verificationInstructions: string;
}

interface DisclosureScope {
  startTime: number;
  endTime: number;
  tokenMints: string[];             // Which tokens to disclose
  disclosureLevel: "summary" | "detailed" | "full";
}

interface DisclosedDeposit {
  commitmentHash: string;           // On-chain reference
  amount: number;                   // Decrypted amount
  tokenMint: string;
  timestamp: number;
  senderHint?: string;              // If available and disclosure level = "full"
  merkleProof: string;              // Proves deposit exists in pool
}

interface DisclosedWithdrawal {
  nullifierHash: string;            // On-chain reference
  amount: number;
  tokenMint: string;
  timestamp: number;
  destinationWallet: string;        // Only at "full" disclosure level
}

interface AggregateProof {
  proofType: string;                // "total_received", "total_withdrawn", "net_balance"
  value: number;
  period: { start: number; end: number };
  zkProof: string;                  // Verifiable without seeing individual txns
}
```

### 4.3 Disclosure Levels

| Level | What's Revealed | Use Case |
|-------|----------------|----------|
| **Summary** | Aggregate totals + ZK proofs of correctness | Tax summary, proof of income range |
| **Detailed** | Individual amounts + timestamps (no counterparty info) | Detailed tax filing |
| **Full** | Everything including sender hints + destination wallets | Full audit, legal compliance |

### 4.4 Package Generation

```typescript
async function generateDisclosurePackage(
  recipientKeys: RecipientKeyHierarchy,
  scope: DisclosureScope,
  deposits: DecryptedDeposit[],
  withdrawals: TrackedWithdrawal[]
): Promise<DisclosurePackage> {
  const filteredDeposits = deposits.filter(d =>
    d.timestamp >= scope.startTime &&
    d.timestamp <= scope.endTime &&
    scope.tokenMints.includes(d.tokenMint)
  );
  
  const filteredWithdrawals = withdrawals.filter(w =>
    w.timestamp >= scope.startTime &&
    w.timestamp <= scope.endTime &&
    scope.tokenMints.includes(w.tokenMint)
  );
  
  // Generate aggregate ZK proofs
  const totalReceivedProof = await generateAggregateProof(
    "total_received",
    filteredDeposits.map(d => d.amount),
    scope
  );
  
  const totalWithdrawnProof = await generateAggregateProof(
    "total_withdrawn",
    filteredWithdrawals.map(w => w.amount),
    scope
  );
  
  const disclosed = applyDisclosureLevel(
    filteredDeposits,
    filteredWithdrawals,
    scope.disclosureLevel
  );
  
  const pkg: DisclosurePackage = {
    id: uuid(),
    generatedBy: recipientKeys.name,
    generatedAt: Date.now(),
    scope,
    deposits: disclosed.deposits,
    withdrawals: disclosed.withdrawals,
    aggregateProofs: [totalReceivedProof, totalWithdrawnProof],
    signedByRecipient: new Uint8Array(0), // Signed below
    verificationInstructions: generateVerificationGuide(scope),
  };
  
  pkg.signedByRecipient = await sign(
    recipientKeys.masterKey,
    hashPackage(pkg)
  );
  
  return pkg;
}
```

### 4.5 Lit-Encrypted Disclosure Delivery

Disclosure packages are encrypted for the specific auditor using Lit:

```typescript
async function deliverDisclosurePackage(
  pkg: DisclosurePackage,
  auditorPubkey: string,
  expiresAt?: number
): Promise<EncryptedDisclosurePackage> {
  const conditions: AccsCondition[] = [
    {
      conditionType: "evmBasic",
      chain: "solana",
      method: "",
      parameters: [":userAddress"],
      returnValueTest: {
        comparator: "=",
        value: auditorPubkey,
      },
    },
  ];
  
  if (expiresAt) {
    // Package expires — auditor can only decrypt before expiry
    conditions.push(
      { operator: "and" },
      {
        conditionType: "evmBasic",
        chain: "solana",
        method: "eth_getBlockByNumber",
        parameters: ["latest"],
        returnValueTest: {
          comparator: "<",
          value: expiresAt.toString(),
          key: "timestamp",
        },
      }
    );
  }
  
  const { ciphertext, dataToEncryptHash } = await litClient.encrypt({
    accessControlConditions: conditions,
    dataToEncrypt: new TextEncoder().encode(JSON.stringify(pkg)),
  });
  
  return { ciphertext, dataToEncryptHash, conditions, expiresAt };
}
```

## 5. Rate & Velocity Limits as Policy

### 5.1 On-Chain Policy Account

```rust
#[account]
pub struct WithdrawalPolicy {
    pub pool: Pubkey,                     // Which Stealth Pool this applies to
    pub authority: Pubkey,                // Who can update (governance or admin)
    
    // Global limits
    pub daily_withdrawal_cap: Option<u64>,        // Max total withdrawals per day (in token units)
    pub per_withdrawal_max: Option<u64>,          // Max single withdrawal amount
    pub min_withdrawal: Option<u64>,              // Min single withdrawal amount
    
    // Cooldown
    pub min_withdrawal_interval: Option<i64>,     // Seconds between withdrawals
    
    // Jurisdiction enforcement
    pub blocked_jurisdiction_hashes: Vec<[u8; 32]>, // Poseidon(country_code)
    
    pub updated_at: i64,
    pub bump: u8,
}
```

### 5.2 Policy Enforcement via Lit Actions

Lit Actions are serverless JavaScript functions executed inside Lit nodes. They can enforce policies before releasing decryption shares.

```javascript
// Lit Action: Enforce withdrawal velocity limit
const _litActionCode = `
  const go = async () => {
    // Fetch current withdrawal stats from SKAUS API
    const response = await Lit.Actions.call({
      url: "https://api.skaus.pay/policy/withdrawal-stats",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pool: poolAddress,
        nullifierHash: nullifierHash,
        requestedAmount: amount,
      }),
    });
    
    const stats = JSON.parse(response);
    
    // Check daily cap
    if (stats.dailyTotal + amount > stats.dailyCap) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          allowed: false,
          reason: "Daily withdrawal cap exceeded",
        }),
      });
      return;
    }
    
    // Check cooldown
    const timeSinceLastWithdrawal = Date.now() / 1000 - stats.lastWithdrawalTimestamp;
    if (timeSinceLastWithdrawal < stats.minInterval) {
      Lit.Actions.setResponse({
        response: JSON.stringify({
          allowed: false,
          reason: "Withdrawal cooldown not met",
          retryAfter: stats.minInterval - timeSinceLastWithdrawal,
        }),
      });
      return;
    }
    
    // Policy passed — sign the withdrawal authorization
    const sigShare = await Lit.Actions.signEcdsa({
      toSign: withdrawalMessageHash,
      publicKey: pkpPublicKey,
      sigName: "withdrawal_auth",
    });
    
    Lit.Actions.setResponse({
      response: JSON.stringify({ allowed: true }),
    });
  };
  
  go();
`;
```

### 5.3 ZK Proof of Policy Compliance

Recipients can prove they comply with policies without revealing details:

```typescript
// Circuit: Prove daily withdrawal total ≤ cap
// Public inputs: cap, periodStart, periodEnd, proofOfCompliance
// Private inputs: individual withdrawal amounts, timestamps

interface PolicyComplianceProof {
  proofType: "withdrawal_under_cap" | "amount_in_range" | "frequency_compliant";
  
  publicInputs: {
    policyHash: string;       // Hash of the policy being proven against
    periodStart: number;
    periodEnd: number;
    complianceResult: boolean;
  };
  
  proof: string;              // ZK proof (Groth16)
}

async function proveWithdrawalUnderCap(
  withdrawals: { amount: bigint; timestamp: number }[],
  cap: bigint,
  period: { start: number; end: number }
): Promise<PolicyComplianceProof> {
  const circuit = await loadCircuit("withdrawal_cap_circuit");
  
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      withdrawalAmounts: withdrawals.map(w => w.amount),
      withdrawalTimestamps: withdrawals.map(w => w.timestamp),
      cap,
      periodStart: period.start,
      periodEnd: period.end,
    },
    circuit.wasmPath,
    circuit.zkeyPath
  );
  
  return {
    proofType: "withdrawal_under_cap",
    publicInputs: {
      policyHash: hashPolicy({ cap, period }),
      periodStart: period.start,
      periodEnd: period.end,
      complianceResult: true,
    },
    proof: JSON.stringify(proof),
  };
}
```

## 6. Policy Templates

### 6.1 Pre-Built Policies

| Policy | Description | Parameters |
|--------|------------|------------|
| `daily_cap` | Max total withdrawals per 24h | `cap_amount`, `token` |
| `per_tx_limit` | Max single withdrawal | `max_amount`, `token` |
| `cooldown` | Min time between withdrawals | `interval_seconds` |
| `geo_block` | Block certain jurisdictions | `blocked_codes[]` |
| `auditor_access` | Grant auditor view access for a period | `auditor_pubkey`, `start`, `end` |
| `time_lock` | Funds locked until timestamp | `unlock_at` |
| `multi_sig_release` | Require N-of-M signatures for large withdrawals | `signers[]`, `threshold`, `amount_trigger` |

### 6.2 Policy Composition

```typescript
// Compose multiple policies into a single enforcement rule
function composePolicies(policies: Policy[]): ComposedPolicy {
  return {
    conditions: policies.map(p => p.toAccessControlCondition()),
    operator: "and",  // All policies must pass
    litAction: mergeLitActions(policies.map(p => p.litActionCode)),
  };
}

// Example: Creator sets up their pool policies
const creatorPolicy = composePolicies([
  new DailyCapPolicy({ cap: 50_000, token: "USDC" }),
  new CooldownPolicy({ interval: 3600 }),   // 1 hour between withdrawals
  new GeoBlockPolicy({ blocked: ["KP", "IR", "CU"] }),
]);
```

## 7. Key Management (PKP Integration)

### 7.1 PKP for Policy Enforcement

```typescript
// Mint a PKP tied to SKAUS pool policy
async function mintPolicyPKP(
  poolAddress: string,
  policies: Policy[]
): Promise<PKPInfo> {
  const litContracts = new LitContracts({ signer: adminWallet });
  await litContracts.connect();
  
  const pkp = await litContracts.pkpNftContractUtils.write.mint();
  
  // Bind Lit Actions to the PKP
  for (const policy of policies) {
    await litContracts.addPermittedAction({
      pkpTokenId: pkp.tokenId,
      ipfsId: await uploadLitAction(policy.litActionCode),
    });
  }
  
  return {
    tokenId: pkp.tokenId,
    publicKey: pkp.publicKey,
    ethAddress: pkp.ethAddress,
    policies: policies.map(p => p.id),
  };
}
```

## 8. Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Lit node collusion | Threshold encryption (2/3 of nodes required); distributed node network |
| Policy bypass | Policies enforced at decryption layer; on-chain nullifier prevents re-use |
| Disclosure package tampering | Signed by recipient's master key; verifiable on-chain |
| Stale policy enforcement | Lit Actions fetch real-time state from Solana RPC |
| Over-broad disclosure | Scope parameters limit what's revealed; time-bounded access |
| Audit trail manipulation | Package hashes stored on-chain as attestations (optional) |

## 9. Development Phases

### Phase 1: Basic Lit Encryption (Weeks 1-3)
- [ ] Lit SDK integration + Solana auth
- [ ] Encrypt/decrypt deposit routing metadata
- [ ] Recipient-only access control condition
- [ ] Basic Lit Action for policy check (no-op placeholder)

### Phase 2: Programmable Policies (Weeks 4-7)
- [ ] WithdrawalPolicy on-chain account
- [ ] Lit Actions for daily cap, cooldown, per-tx limit
- [ ] PKP minting + action binding
- [ ] Policy composition engine
- [ ] Geo-blocking (IP-based + self-declared)

### Phase 3: Disclosure Packages (Weeks 8-10)
- [ ] Disclosure package schema + generation
- [ ] Lit-encrypted delivery to auditor
- [ ] Summary / Detailed / Full disclosure levels
- [ ] Aggregate ZK proofs (total received, total withdrawn)
- [ ] Verification guide generator

### Phase 4: Advanced Policies (Weeks 11-14)
- [ ] Multi-sig release for large withdrawals
- [ ] Time-locked disclosures
- [ ] Policy compliance ZK proofs
- [ ] Policy marketplace / templates
- [ ] Governance-controlled global policies

## 10. Dependencies

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Threshold Encryption | Lit Protocol (Datil network) | Decentralized key management, no single point of failure |
| Access Control | Lit ACCs | Programmable conditions, Solana-compatible |
| Policy Execution | Lit Actions (JS in TEE) | Serverless, trust-minimized policy enforcement |
| Key Management | PKPs (Programmable Key Pairs) | Protocol-level automation keys |
| ZK Proofs | Circom + snarkjs | Reuse Plan A circuit tooling |
| Auth | Solana wallet signature | Native wallet-based auth to Lit network |
| Storage | IPFS (Lit Action code) | Immutable, content-addressed policy code |
