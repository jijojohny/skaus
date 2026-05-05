'use client';

import { useState, useEffect } from 'react';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { Connection, Transaction } from '@solana/web3.js';
import { DashboardShell } from '@/components/DashboardShell';
import {
  fetchProfile,
  updateProfile,
  linkProfileToChain,
  confirmProfileOnChain,
  lookupByAuthority,
  type UpdateProfileResult,
} from '@/lib/gateway';
import type { CompressedProfile, PaymentTier, GatedContentPointer } from '@skaus/types';

const PLATFORMS = ['Website', 'Twitter', 'GitHub', 'Instagram', 'YouTube', 'TikTok', 'Discord', 'Telegram', 'Other'];

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default function SettingsPage() {
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const wallet = wallets[0];
  const walletAddress = wallet?.address || '';

  const [username, setUsername] = useState<string | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // Form — identity
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState('');
  const [links, setLinks] = useState<{ platform: string; url: string }[]>([]);

  // Form — payment config
  const [suggestedAmounts, setSuggestedAmounts] = useState('');
  const [customAmountEnabled, setCustomAmountEnabled] = useState(true);
  const [thankYouMessage, setThankYouMessage] = useState('');

  // Form — tiers
  const [tiers, setTiers] = useState<PaymentTier[]>([]);
  const [expandedTier, setExpandedTier] = useState<number | null>(null);

  // Form — gated content
  const [gatedContent, setGatedContent] = useState<GatedContentPointer[]>([]);
  const [expandedContent, setExpandedContent] = useState<number | null>(null);

  // Save / compression
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [compressionResult, setCompressionResult] = useState<UpdateProfileResult | null>(null);

  // Link-to-chain
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkDone, setLinkDone] = useState(false);

  // ── Username resolution ──────────────────────────────────────────────────

  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;

    try {
      const savedName = localStorage.getItem('skaus_username');
      const savedWallet = localStorage.getItem('skaus_wallet');
      if (savedName && savedWallet === walletAddress) {
        setUsername(savedName);
        setUsernameLoading(false);
        return;
      }
    } catch { /* ignore */ }

    lookupByAuthority(walletAddress)
      .then(r => {
        if (cancelled) return;
        const name = r.names[0]?.username ?? null;
        setUsername(name);
        if (name) {
          try {
            localStorage.setItem('skaus_username', name);
            localStorage.setItem('skaus_wallet', walletAddress);
          } catch { /* ignore */ }
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setUsernameLoading(false); });

    return () => { cancelled = true; };
  }, [walletAddress]);

  // ── Profile load ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!username) return;
    setProfileLoading(true);
    fetchProfile(username)
      .then(p => {
        if (!p) return;
        setDisplayName(p.displayName ?? '');
        setBio(p.bio ?? '');
        setAvatarUri(p.avatarUri ?? '');
        setLinks((p.links ?? []).map(l => ({ platform: l.platform, url: l.url })));
        setSuggestedAmounts((p.paymentConfig?.suggestedAmounts ?? []).join(', '));
        setCustomAmountEnabled(p.paymentConfig?.customAmountEnabled ?? true);
        setThankYouMessage(p.paymentConfig?.thankYouMessage ?? '');
        setTiers(p.tiers ?? []);
        setGatedContent(p.gatedContent ?? []);
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [username]);

  // ── Links helpers ────────────────────────────────────────────────────────

  const addLink = () => setLinks(prev => [...prev, { platform: 'Website', url: '' }]);
  const removeLink = (i: number) => setLinks(prev => prev.filter((_, idx) => idx !== i));
  const updateLink = (i: number, f: 'platform' | 'url', v: string) =>
    setLinks(prev => prev.map((l, idx) => idx === i ? { ...l, [f]: v } : l));

  // ── Tiers helpers ────────────────────────────────────────────────────────

  const addTier = () => {
    const next = tiers.length;
    setTiers(prev => [
      ...prev,
      { id: genId(), name: '', amount: 0, currency: 'USDC', benefits: [''], gateType: 'one-time' },
    ]);
    setExpandedTier(next);
  };

  const removeTier = (i: number) => {
    setTiers(prev => prev.filter((_, idx) => idx !== i));
    setExpandedTier(e => (e === i ? null : e !== null && e > i ? e - 1 : e));
  };

  const updateTier = <K extends keyof PaymentTier>(i: number, f: K, v: PaymentTier[K]) =>
    setTiers(prev => prev.map((t, idx) => idx === i ? { ...t, [f]: v } : t));

  const addBenefit = (ti: number) =>
    setTiers(prev => prev.map((t, idx) => idx === ti ? { ...t, benefits: [...t.benefits, ''] } : t));

  const updateBenefit = (ti: number, bi: number, v: string) =>
    setTiers(prev => prev.map((t, idx) =>
      idx === ti ? { ...t, benefits: t.benefits.map((b, j) => j === bi ? v : b) } : t));

  const removeBenefit = (ti: number, bi: number) =>
    setTiers(prev => prev.map((t, idx) =>
      idx === ti ? { ...t, benefits: t.benefits.filter((_, j) => j !== bi) } : t));

  // ── Gated content helpers ─────────────────────────────────────────────────

  const addContent = () => {
    const next = gatedContent.length;
    const defaultCondition = tiers[0] ? `tier:${tiers[0].id}` : '';
    setGatedContent(prev => [
      ...prev,
      { contentId: genId(), encryptedUri: '', accessCondition: defaultCondition, previewText: '' },
    ]);
    setExpandedContent(next);
  };

  const removeContent = (i: number) => {
    setGatedContent(prev => prev.filter((_, idx) => idx !== i));
    setExpandedContent(e => (e === i ? null : e !== null && e > i ? e - 1 : e));
  };

  const updateContent = (i: number, f: keyof GatedContentPointer, v: string) =>
    setGatedContent(prev => prev.map((c, idx) => idx === i ? { ...c, [f]: v } : c));

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!username || !walletAddress) return;
    if (!displayName.trim()) { setSaveError('Display name is required.'); return; }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const parsedAmounts = suggestedAmounts
      .split(',')
      .map(s => parseFloat(s.trim()))
      .filter(n => !Number.isNaN(n) && n > 0);

    const profile: CompressedProfile = {
      displayName: displayName.trim(),
      bio: bio.trim(),
      avatarUri: avatarUri.trim(),
      links: links
        .filter(l => l.url.trim())
        .map(l => ({ platform: l.platform, url: l.url.trim(), verified: false })),
      paymentConfig: {
        acceptedTokens: ['USDC'],
        suggestedAmounts: parsedAmounts,
        customAmountEnabled,
        thankYouMessage: thankYouMessage.trim(),
      },
      tiers: tiers.filter(t => t.name.trim()),
      gatedContent: gatedContent.filter(c => c.previewText.trim()),
      version: 1,
      updatedAt: Date.now(),
    };

    try {
      const result = await updateProfile(username, profile, walletAddress);
      setCompressionResult(result);
      setLinkDone(result.compressedOnChain);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  // ── Link-to-chain ─────────────────────────────────────────────────────────

  const handleLinkToChain = async () => {
    if (!username || !walletAddress || !wallet) return;
    setLinking(true);
    setLinkError(null);

    try {
      const { transaction: txBase64, hash } = await linkProfileToChain(username, walletAddress);

      const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const { signedTransaction } = await signTransaction({ transaction: serialized, wallet });

      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
        'confirmed',
      );
      const txSig = await connection.sendRawTransaction(signedTransaction, { skipPreflight: true });
      await connection.confirmTransaction(txSig, 'confirmed');
      await confirmProfileOnChain(username, hash, txSig);

      setLinkDone(true);
      setCompressionResult(prev => prev ? { ...prev, compressedOnChain: true } : null);
    } catch (e: any) {
      setLinkError(e.message || 'Failed to link profile on-chain.');
    } finally {
      setLinking(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const showLinkBanner = compressionResult !== null && !compressionResult.compressedOnChain && !linkDone;

  // ── Loading / no-username guards ──────────────────────────────────────────

  if (usernameLoading || profileLoading) {
    return (
      <DashboardShell title="Settings">
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 rounded-full border-2 border-skaus-primary border-t-transparent animate-spin" />
        </div>
      </DashboardShell>
    );
  }

  if (!username) {
    return (
      <DashboardShell title="Settings">
        <div className="px-4 sm:px-6 lg:px-10 py-16 max-w-lg mx-auto text-center">
          <p className="text-sm text-skaus-muted">
            No registered username found.{' '}
            <a href="/onboarding" className="text-skaus-primary hover:underline">Complete onboarding first.</a>
          </p>
        </div>
      </DashboardShell>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardShell title="Settings">
      <div className="px-4 sm:px-6 lg:px-10 py-8 max-w-2xl mx-auto space-y-8 pb-20">

        {/* Link-to-chain banner */}
        {showLinkBanner && (
          <div className="border border-amber-500/40 bg-amber-500/5 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold tracking-[0.18em] text-amber-400 uppercase mb-1">Profile not linked on-chain</p>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Your profile is saved but not yet anchored to your on-chain identity. Sign one transaction to make it permanent.
              </p>
              {linkError && <p className="mt-2 text-xs text-red-400">{linkError}</p>}
            </div>
            <button
              type="button"
              onClick={() => void handleLinkToChain()}
              disabled={linking}
              className="shrink-0 border border-amber-500/60 bg-amber-500/10 px-4 py-2.5 text-[11px] font-bold tracking-[0.15em] text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {linking
                ? <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-amber-400 border-t-transparent animate-spin" />LINKING...</span>
                : 'LINK_ON_CHAIN'}
            </button>
          </div>
        )}

        {linkDone && compressionResult && (
          <div className="border border-green-500/40 bg-green-500/5 px-4 py-3 flex items-center gap-3">
            <svg className="h-4 w-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-[11px] font-bold tracking-[0.15em] text-green-400">PROFILE_LINKED_ON_CHAIN</p>
          </div>
        )}

        {/* ── IDENTITY ── */}
        <Section label="IDENTITY">
          <Field label="USERNAME">
            <div className="mt-1.5 px-3 py-2.5 border border-neutral-800 bg-neutral-900/40 text-neutral-400 text-sm font-mono select-all">
              @{username}
            </div>
          </Field>
          <Field label="DISPLAY_NAME">
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="Your public display name" maxLength={64} className="input-field mt-1.5" />
          </Field>
          <Field label="BIO">
            <textarea value={bio} onChange={e => setBio(e.target.value)}
              placeholder="Tell people about yourself" rows={3} maxLength={280}
              className="input-field mt-1.5 resize-none" />
            <p className="mt-1 text-right text-[10px] text-neutral-600">{bio.length}/280</p>
          </Field>
          <Field label="AVATAR_URI">
            <input type="url" value={avatarUri} onChange={e => setAvatarUri(e.target.value)}
              placeholder="https://..." className="input-field mt-1.5 font-mono text-sm" />
            <p className="mt-1 text-[10px] text-neutral-600">Paste an image URL — no file upload</p>
          </Field>
        </Section>

        {/* ── LINKS ── */}
        <Section label="LINKS" action={{ label: '+ ADD', onClick: addLink }}>
          {links.length === 0 && (
            <p className="text-xs text-neutral-600 text-center py-4">No links added yet.</p>
          )}
          {links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <select value={link.platform} onChange={e => updateLink(i, 'platform', e.target.value)}
                className="input-field w-32 shrink-0 text-sm">
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input type="url" value={link.url} onChange={e => updateLink(i, 'url', e.target.value)}
                placeholder="https://..." className="input-field flex-1 font-mono text-sm" />
              <RemoveButton onClick={() => removeLink(i)} />
            </div>
          ))}
        </Section>

        {/* ── PAYMENT_CONFIG ── */}
        <Section label="PAYMENT_CONFIG">
          <Field label="SUGGESTED_AMOUNTS">
            <input type="text" value={suggestedAmounts} onChange={e => setSuggestedAmounts(e.target.value)}
              placeholder="e.g. 5, 10, 25, 50" className="input-field mt-1.5 font-mono" />
            <p className="mt-1 text-[10px] text-neutral-600">Comma-separated amounts shown to senders</p>
          </Field>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold tracking-[0.15em] text-neutral-300">CUSTOM_AMOUNT</p>
              <p className="text-[10px] text-neutral-600 mt-0.5">Allow senders to enter any amount</p>
            </div>
            <Toggle value={customAmountEnabled} onChange={setCustomAmountEnabled} />
          </div>
          <Field label="THANK_YOU_MESSAGE">
            <textarea value={thankYouMessage} onChange={e => setThankYouMessage(e.target.value)}
              placeholder="Message shown to senders after payment" rows={2} maxLength={200}
              className="input-field mt-1.5 resize-none" />
          </Field>
        </Section>

        {/* ── TIERS ── */}
        <Section label="SUPPORT_TIERS" action={{ label: '+ ADD TIER', onClick: addTier }}>
          {tiers.length === 0 && (
            <p className="text-xs text-neutral-600 text-center py-4">
              No tiers yet. Add one to offer supporters structured access.
            </p>
          )}
          {tiers.map((tier, i) => (
            <div key={tier.id} className="border border-neutral-800">
              {/* Tier header row */}
              <button
                type="button"
                onClick={() => setExpandedTier(expandedTier === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ChevronIcon open={expandedTier === i} />
                  <span className="text-sm font-bold text-white truncate">
                    {tier.name || <span className="text-neutral-600 font-normal italic">Untitled tier</span>}
                  </span>
                  {tier.amount > 0 && (
                    <span className="text-xs text-neutral-500 font-mono shrink-0">
                      {tier.amount} {tier.currency}
                      {tier.gateType === 'recurring-hint' ? '/mo' : ''}
                    </span>
                  )}
                </div>
                <RemoveButton onClick={e => { e.stopPropagation(); removeTier(i); }} />
              </button>

              {/* Tier edit form */}
              {expandedTier === i && (
                <div className="border-t border-neutral-800 px-4 pb-4 pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="NAME">
                      <input type="text" value={tier.name}
                        onChange={e => updateTier(i, 'name', e.target.value)}
                        placeholder="e.g. Supporter" maxLength={40}
                        className="input-field mt-1.5 text-sm" />
                    </Field>
                    <Field label="AMOUNT">
                      <input type="number" min="0" step="0.01" value={tier.amount || ''}
                        onChange={e => updateTier(i, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="input-field mt-1.5 text-sm font-mono" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="CURRENCY">
                      <select value={tier.currency}
                        onChange={e => updateTier(i, 'currency', e.target.value)}
                        className="input-field mt-1.5 text-sm">
                        <option value="USDC">USDC</option>
                        <option value="SOL">SOL</option>
                      </select>
                    </Field>
                    <Field label="GATE_TYPE">
                      <select value={tier.gateType}
                        onChange={e => updateTier(i, 'gateType', e.target.value as PaymentTier['gateType'])}
                        className="input-field mt-1.5 text-sm">
                        <option value="one-time">One-time</option>
                        <option value="recurring-hint">Monthly</option>
                      </select>
                    </Field>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold tracking-[0.18em] text-neutral-500">BENEFITS</p>
                      <button type="button" onClick={() => addBenefit(i)}
                        className="text-[10px] font-bold tracking-[0.15em] text-skaus-primary hover:text-white transition-colors">
                        + ADD
                      </button>
                    </div>
                    {tier.benefits.length === 0 && (
                      <p className="text-xs text-neutral-600 italic">No benefits listed.</p>
                    )}
                    {tier.benefits.map((benefit, bi) => (
                      <div key={bi} className="flex gap-2 mb-2">
                        <input type="text" value={benefit}
                          onChange={e => updateBenefit(i, bi, e.target.value)}
                          placeholder="e.g. Access to Discord"
                          className="input-field flex-1 text-sm" />
                        <RemoveButton onClick={() => removeBenefit(i, bi)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </Section>

        {/* ── GATED_CONTENT ── */}
        <Section label="GATED_CONTENT" action={{ label: '+ ADD CONTENT', onClick: addContent }}>
          {gatedContent.length === 0 && (
            <p className="text-xs text-neutral-600 text-center py-4">
              No gated content yet. Add exclusive items unlocked by supporters.
            </p>
          )}
          {gatedContent.map((item, i) => (
            <div key={item.contentId} className="border border-neutral-800">
              {/* Content header row */}
              <button
                type="button"
                onClick={() => setExpandedContent(expandedContent === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ChevronIcon open={expandedContent === i} />
                  <span className="text-sm font-bold text-white truncate">
                    {item.previewText || <span className="text-neutral-600 font-normal italic">Untitled content</span>}
                  </span>
                  {item.accessCondition && (
                    <span className="text-[10px] font-mono text-neutral-500 shrink-0">{item.accessCondition}</span>
                  )}
                </div>
                <RemoveButton onClick={e => { e.stopPropagation(); removeContent(i); }} />
              </button>

              {/* Content edit form */}
              {expandedContent === i && (
                <div className="border-t border-neutral-800 px-4 pb-4 pt-4 space-y-4">
                  <Field label="PREVIEW_TEXT">
                    <input type="text" value={item.previewText}
                      onChange={e => updateContent(i, 'previewText', e.target.value)}
                      placeholder="e.g. Exclusive market analysis report"
                      maxLength={100} className="input-field mt-1.5 text-sm" />
                    <p className="mt-1 text-[10px] text-neutral-600">Shown publicly as a teaser</p>
                  </Field>
                  <Field label="ACCESS_CONDITION">
                    {tiers.length > 0 ? (
                      <select
                        value={item.accessCondition}
                        onChange={e => updateContent(i, 'accessCondition', e.target.value)}
                        className="input-field mt-1.5 text-sm font-mono"
                      >
                        {tiers.filter(t => t.name.trim()).map(t => (
                          <option key={t.id} value={`tier:${t.id}`}>
                            tier: {t.name} ({t.amount} {t.currency})
                          </option>
                        ))}
                        <option value="">— none —</option>
                      </select>
                    ) : (
                      <input type="text" value={item.accessCondition}
                        onChange={e => updateContent(i, 'accessCondition', e.target.value)}
                        placeholder="tier:TIER_ID"
                        className="input-field mt-1.5 text-sm font-mono" />
                    )}
                    <p className="mt-1 text-[10px] text-neutral-600">
                      Which tier unlocks this content
                    </p>
                  </Field>
                  <Field label="CONTENT_URI">
                    <input type="url" value={item.encryptedUri}
                      onChange={e => updateContent(i, 'encryptedUri', e.target.value)}
                      placeholder="https://..."
                      className="input-field mt-1.5 text-sm font-mono" />
                    <p className="mt-1 text-[10px] text-neutral-600">
                      Link to the content — encryption coming soon
                    </p>
                  </Field>
                </div>
              )}
            </div>
          ))}
        </Section>

        {/* ── Save controls ── */}
        {saveError && (
          <div className="border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {saveError}
          </div>
        )}
        {saveSuccess && (
          <div className="border border-green-500/30 bg-green-500/5 px-4 py-3 flex items-center gap-2 text-sm text-green-400">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Profile saved.
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full border border-skaus-primary bg-skaus-primary/10 py-3.5 text-[11px] font-bold tracking-[0.2em] text-white hover:bg-skaus-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving
            ? <span className="flex items-center justify-center gap-2">
                <span className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin" />
                SAVING...
              </span>
            : 'SAVE_PROFILE'}
        </button>

      </div>
    </DashboardShell>
  );
}

// ── Small layout primitives ───────────────────────────────────────────────────

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section className="border border-neutral-800 bg-neutral-900/20">
      <div className="border-b border-neutral-800 px-5 py-3 flex items-center justify-between">
        <p className="text-[10px] font-bold tracking-[0.22em] text-neutral-500">{label}</p>
        {action && (
          <button type="button" onClick={action.onClick}
            className="text-[10px] font-bold tracking-[0.15em] text-skaus-primary hover:text-white transition-colors">
            {action.label}
          </button>
        )}
      </div>
      <div className="px-5 py-5 space-y-5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="section-label">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 shrink-0 border transition-colors ${
        value ? 'border-skaus-primary bg-skaus-primary/20' : 'border-neutral-700 bg-neutral-800'
      }`}
    >
      <span className={`absolute top-0.5 h-5 w-5 transition-transform ${
        value ? 'translate-x-5 bg-skaus-primary' : 'translate-x-0 bg-neutral-600'
      }`} />
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 px-3 py-2 text-neutral-600 hover:text-red-400 transition-colors border border-neutral-800 bg-neutral-900/40"
      aria-label="Remove"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`h-3.5 w-3.5 text-neutral-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}
