'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { DashboardShell } from '@/components/DashboardShell';
import { fetchProfile, lookupByAuthority } from '@/lib/gateway';
import { getPublicProfileUrl } from '@/lib/config';
import type { CompressedProfile } from '@skaus/types';
import QRCode from 'react-qr-code';

export default function PersonalLinkDetailPage() {
  const router = useRouter();
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address ?? '';

  const [username, setUsername] = useState<string | null>(null);
  const [profile, setProfile] = useState<CompressedProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Resolve username ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!walletAddress) return;

    let name: string | null = null;

    try {
      const n = localStorage.getItem('skaus_username');
      const w = localStorage.getItem('skaus_wallet');
      if (n && w === walletAddress) name = n;
    } catch { /* ignore */ }

    if (name) {
      setUsername(name);
      return;
    }

    lookupByAuthority(walletAddress)
      .then(r => {
        const resolved = r.names[0]?.username ?? null;
        if (!resolved) {
          router.push('/dashboard/links');
          return;
        }
        setUsername(resolved);
        try {
          localStorage.setItem('skaus_username', resolved);
          localStorage.setItem('skaus_wallet', walletAddress);
        } catch { /* ignore */ }
      })
      .catch(() => router.push('/dashboard/links'));
  }, [walletAddress, router]);

  // ── Load profile ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!username) return;
    fetchProfile(username)
      .then(p => setProfile(p))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const url = username ? getPublicProfileUrl(username) : '';
  const initial = (profile?.displayName || username || '?')[0].toUpperCase();
  const tierCount = profile?.tiers?.length ?? 0;
  const linkCount = profile?.links?.length ?? 0;

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardShell
      title="Personal"
      headerRight={
        <Link href="/dashboard/links" className="text-xs text-skaus-muted hover:text-white font-semibold">
          ← Links
        </Link>
      }
    >
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-6 pb-20">

        {/* Profile identity */}
        <div className="border border-neutral-800 bg-[#0a0a0a] px-5 py-6 flex items-center gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-skaus-primary/30 bg-skaus-primary/10 text-2xl font-black text-skaus-primary">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-white">{profile?.displayName || username}</p>
            {profile?.bio && (
              <p className="mt-1 text-[11px] text-neutral-500 line-clamp-2">{profile.bio}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {tierCount > 0 && (
                <span className="border border-neutral-700 px-2 py-0.5 text-[9px] font-bold tracking-wider text-neutral-500">
                  {tierCount} TIER{tierCount !== 1 ? 'S' : ''}
                </span>
              )}
              {linkCount > 0 && (
                <span className="border border-neutral-700 px-2 py-0.5 text-[9px] font-bold tracking-wider text-neutral-500">
                  {linkCount} LINK{linkCount !== 1 ? 'S' : ''}
                </span>
              )}
              <span className="border border-skaus-primary/40 px-2 py-0.5 text-[9px] font-bold tracking-wider text-skaus-primary">
                ACTIVE
              </span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 divide-x divide-neutral-800 border border-neutral-800 bg-[#0a0a0a]">
          <div className="px-4 py-5 text-center">
            <p className="text-[9px] font-bold tracking-[0.22em] text-neutral-500">VIEWS</p>
            <p className="mt-2 text-xl font-black text-neutral-600" title="View tracking not available for stealth profile links">—</p>
            <p className="mt-0.5 text-[8px] text-neutral-700">NOT_TRACKED</p>
          </div>
          <div className="px-4 py-5 text-center">
            <p className="text-[9px] font-bold tracking-[0.22em] text-neutral-500">DEPOSITS</p>
            <p className="mt-2 text-xl font-black text-skaus-primary" title="Stealth — scan from dashboard">
              <svg className="mx-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </p>
            <p className="mt-0.5 text-[8px] text-neutral-700">STEALTH</p>
          </div>
          <div className="px-4 py-5 text-center">
            <p className="text-[9px] font-bold tracking-[0.22em] text-neutral-500">BALANCE</p>
            <p className="mt-2 text-xl font-black text-skaus-primary" title="Stealth — scan from dashboard">
              <svg className="mx-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </p>
            <p className="mt-0.5 text-[8px] text-neutral-700">STEALTH</p>
          </div>
        </div>

        {/* URL bar */}
        <div className="flex items-center gap-2 border border-neutral-800 bg-[#0a0a0a] px-4 py-3">
          <span className="flex-1 min-w-0 font-mono text-xs text-white truncate">{url}</span>
          <button type="button" onClick={copy}
            className="shrink-0 border border-neutral-700 px-3 py-1.5 text-[10px] font-bold tracking-wider text-neutral-400 hover:text-white transition-colors">
            {copied ? 'COPIED' : 'COPY'}
          </button>
          <button type="button" onClick={() => setShowQr(true)}
            className="shrink-0 border border-neutral-700 px-3 py-1.5 text-[10px] font-bold tracking-wider text-neutral-400 hover:text-white transition-colors">
            QR
          </button>
          {username && (
            <a href={`/${username}`} target="_blank" rel="noopener noreferrer"
              className="shrink-0 border border-skaus-primary/60 bg-skaus-primary/10 px-3 py-1.5 text-[10px] font-bold tracking-wider text-skaus-primary hover:bg-skaus-primary/20 transition-colors">
              OPEN
            </a>
          )}
        </div>

        {/* Stealth explanation */}
        <div className="border border-neutral-800 bg-[#0a0a0a] px-5 py-5 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[11px] font-bold tracking-[0.18em] text-white">STEALTH_DEPOSITS</p>
            <p className="text-[10px] text-neutral-500 leading-relaxed">
              Payments to your personal link go directly into the encrypted stealth pool —
              they are private by design. Scan from the dashboard with your PIN to see your balance and withdraw.
            </p>
          </div>
          <Link
            href="/dashboard#transaction-ledger"
            className="shrink-0 border border-skaus-primary/50 bg-skaus-primary/10 px-4 py-2.5 text-[10px] font-bold tracking-[0.15em] text-skaus-primary hover:bg-skaus-primary/20 transition-colors text-center"
          >
            SCAN_LEDGER
          </Link>
        </div>

        {/* Profile config summary */}
        {!loading && (
          <div className="border border-neutral-800 bg-[#0a0a0a]">
            <div className="border-b border-neutral-800 px-5 py-3 flex items-center justify-between">
              <p className="text-[10px] font-bold tracking-[0.22em] text-neutral-500">PROFILE_CONFIG</p>
              <Link href="/dashboard/settings"
                className="text-[10px] font-bold tracking-[0.15em] text-skaus-primary hover:text-white transition-colors">
                EDIT →
              </Link>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-3">
              <ConfigRow
                label="ACCEPTED_TOKENS"
                value={(profile?.paymentConfig?.acceptedTokens ?? ['USDC']).join(', ')}
              />
              <ConfigRow
                label="CUSTOM_AMOUNT"
                value={profile?.paymentConfig?.customAmountEnabled !== false ? 'Yes' : 'No'}
              />
              <ConfigRow
                label="SUGGESTED_AMOUNTS"
                value={
                  profile?.paymentConfig?.suggestedAmounts?.length
                    ? profile.paymentConfig.suggestedAmounts.map(a => `$${a}`).join(', ')
                    : '—'
                }
              />
              <ConfigRow
                label="SUPPORT_TIERS"
                value={tierCount > 0 ? tierCount.toString() : 'None'}
              />
              {profile?.paymentConfig?.thankYouMessage && (
                <div className="col-span-2">
                  <ConfigRow label="THANK_YOU_MSG" value={profile.paymentConfig.thankYouMessage} />
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* QR modal */}
      {showQr && url && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowQr(false)} role="presentation">
          <div className="w-full max-w-sm space-y-4 border border-neutral-800 bg-neutral-950 p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">Personal link</p>
              <button type="button" onClick={() => setShowQr(false)} className="text-neutral-500 hover:text-white">✕</button>
            </div>
            <div className="flex justify-center rounded bg-white p-4">
              <QRCode value={url} size={200} level="M" fgColor="#0f172a" bgColor="#ffffff" />
            </div>
            <p className="break-all text-center font-mono text-[10px] text-neutral-500">{url}</p>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold tracking-[0.18em] text-neutral-600">{label}</p>
      <p className="mt-0.5 text-[11px] font-mono text-neutral-300">{value}</p>
    </div>
  );
}
