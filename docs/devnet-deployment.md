# SKAUS — Devnet Deployment

**Deployed**: April 9, 2026
**Cluster**: Solana Devnet
**Anchor Version**: 0.30.1
**Solana CLI**: 3.1.12

---

## Programs Overview

| Program | Address | Binary Size | Rent Held |
|---------|---------|-------------|-----------|
| **Stealth Pool** (Plan A) | `EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq` | 316 KB | 2.231 SOL |
| **Name Registry** (Plan B) | `JAmSyEVzHNCTzC6BETuRQdwK1gLQYUFnzwiVKRVYqpdT` | 268 KB | 1.897 SOL |

**Upgrade Authority**: `EibRsRoMiPD7yndP7YJbZt5Ut19poNqsjs3BvvTQ5rgp`

---

## 1. Stealth Pool (Plan A)

### Deployed Addresses

| Component             | Address                                              |
|-----------------------|------------------------------------------------------|
| **Program ID**        | `EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq`     |
| **ProgramData**       | `8zdLwKBuePejkA9c62SXBFfBRr1WVuAis1frdnuBQ53i`     |
| **Token Mint (test)** | `C25DXFMAFWX3UuyHHJYQEvxpcc14kt2e92kbQ57tWeg`      |
| **Pool PDA**          | `BCSm6hvWmJF6UhaUrfSNVGXzGBhaSQTFbvsRPXuDqfoF`     |
| **Merkle Root History** | `6iwWLQHicoNnXAL4H46t14BGyGTbYNzDbcEQC3Q95er8`   |
| **Fee Vault ATA**     | `G4rbhDtZABVrB7NMuNK3c75dbXHY8mirxGYN2go4TV9`      |

### Transaction Signatures

| Action          | Signature |
|-----------------|-----------|
| Program Deploy  | `3CPqm26REeQjCsNNZuZFuc3Ynbn6rkNEzd7g61PXr1h7maMxfFsHvLJCBLX8PtWufPt1ZLq2ZJQMZjYgYYo62YKc` |
| Pool Initialize | `4myZLWuaPiCfZV7aZeqv63goVzDaSq2aevq12tgLUd5tD6G4AGXS5dWaBDhPBZcemPVTCxWbhs2Ju2HYCmTLgPkk` |

### Pool Configuration

| Parameter            | Value                    |
|----------------------|--------------------------|
| Fee                  | 30 bps (0.3%)            |
| Min Deposit          | 10,000,000 (10 USDC)    |
| Max Deposit          | 10,000,000,000 (10K USDC)|
| Merkle Depth         | 20 (1,048,576 leaves)   |
| Deposit Tiers (USDC) | 10 / 100 / 1,000 / 10,000 |
| Deposit Tiers (SOL)  | 0.1 / 1 / 10 / 100      |
| Features             | `devnet-mock` (ZK proof bypass for testing) |

### PDA Derivation Seeds

```
Pool:           ["stealth_pool", token_mint]
Merkle History: ["merkle_roots", pool]
Deposit Note:   ["deposit_note", pool, commitment]
Spent Nullifier:["nullifier", pool, nullifier_hash]
```

### Anchor Instruction Discriminators

Computed as `sha256("global:<fn_name>")[..8]`:

| Instruction         | Discriminator                          |
|---------------------|----------------------------------------|
| `initialize_pool`   | `sha256("global:initialize_pool")[..8]`|
| `deposit`           | `sha256("global:deposit")[..8]`        |
| `withdraw`          | `sha256("global:withdraw")[..8]`       |
| `update_pool_config`| `sha256("global:update_pool_config")[..8]` |
| `pause_pool`        | `sha256("global:pause_pool")[..8]`     |
| `unpause_pool`      | `sha256("global:unpause_pool")[..8]`   |
| `set_fee_vault`     | `sha256("global:set_fee_vault")[..8]`  |

### Explorer Links

- **Program**: https://explorer.solana.com/address/EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq?cluster=devnet
- **Pool PDA**: https://explorer.solana.com/address/BCSm6hvWmJF6UhaUrfSNVGXzGBhaSQTFbvsRPXuDqfoF?cluster=devnet
- **Deploy Tx**: https://explorer.solana.com/tx/3CPqm26REeQjCsNNZuZFuc3Ynbn6rkNEzd7g61PXr1h7maMxfFsHvLJCBLX8PtWufPt1ZLq2ZJQMZjYgYYo62YKc?cluster=devnet
- **Init Tx**: https://explorer.solana.com/tx/4myZLWuaPiCfZV7aZeqv63goVzDaSq2aevq12tgLUd5tD6G4AGXS5dWaBDhPBZcemPVTCxWbhs2Ju2HYCmTLgPkk?cluster=devnet

---

## 2. Name Registry (Plan B)

### Deployed Addresses

| Component              | Address                                              |
|------------------------|------------------------------------------------------|
| **Program ID**         | `JAmSyEVzHNCTzC6BETuRQdwK1gLQYUFnzwiVKRVYqpdT`     |
| **ProgramData**        | `26xVrwTJ6fSQgVVfDvteqUbEK39crmVEmgddZ38jwK1X`     |
| **Registry Config PDA**| `8mosYnZHPjJH8E3ywfzU3w7wy2GFrKQYXGt3t6UYs7cK`     |
| **"alice" NameRecord** | `DNPCSmWySx85eso3d3cVRSwmGZz4dWG6kp8ath1YvEEF`      |

### Transaction Signatures

| Action               | Signature |
|----------------------|-----------|
| Program Deploy       | `5YD9ixSbqRS7RZMXKLJmQSpCtX45dRjDgavgkTjJPSCrMRAaJ6qBttWcZQDCpvuNCB9RRaW9Q9BYnqu9BWjs5HGg` |
| Initialize Registry  | `3cEn6d6tyFiJiQQcypvLCxK5vPssxTc8t7RHzBpE5dnLyR7SznZbnfqsK8yFRRtGXaVRCLfojCpqHDPGm28TScc4` |
| Register "alice"     | `3TqmFYnvrKPPy3N3UpNxnnzhjzud5c8CJs28fZk9VZQWisJNv3HbMiWJQZXTGV84XmtmhiTQAjyvsWoLHMoKBkj5` |

### Registry Configuration

| Parameter          | Value              |
|--------------------|--------------------|
| Registration Fee   | 0 lamports (free)  |
| Fee Treasury       | Upgrade authority   |
| Total Registrations| 1 ("alice")        |

### Registered Names

| Name    | NameRecord PDA                                       | Scan Pubkey | Spend Pubkey |
|---------|------------------------------------------------------|-------------|--------------|
| `alice` | `DNPCSmWySx85eso3d3cVRSwmGZz4dWG6kp8ath1YvEEF`      | `6PcadoUiMebncpTFzyJjUGeVHUyKfyPv9QDAbT9cgcoK` | `2BQaRPdSHejagLxhofHDPDcX24Xt25UrS4iyMrdLhkie` |

### PDA Derivation Seeds

```
Registry Config: ["registry_config"]
Name Record:     ["name", Poseidon(lowercase(name))]
Deposit Path:    ["deposit_path", name_record, path_index_u64_le]
```

### Anchor Instruction Discriminators

| Instruction             | Discriminator                                  |
|-------------------------|------------------------------------------------|
| `initialize_registry`   | `sha256("global:initialize_registry")[..8]`    |
| `register_name`         | `sha256("global:register_name")[..8]`          |
| `rotate_keys`           | `sha256("global:rotate_keys")[..8]`            |
| `create_deposit_path`   | `sha256("global:create_deposit_path")[..8]`    |
| `update_profile`        | `sha256("global:update_profile")[..8]`         |
| `update_registry_config`| `sha256("global:update_registry_config")[..8]` |
| `pause_registry`        | `sha256("global:pause_registry")[..8]`         |
| `unpause_registry`      | `sha256("global:unpause_registry")[..8]`       |
| `suspend_name`          | `sha256("global:suspend_name")[..8]`           |
| `unsuspend_name`        | `sha256("global:unsuspend_name")[..8]`         |

### Explorer Links

- **Program**: https://explorer.solana.com/address/JAmSyEVzHNCTzC6BETuRQdwK1gLQYUFnzwiVKRVYqpdT?cluster=devnet
- **Registry Config**: https://explorer.solana.com/address/8mosYnZHPjJH8E3ywfzU3w7wy2GFrKQYXGt3t6UYs7cK?cluster=devnet
- **"alice" NameRecord**: https://explorer.solana.com/address/DNPCSmWySx85eso3d3cVRSwmGZz4dWG6kp8ath1YvEEF?cluster=devnet
- **Deploy Tx**: https://explorer.solana.com/tx/5YD9ixSbqRS7RZMXKLJmQSpCtX45dRjDgavgkTjJPSCrMRAaJ6qBttWcZQDCpvuNCB9RRaW9Q9BYnqu9BWjs5HGg?cluster=devnet
- **Init Tx**: https://explorer.solana.com/tx/3cEn6d6tyFiJiQQcypvLCxK5vPssxTc8t7RHzBpE5dnLyR7SznZbnfqsK8yFRRtGXaVRCLfojCpqHDPGm28TScc4?cluster=devnet
- **Register "alice" Tx**: https://explorer.solana.com/tx/3TqmFYnvrKPPy3N3UpNxnnzhjzud5c8CJs28fZk9VZQWisJNv3HbMiWJQZXTGV84XmtmhiTQAjyvsWoLHMoKBkj5?cluster=devnet

---

## How to Redeploy

### Stealth Pool

```bash
solana config set --url devnet
solana balance

# Build and deploy
bash scripts/deploy-devnet.sh

# Initialize a pool for a token mint
npx tsx scripts/init-pool-devnet.ts --mint <TOKEN_MINT_ADDRESS>

# Or create a new test mint automatically
npx tsx scripts/init-pool-devnet.ts
```

### Name Registry

```bash
solana config set --url devnet
solana balance

# Build and deploy
bash scripts/deploy-name-registry-devnet.sh

# Initialize the registry (free registration)
npx tsx scripts/init-name-registry-devnet.ts

# Initialize + register a name in one step
npx tsx scripts/init-name-registry-devnet.ts --register alice
```

---

## Environment Variables

Set these for the gateway and web app to connect:

```env
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
STEALTH_POOL_PROGRAM_ID=EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq
NAME_REGISTRY_PROGRAM_ID=JAmSyEVzHNCTzC6BETuRQdwK1gLQYUFnzwiVKRVYqpdT
```

---

## Architecture Notes

### Stealth Pool
- **ZK Verification**: Built with `groth16-solana` using Solana's alt_bn128 precompiles (~200K CU). On devnet, the `devnet-mock` feature flag bypasses proof verification for testing.
- **Merkle Tree**: Uses Poseidon hash via `solana_program::poseidon` syscall, matching the circom circuit (`Poseidon(2)` over BN254).
- **Commitment Scheme**: `commitment = Poseidon(secret, nullifier, amount)`, `nullifier_hash = Poseidon(nullifier)`.
- **Double-Spend Protection**: Each spent nullifier gets its own PDA (`SpentNullifier`). Attempting to reuse a nullifier causes Anchor's `init` to fail with "already in use".
- **Deposit Tiers**: Fixed tiers enforce anonymity set uniformity — all deposits in a tier are indistinguishable on-chain.

### Name Registry
- **Name Hashing**: Names are hashed with Poseidon (matching the circuit's hash function) for PDA derivation. The plaintext name is never stored on-chain.
- **Stealth Meta-Address**: Each name stores a scan pubkey + spend pubkey, enabling ECDH-based stealth address derivation for incoming payments.
- **Per-Link Deposit Paths**: Each pay link or invoice gets a unique derivation path (`deposit_path`), preventing cross-link correlation of payment activity.
- **Key Rotation**: Name owners can rotate their stealth meta-address (scan + spend keys) without changing their registered name or PDA.
- **Admin Controls**: Registry authority can pause registrations, suspend individual names (policy violations), and update the registration fee.
