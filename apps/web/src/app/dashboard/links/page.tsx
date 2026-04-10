'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { DashboardShell } from '@/components/DashboardShell';
import { listPaymentRequests, lookupByAuthority, type PaymentRequestData } from '@/lib/gateway';
import { getPaymentRequestUrl, getPublicProfileUrl } from '@/lib/config';
import QRCode from 'react-qr-code';

export default function DashboardLinksPage() {
  const router = useRouter();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const walletAddress = wallet?.address;
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  const [requests, setRequests] = useState<PaymentRequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrFor, setQrFor] = useState<{ url: string; title: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) return;
    lookupByAuthority(walletAddress)
      .then(r => {
        if (!r.registered) router.push('/onboarding');
      })
      .catch(() => {});
    try {
      const n = localStorage.getItem('skaus_username');
      const w = localStorage.getItem('skaus_wallet');
      if (n && w === walletAddress) setRegisteredName(n);
    } catch {
      /* ignore */
    }
  }, [walletAddress, router]);

  const loadRequests = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const list = await listPaymentRequests(walletAddress);
      setRequests(list);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const personalUrl = registeredName ? getPublicProfileUrl(registeredName) : '';

  return (
    <DashboardShell title="Links">
      <div className="px-6 lg:px-10 py-8 max-w-5xl">
        {!registeredName && !loading && (
          <p className="text-sm text-skaus-warning mb-6 border border-skaus-warning/30 rounded-xl p-4 bg-skaus-warning/5">
            Complete onboarding to claim a username and share your main pay link.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Link
            href="/dashboard/links/create"
            className="rounded-2xl border-2 border-dashed border-skaus-border hover:border-skaus-primary/50 bg-skaus-surface/40 min-h-[200px] flex flex-col items-center justify-center gap-3 text-skaus-muted hover:text-white transition-colors"
          >
            <span className="text-4xl font-light text-skaus-primary">+</span>
            <span className="text-sm font-bold">Create new link</span>
          </Link>

          {registeredName && (
            <div className="rounded-2xl border border-skaus-primary/40 bg-skaus-surface/80 p-5 flex flex-col gap-4 shadow-lg shadow-skaus-primary/5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-10 h-10 rounded-full bg-skaus-primary/20 flex items-center justify-center text-sm font-black text-skaus-primary">
                    S
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-skaus-success flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-skaus-success" />
                      Simple payment
                    </p>
                    <p className="text-base font-bold text-white mt-0.5">Personal</p>
                  </div>
                </div>
                <div className="flex gap-2 text-[10px] text-skaus-muted">
                  <span title="Views">—</span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-skaus-darker border border-skaus-border px-3 py-2.5">
                <span className="text-xs font-mono text-white truncate flex-1">{personalUrl}</span>
                <button
                  type="button"
                  onClick={() => copyUrl(personalUrl, 'personal')}
                  className="p-1.5 rounded-lg hover:bg-white/5 shrink-0"
                  title="Copy"
                >
                  {copiedId === 'personal' ? (
                    <span className="text-skaus-success text-xs">✓</span>
                  ) : (
                    <svg className="w-4 h-4 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setQrFor({ url: personalUrl, title: 'Personal link' })}
                  className="p-1.5 rounded-lg hover:bg-white/5 shrink-0"
                  title="QR code"
                >
                  <svg className="w-4 h-4 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75z" />
                  </svg>
                </button>
              </div>
              <Link
                href="/dashboard/links/personal"
                className="text-xs text-skaus-primary font-semibold hover:underline"
              >
                View details
              </Link>
            </div>
          )}

          {requests.map(req => {
            const url = getPaymentRequestUrl(req.username, req.id);
            const payCount = req.payments?.length ?? 0;
            return (
              <div
                key={req.id}
                className="rounded-2xl border border-skaus-border bg-skaus-surface/80 p-5 flex flex-col gap-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-10 h-10 rounded-full bg-skaus-primary/15 flex items-center justify-center text-sm font-black text-skaus-primary shrink-0">
                      {(req.title || 'L')[0].toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-skaus-success flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-skaus-success" />
                        Simple payment
                      </p>
                      <p className="text-base font-bold text-white truncate">{req.title || 'Payment link'}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 text-[10px] text-skaus-muted shrink-0">
                    <span className="flex items-center gap-0.5" title="Views">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {req.views ?? 0}
                    </span>
                    <span className="flex items-center gap-0.5" title="Payments">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                      {payCount}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-skaus-darker border border-skaus-border px-3 py-2.5">
                  <span className="text-xs font-mono text-white truncate flex-1">{url}</span>
                  <button
                    type="button"
                    onClick={() => copyUrl(url, req.id)}
                    className="p-1.5 rounded-lg hover:bg-white/5 shrink-0"
                    title="Copy"
                  >
                    {copiedId === req.id ? (
                      <span className="text-skaus-success text-xs">✓</span>
                    ) : (
                      <svg className="w-4 h-4 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrFor({ url, title: req.title || 'Payment link' })}
                    className="p-1.5 rounded-lg hover:bg-white/5 shrink-0"
                    title="QR code"
                  >
                    <svg className="w-4 h-4 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75z" />
                    </svg>
                  </button>
                </div>
                <Link
                  href={`/dashboard/links/${req.id}`}
                  className="text-xs text-skaus-primary font-semibold hover:underline"
                >
                  View details
                </Link>
              </div>
            );
          })}
        </div>

        {loading && (
          <p className="text-xs text-skaus-muted mt-6 text-center">Loading links…</p>
        )}

        <button
          type="button"
          className="mt-10 w-full rounded-2xl border border-skaus-border bg-skaus-surface/50 py-4 px-5 text-left text-sm text-skaus-muted hover:border-skaus-border-hover transition-colors flex items-center justify-between"
        >
          <span>
            <span className="block font-semibold text-white">Archived links</span>
            <span className="text-xs">Coming soon — view archived payment links.</span>
          </span>
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {qrFor && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={() => setQrFor(null)}
          role="presentation"
        >
          <div
            className="bg-skaus-surface border border-skaus-border rounded-2xl p-6 max-w-sm w-full space-y-4"
            onClick={e => e.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{qrFor.title}</h3>
              <button type="button" onClick={() => setQrFor(null)} className="p-1 rounded-lg hover:bg-white/5">
                ×
              </button>
            </div>
            <div className="flex justify-center p-4 rounded-xl bg-white">
              <QRCode value={qrFor.url} size={200} level="M" fgColor="#0f172a" bgColor="#ffffff" />
            </div>
            <p className="text-[10px] font-mono text-skaus-muted break-all text-center">{qrFor.url}</p>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
