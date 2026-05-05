'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useWallets } from '@privy-io/react-auth/solana';
import { DashboardShell } from '@/components/DashboardShell';
import { listPaymentRequests, lookupByAuthority, type PaymentRequestData } from '@/lib/gateway';
import { getPaymentRequestUrl } from '@/lib/config';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlatPayment {
  txSignature: string;
  amount: number;
  paidAt: number;
  token: string;
  requestId: string;
  requestTitle: string;
  requestSlug: string;
  requestStatus: string;
}

type SortOrder = 'newest' | 'oldest' | 'amount_desc' | 'amount_asc';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(amount: number) {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortTx(sig: string) {
  return `${sig.slice(0, 8)}…${sig.slice(-6)}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ActivitiesPage() {
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address ?? '';

  const [username, setUsername] = useState<string | null>(null);
  const [requests, setRequests] = useState<PaymentRequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterRequest, setFilterRequest] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [copied, setCopied] = useState<string | null>(null);

  // ── Resolve username ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!walletAddress) return;
    try {
      const n = localStorage.getItem('skaus_username');
      const w = localStorage.getItem('skaus_wallet');
      if (n && w === walletAddress) { setUsername(n); return; }
    } catch { /* ignore */ }

    lookupByAuthority(walletAddress)
      .then(r => {
        const name = r.names[0]?.username ?? null;
        setUsername(name);
        if (name) {
          try {
            localStorage.setItem('skaus_username', name);
            localStorage.setItem('skaus_wallet', walletAddress);
          } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, [walletAddress]);

  // ── Load payment requests ─────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listPaymentRequests(walletAddress);
      setRequests(list);
    } catch {
      setError('Failed to load activity. Is the gateway reachable?');
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => { load(); }, [load]);

  // ── Flatten all payments ──────────────────────────────────────────────────

  const allPayments = useMemo<FlatPayment[]>(() => {
    const flat: FlatPayment[] = [];
    for (const req of requests) {
      for (const p of req.payments ?? []) {
        flat.push({
          txSignature: p.txSignature,
          amount: p.amount,
          paidAt: p.paidAt,
          token: req.token,
          requestId: req.id,
          requestTitle: req.title || req.slug || 'Payment link',
          requestSlug: req.slug,
          requestStatus: req.status,
        });
      }
    }
    return flat;
  }, [requests]);

  // ── Apply filters + sort ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let rows = filterRequest === 'all'
      ? allPayments
      : allPayments.filter(p => p.requestId === filterRequest);

    rows = [...rows].sort((a, b) => {
      switch (sortOrder) {
        case 'oldest':      return a.paidAt - b.paidAt;
        case 'amount_desc': return b.amount - a.amount;
        case 'amount_asc':  return a.amount - b.amount;
        default:            return b.paidAt - a.paidAt;
      }
    });

    return rows;
  }, [allPayments, filterRequest, sortOrder]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalReceived = useMemo(() =>
    allPayments.reduce((s, p) => s + p.amount, 0),
  [allPayments]);

  const activeRequests = useMemo(() =>
    requests.filter(r => r.status === 'pending' || r.status === 'partial').length,
  [requests]);

  // ── Copy tx ───────────────────────────────────────────────────────────────

  const copyTx = (sig: string) => {
    navigator.clipboard.writeText(sig);
    setCopied(sig);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardShell title="Activities">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-10 space-y-6 pb-20">

        {/* Stats strip */}
        <div className="grid grid-cols-3 divide-x divide-neutral-800 border border-neutral-800 bg-[#0a0a0a]">
          <Stat
            label="TOTAL_RECEIVED"
            value={loading ? '—' : `$${formatAmount(totalReceived)}`}
            highlight
          />
          <Stat
            label="PAYMENT_LINKS"
            value={loading ? '—' : requests.length.toString()}
          />
          <Stat
            label="ACTIVE_LINKS"
            value={loading ? '—' : activeRequests.toString()}
          />
        </div>

        {/* Stealth deposits callout */}
        <div className="flex items-center justify-between border border-neutral-800 bg-[#0a0a0a] px-5 py-4">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-white">STEALTH_DEPOSITS</p>
            <p className="mt-1 text-[10px] text-neutral-500">
              Encrypted pool deposits are tracked on the dashboard — scan with your PIN to view them.
            </p>
          </div>
          <Link
            href="/dashboard#transaction-ledger"
            className="shrink-0 border border-skaus-primary/50 bg-skaus-primary/10 px-4 py-2 text-[10px] font-bold tracking-[0.15em] text-skaus-primary hover:bg-skaus-primary/20 transition-colors"
          >
            SCAN_LEDGER
          </Link>
        </div>

        {/* Activity feed */}
        <div className="border border-neutral-800 bg-[#0a0a0a]">

          {/* Feed header + filters */}
          <div className="flex flex-col gap-3 border-b border-neutral-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[11px] font-bold tracking-[0.18em] text-white">PAYMENT_ACTIVITY</h2>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filter by link */}
              <select
                value={filterRequest}
                onChange={e => setFilterRequest(e.target.value)}
                className="border border-neutral-700 bg-black px-2.5 py-1.5 text-[10px] font-mono text-neutral-400 focus:outline-none focus:ring-1 focus:ring-skaus-primary"
              >
                <option value="all">ALL_LINKS</option>
                {requests.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.title || r.slug || r.id.slice(0, 8)}
                  </option>
                ))}
              </select>

              {/* Sort */}
              <select
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as SortOrder)}
                className="border border-neutral-700 bg-black px-2.5 py-1.5 text-[10px] font-mono text-neutral-400 focus:outline-none focus:ring-1 focus:ring-skaus-primary"
              >
                <option value="newest">NEWEST_FIRST</option>
                <option value="oldest">OLDEST_FIRST</option>
                <option value="amount_desc">AMOUNT_HIGH</option>
                <option value="amount_asc">AMOUNT_LOW</option>
              </select>

              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="border border-neutral-700 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.12em] text-neutral-400 hover:text-white transition-colors disabled:opacity-40"
              >
                {loading ? 'LOADING...' : 'REFRESH'}
              </button>
            </div>
          </div>

          {/* Rows */}
          {error ? (
            <div className="px-5 py-14 text-center">
              <p className="text-[11px] text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-4 text-[10px] font-bold tracking-wider text-skaus-primary hover:underline"
              >
                RETRY
              </button>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-20">
              <div className="h-7 w-7 rounded-full border-2 border-skaus-primary border-t-transparent animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState hasRequests={requests.length > 0} username={username} />
          ) : (
            <div className="divide-y divide-neutral-800">
              {filtered.map((payment, i) => (
                <div
                  key={`${payment.txSignature}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors"
                >
                  {/* Left: icon + info */}
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-neutral-700 bg-neutral-950 text-skaus-primary">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-white">
                          INBOUND_PAYMENT
                        </p>
                        <span className="border border-skaus-primary/40 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-skaus-primary">
                          {payment.token}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-neutral-500">
                        {formatDate(payment.paidAt)} · {formatTime(payment.paidAt)}
                        {' '}·{' '}
                        <span className="text-neutral-400">{payment.requestTitle}</span>
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyTx(payment.txSignature)}
                          className="font-mono text-[10px] text-neutral-600 hover:text-neutral-300 transition-colors"
                          title="Copy tx signature"
                        >
                          {copied === payment.txSignature ? 'COPIED' : `TX:${shortTx(payment.txSignature)}`}
                        </button>
                        <a
                          href={`https://explorer.solana.com/tx/${payment.txSignature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-neutral-600 hover:text-skaus-primary transition-colors"
                          title="View on Solana Explorer"
                        >
                          ↗
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Right: amount */}
                  <p className="shrink-0 text-base font-bold text-skaus-primary">
                    +{formatAmount(payment.amount)} {payment.token}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Footer summary */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-neutral-800 px-5 py-3 text-[10px] text-neutral-600">
              <span>{filtered.length} ENTR{filtered.length === 1 ? 'Y' : 'IES'}</span>
              <span className="font-mono">
                TOTAL:{' '}
                <span className="text-neutral-400">
                  +{formatAmount(filtered.reduce((s, p) => s + p.amount, 0))}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Payment requests table */}
        {requests.length > 0 && (
          <div className="border border-neutral-800 bg-[#0a0a0a]">
            <div className="border-b border-neutral-800 px-5 py-3">
              <p className="text-[10px] font-bold tracking-[0.22em] text-neutral-500">PAYMENT_LINKS</p>
            </div>
            <div className="divide-y divide-neutral-800">
              {requests.map(req => {
                const payCount = req.payments?.length ?? 0;
                const totalForReq = (req.payments ?? []).reduce((s, p) => s + p.amount, 0);
                const url = getPaymentRequestUrl(req.username, req.slug);
                return (
                  <div key={req.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <StatusDot status={req.status} />
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold text-white">
                          {req.title || req.slug || 'Payment link'}
                        </p>
                        <p className="font-mono text-[10px] text-neutral-600 truncate">{url}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-6 text-[10px]">
                      <div className="text-right">
                        <p className="text-neutral-500">PAYMENTS</p>
                        <p className="font-bold text-white">{payCount}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-neutral-500">RECEIVED</p>
                        <p className="font-bold text-skaus-primary">
                          {totalForReq > 0 ? `+${formatAmount(totalForReq)} ${req.token}` : '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-neutral-500">VIEWS</p>
                        <p className="font-bold text-white">{req.views ?? 0}</p>
                      </div>
                      <Link
                        href={`/dashboard/links/${req.id}`}
                        className="border border-neutral-700 px-3 py-1.5 text-[10px] font-bold tracking-wider text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
                      >
                        VIEW
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </DashboardShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="px-5 py-5">
      <p className="text-[9px] font-bold tracking-[0.22em] text-neutral-500">{label}</p>
      <p className={`mt-2 text-2xl font-black tracking-tight ${highlight ? 'text-skaus-primary' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending:   'bg-skaus-primary',
    partial:   'bg-yellow-400',
    paid:      'bg-green-400',
    expired:   'bg-neutral-500',
    cancelled: 'bg-red-500',
  };
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${colors[status] ?? 'bg-neutral-500'}`}
      title={status.toUpperCase()}
    />
  );
}

function EmptyState({ hasRequests, username }: { hasRequests: boolean; username: string | null }) {
  return (
    <div className="px-5 py-16 text-center space-y-4">
      <div className="mx-auto flex h-12 w-12 items-center justify-center border border-neutral-800 bg-neutral-950">
        <svg className="h-5 w-5 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
        </svg>
      </div>
      {hasRequests ? (
        <>
          <p className="text-[11px] font-bold tracking-wider text-neutral-500">NO_PAYMENTS_YET</p>
          <p className="text-[10px] text-neutral-600 max-w-xs mx-auto">
            Your payment links are live — share them to receive payments.
          </p>
          {username && (
            <Link
              href={`/${username}`}
              className="inline-block text-[10px] font-bold tracking-wider text-skaus-primary hover:underline"
            >
              VIEW_YOUR_PROFILE →
            </Link>
          )}
        </>
      ) : (
        <>
          <p className="text-[11px] font-bold tracking-wider text-neutral-500">NO_PAYMENT_LINKS</p>
          <p className="text-[10px] text-neutral-600 max-w-xs mx-auto">
            Create a payment link to start accepting payments.
          </p>
          <Link
            href="/dashboard/links/create"
            className="inline-block border border-skaus-primary bg-skaus-primary/10 px-4 py-2 text-[10px] font-bold tracking-[0.15em] text-skaus-primary hover:bg-skaus-primary/20 transition-colors"
          >
            CREATE_LINK
          </Link>
        </>
      )}
    </div>
  );
}
