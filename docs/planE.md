# Plan E — Trust, Pool & Credibility

> Technical implementation plan for anonymity set transparency, configurable privacy knobs, and abuse prevention on Solana.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Trust & Credibility Layer                          │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ Anonymity Set    │  │ Delayed /        │  │ Risk & Abuse      │  │
│  │ Dashboard        │  │ Batched Exits    │  │ Surface           │  │
│  │                  │  │                  │  │                   │  │
│  │ • Effective set  │  │ • User-tunable   │  │ • Jurisdiction    │  │
│  │   size display   │  │   delay (1h-72h) │  │   toggle          │  │
│  │ • Delay options  │  │ • Batch windows  │  │ • Amount caps     │  │
│  │ • Fee tiers      │  │ • Creator        │  │   (unverified)    │  │
│  │ • Health metrics │  │   protection     │  │ • Anomaly detect  │  │
│  │ • Transparency   │  │   framing        │  │ • Compliance      │  │
│  │   for power      │  │                  │  │   signals         │  │
│  │   users          │  │                  │  │                   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬──────────┘  │
│           │                     │                      │              │
│           └─────────────────────┼──────────────────────┘              │
│                                 │                                     │
│                    ┌────────────▼────────────┐                        │
│                    │  Stealth Pool (Plan A)   │                        │
│                    └────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. Anonymity Set Dashboard

### 2.1 Anonymity Set Metrics

The anonymity set is the group of deposits that any given withdrawal could belong to. Larger = more private.

```typescript
interface AnonymitySetMetrics {
  // Per-pool, per-tier metrics
  pool: PublicKey;
  token: string;
  tier: number;                      // Deposit amount tier
  
  // Core metrics
  effectiveSetSize: number;          // Active unspent deposits in this tier
  totalDeposits: number;             // All-time deposits
  totalWithdrawals: number;          // All-time withdrawals
  
  // Health indicators
  depositRate24h: number;            // Deposits in last 24 hours
  withdrawalRate24h: number;         // Withdrawals in last 24 hours
  avgTimeInPool: number;             // Average time deposits stay before withdrawal (hours)
  
  // Privacy score
  privacyScore: PrivacyScore;
  
  // Temporal distribution
  ageDistribution: {
    under1h: number;                 // % of deposits < 1 hour old
    under24h: number;
    under7d: number;
    over7d: number;
  };
  
  lastUpdated: number;
}

interface PrivacyScore {
  score: number;                     // 0-100
  label: "low" | "moderate" | "good" | "strong" | "excellent";
  factors: PrivacyFactor[];
}

interface PrivacyFactor {
  name: string;                      // "set_size", "deposit_rate", "age_diversity"
  value: number;                     // 0-100
  weight: number;                    // Contribution to overall score
  description: string;
}
```

### 2.2 Privacy Score Calculation

```typescript
function calculatePrivacyScore(metrics: AnonymitySetMetrics): PrivacyScore {
  const factors: PrivacyFactor[] = [
    {
      name: "set_size",
      value: Math.min(100, (metrics.effectiveSetSize / 1000) * 100),
      weight: 0.35,
      description: `${metrics.effectiveSetSize} unspent deposits in pool`,
    },
    {
      name: "deposit_rate",
      value: Math.min(100, (metrics.depositRate24h / 50) * 100),
      weight: 0.25,
      description: `${metrics.depositRate24h} new deposits in last 24h`,
    },
    {
      name: "age_diversity",
      value: calculateAgeDiversity(metrics.ageDistribution),
      weight: 0.20,
      description: "Mix of recent and aged deposits",
    },
    {
      name: "withdrawal_ratio",
      value: calculateWithdrawalRatio(metrics),
      weight: 0.20,
      description: "Healthy deposit/withdrawal balance",
    },
  ];
  
  const weightedScore = factors.reduce(
    (sum, f) => sum + f.value * f.weight, 0
  );
  
  return {
    score: Math.round(weightedScore),
    label: scoreToLabel(weightedScore),
    factors,
  };
}

function scoreToLabel(score: number): PrivacyScore["label"] {
  if (score >= 80) return "excellent";
  if (score >= 60) return "strong";
  if (score >= 40) return "good";
  if (score >= 20) return "moderate";
  return "low";
}
```

### 2.3 Dashboard UI

```
┌─────────────────────────────────────────────────────────────┐
│  Anonymity Set Dashboard                                     │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  USDC Pool                          Privacy Score: 78   ││
│  │  ████████████████████████████░░░░░░  Strong 🟢          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ $10 Tier │ │ $100 Tier│ │ $1K Tier │ │ $10K Tier│      │
│  │ Set: 2.4K│ │ Set: 890 │ │ Set: 234 │ │ Set: 45  │      │
│  │ 🟢 Strong│ │ 🟢 Strong│ │ 🟡 Good  │ │ 🟠 Mod   │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                              │
│  ─── Deposit Activity (7 days) ───                           │
│  [Sparkline chart showing deposit/withdrawal rates]          │
│                                                              │
│  ─── Privacy Factors ───                                     │
│  Set Size:        ████████████████░░░░  78/100              │
│  Deposit Rate:    █████████████░░░░░░░  65/100              │
│  Age Diversity:   ██████████████████░░  88/100              │
│  W/D Ratio:       ███████████████░░░░░  75/100              │
│                                                              │
│  ─── Recommended Settings ───                                │
│  Based on current pool state:                                │
│  • Optimal delay: 4-8 hours (current set supports it)       │
│  • Best tier for your amount: $100 (highest set density)    │
│  • Consider: Split $500 → 5×$100 for stronger privacy      │
│                                                              │
│  ─── Fee Tiers ───                                           │
│  Instant exit:    0.40% fee (standard)                      │
│  4h delay:        0.30% fee (-25%)                          │
│  24h delay:       0.20% fee (-50%)                          │
│  72h delay:       0.10% fee (-75%)                          │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Metrics Collection

```typescript
// On-chain event listener → metrics aggregator
class PoolMetricsCollector {
  private redis: Redis;
  
  async onDeposit(event: DepositEvent): Promise<void> {
    const tier = this.amountToTier(event.amount, event.tokenMint);
    const key = `metrics:${event.pool}:${event.tokenMint}:${tier}`;
    
    await this.redis.pipeline()
      .hincrby(key, "effectiveSetSize", 1)
      .hincrby(key, "totalDeposits", 1)
      .hincrby(key, "deposits24h", 1)
      .expire(`${key}:deposits24h`, 86400)
      .hset(key, "lastUpdated", Date.now())
      .exec();
    
    await this.updatePrivacyScore(event.pool, event.tokenMint, tier);
  }
  
  async onWithdrawal(event: WithdrawalEvent): Promise<void> {
    const tier = this.amountToTier(event.amount, event.tokenMint);
    const key = `metrics:${event.pool}:${event.tokenMint}:${tier}`;
    
    await this.redis.pipeline()
      .hincrby(key, "effectiveSetSize", -1)
      .hincrby(key, "totalWithdrawals", 1)
      .hincrby(key, "withdrawals24h", 1)
      .expire(`${key}:withdrawals24h`, 86400)
      .hset(key, "lastUpdated", Date.now())
      .exec();
    
    await this.updatePrivacyScore(event.pool, event.tokenMint, tier);
  }
  
  async getMetrics(
    pool: PublicKey, token: string, tier: number
  ): Promise<AnonymitySetMetrics> {
    const key = `metrics:${pool}:${token}:${tier}`;
    const data = await this.redis.hgetall(key);
    return this.parseMetrics(data, pool, token, tier);
  }
}
```

## 3. Delayed / Batched Exits

### 3.1 Withdrawal Modes

| Mode | Delay | Fee Discount | Privacy Benefit |
|------|-------|-------------|-----------------|
| **Instant** | 0 | 0% | Baseline anonymity set |
| **Short Delay** | 1-4 hours | 25% | Decouples withdrawal timing from deposit |
| **Medium Delay** | 4-24 hours | 50% | Significant temporal unlinkability |
| **Long Delay** | 24-72 hours | 75% | Maximum temporal privacy |
| **Batched** | Next batch window | 50% | Withdrawn with others in same window |

### 3.2 Delayed Withdrawal Architecture

```rust
#[account]
pub struct DelayedWithdrawal {
    pub pool: Pubkey,
    pub nullifier_hash: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
    pub token_mint: Pubkey,
    pub fee_bps: u16,
    
    // Timing
    pub requested_at: i64,
    pub execute_after: i64,          // Timestamp when withdrawal can be executed
    pub expires_at: i64,             // Must be executed before this (prevents stale claims)
    
    // ZK proof stored for deferred execution
    pub proof: Vec<u8>,              // Groth16 proof bytes
    pub merkle_root: [u8; 32],       // Root at time of proof generation
    
    pub status: WithdrawalStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum WithdrawalStatus {
    Pending,                          // Waiting for delay to pass
    Executable,                       // Delay passed, can be executed
    Executed,                         // Withdrawal completed
    Expired,                          // Not executed in time, nullifier released
    Cancelled,                        // User cancelled before execution
}
```

### 3.3 Instructions

```rust
// Request a delayed withdrawal
pub fn request_delayed_withdrawal(
    ctx: Context<RequestDelayedWithdrawal>,
    proof: Vec<u8>,
    nullifier_hash: [u8; 32],
    recipient: Pubkey,
    amount: u64,
    merkle_root: [u8; 32],
    delay_seconds: i64,              // User-chosen delay
) -> Result<()> {
    // 1. Verify ZK proof is valid
    // 2. Mark nullifier as "pending" (prevents double-request)
    // 3. Create DelayedWithdrawal account
    // 4. Calculate discounted fee based on delay_seconds
    // 5. Set execute_after = now + delay_seconds
    // 6. Set expires_at = execute_after + 7 days
}

// Execute a delayed withdrawal (anyone can call after delay)
pub fn execute_delayed_withdrawal(
    ctx: Context<ExecuteDelayedWithdrawal>,
) -> Result<()> {
    // 1. Verify current_time >= execute_after
    // 2. Verify current_time < expires_at
    // 3. Verify merkle_root is still in accepted roots
    // 4. Transfer tokens to recipient
    // 5. Mark nullifier as spent
    // 6. Update status to Executed
}

// Cancel a pending delayed withdrawal
pub fn cancel_delayed_withdrawal(
    ctx: Context<CancelDelayedWithdrawal>,
) -> Result<()> {
    // 1. Verify caller is recipient
    // 2. Release nullifier from "pending" state
    // 3. Mark status as Cancelled
}
```

### 3.4 Batched Exit Windows

```typescript
interface BatchWindow {
  windowId: number;
  openAt: number;                    // When batch starts collecting
  closeAt: number;                   // When batch stops collecting
  executeAt: number;                 // When all withdrawals in batch execute
  
  pendingWithdrawals: number;        // Count of withdrawals in this batch
  status: "collecting" | "pending_execution" | "executed";
}

// Batch windows: every 6 hours
// Window 1: 00:00-06:00 UTC → executes at 06:00
// Window 2: 06:00-12:00 UTC → executes at 12:00
// Window 3: 12:00-18:00 UTC → executes at 18:00
// Window 4: 18:00-00:00 UTC → executes at 00:00

const BATCH_INTERVAL_SECONDS = 6 * 3600; // 6 hours

function getCurrentBatchWindow(): BatchWindow {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % BATCH_INTERVAL_SECONDS);
  
  return {
    windowId: windowStart / BATCH_INTERVAL_SECONDS,
    openAt: windowStart,
    closeAt: windowStart + BATCH_INTERVAL_SECONDS,
    executeAt: windowStart + BATCH_INTERVAL_SECONDS,
    pendingWithdrawals: 0,
    status: "collecting",
  };
}
```

### 3.5 Batched Execution (Cranked)

```typescript
// Crank bot executes all withdrawals in a batch window
async function executeBatchWithdrawals(windowId: number): Promise<void> {
  const pendingWithdrawals = await getPendingBatchWithdrawals(windowId);
  
  // Shuffle order for additional privacy
  shuffleArray(pendingWithdrawals);
  
  // Execute in transaction batches (Solana tx size limits)
  const TX_BATCH_SIZE = 5; // ~5 withdrawals per transaction
  
  for (let i = 0; i < pendingWithdrawals.length; i += TX_BATCH_SIZE) {
    const batch = pendingWithdrawals.slice(i, i + TX_BATCH_SIZE);
    
    const tx = new Transaction();
    for (const withdrawal of batch) {
      tx.add(
        await buildExecuteDelayedWithdrawalIx(withdrawal)
      );
    }
    
    await sendAndConfirmTransaction(connection, tx, [crankKeypair]);
    
    // Random delay between batches to avoid timing patterns
    await sleep(randomBetween(500, 3000));
  }
}
```

## 4. Risk & Abuse Surface Management

### 4.1 Jurisdiction Controls

```rust
#[account]
pub struct JurisdictionConfig {
    pub pool: Pubkey,
    pub authority: Pubkey,            // Governance / admin multisig
    
    // Blocked jurisdictions (stored as hashes for privacy)
    pub blocked_jurisdiction_hashes: Vec<[u8; 32]>,
    
    // Self-declaration required for deposits above threshold
    pub declaration_threshold: u64,   // e.g., 10,000 USDC
    
    pub updated_at: i64,
    pub bump: u8,
}
```

**Jurisdiction Enforcement Flow:**

```
Sender initiates deposit
        │
        ▼
┌───────────────────┐
│ Amount < threshold?│──── Yes ──► Deposit proceeds (no check)
└───────┬───────────┘
        │ No
        ▼
┌───────────────────┐
│ Self-declaration   │
│ "I am not in a    │
│  blocked           │
│  jurisdiction"     │
│ [Accept / Decline] │
└───────┬───────────┘
        │ Accept
        ▼
┌───────────────────┐
│ Store declaration  │
│ hash on-chain      │
│ (no location data) │
└───────┬───────────┘
        │
        ▼
    Deposit proceeds
```

### 4.2 Amount Caps for Unverified Flows

```typescript
interface VerificationTier {
  name: string;
  requirements: string[];
  limits: {
    singleDeposit: number;           // Max per deposit
    dailyDeposit: number;            // Max per 24h
    dailyWithdrawal: number;         // Max per 24h
    monthlyVolume: number;           // Max per 30 days
  };
}

const VERIFICATION_TIERS: VerificationTier[] = [
  {
    name: "unverified",
    requirements: [],
    limits: {
      singleDeposit: 1_000,          // 1,000 USDC
      dailyDeposit: 5_000,
      dailyWithdrawal: 5_000,
      monthlyVolume: 25_000,
    },
  },
  {
    name: "basic",
    requirements: ["email_verified", "jurisdiction_declaration"],
    limits: {
      singleDeposit: 10_000,
      dailyDeposit: 50_000,
      dailyWithdrawal: 50_000,
      monthlyVolume: 250_000,
    },
  },
  {
    name: "verified",
    requirements: ["basic", "kyc_completed"],
    limits: {
      singleDeposit: 100_000,
      dailyDeposit: 500_000,
      dailyWithdrawal: 500_000,
      monthlyVolume: 2_500_000,
    },
  },
];
```

### 4.3 On-Chain Limit Enforcement

```rust
pub fn check_deposit_limits(
    depositor_stats: &DepositorStats,
    amount: u64,
    tier: &VerificationTier,
    current_time: i64,
) -> Result<()> {
    // Single deposit check
    require!(
        amount <= tier.limits.single_deposit,
        SkausError::SingleDepositExceeded
    );
    
    // Daily deposit check
    let daily_total = depositor_stats.get_daily_total(current_time);
    require!(
        daily_total + amount <= tier.limits.daily_deposit,
        SkausError::DailyDepositExceeded
    );
    
    // Monthly volume check
    let monthly_total = depositor_stats.get_monthly_total(current_time);
    require!(
        monthly_total + amount <= tier.limits.monthly_volume,
        SkausError::MonthlyVolumeExceeded
    );
    
    Ok(())
}
```

### 4.4 Anomaly Detection (Off-Chain)

```typescript
interface AnomalyDetector {
  // Real-time stream analysis
  analyzeDeposit(deposit: DepositEvent): AnomalyResult;
  analyzeWithdrawal(withdrawal: WithdrawalEvent): AnomalyResult;
  
  // Periodic analysis
  dailyPoolHealthCheck(): PoolHealthReport;
}

interface AnomalyResult {
  riskScore: number;                 // 0-100
  flags: AnomalyFlag[];
  action: "allow" | "flag" | "block";
}

interface AnomalyFlag {
  type: string;
  severity: "info" | "warning" | "critical";
  description: string;
}

class SkausAnomalyDetector implements AnomalyDetector {
  analyzeDeposit(deposit: DepositEvent): AnomalyResult {
    const flags: AnomalyFlag[] = [];
    let riskScore = 0;
    
    // Rapid-fire deposits from same source
    if (this.isRapidFireDeposit(deposit)) {
      flags.push({
        type: "rapid_fire",
        severity: "warning",
        description: "Multiple deposits in < 60 seconds from same source",
      });
      riskScore += 30;
    }
    
    // Unusual amount pattern (not standard tiers)
    if (this.isUnusualAmountPattern(deposit)) {
      flags.push({
        type: "unusual_pattern",
        severity: "info",
        description: "Deposit pattern suggests automated splitting",
      });
      riskScore += 15;
    }
    
    // Known flagged wallet interaction
    if (this.isFromFlaggedSource(deposit)) {
      flags.push({
        type: "flagged_source",
        severity: "critical",
        description: "Deposit source has prior flags",
      });
      riskScore += 50;
    }
    
    return {
      riskScore: Math.min(100, riskScore),
      flags,
      action: riskScore >= 70 ? "block" : riskScore >= 40 ? "flag" : "allow",
    };
  }
  
  dailyPoolHealthCheck(): PoolHealthReport {
    return {
      timestamp: Date.now(),
      pools: SUPPORTED_TOKENS.map(token => ({
        token: token.symbol,
        totalLocked: this.getTotalLocked(token),
        netFlow24h: this.getNetFlow(token, 24),
        unusualActivity: this.detectUnusualPatterns(token),
        setHealthy: this.isSetHealthy(token),
      })),
    };
  }
}
```

### 4.5 Compliance Signals (In-Product)

Features that signal seriousness to regulators, judges, and institutional users:

```typescript
interface ComplianceSignals {
  // Visible in-product
  jurisdictionToggle: {
    enabled: boolean;
    blockedList: string[];           // ["OFAC list", "EU sanctions"]
    lastUpdated: string;
    source: string;                  // "Chainalysis / OFAC SDN"
  };
  
  amountCaps: {
    enabled: boolean;
    tiers: VerificationTier[];
    displayedToUser: boolean;        // Shown transparently
  };
  
  auditTrail: {
    poolActivityPublic: boolean;     // Aggregate stats are public
    individualTxsPrivate: boolean;   // Individual txs remain private
    complianceEndpoint: string;      // For institutional inquiries
  };
  
  transparencyReport: {
    frequency: "monthly";
    includes: [
      "total_volume",
      "active_users",
      "blocked_transactions",
      "average_anonymity_set",
      "compliance_requests_served"
    ];
  };
}
```

## 5. Pool Health Monitoring

### 5.1 Health Metrics API

```typescript
// GET /api/pool/health — Public endpoint, no auth required
router.get("/api/pool/health", async (req, res) => {
  const health = await Promise.all(
    SUPPORTED_TOKENS.map(async (token) => {
      const metrics = await getAllTierMetrics(token);
      
      return {
        token: token.symbol,
        tiers: metrics.map(m => ({
          amount: m.tier,
          effectiveSetSize: m.effectiveSetSize,
          privacyScore: m.privacyScore,
          depositRate24h: m.depositRate24h,
          avgTimeInPool: m.avgTimeInPool,
        })),
        overallScore: calculateOverallScore(metrics),
        tvl: await getTotalValueLocked(token),
        lastActivity: await getLastActivityTimestamp(token),
      };
    })
  );
  
  res.json({
    status: "healthy",
    pools: health,
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});
```

### 5.2 Monitoring & Alerts

```typescript
interface PoolAlert {
  type: "low_set_size" | "high_drain_rate" | "stale_pool" | "anomaly_detected";
  severity: "info" | "warning" | "critical";
  pool: string;
  tier?: number;
  message: string;
  timestamp: number;
  autoAction?: "notify_team" | "pause_deposits" | "increase_fees";
}

// Alert thresholds
const ALERT_THRESHOLDS = {
  low_set_size: {
    warning: 50,                     // Set size below 50
    critical: 10,                    // Set size below 10
  },
  high_drain_rate: {
    warning: 0.7,                    // 70% of deposits withdrawn in 24h
    critical: 0.9,                   // 90% of deposits withdrawn in 24h
  },
  stale_pool: {
    warning: 24 * 3600,             // No deposits in 24 hours
    critical: 72 * 3600,            // No deposits in 72 hours
  },
};
```

## 6. Fee Tier Structure

### 6.1 Dynamic Fee Model

```typescript
interface FeeTier {
  name: string;
  delayRange: { min: number; max: number };  // Seconds
  feeBps: number;
  feeDiscount: string;
  privacyBenefit: string;
}

function getFeeTiers(baseFeeBps: number): FeeTier[] {
  return [
    {
      name: "Instant",
      delayRange: { min: 0, max: 0 },
      feeBps: baseFeeBps,
      feeDiscount: "0%",
      privacyBenefit: "Standard anonymity set",
    },
    {
      name: "Quick",
      delayRange: { min: 3600, max: 14400 },
      feeBps: Math.floor(baseFeeBps * 0.75),
      feeDiscount: "25%",
      privacyBenefit: "Temporal decorrelation from deposit",
    },
    {
      name: "Standard",
      delayRange: { min: 14400, max: 86400 },
      feeBps: Math.floor(baseFeeBps * 0.50),
      feeDiscount: "50%",
      privacyBenefit: "Strong temporal privacy",
    },
    {
      name: "Maximum Privacy",
      delayRange: { min: 86400, max: 259200 },
      feeBps: Math.floor(baseFeeBps * 0.25),
      feeDiscount: "75%",
      privacyBenefit: "Maximum temporal + set diversity",
    },
  ];
}
```

### 6.2 Fee Incentive Alignment

Lower fees for delayed withdrawals incentivize:
- **Larger anonymity sets**: Delayed deposits stay in the pool longer
- **Temporal diversity**: Mix of ages makes timing analysis harder
- **Pool stability**: Reduces rapid drain scenarios

## 7. Transparency Report (Monthly)

### 7.1 Report Schema

```typescript
interface TransparencyReport {
  period: { start: string; end: string };
  generatedAt: string;
  
  // Volume
  totalDeposits: { usdc: number; sol: number };
  totalWithdrawals: { usdc: number; sol: number };
  uniqueDepositors: number;         // Approximate (Bloom filter)
  
  // Privacy
  averageAnonymitySetSize: Record<string, number>;  // Per tier
  averageTimeInPool: Record<string, number>;         // Per tier, in hours
  
  // Compliance
  blockedTransactions: number;
  jurisdictionDeclarations: number;
  viewingCredentialsIssued: number;
  disclosurePackagesGenerated: number;
  
  // Health
  uptimePercentage: number;
  averageDepositConfirmationTime: number;  // Seconds
  averageWithdrawalTime: number;           // Seconds
  
  // Incidents
  incidents: Incident[];
  
  // Signature
  signedBy: string;                 // Protocol multisig
  signature: string;
}
```

### 7.2 Automated Report Generation

```typescript
// Cron job: first day of each month
async function generateMonthlyReport(): Promise<TransparencyReport> {
  const period = getLastMonthPeriod();
  
  const [deposits, withdrawals, privacy, compliance, health] = await Promise.all([
    aggregateDeposits(period),
    aggregateWithdrawals(period),
    aggregatePrivacyMetrics(period),
    aggregateComplianceMetrics(period),
    aggregateHealthMetrics(period),
  ]);
  
  const report: TransparencyReport = {
    period,
    generatedAt: new Date().toISOString(),
    totalDeposits: deposits,
    totalWithdrawals: withdrawals,
    uniqueDepositors: deposits.uniqueCount,
    averageAnonymitySetSize: privacy.avgSetSizes,
    averageTimeInPool: privacy.avgTimes,
    blockedTransactions: compliance.blocked,
    jurisdictionDeclarations: compliance.declarations,
    viewingCredentialsIssued: compliance.viewingKeys,
    disclosurePackagesGenerated: compliance.disclosures,
    uptimePercentage: health.uptime,
    averageDepositConfirmationTime: health.avgDepositTime,
    averageWithdrawalTime: health.avgWithdrawalTime,
    incidents: health.incidents,
    signedBy: PROTOCOL_MULTISIG.toBase58(),
    signature: "",
  };
  
  report.signature = await signReport(report);
  
  await publishReport(report);      // IPFS + website
  return report;
}
```

## 8. Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Anonymity set gaming | Minimum set size requirements; fee incentives for pool growth |
| Timing correlation | Delayed exits, batched windows, random execution order |
| Pool drain attack | Rate limits on withdrawals; anomaly detection; circuit breaker |
| Sybil deposits | Deposit tiers make spam expensive; minimum amounts |
| Jurisdiction evasion | Self-declaration is a compliance signal, not enforcement |
| Transparency report manipulation | Signed by multisig; data derived from on-chain state |
| Privacy score gaming | Multiple independent factors; weighted scoring |
| Crank manipulation (batched exits) | Random execution order; multiple independent crank operators |

## 9. Development Phases

### Phase 1: Basic Metrics (Weeks 1-3)
- [ ] Pool metrics collector (deposits, withdrawals, set sizes)
- [ ] Redis-based metrics store
- [ ] Privacy score calculation
- [ ] Public health API endpoint

### Phase 2: Dashboard UI (Weeks 4-6)
- [ ] Anonymity set dashboard components
- [ ] Per-tier privacy score display
- [ ] Deposit activity charts
- [ ] Recommended settings engine

### Phase 3: Delayed Exits (Weeks 7-10)
- [ ] DelayedWithdrawal on-chain account
- [ ] Request, execute, cancel instructions
- [ ] Fee tier discounts
- [ ] Crank bot for batch execution
- [ ] Batch window logic

### Phase 4: Risk & Compliance (Weeks 11-14)
- [ ] Jurisdiction toggle + declaration flow
- [ ] Amount caps per verification tier
- [ ] Anomaly detection pipeline
- [ ] Monthly transparency report generator
- [ ] Compliance signal display in-product

## 10. Dependencies

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Metrics Store | Redis (Sorted Sets + Hashes) | High-throughput real-time metrics |
| Metrics Dashboard | Next.js + Recharts | Interactive charting, SSR |
| Delayed Withdrawals | Anchor program extension | On-chain timing enforcement |
| Batch Crank | Clockwork / custom cron | Reliable scheduled execution on Solana |
| Anomaly Detection | Custom rules engine | Lightweight, extensible |
| Transparency Reports | IPFS + Arweave | Immutable, publicly verifiable |
| Alert System | PagerDuty / Grafana Alerts | Ops team notification |
| Jurisdiction Data | OFAC SDN list + Chainalysis | Industry-standard compliance data |
