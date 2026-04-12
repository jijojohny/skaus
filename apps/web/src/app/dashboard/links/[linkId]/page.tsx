'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallets } from '@privy-io/react-auth/solana';
import { DashboardShell } from '@/components/DashboardShell';
import { getPaymentRequest, type PaymentRequestData } from '@/lib/gateway';
import { getPaymentRequestUrl } from '@/lib/config';
import QRCode from 'react-qr-code';

export default function LinkDetailPage({ params }: { params: { linkId: string } }) {
  const { linkId } = params;
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;
  const [req, setReq] = useState<PaymentRequestData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getPaymentRequest(linkId)
      .then(data => {
        setReq(data);
        if (walletAddress && data.creator !== walletAddress) {
          setError('This link belongs to another wallet.');
        }
      })
      .catch(() => setError('Link not found'));
  }, [linkId, walletAddress]);

  const url = req ? getPaymentRequestUrl(req.username, req.slug) : '';
  const revenue =
    req?.payments?.reduce((s, p) => s + p.amount, 0) ?? 0;

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error && !req) {
    return (
      <DashboardShell title="Link">
        <div className="px-6 py-16 text-center text-skaus-error text-sm">{error}</div>
        <div className="text-center">
          <Link href="/dashboard/links" className="text-skaus-primary text-sm font-semibold">
            Back to links
          </Link>
        </div>
      </DashboardShell>
    );
  }

  if (!req) {
    return (
      <DashboardShell title="Link">
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-2 border-skaus-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title={req.title || 'Payment link'}
      headerRight={
        <Link href="/dashboard/links" className="text-xs text-skaus-muted hover:text-white font-semibold">
          ← Links
        </Link>
      }
    >
      <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 max-w-lg mx-auto space-y-6">
        {error && <p className="text-sm text-skaus-warning text-center">{error}</p>}

        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-skaus-primary/20 border border-skaus-primary/30 flex items-center justify-center text-3xl font-black text-skaus-primary">
            {(req.title || 'L')[0].toUpperCase()}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border border-skaus-border bg-skaus-surface/60 py-3">
            <p className="text-lg font-bold text-white">{req.views ?? 0}</p>
            <p className="text-[10px] text-skaus-muted uppercase">Views</p>
          </div>
          <div className="rounded-xl border border-skaus-border bg-skaus-surface/60 py-3">
            <p className="text-lg font-bold text-white">{req.payments?.length ?? 0}</p>
            <p className="text-[10px] text-skaus-muted uppercase">Payments</p>
          </div>
          <div className="rounded-xl border border-skaus-border bg-skaus-surface/60 py-3">
            <p className="text-lg font-bold text-skaus-success">${revenue.toFixed(2)}</p>
            <p className="text-[10px] text-skaus-muted uppercase">Revenue</p>
          </div>
        </div>

        <div className="rounded-xl border border-skaus-primary/40 bg-skaus-darker px-4 py-3 flex items-center gap-2">
          <span className="text-sm font-mono text-white truncate flex-1">{url}</span>
          <button type="button" onClick={copy} className="p-2 rounded-lg hover:bg-white/5 shrink-0 text-xs text-skaus-muted">
            {copied ? '✓' : 'Copy'}
          </button>
          <button type="button" onClick={() => setShowQr(true)} className="p-2 rounded-lg hover:bg-white/5 shrink-0 text-xs text-skaus-muted">
            QR
          </button>
        </div>

        <div className="rounded-2xl border border-skaus-border bg-skaus-surface/60 p-5 space-y-3">
          <p className="text-[10px] font-bold uppercase text-skaus-success">Simple payment</p>
          {req.memo && <p className="text-sm text-white">{req.memo}</p>}
          <div>
            <p className="text-xs text-skaus-muted mb-1">Payment amount</p>
            <p className="text-2xl font-black text-white">
              {req.openAmount ? 'Open amount' : `${req.amount} ${req.token}`}
            </p>
          </div>
          <p className="text-[10px] text-skaus-muted">Solana · SKAUS stealth pool</p>
        </div>

        <p className="text-xs font-semibold text-skaus-muted uppercase tracking-wider">Recent activity</p>
        <p className="text-sm text-skaus-muted text-center py-8 border border-dashed border-skaus-border rounded-xl">
          No payments recorded yet.
        </p>

        {showQr && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={() => setShowQr(false)} role="presentation">
            <div className="bg-skaus-surface border border-skaus-border rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <p className="font-bold mb-4">{req.title || 'Payment link'}</p>
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
