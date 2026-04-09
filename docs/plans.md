SKAUS

skaus is a privacy-preserving payment and identity layer for Solana that enables users to receive funds through independent privacy, ensuring the recipient's treasury remains shielded regardless of whether the sender is onboarded into the skaus ecosystem. The platform implements a Stealth Pool architecture that combines shared address pools, encrypted routing, and zero-knowledge (ZK) withdrawals to make on-chain transactions cryptographically unlinkable while maintaining the verifiability required for institutional compliance and audits. By leveraging ZK Compression to manage high-volume user profiles at near-zero state cost and Lit Protocol for decentralized conditional access control, skaus simplifies private monetization into a user-friendly link-in-bio experience that is as intuitive as sharing a standard web URL.



Features (landscape-informed, more concrete)
A. Core payment rail 
Universal pay link
Static URL + QR; payer uses any Solana wallet; no skaus install for sender.
Vs landscape: Makes “independent privacy” testable; many projects still assume both sides in-app.

Shielded balance + ZK claim
Funds land in shared liquidity with ZK withdrawal to recipient control; chain shows pool activity, not “sender → your salary graph.”
Vs Cloak/PIVY: Same family—your pitch must add B–D below or you look duplicate.

Minimum viable compliance viewport
One clear mode: e.g. recipient-issued viewing credential or ZK proof of rule (“withdrawal respects limit R”) without publishing full graph.
Vs NinjaPay: Same “compliance” word—name the artifact (viewing key, attestations, proofs).

B. Identity & discovery 
Human-readable identity layer
@name / name.skaus (or similar) resolving to rotating receive semantics (stealth meta-address or pool deposit tag), not a single public pubkey.
Feature detail: Per-link or per-payer deposit paths so one leaked link doesn’t deanonymize everything.

Profile under compression
Link page, tiers, thank-you message, optional gated content pointer—state compressed so “10k creators × rich profile” is believable.
Vs Amp Pay: You own creator link + profile scale, not generic P2P.

Payment requests & invoices
Amount + memo + expiry; payer still uses normal wallet.
Vs Privment-ish: B2B-light angle without full “private invoices” scope on day one.

C. Policy & access (Lit — make it do real work)
Lit-gated decryption
Encrypted routing metadata / viewing payloads: only recipient, or recipient + designated auditor, or after time T can decrypt.
Landscape gap: Most hackathon projects don’t show programmable disclosure; this is a clear differentiator if you demo one policy.

Optional “disclosure packages”
One-click generate audit bundle (proofs + allowed logs) for accountants or platforms—opt-in, not default surveillance.

Rate / velocity limits as policy
e.g. daily withdraw cap without revealing why; reduces abuse and regulatory heat vs “anything goes mixer.”

D. Creator & growth features (vs Unchain / PIVY)
Tip jar + membership hint (non-custodial)
Single link; optional “supporter badge” or NFT gate without exposing full payment graph (policy or ZK summary).

Webhook / webhook-hash alerts
“You got paid” off-chain without putting PII on-chain; fits link-in-bio operators.

Stablecoin-first presets
USDC on multiple chains , also needs to support SOL token also; clear fee display; no “support every SPL day one.”

E. Trust, pool, and credibility (vs Cloak)
Anonymity set dashboard 
Show effective set size, delay options, fee tier—transparency for sophisticated users; avoids “trust us it’s private.”

Delayed / batched exits (optional)
User-tunable privacy knob; Cloak-adjacent but framed as creator protection, not miner game theory (unless you also want mining incentives later).

Risk & abuse surface in-product
Blocked jurisdictions toggle, amount caps for unverified flows—signals seriousness to judges worried about mixers.



