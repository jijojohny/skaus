'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { DashboardShell } from '@/components/DashboardShell';
import { getPublicProfileUrl } from '@/lib/config';
import QRCode from 'react-qr-code';

export default function PersonalLinkDetailPage() {
  const router = useRouter();
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const n = localStorage.getItem('skaus_username');
      const w = localStorage.getItem('skaus_wallet');
      if (n && w === walletAddress) {
        setRegisteredName(n);
      } else {
        router.push('/dashboard/links');
      }
    } catch {
      router.push('/dashboard/links');
    }
  }, [walletAddress, router]);

  const url = registeredName ? getPublicProfileUrl(registeredName) : '';

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DashboardShell
      title="Personal"
      headerRight={
        <Link href="/dashboard/links" className="text-xs text-skaus-muted hover:text-white font-semibold">
          ← Links
        </Link>
      }
    >
      <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 max-w-lg mx-auto space-y-6">
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-skaus-primary/20 border border-skaus-primary/30 flex items-center justify-center text-3xl font-black text-skaus-primary">
            {(registeredName || '?')[0].toUpperCase()}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border border-skaus-border bg-skaus-surface/60 py-3">
            <p className="text-lg font-bold text-white">0</p>
            <p className="text-[10px] text-skaus-muted uppercase">Views</p>
          </div>
          <div className="rounded-xl border border-skaus-border bg-skaus-surface/60 py-3">
            <p className="text-lg font-bold text-white">—</p>
            <p className="text-[10px] text-skaus-muted uppercase">Payments</p>
          </div>
          <div className="rounded-xl border border-skaus-border bg-skaus-surface/60 py-3">
            <p className="text-lg font-bold text-skaus-success">$0</p>
            <p className="text-[10px] text-skaus-muted uppercase">Revenue</p>
          </div>
        </div>

        <div className="rounded-xl border border-skaus-primary/40 bg-skaus-darker px-4 py-3 flex items-center gap-2">
          <span className="text-sm font-mono text-white truncate flex-1">{url}</span>
          <button type="button" onClick={copy} className="p-2 rounded-lg hover:bg-white/5 shrink-0" title="Copy">
            {copied ? <span className="text-skaus-success text-xs">✓</span> : <span className="text-skaus-muted text-xs">Copy</span>}
          </button>
          <button type="button" onClick={() => setShowQr(true)} className="p-2 rounded-lg hover:bg-white/5 shrink-0">
            QR
          </button>
        </div>

        <div className="rounded-2xl border border-skaus-border bg-skaus-surface/60 p-5 space-y-2">
          <p className="text-[10px] font-bold uppercase text-skaus-success">Simple payment</p>
          <p className="text-sm text-skaus-muted">Your main profile pay page. Payers choose amount and token on your public page.</p>
          <p className="text-xs text-skaus-muted pt-2">
            <Link href={registeredName ? `/${registeredName}` : '#'} className="text-skaus-primary font-semibold hover:underline">
              Open public page →
            </Link>
          </p>
        </div>

        {showQr && url && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={() => setShowQr(false)} role="presentation">
            <div className="bg-skaus-surface border border-skaus-border rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <p className="font-bold mb-4">Personal link</p>
              <div className="flex justify-center p-4 bg-white rounded-xl">
                <QRCode value={url} size={200} level="M" fgColor="#0f172a" bgColor="#ffffff" />
              </div>
              <p className="text-[10px] font-mono text-skaus-muted break-all text-center mt-3">{url}</p>
              <button type="button" onClick={() => setShowQr(false)} className="w-full mt-4 py-2 rounded-xl border border-skaus-border text-sm">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
