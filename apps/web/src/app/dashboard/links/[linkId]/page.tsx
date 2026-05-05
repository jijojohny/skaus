'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useWallets } from '@privy-io/react-auth/solana';
import { DashboardShell } from '@/components/DashboardShell';
import { getPaymentRequest, cancelPaymentRequest, type PaymentRequestData } from '@/lib/gateway';
import { getPaymentRequestUrl } from '@/lib/config';
import QRCode from 'react-qr-code';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function shortTx(sig: string) {
  return `${sig.slice(0, 8)}…${sig.slice(-6)}`;
}

// ISO date string YYYY-MM-DD in local time
function isoDay(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LinkDetailPage({ params }: { params: { linkId: string } }) {
  const { linkId } = params;
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;

  const [req, setReq] = useState<PaymentRequestData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedTx, setCopiedTx] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    getPaymentRequest(linkId)
      .then(data => {
        setReq(data);
        if (walletAddress && data.creator !== walletAddress) {
          setLoadError('This link belongs to another wallet.');
        }
      })
      .catch(() => setLoadError('Link not found'));
  }, [linkId, walletAddress]);

  // ── Derived stats ─────────────────────────────────────────────────────────

  const payments = useMemo(() => req?.payments ?? [], [req]);
  const revenue = useMemo(() => payments.reduce((s, p) => s + p.amount, 0), [payments]);
  const views = req?.views ?? 0;
  const conversionRate = views > 0 ? ((payments.length / views) * 100).toFixed(1) : '—';

  // 14-day bar chart bucketed by day
  const chartData = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      buckets[isoDay(Date.now() - i * 86_400_000)] = 0;
    }
    for (const p of payments) {
      const k = isoDay(p.paidAt);
      if (k in buckets) buckets[k] = (buckets[k] ?? 0) + p.amount;
    }
    return Object.entries(buckets).map(([date, amount]) => ({ date, amount }));
  }, [payments]);

  const chartMax = useMemo(() => Math.max(...chartData.map(d => d.amount), 0.01), [chartData]);

  // sorted payments newest-first
  const sortedPayments = useMemo(
    () => [...payments].sort((a, b) => b.paidAt - a.paidAt),
    [payments],
  );

  const url = req ? getPaymentRequestUrl(req.username, req.slug) : '';

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyTx = (sig: string) => {
    navigator.clipboard.writeText(sig);
    setCopiedTx(sig);
    setTimeout(() => setCopiedTx(null), 2000);
  };

  const handleCancel = async () => {
    if (!req || !walletAddress) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await cancelPaymentRequest(req.id, walletAddress);
      setReq(updated);
    } catch (e: any) {
      setCancelError(e.message || 'Failed to cancel.');
    } finally {
      setCancelling(false);
    }
  };

  const isActive = req?.status === 'pending' || req?.status === 'partial';

  // ── Guards ────────────────────────────────────────────────────────────────

  if (loadError && !req) {
    return (
      <DashboardShell title="Link">
        <div className="px-6 py-16 text-center space-y-4">
          <p className="text-sm text-red-400">{loadError}</p>
          <Link href="/dashboard/links" className="text-skaus-primary text-sm font-semibold">← Links</Link>
        </div>
      </DashboardShell>
    );
  }

  if (!req) {
    return (
      <DashboardShell title="Link">
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 rounded-full border-2 border-skaus-primary border-t-transparent animate-spin" />
        </div>
      </DashboardShell>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardShell
      title={req.title || 'Payment link'}
      headerRight={
        <Link href="/dashboard/links" className="text-xs text-skaus-muted hover:text-white font-semibold">
          ← Links
        </Link>
      }
    >
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-6 pb-20">
        {loadError && (
          <div className="border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-400">{loadError}</div>
        )}

        {/* Stats strip */}
        <div className="grid grid-cols-4 divide-x divide-neutral-800 border border-neutral-800 bg-[#0a0a0a]">
          <StatCell label="VIEWS" value={views.toLocaleString()} />
          <StatCell label="PAYMENTS" value={payments.length.toLocaleString()} />
          <StatCell label="REVENUE" value={`$${fmtAmount(revenue)}`} highlight />
          <StatCell label="CONVERSION" value={conversionRate === '—' ? '—' : `${conversionRate}%`} />
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
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 border border-skaus-primary/60 bg-skaus-primary/10 px-3 py-1.5 text-[10px] font-bold tracking-wider text-skaus-primary hover:bg-skaus-primary/20 transition-colors">
            OPEN
          </a>
        </div>

        {/* 14-day payment chart */}
        <div className="border border-neutral-800 bg-[#0a0a0a]">
          <div className="border-b border-neutral-800 px-5 py-3 flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-[0.22em] text-neutral-500">PAYMENTS_14D</p>
            {payments.length > 0 && (
              <p className="text-[10px] font-mono text-neutral-600">
                peak ${fmtAmount(chartMax)} {req.token}
              </p>
            )}
          </div>
          <div className="px-5 pb-4 pt-3">
            {payments.length === 0 ? (
              <p className="py-6 text-center text-[10px] text-neutral-600">No payments yet</p>
            ) : (
              <div className="flex items-end gap-1" style={{ height: 56 }}>
                {chartData.map(({ date, amount }) => {
                  const heightPct = amount / chartMax;
                  const barH = Math.max(heightPct * 48, amount > 0 ? 3 : 0);
                  const dayNum = new Date(date + 'T12:00:00').getDate();
                  return (
                    <div key={date} className="flex flex-1 flex-col items-center gap-1" title={`${date}: $${fmtAmount(amount)}`}>
                      <div className="w-full flex items-end" style={{ height: 48 }}>
                        <div
                          className={`w-full transition-all ${amount > 0 ? 'bg-skaus-primary' : 'bg-neutral-800'}`}
                          style={{ height: barH }}
                        />
                      </div>
                      <span className="text-[8px] font-mono text-neutral-700">{dayNum}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Payment history */}
        <div className="border border-neutral-800 bg-[#0a0a0a]">
          <div className="border-b border-neutral-800 px-5 py-3">
            <p className="text-[10px] font-bold tracking-[0.22em] text-neutral-500">PAYMENT_HISTORY</p>
          </div>
          {sortedPayments.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-[11px] text-neutral-600">No payments recorded yet.</p>
              <p className="mt-1 text-[10px] text-neutral-700">Share your link to start receiving payments.</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {sortedPayments.map((p, i) => (
                <div key={`${p.txSignature}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-neutral-800 bg-neutral-950 text-skaus-primary">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white">
                        {fmtDate(p.paidAt)}
                        <span className="ml-2 font-normal text-neutral-500">{fmtTime(p.paidAt)}</span>
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <button type="button" onClick={() => copyTx(p.txSignature)}
                          className="font-mono text-[10px] text-neutral-600 hover:text-neutral-300 transition-colors">
                          {copiedTx === p.txSignature ? 'COPIED' : `TX:${shortTx(p.txSignature)}`}
                        </button>
                        <a href={`https://explorer.solana.com/tx/${p.txSignature}?cluster=devnet`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-neutral-700 hover:text-skaus-primary transition-colors">↗</a>
                      </div>
                    </div>
                  </div>
                  <p className="shrink-0 font-bold text-skaus-primary">
                    +{fmtAmount(p.amount)} {req.token}
                  </p>
                </div>
              ))}
            </div>
          )}
          {sortedPayments.length > 0 && (
            <div className="flex items-center justify-between border-t border-neutral-800 px-5 py-3 text-[10px] text-neutral-600">
              <span>{sortedPayments.length} PAYMENT{sortedPayments.length !== 1 ? 'S' : ''}</span>
              <span className="font-mono text-neutral-400">+{fmtAmount(revenue)} {req.token}</span>
            </div>
          )}
        </div>

        {/* Link config */}
        <div className="border border-neutral-800 bg-[#0a0a0a]">
          <div className="border-b border-neutral-800 px-5 py-3">
            <p className="text-[10px] font-bold tracking-[0.22em] text-neutral-500">LINK_CONFIG</p>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-3">
            <ConfigRow label="AMOUNT" value={req.openAmount ? 'Open' : `${req.amount} ${req.token}`} />
            <ConfigRow label="TOKEN" value={req.token} />
            <ConfigRow label="STATUS" value={req.status.toUpperCase()} highlight={isActive} />
            <ConfigRow label="MAX_PAYMENTS" value={req.maxPayments === 1000 ? '∞' : req.maxPayments.toString()} />
            <ConfigRow label="CREATED" value={fmtDate(req.createdAt)} />
            <ConfigRow label="EXPIRES" value={req.expiresAt ? fmtDate(req.expiresAt) : 'Never'} />
            {req.memo && <div className="col-span-2"><ConfigRow label="MEMO" value={req.memo} /></div>}
          </div>
        </div>

        {/* Cancel */}
        {isActive && walletAddress === req.creator && (
          <div className="border border-neutral-800 bg-[#0a0a0a] px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold tracking-[0.15em] text-neutral-300">CANCEL_LINK</p>
              <p className="mt-1 text-[10px] text-neutral-600">
                Stops accepting new payments. Existing payments are not affected.
              </p>
              {cancelError && <p className="mt-1 text-[10px] text-red-400">{cancelError}</p>}
            </div>
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={cancelling}
              className="shrink-0 border border-red-500/40 bg-red-500/5 px-4 py-2.5 text-[11px] font-bold tracking-[0.15em] text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
            >
              {cancelling ? 'CANCELLING...' : 'CANCEL_LINK'}
            </button>
          </div>
        )}

      </div>

      {/* QR modal */}
      {showQr && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowQr(false)} role="presentation">
          <div className="w-full max-w-sm space-y-4 border border-neutral-800 bg-neutral-950 p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">{req.title || 'Payment link'}</p>
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

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="px-4 py-5">
      <p className="text-[9px] font-bold tracking-[0.22em] text-neutral-500">{label}</p>
      <p className={`mt-2 text-xl font-black tracking-tight ${highlight ? 'text-skaus-primary' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}

function ConfigRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-bold tracking-[0.18em] text-neutral-600">{label}</p>
      <p className={`mt-0.5 text-[11px] font-mono ${highlight ? 'text-skaus-primary' : 'text-neutral-300'}`}>{value}</p>
    </div>
  );
}
