# Plan D — Creator & Growth Features

> Technical implementation plan for tip jars, membership hints, webhook alerts, and stablecoin-first payment experience on Solana.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Creator Growth Stack                             │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ Tip Jar +        │  │ Webhook /        │  │ Stablecoin-First  │  │
│  │ Membership       │  │ Notification     │  │ Presets           │  │
│  │                  │  │ Engine           │  │                   │  │
│  │ • Single link    │  │                  │  │ • USDC primary    │  │
│  │ • Supporter      │  │ • "You got paid" │  │ • SOL support     │  │
│  │   badge (NFT)    │  │   off-chain      │  │ • Clear fee       │  │
│  │ • Privacy-safe   │  │ • Webhook-hash   │  │   display         │  │
│  │   summary        │  │   integrity      │  │ • Fiat on-ramp    │  │
│  │                  │  │ • Link-in-bio    │  │   hints           │  │
│  │                  │  │   operator hooks │  │                   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬──────────┘  │
│           │                     │                      │              │
│           └─────────────────────┼──────────────────────┘              │
│                                 │                                     │
│                    ┌────────────▼────────────┐                        │
│                    │  Plans A + B + C         │                        │
│                    │  (Pool, Identity, Policy)│                        │
│                    └────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. Tip Jar + Membership Hints

### 2.1 Tip Jar Configuration

```typescript
interface TipJarConfig {
  // Display
  label: string;                     // "Buy me a coffee", "Support my work"
  style: TipJarStyle;               // Visual theme
  
  // Payment options
  suggestedAmounts: TipAmount[];    // Quick-select buttons
  customAmountEnabled: boolean;
  minimumAmount: number;
  maximumAmount: number;
  
  // Token preferences
  preferredToken: TokenMint;        // USDC (default)
  acceptedTokens: TokenMint[];      // [USDC, SOL]
  
  // Post-payment
  thankYouMessage: string;
  thankYouRedirectUrl?: string;
  showConfetti: boolean;
  
  // Privacy
  showRecentTips: boolean;          // Public social proof (anonymized)
  showTotalReceived: boolean;       // Aggregate counter
}

interface TipAmount {
  value: number;
  label: string;                    // "☕ Coffee", "🍕 Pizza", "🚀 Boost"
  emoji?: string;
}

interface TipJarStyle {
  theme: "minimal" | "playful" | "professional" | "custom";
  primaryColor?: string;
  borderRadius?: number;
  fontFamily?: string;
}
```

### 2.2 Tip Jar Widget (Embeddable)

```typescript
// Embeddable widget for external sites
// <script src="https://skaus.pay/widget.js" data-creator="alice"></script>

class SkausTipJarWidget {
  private config: TipJarConfig;
  private iframe: HTMLIFrameElement;
  
  constructor(creatorName: string, container: HTMLElement) {
    this.iframe = document.createElement("iframe");
    this.iframe.src = `https://skaus.pay/embed/tip/${creatorName}`;
    this.iframe.style.cssText = "border:none;width:100%;max-width:400px;height:320px;";
    this.iframe.sandbox.add("allow-scripts", "allow-popups", "allow-same-origin");
    container.appendChild(this.iframe);
    
    window.addEventListener("message", this.handleMessage.bind(this));
  }
  
  private handleMessage(event: MessageEvent) {
    if (event.origin !== "https://skaus.pay") return;
    
    switch (event.data.type) {
      case "TIP_COMPLETED":
        this.onTipCompleted?.(event.data.payload);
        break;
      case "WIDGET_RESIZE":
        this.iframe.style.height = `${event.data.height}px`;
        break;
    }
  }
  
  onTipCompleted?: (payload: { amount: number; token: string; txSig: string }) => void;
}
```

### 2.3 Supporter Badge (Non-Custodial NFT Gate)

Supporters can optionally receive a compressed NFT badge that proves support without revealing payment amounts.

```typescript
interface SupporterBadge {
  mint: PublicKey;                    // Compressed NFT mint
  tier: string;                      // "supporter", "patron", "champion"
  creator: string;                   // @name.skaus
  issuedAt: number;
  
  // Privacy-preserving: badge does NOT store payment amount
  // Uses ZK proof that "payment >= tier_threshold" was made
  proofOfThreshold: string;          // ZK proof
}
```

**Badge Minting Flow:**

```
1. Supporter pays creator via Stealth Pool
2. Creator's backend detects payment (via deposit scan)
3. Creator signs a "badge authorization" message
4. Badge minting Lit Action verifies:
   a. Valid deposit exists in pool (Merkle inclusion)
   b. Amount meets tier threshold (ZK range proof)
   c. Creator authorized the badge
5. Compressed NFT minted to supporter's chosen wallet
```

```typescript
import { createTree, mintToCollectionV1 } from "@metaplex-foundation/mpl-bubblegum";

async function mintSupporterBadge(
  creator: string,
  supporterWallet: PublicKey,
  tier: SupporterTier,
  paymentProof: ZkProof
): Promise<string> {
  // Verify the ZK proof that payment meets tier threshold
  const isValid = await verifyThresholdProof(paymentProof, tier.minimumAmount);
  if (!isValid) throw new Error("Payment proof invalid");
  
  const merkleTree = await getOrCreateBadgeTree(creator);
  
  const txSig = await mintToCollectionV1(umi, {
    leafOwner: supporterWallet,
    merkleTree: merkleTree.publicKey,
    collectionMint: getBadgeCollection(creator),
    metadata: {
      name: `${creator} ${tier.name} Badge`,
      uri: await uploadBadgeMetadata(creator, tier),
      sellerFeeBasisPoints: 0,
      collection: { key: getBadgeCollection(creator), verified: true },
      creators: [{ address: getCreatorAuthority(creator), verified: true, share: 100 }],
    },
  }).sendAndConfirm(umi);
  
  return txSig;
}
```

### 2.4 Privacy-Safe Social Proof

Instead of showing "Alice received $5,000 this month", show anonymized aggregate hints:

```typescript
interface PublicTipStats {
  totalSupporters: number;          // Count of unique badge holders
  recentActivity: "active" | "growing" | "new";
  tierDistribution: {               // Percentage per tier (not counts)
    supporter: number;              // e.g., 70%
    patron: number;                 // e.g., 25%
    champion: number;               // e.g., 5%
  };
  // Deliberately NO total amounts, NO individual tip amounts
}
```

## 3. Webhook / Notification Engine

### 3.1 Notification Types

| Type | Channel | Trigger | Data |
|------|---------|---------|------|
| `payment_received` | Webhook / Push / Email | New deposit detected for creator | Amount, token, timestamp (no sender identity) |
| `withdrawal_complete` | Push / Email | ZK withdrawal confirmed | Amount, destination hint, tx sig |
| `badge_minted` | Webhook / Push | New supporter badge issued | Tier, badge mint address |
| `request_paid` | Webhook / Push / Email | Payment request fulfilled | Request ID, amount, token |
| `request_expired` | Push / Email | Payment request expired unfulfilled | Request ID |
| `policy_alert` | Push / Email | Policy limit approaching (80% of cap) | Policy type, current usage |

### 3.2 Webhook Configuration

```typescript
interface WebhookConfig {
  id: string;
  creatorName: string;
  url: string;                       // https://myapp.com/webhooks/skaus
  secret: string;                    // HMAC signing secret (32 bytes hex)
  events: WebhookEventType[];        // Which events to receive
  active: boolean;
  
  // Retry policy
  maxRetries: number;                // Default: 3
  retryIntervalMs: number;          // Default: 5000 (exponential backoff)
  
  // Rate limiting
  maxEventsPerMinute: number;        // Default: 60
  
  createdAt: number;
  updatedAt: number;
}
```

### 3.3 Webhook Delivery

```typescript
interface WebhookPayload {
  id: string;                        // Event UUID
  type: WebhookEventType;
  timestamp: number;
  
  // Event-specific data (privacy-safe — no PII on chain)
  data: {
    amount?: number;
    token?: string;
    txSignature?: string;
    requestId?: string;
    badgeTier?: string;
  };
  
  // Integrity
  hash: string;                      // SHA256(id + type + timestamp + JSON(data))
}

async function deliverWebhook(
  config: WebhookConfig,
  payload: WebhookPayload
): Promise<void> {
  const signature = hmacSha256(config.secret, JSON.stringify(payload));
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Skaus-Signature": signature,
          "X-Skaus-Event": payload.type,
          "X-Skaus-Delivery": payload.id,
          "X-Skaus-Timestamp": payload.timestamp.toString(),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      
      if (response.ok) {
        await logDelivery(payload.id, "delivered", attempt);
        return;
      }
      
      if (response.status < 500) {
        await logDelivery(payload.id, "rejected", attempt, response.status);
        return; // Don't retry 4xx
      }
    } catch (error) {
      // Retry on network errors and 5xx
    }
    
    if (attempt < config.maxRetries) {
      await sleep(config.retryIntervalMs * Math.pow(2, attempt));
    }
  }
  
  await logDelivery(payload.id, "failed", config.maxRetries);
  await enqueueForDeadLetterProcessing(payload);
}
```

### 3.4 Webhook Verification (Consumer Side)

```typescript
// For webhook consumers to verify payload integrity
function verifySkausWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = hmacSha256(secret, payload);
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
}
```

### 3.5 Push Notification Service

```typescript
interface PushNotificationConfig {
  creatorName: string;
  channels: {
    webPush?: WebPushSubscription;
    email?: string;                  // Encrypted, stored off-chain
    telegram?: string;               // Bot chat ID (encrypted)
  };
  preferences: {
    paymentReceived: boolean;
    withdrawalComplete: boolean;
    dailySummary: boolean;
    policyAlerts: boolean;
  };
  quietHours?: {
    start: string;                   // "22:00" UTC
    end: string;                     // "08:00" UTC
    timezone: string;
  };
}
```

### 3.6 Payment Detection Pipeline

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  Helius       │     │  Deposit Scanner  │     │  Notification     │
│  Webhook      │────►│  (attempts        │────►│  Dispatcher       │
│  (new deposit │     │   decryption for  │     │                   │
│   in pool)    │     │   each creator)   │     │  • Webhooks       │
└──────────────┘     └──────────────────┘     │  • Push            │
                                               │  • Email           │
                                               │  • Telegram        │
                                               └───────────────────┘
```

## 4. Stablecoin-First Payment Experience

### 4.1 Token Configuration

```typescript
interface TokenConfig {
  mint: PublicKey;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;                      // URL to token icon
  
  // Pool configuration
  poolAddress: PublicKey;
  depositTiers: number[];            // [10, 100, 1000, 10000] for USDC
  
  // Fee configuration
  withdrawalFeeBps: number;
  relayerFeeBps: number;
  
  // Display
  fiatEquivalent: boolean;           // Show USD equivalent
  priority: number;                  // Display order (lower = higher priority)
}

const SUPPORTED_TOKENS: TokenConfig[] = [
  {
    mint: USDC_MINT,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    icon: "/tokens/usdc.svg",
    poolAddress: USDC_POOL,
    depositTiers: [10, 100, 1_000, 10_000],
    withdrawalFeeBps: 30,
    relayerFeeBps: 10,
    fiatEquivalent: true,
    priority: 0,                     // Primary token
  },
  {
    mint: SOL_MINT,
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    icon: "/tokens/sol.svg",
    poolAddress: SOL_POOL,
    depositTiers: [0.1, 1, 10, 100],
    withdrawalFeeBps: 30,
    relayerFeeBps: 10,
    fiatEquivalent: true,
    priority: 1,
  },
];
```

### 4.2 Fee Display Component

Transparency is a core differentiator. Every payment shows exact fees before confirmation.

```typescript
interface FeeBreakdown {
  paymentAmount: number;             // What the sender pays
  token: string;
  
  // Breakdown
  recipientReceives: number;         // After all fees
  protocolFee: number;               // 0.30%
  relayerFee: number;                // 0.10% (if using relayer)
  networkFee: number;                // Solana tx fee in SOL
  
  // Totals
  totalFees: number;
  totalFeePct: string;               // "0.40%"
  
  // Fiat equivalents
  fiatEquivalent?: {
    currency: string;                // "USD"
    paymentAmount: number;
    recipientReceives: number;
    totalFees: number;
  };
}

function calculateFees(
  amount: number,
  token: TokenConfig,
  useRelayer: boolean
): FeeBreakdown {
  const protocolFee = (amount * token.withdrawalFeeBps) / 10_000;
  const relayerFee = useRelayer ? (amount * token.relayerFeeBps) / 10_000 : 0;
  const networkFee = 0.000005; // ~5000 lamports in SOL
  
  const totalFees = protocolFee + relayerFee;
  const recipientReceives = amount - totalFees;
  
  return {
    paymentAmount: amount,
    token: token.symbol,
    recipientReceives,
    protocolFee,
    relayerFee,
    networkFee,
    totalFees,
    totalFeePct: `${((totalFees / amount) * 100).toFixed(2)}%`,
  };
}
```

### 4.3 Payment UI Flow

```
┌─────────────────────────────────────┐
│  Pay @alice                         │
│                                     │
│  Amount: [___50___] USDC ▼          │
│                                     │
│  ─── Fee Breakdown ───              │
│  You pay:          50.00 USDC       │
│  Protocol fee:     -0.15 USDC (0.3%)│
│  Relayer fee:      -0.05 USDC (0.1%)│
│  Network fee:      ~0.000005 SOL    │
│  ─────────────────────────          │
│  Alice receives:   49.80 USDC       │
│                                     │
│  ☑ Use relayer (recommended)        │
│    Hides your wallet from recipient │
│                                     │
│  [ Connect Wallet & Pay ]           │
│                                     │
│  🔒 Privacy: Payment routed through │
│  Stealth Pool. On-chain observers   │
│  cannot link you to Alice.          │
└─────────────────────────────────────┘
```

### 4.4 Jupiter Integration (Token Swap on Payment)

If a sender holds SOL but the creator prefers USDC, auto-swap via Jupiter:

```typescript
import { Jupiter } from "@jup-ag/core";

async function payWithAutoSwap(
  senderToken: TokenMint,       // What sender has (e.g., SOL)
  recipientToken: TokenMint,    // What creator wants (e.g., USDC)
  recipientAmount: number,      // Exact amount creator should receive
  slippageBps: number = 50      // 0.5% slippage tolerance
): Promise<TransactionInstruction[]> {
  if (senderToken === recipientToken) {
    return buildDirectDepositIx(recipientToken, recipientAmount);
  }
  
  const jupiter = await Jupiter.load({ connection, cluster: "mainnet-beta" });
  
  const routes = await jupiter.computeRoutes({
    inputMint: senderToken,
    outputMint: recipientToken,
    amount: recipientAmount * 10 ** getDecimals(recipientToken),
    slippageBps,
    swapMode: "ExactOut",       // Ensure exact output amount
  });
  
  const bestRoute = routes.routesInfos[0];
  const { swapTransaction } = await jupiter.exchange({ routeInfo: bestRoute });
  
  // Compose: swap instruction + deposit instruction
  return [
    ...swapTransaction.instructions,
    ...buildDepositIx(recipientToken, recipientAmount),
  ];
}
```

## 5. Creator Dashboard

### 5.1 Dashboard Data Model

```typescript
interface CreatorDashboard {
  // Overview
  profile: CompressedProfile;
  totalSupporters: number;
  
  // Earnings (all privacy-preserving — creator sees their own data)
  earnings: {
    today: TokenAmount[];
    thisWeek: TokenAmount[];
    thisMonth: TokenAmount[];
    allTime: TokenAmount[];
  };
  
  // Pending
  pendingWithdrawals: PendingWithdrawal[];
  shieldedBalance: TokenAmount[];    // Available to withdraw
  
  // Activity (anonymized)
  recentDeposits: AnonymizedDeposit[];
  
  // Payment requests
  activeRequests: PaymentRequest[];
  completedRequests: PaymentRequest[];
  
  // Webhooks
  webhooks: WebhookConfig[];
  recentDeliveries: WebhookDeliveryLog[];
  
  // Badges
  badgeStats: {
    totalMinted: number;
    tierBreakdown: Record<string, number>;
  };
}

interface AnonymizedDeposit {
  amount: number;
  token: string;
  timestamp: number;
  depositPath?: string;              // Which link/source
  // No sender information — privacy preserved
}
```

### 5.2 Dashboard API

```typescript
// GET /api/creator/dashboard
// Authenticated via Solana wallet signature

router.get("/api/creator/dashboard", authenticate, async (req, res) => {
  const creator = req.creator;
  
  const [earnings, balance, deposits, requests, webhooks, badges] = await Promise.all([
    getEarnings(creator.name),
    getShieldedBalance(creator.scanKey),
    getRecentDeposits(creator.scanKey, { limit: 50 }),
    getPaymentRequests(creator.name),
    getWebhookConfigs(creator.name),
    getBadgeStats(creator.name),
  ]);
  
  res.json({
    profile: creator.profile,
    totalSupporters: badges.totalMinted,
    earnings,
    shieldedBalance: balance,
    recentDeposits: deposits,
    activeRequests: requests.filter(r => r.status === "pending"),
    completedRequests: requests.filter(r => r.status === "paid"),
    webhooks,
    badgeStats: badges,
  });
});
```

## 6. Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Webhook secret leak | Secrets hashed before storage; rotation API available |
| Badge forgery | ZK proof of payment required for minting; creator authorization |
| Tip amount inference from badge | Badge tiers are broad ranges; exact amount never stored |
| Webhook replay attack | Unique delivery IDs + timestamp verification + idempotency keys |
| Embeddable widget XSS | Sandboxed iframe; CSP headers; postMessage origin checks |
| Fee manipulation | Fee calculation verified on-chain in pool program; client display is informational |

## 7. Development Phases

### Phase 1: Tip Jar MVP (Weeks 1-4)
- [ ] Tip jar configuration schema
- [ ] Payment page with suggested amounts + custom
- [ ] Fee breakdown display component
- [ ] USDC-first payment flow
- [ ] Thank-you page / confetti animation

### Phase 2: Notifications (Weeks 5-7)
- [ ] Deposit scanner → notification pipeline
- [ ] Webhook delivery engine with retry
- [ ] HMAC signature verification
- [ ] Web push notification support
- [ ] Email notification (via SendGrid/Resend)

### Phase 3: Badges & Social Proof (Weeks 8-10)
- [ ] Supporter badge compressed NFT collection
- [ ] ZK threshold proof for badge minting
- [ ] Anonymized public stats display
- [ ] Badge verification page

### Phase 4: Growth & Polish (Weeks 11-14)
- [ ] Embeddable widget (iframe + script tag)
- [ ] Creator dashboard (earnings, activity, webhooks)
- [ ] Jupiter auto-swap integration
- [ ] SOL payment support
- [ ] Telegram bot notifications
- [ ] Link-in-bio SEO optimization

## 8. Dependencies

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Tip Jar Widget | Preact (lightweight iframe embed) | <10KB bundle, fast load |
| Compressed NFT Badges | Metaplex Bubblegum | Near-zero cost NFTs on Solana |
| Webhook Engine | BullMQ (Redis queue) | Reliable delivery with retry |
| Push Notifications | Web Push API + Firebase | Cross-platform push support |
| Email | Resend API | Developer-friendly transactional email |
| Token Swap | Jupiter Aggregator | Best swap rates on Solana |
| Dashboard | Next.js + TailwindCSS | SSR + responsive design |
| Fee Oracle | Pyth / Switchboard | Real-time SOL↔USD price for fiat display |
