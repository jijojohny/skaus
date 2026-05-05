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
import type { CompressedProfile } from '@skaus/types';

const PLATFORMS = ['Website', 'Twitter', 'GitHub', 'Instagram', 'YouTube', 'TikTok', 'Discord', 'Telegram', 'Other'];

export default function SettingsPage() {
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const wallet = wallets[0];
  const walletAddress = wallet?.address || '';

  const [username, setUsername] = useState<string | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState('');
  const [links, setLinks] = useState<{ platform: string; url: string }[]>([]);
  const [suggestedAmounts, setSuggestedAmounts] = useState('');
  const [customAmountEnabled, setCustomAmountEnabled] = useState(true);
  const [thankYouMessage, setThankYouMessage] = useState('');

  // Save / compression state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [compressionResult, setCompressionResult] = useState<UpdateProfileResult | null>(null);

  // Link-to-chain state
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkDone, setLinkDone] = useState(false);

  // Resolve username
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
      .finally(() => {
        if (!cancelled) setUsernameLoading(false);
      });

    return () => { cancelled = true; };
  }, [walletAddress]);

  // Load profile once username is known
  useEffect(() => {
    if (!username) return;

    setProfileLoading(true);
    fetchProfile(username)
      .then(profile => {
        if (!profile) return;
        setDisplayName(profile.displayName ?? '');
        setBio(profile.bio ?? '');
        setAvatarUri(profile.avatarUri ?? '');
        setLinks((profile.links ?? []).map(l => ({ platform: l.platform, url: l.url })));
        setSuggestedAmounts((profile.paymentConfig?.suggestedAmounts ?? []).join(', '));
        setCustomAmountEnabled(profile.paymentConfig?.customAmountEnabled ?? true);
        setThankYouMessage(profile.paymentConfig?.thankYouMessage ?? '');
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [username]);

  const addLink = () => setLinks(prev => [...prev, { platform: 'Website', url: '' }]);

  const removeLink = (i: number) => setLinks(prev => prev.filter((_, idx) => idx !== i));

  const updateLink = (i: number, field: 'platform' | 'url', value: string) =>
    setLinks(prev => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  const handleSave = async () => {
    if (!username || !walletAddress) return;
    if (!displayName.trim()) {
      setSaveError('Display name is required.');
      return;
    }

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
      tiers: [],
      gatedContent: [],
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

  const handleLinkToChain = async () => {
    if (!username || !walletAddress || !wallet) return;
    setLinking(true);
    setLinkError(null);

    try {
      const { transaction: txBase64, hash } = await linkProfileToChain(username, walletAddress);

      const txBytes = Buffer.from(txBase64, 'base64');
      const tx = Transaction.from(txBytes);
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

  const showLinkBanner =
    compressionResult !== null &&
    !compressionResult.compressedOnChain &&
    !linkDone;

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
            <a href="/onboarding" className="text-skaus-primary hover:underline">
              Complete onboarding first.
            </a>
          </p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Settings">
      <div className="px-4 sm:px-6 lg:px-10 py-8 max-w-2xl mx-auto space-y-8 pb-20">

        {/* Link-to-chain banner */}
        {showLinkBanner && (
          <div className="border border-amber-500/40 bg-amber-500/5 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold tracking-[0.18em] text-amber-400 uppercase mb-1">
                Profile not linked on-chain
              </p>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Your profile is saved but not yet anchored to your on-chain identity.
                Sign one transaction to make it permanent.
              </p>
              {linkError && (
                <p className="mt-2 text-xs text-red-400">{linkError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleLinkToChain()}
              disabled={linking}
              className="shrink-0 border border-amber-500/60 bg-amber-500/10 px-4 py-2.5 text-[11px] font-bold tracking-[0.15em] text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {linking ? (
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full border border-amber-400 border-t-transparent animate-spin" />
                  LINKING...
                </span>
              ) : (
                'LINK_ON_CHAIN'
              )}
            </button>
          </div>
        )}

        {/* Link-to-chain success */}
        {linkDone && compressionResult && (
          <div className="border border-green-500/40 bg-green-500/5 px-4 py-3 flex items-center gap-3">
            <svg className="h-4 w-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-[11px] font-bold tracking-[0.15em] text-green-400">PROFILE_LINKED_ON_CHAIN</p>
          </div>
        )}

        {/* Identity */}
        <section className="border border-neutral-800 bg-neutral-900/20">
          <div className="border-b border-neutral-800 px-5 py-3">
            <p className="text-[10px] font-bold tracking-[0.22em] text-neutral-500">IDENTITY</p>
          </div>

          <div className="px-5 py-5 space-y-5">
            <div>
              <label className="section-label">USERNAME</label>
              <div className="mt-1.5 px-3 py-2.5 border border-neutral-800 bg-neutral-900/40 text-neutral-400 text-sm font-mono select-all">
                @{username}
              </div>
            </div>

            <div>
              <label className="section-label">DISPLAY_NAME</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your public display name"
                maxLength={64}
                className="input-field mt-1.5"
              />
            </div>

            <div>
              <label className="section-label">BIO</label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Tell people about yourself"
                rows={3}
                maxLength={280}
                className="input-field mt-1.5 resize-none"
              />
              <p className="mt-1 text-right text-[10px] text-neutral-600">{bio.length}/280</p>
            </div>

            <div>
              <label className="section-label">AVATAR_URI</label>
              <input
                type="url"
                value={avatarUri}
                onChange={e => setAvatarUri(e.target.value)}
                placeholder="https://..."
                className="input-field mt-1.5 font-mono text-sm"
              />
              <p className="mt-1 text-[10px] text-neutral-600">Paste an image URL — no file upload</p>
            </div>
          </div>
        </section>

        {/* Links */}
        <section className="border border-neutral-800 bg-neutral-900/20">
          <div className="border-b border-neutral-800 px-5 py-3 flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-[0.22em] text-neutral-500">LINKS</p>
            <button
              type="button"
              onClick={addLink}
              className="text-[10px] font-bold tracking-[0.15em] text-skaus-primary hover:text-white transition-colors"
            >
              + ADD
            </button>
          </div>

          <div className="px-5 py-5 space-y-3">
            {links.length === 0 && (
              <p className="text-xs text-neutral-600 text-center py-4">No links added yet.</p>
            )}
            {links.map((link, i) => (
              <div key={i} className="flex gap-2">
                <select
                  value={link.platform}
                  onChange={e => updateLink(i, 'platform', e.target.value)}
                  className="input-field w-32 shrink-0 text-sm"
                >
                  {PLATFORMS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <input
                  type="url"
                  value={link.url}
                  onChange={e => updateLink(i, 'url', e.target.value)}
                  placeholder="https://..."
                  className="input-field flex-1 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeLink(i)}
                  className="shrink-0 px-3 text-neutral-600 hover:text-red-400 transition-colors border border-neutral-800 bg-neutral-900/40"
                  aria-label="Remove link"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Payment config */}
        <section className="border border-neutral-800 bg-neutral-900/20">
          <div className="border-b border-neutral-800 px-5 py-3">
            <p className="text-[10px] font-bold tracking-[0.22em] text-neutral-500">PAYMENT_CONFIG</p>
          </div>

          <div className="px-5 py-5 space-y-5">
            <div>
              <label className="section-label">SUGGESTED_AMOUNTS</label>
              <input
                type="text"
                value={suggestedAmounts}
                onChange={e => setSuggestedAmounts(e.target.value)}
                placeholder="e.g. 5, 10, 25, 50"
                className="input-field mt-1.5 font-mono"
              />
              <p className="mt-1 text-[10px] text-neutral-600">Comma-separated amounts shown to senders</p>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold tracking-[0.15em] text-neutral-300">CUSTOM_AMOUNT</p>
                <p className="text-[10px] text-neutral-600 mt-0.5">Allow senders to enter any amount</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={customAmountEnabled}
                onClick={() => setCustomAmountEnabled(v => !v)}
                className={`relative h-6 w-11 shrink-0 border transition-colors ${
                  customAmountEnabled
                    ? 'border-skaus-primary bg-skaus-primary/20'
                    : 'border-neutral-700 bg-neutral-800'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 transition-transform ${
                    customAmountEnabled
                      ? 'translate-x-5 bg-skaus-primary'
                      : 'translate-x-0 bg-neutral-600'
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="section-label">THANK_YOU_MESSAGE</label>
              <textarea
                value={thankYouMessage}
                onChange={e => setThankYouMessage(e.target.value)}
                placeholder="Message shown to senders after payment"
                rows={2}
                maxLength={200}
                className="input-field mt-1.5 resize-none"
              />
            </div>
          </div>
        </section>

        {/* Save */}
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
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin" />
              SAVING...
            </span>
          ) : (
            'SAVE_PROFILE'
          )}
        </button>
      </div>
    </DashboardShell>
  );
}
