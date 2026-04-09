# Plan B — Identity & Discovery

> Technical implementation plan for SKAUS's human-readable identity layer, compressed profiles, and payment requests on Solana.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     SKAUS Identity Layer                         │
│                                                                  │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────┐  │
│  │ Name Registry │   │ Compressed       │   │ Payment Request│  │
│  │ @name.skaus   │   │ Profiles (ZKC)   │   │ Engine         │  │
│  │               │   │                  │   │                │  │
│  │ • Resolve to  │   │ • Link-in-bio    │   │ • Amount+memo  │  │
│  │   stealth     │   │ • Tiers/pricing  │   │ • Expiry       │  │
│  │   meta-addr   │   │ • Gated content  │   │ • Status track │  │
│  │ • Rotate keys │   │ • 10K+ profiles  │   │ • Wallet-native│  │
│  │ • Per-link    │   │   at ~$0 state   │   │                │  │
│  │   deposit     │   │                  │   │                │  │
│  │   paths       │   │                  │   │                │  │
│  └──────┬───────┘   └────────┬─────────┘   └───────┬────────┘  │
│         │                    │                      │            │
│         └────────────────────┼──────────────────────┘            │
│                              │                                   │
│                    ┌─────────▼──────────┐                        │
│                    │  Stealth Pool      │                        │
│                    │  (Plan A)          │                        │
│                    └────────────────────┘                        │
└──────────────────────────────────────────────────────────────────┘
```

## 2. Name Registry Program

### 2.1 On-Chain Accounts

```rust
#[account]
pub struct NameRecord {
    pub authority: Pubkey,           // Owner who can update
    pub name_hash: [u8; 32],        // Poseidon(lowercase(name))
    pub stealth_meta_address: StealthMetaAddress,
    pub profile_cid: Option<[u8; 32]>,  // ZK-compressed profile pointer
    pub deposit_index: u64,          // Counter for per-link deposit paths
    pub created_at: i64,
    pub updated_at: i64,
    pub status: NameStatus,          // Active, Suspended, Expired
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StealthMetaAddress {
    pub scan_pubkey: [u8; 32],      // For detecting incoming payments
    pub spend_pubkey: [u8; 32],     // For authorizing withdrawals
    pub version: u8,                 // Key rotation version
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum NameStatus {
    Active,
    Suspended,
    Expired,
}
```

### 2.2 Instructions

```rust
// Register a new @name.skaus
pub fn register_name(
    ctx: Context<RegisterName>,
    name: String,                    // "alice" → alice.skaus
    stealth_meta_address: StealthMetaAddress,
) -> Result<()>;

// Update stealth meta-address (key rotation)
pub fn rotate_keys(
    ctx: Context<RotateKeys>,
    new_stealth_meta_address: StealthMetaAddress,
) -> Result<()>;

// Generate a unique deposit path for a specific link/payer
pub fn create_deposit_path(
    ctx: Context<CreateDepositPath>,
    label: String,                   // e.g., "twitter-tip", "invoice-42"
) -> Result<DepositPath>;

// Update profile pointer
pub fn update_profile(
    ctx: Context<UpdateProfile>,
    profile_cid: [u8; 32],          // Compressed account hash
) -> Result<()>;
```

### 2.3 Name Resolution Flow

```
1. Client queries: "alice.skaus"
2. Compute PDA: seeds = ["name", Poseidon("alice")]
3. Fetch NameRecord account
4. Extract stealth_meta_address
5. Derive ephemeral deposit address using ECDH:
   
   shared_secret = ECDH(sender_ephemeral_privkey, scan_pubkey)
   deposit_key = spend_pubkey + Hash(shared_secret) * G
   
6. Construct deposit to Stealth Pool with derived key
```

### 2.4 Per-Link Deposit Paths

Each link or context gets a unique deposit derivation path so that one leaked link doesn't compromise all payment history.

```typescript
interface DepositPath {
  label: string;              // Human-readable label
  pathIndex: number;          // Unique index for key derivation
  derivedScanKey: PublicKey;  // scan_pubkey + Hash("path" || pathIndex) * G
  createdAt: number;
  totalDeposits: number;      // Counter (off-chain indexed)
}
```

**Derivation:**
```
path_scan_key = base_scan_key + Hash("skaus_path" || path_index) * G
path_spend_key = base_spend_key + Hash("skaus_path" || path_index) * G
```

The recipient can derive all path keys from their master key + the path index, but an external observer cannot link two different path keys to the same recipient.

### 2.5 Name Validation Rules

| Rule | Constraint |
|------|-----------|
| Length | 3-32 characters |
| Characters | `[a-z0-9_-]` (lowercase alphanumeric, underscore, hyphen) |
| Reserved | Cannot start with `_` or `-`; blocklist for offensive terms |
| Uniqueness | Enforced on-chain via PDA derivation from name hash |
| Cost | Rent-exempt deposit (~0.002 SOL) + registration fee (optional, configurable) |

## 3. Compressed Profiles (ZK Compression)

### 3.1 Why ZK Compression

Standard Solana accounts cost ~0.002 SOL rent. For 10K creators with rich profiles:
- **Without compression:** 10,000 × 0.002 = 20 SOL (~$3,000+)
- **With ZK Compression:** 10,000 × ~$0.0001 = ~$1

ZK Compression (Light Protocol) stores account data as leaves in a concurrent Merkle tree, with only the tree root on-chain. Proofs of inclusion are generated by indexers.

### 3.2 Profile Schema

```typescript
interface CompressedProfile {
  // Identity
  displayName: string;            // "Alice Creator"
  bio: string;                    // Max 280 chars
  avatarUri: string;              // IPFS/Arweave CID
  
  // Links
  links: ProfileLink[];           // Social links, website, etc.
  
  // Payment configuration
  paymentConfig: {
    acceptedTokens: TokenMint[];  // [USDC, SOL]
    suggestedAmounts: number[];   // [5, 10, 25, 50]
    customAmountEnabled: boolean;
    thankYouMessage: string;      // Shown after payment
  };
  
  // Tiered access (for membership/subscription hints)
  tiers: PaymentTier[];
  
  // Gated content pointers
  gatedContent: GatedContentPointer[];
  
  // Metadata
  version: number;
  updatedAt: number;
}

interface ProfileLink {
  platform: string;               // "twitter", "github", "website"
  url: string;
  verified: boolean;              // Verified via signed message
}

interface PaymentTier {
  id: string;
  name: string;                   // "Supporter", "VIP"
  amount: number;                 // Monthly/one-time amount
  currency: TokenMint;
  benefits: string[];             // Description of benefits
  gateType: "one-time" | "recurring-hint";
}

interface GatedContentPointer {
  contentId: string;
  encryptedUri: string;           // Lit-encrypted (Plan C)
  accessCondition: string;        // Lit access control condition
  previewText: string;
}
```

### 3.3 Compression Implementation

```typescript
import { createRpc, Rpc } from "@lightprotocol/stateless.js";
import { compress, decompress } from "@lightprotocol/compressed-token";

async function createCompressedProfile(
  rpc: Rpc,
  owner: Keypair,
  profile: CompressedProfile
): Promise<string> {
  const serialized = borsh.serialize(ProfileSchema, profile);
  
  // Create compressed account via Light Protocol
  const txSig = await compress(rpc, owner, {
    data: serialized,
    owner: owner.publicKey,
    lamports: 0,  // No rent needed for compressed accounts
  });
  
  return txSig;
}

async function readCompressedProfile(
  rpc: Rpc,
  profileHash: Uint8Array
): Promise<CompressedProfile> {
  const account = await rpc.getCompressedAccount(profileHash);
  return borsh.deserialize(ProfileSchema, account.data);
}

async function updateCompressedProfile(
  rpc: Rpc,
  owner: Keypair,
  currentHash: Uint8Array,
  updatedProfile: CompressedProfile
): Promise<string> {
  const proof = await rpc.getValidityProof([currentHash]);
  
  const txSig = await updateCompressedAccount(rpc, owner, {
    currentHash,
    proof,
    newData: borsh.serialize(ProfileSchema, updatedProfile),
  });
  
  return txSig;
}
```

### 3.4 Profile Page Rendering

The link-in-bio page is server-side rendered for SEO and instant load:

```
https://skaus.pay/alice
         │
         ▼
┌─────────────────────┐
│  Resolve NameRecord  │
│  for "alice"         │
├─────────────────────┤
│  Fetch compressed    │
│  profile via indexer │
├─────────────────────┤
│  SSR profile page    │
│  with payment widget │
└─────────────────────┘
```

**Page Structure:**
```
┌─────────────────────────────┐
│  [Avatar]                   │
│  Alice Creator              │
│  "Building cool stuff 🛠️"   │
│                             │
│  [Twitter] [GitHub] [Web]   │
│                             │
│  ─── Pay Alice ───          │
│  [10] [25] [50] [Custom]   │
│  [USDC ▼]                  │
│  [ Connect Wallet & Pay ]   │
│                             │
│  ─── Tiers ───              │
│  ☆ Supporter - $5/mo       │
│  ★ VIP - $25/mo            │
│                             │
│  ─── Gated Content ───      │
│  🔒 Exclusive Guide         │
│  🔒 Private Discord Link    │
│                             │
│  Powered by SKAUS           │
└─────────────────────────────┘
```

## 4. Payment Requests & Invoices

### 4.1 Request Schema

```typescript
interface PaymentRequest {
  id: string;                     // UUID v4
  creator: string;                // @name.skaus
  
  // Payment details
  amount: number;                 // Exact amount requested
  token: TokenMint;               // USDC or SOL
  memo: string;                   // "Invoice #42 — Logo Design"
  
  // Constraints
  expiresAt: number | null;       // Unix timestamp, null = no expiry
  maxPayments: number;            // Usually 1 for invoices
  
  // Routing
  depositPath: DepositPath;       // Unique path for this request
  
  // Status
  status: "pending" | "partial" | "paid" | "expired" | "cancelled";
  payments: PaymentRecord[];
  
  // Metadata
  createdAt: number;
  updatedAt: number;
}

interface PaymentRecord {
  txSignature: string;
  amount: number;
  paidAt: number;
  depositorHint?: string;         // Optional: encrypted payer identifier
}
```

### 4.2 Request Link Format

```
https://skaus.pay/alice/request/inv-42?amount=250&token=USDC&memo=Logo+Design&expires=1714000000
```

**QR payload:**
```json
{
  "v": 1,
  "type": "payment_request",
  "recipient": "alice.skaus",
  "amount": 250,
  "token": "USDC",
  "memo_encrypted": "base64...",
  "expires": 1714000000,
  "deposit_path_index": 42
}
```

### 4.3 Request Lifecycle

```
Creator creates request
        │
        ▼
    ┌─────────┐
    │ PENDING  │ ◄─── Link/QR shared with payer
    └────┬────┘
         │ Payer deposits into pool
         ▼
    ┌─────────┐
    │  PAID   │ ◄─── Indexed off-chain; creator notified
    └────┬────┘
         │ Creator can withdraw via ZK proof
         ▼
    ┌──────────┐
    │ COMPLETE │
    └──────────┘

Expiry path:
    PENDING ──► (expires_at reached) ──► EXPIRED
    
Cancel path:
    PENDING ──► (creator cancels) ──► CANCELLED
```

### 4.4 Off-Chain Request Storage

Payment requests are stored off-chain (encrypted) because:
- They contain human-readable memos (privacy-sensitive)
- They need fast CRUD operations
- On-chain storage would be expensive and leak metadata

**Storage: Encrypted in PostgreSQL (relayer/gateway DB)**

```sql
CREATE TABLE payment_requests (
    id UUID PRIMARY KEY,
    creator_name VARCHAR(32) NOT NULL,
    encrypted_data BYTEA NOT NULL,       -- ChaCha20 encrypted PaymentRequest
    data_hash BYTEA NOT NULL,            -- For integrity verification
    deposit_path_index BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_requests_creator ON payment_requests(creator_name, status);
CREATE INDEX idx_requests_expiry ON payment_requests(expires_at) WHERE status = 'pending';
```

## 5. Indexing & Discovery

### 5.1 Name Indexer

Monitors on-chain `NameRecord` account changes via Helius webhooks:

```typescript
// Helius webhook handler
app.post("/webhooks/name-registry", async (req, res) => {
  const events = req.body;
  
  for (const event of events) {
    if (event.type === "ACCOUNT_UPDATE") {
      const nameRecord = deserializeNameRecord(event.data);
      
      await nameIndex.upsert({
        nameHash: nameRecord.nameHash,
        name: await reverseLookup(nameRecord.nameHash), // From tx history
        authority: nameRecord.authority,
        stealthMetaAddress: nameRecord.stealthMetaAddress,
        status: nameRecord.status,
        updatedAt: nameRecord.updatedAt,
      });
    }
  }
});
```

### 5.2 Profile Indexer

Subscribes to ZK Compression state changes via Light Protocol's indexer:

```typescript
// Light Protocol indexer subscription
lightIndexer.onCompressedAccountChange(
  PROFILE_PROGRAM_ID,
  async (update) => {
    const profile = deserializeProfile(update.data);
    
    await profileCache.set(
      update.hash.toString("hex"),
      profile,
      { ttl: 300 } // 5-minute cache
    );
  }
);
```

### 5.3 Search & Discovery (Future)

```typescript
// Full-text search over public profile fields
interface ProfileSearchParams {
  query: string;              // "digital artist"
  tags?: string[];            // ["art", "music"]
  sortBy?: "relevance" | "created" | "popularity";
  limit?: number;
  offset?: number;
}

// Powered by Meilisearch / Typesense (self-hosted)
async function searchProfiles(params: ProfileSearchParams): Promise<ProfileSearchResult[]> {
  return meili.index("profiles").search(params.query, {
    filter: params.tags?.map(t => `tags = "${t}"`),
    sort: [params.sortBy || "relevance:desc"],
    limit: params.limit || 20,
    offset: params.offset || 0,
  });
}
```

## 6. Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Name squatting | Registration fee + dispute process + reserved name blocklist |
| Stealth meta-address linkage | Per-link deposit paths prevent cross-link correlation |
| Profile data leak | Sensitive fields encrypted; public fields are opt-in |
| Compressed account manipulation | ZK validity proofs ensure only owner can update |
| Payment request forgery | Requests signed by creator's authority key |
| Indexer tampering | Clients verify Merkle proofs from on-chain roots |

## 7. Development Phases

### Phase 1: Name Registry (Weeks 1-4)
- [ ] NameRecord account design + Anchor program
- [ ] Register, rotate, and resolve instructions
- [ ] Basic CLI for name registration
- [ ] Name resolution in web app

### Phase 2: Compressed Profiles (Weeks 5-8)
- [ ] Profile schema + Borsh serialization
- [ ] ZK Compression integration (Light Protocol SDK)
- [ ] Profile CRUD via compressed accounts
- [ ] SSR profile page rendering
- [ ] Profile indexer + cache

### Phase 3: Payment Requests (Weeks 9-11)
- [ ] Request creation + link generation
- [ ] Off-chain encrypted storage
- [ ] Payment detection + status updates
- [ ] Expiry + cancellation handling

### Phase 4: Discovery (Weeks 12-14)
- [ ] Per-link deposit paths
- [ ] Profile search index
- [ ] Verified social links
- [ ] Public directory (opt-in)

## 8. Dependencies & Integration Points

| Component | Depends On | Integration |
|-----------|-----------|-------------|
| Name Registry | Solana runtime | Anchor program, PDA derivation |
| Name → Stealth Address | Plan A (Stealth Pool) | Stealth meta-address resolution |
| Compressed Profiles | Light Protocol (ZK Compression) | State tree, validity proofs |
| Profile Pages | Next.js SSR | Server-side rendering + hydration |
| Payment Requests | Plan A (deposit flow) | Deposit path → pool deposit |
| Indexer | Helius / Light indexer | Webhook subscriptions, DAS API |
| Search | Meilisearch | Full-text index of public profiles |
