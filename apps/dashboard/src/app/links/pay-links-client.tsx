'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import type { PaymentRequest } from '@/lib/api';

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001';

interface CreateLinkForm {
  creator: string;
  username: string;
  amount: string;
  token: string;
  memo: string;
  title: string;
  openAmount: boolean;
  maxPayments: string;
  depositPathIndex: string;
}

const EMPTY_FORM: CreateLinkForm = {
  creator: '',
  username: '',
  amount: '',
  token: 'USDC',
  memo: '',
  title: '',
  openAmount: false,
  maxPayments: '1',
  depositPathIndex: '0',
};

type StatusColor = {
  pending: string;
  partial: string;
  paid: string;
  expired: string;
  cancelled: string;
};

const STATUS_COLORS: StatusColor = {
  pending:   'bg-yellow-500/15 text-yellow-400',
  partial:   'bg-blue-500/15 text-blue-400',
  paid:      'bg-emerald-500/15 text-emerald-400',
  expired:   'bg-neutral-500/15 text-neutral-500',
  cancelled: 'bg-red-500/15 text-red-400',
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function PayLinksClient() {
  const [links, setLinks] = useState<PaymentRequest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creatorFilter, setCreatorFilter] = useState('');
  const [form, setForm] = useState<CreateLinkForm>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<PaymentRequest | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);

  const loadLinks = useCallback(async (creator: string) => {
    if (!creator.trim()) return;
    setLoadError(null);
    try {
      const res = await fetch(`${GATEWAY}/requests/by-creator/${encodeURIComponent(creator.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setLinks(data.requests ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load links');
      setLinks([]);
    }
  }, []);

  // Reload when creator filter changes (with debounce)
  useEffect(() => {
    const id = setTimeout(() => loadLinks(creatorFilter), 500);
    return () => clearTimeout(id);
  }, [creatorFilter, loadLinks]);

  function handleFormChange(field: keyof CreateLinkForm, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setCreateError(null);
    setCreateSuccess(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    startTransition(async () => {
      try {
        const body = {
          creator: form.creator.trim(),
          username: form.username.trim(),
          amount: form.openAmount ? 0 : Number(form.amount),
          token: form.token.trim() || 'USDC',
          memo: form.memo.trim(),
          title: form.title.trim(),
          openAmount: form.openAmount,
          maxPayments: Number(form.maxPayments) || 1,
          depositPathIndex: Number(form.depositPathIndex) || 0,
        };

        const res = await fetch(`${GATEWAY}/requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

        setCreateSuccess(data);
        setForm(EMPTY_FORM);
        setShowForm(false);

        // Refresh list if creator matches filter
        if (form.creator.trim() === creatorFilter.trim() && creatorFilter.trim()) {
          await loadLinks(creatorFilter);
        }
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : 'Failed to create link');
      }
    });
  }

  async function handleCancel(link: PaymentRequest) {
    try {
      const res = await fetch(`${GATEWAY}/requests/${link.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator: link.creator }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setLinks((prev) => prev.map((l) => (l.id === data.id ? data : l)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Cancel failed');
    }
  }

  return (
    <div className="space-y-6">
      {/* Create success banner */}
      {createSuccess && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <p className="font-semibold">Pay link created!</p>
          {createSuccess.payUrl && (
            <p className="mt-1">
              Share URL:{' '}
              <a
                href={createSuccess.payUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline break-all hover:text-emerald-300"
              >
                {createSuccess.payUrl}
              </a>
            </p>
          )}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Filter by creator address…"
            value={creatorFilter}
            onChange={(e) => setCreatorFilter(e.target.value)}
            className="input w-72 text-xs"
          />
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setCreateError(null);
          }}
          className="btn-primary"
        >
          {showForm ? 'Cancel' : '+ New Pay Link'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card">
          <h2 className="mb-4 text-base font-semibold text-neutral-200">Create Pay Link</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Creator Address *</label>
              <input
                required
                type="text"
                placeholder="Solana public key"
                value={form.creator}
                onChange={(e) => handleFormChange('creator', e.target.value)}
                className="input font-mono text-xs"
              />
            </div>

            <div>
              <label className="label">Username *</label>
              <input
                required
                type="text"
                placeholder="alice"
                value={form.username}
                onChange={(e) => handleFormChange('username', e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">Title</label>
              <input
                type="text"
                placeholder="My Invoice #1"
                value={form.title}
                onChange={(e) => handleFormChange('title', e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">Token</label>
              <select
                value={form.token}
                onChange={(e) => handleFormChange('token', e.target.value)}
                className="input"
              >
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
                <option value="SOL">SOL</option>
              </select>
            </div>

            <div>
              <label className="label">Amount (micro-units)</label>
              <input
                type="number"
                min="0"
                placeholder="1000000"
                value={form.amount}
                disabled={form.openAmount}
                onChange={(e) => handleFormChange('amount', e.target.value)}
                className="input disabled:opacity-40"
              />
            </div>

            <div className="flex items-center gap-3 self-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-400">
                <input
                  type="checkbox"
                  checked={form.openAmount}
                  onChange={(e) => handleFormChange('openAmount', e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-brand-500"
                />
                Open amount (pay-what-you-want)
              </label>
            </div>

            <div>
              <label className="label">Max Payments</label>
              <input
                type="number"
                min="1"
                value={form.maxPayments}
                onChange={(e) => handleFormChange('maxPayments', e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">Deposit Path Index</label>
              <input
                type="number"
                min="0"
                value={form.depositPathIndex}
                onChange={(e) => handleFormChange('depositPathIndex', e.target.value)}
                className="input"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="label">Memo</label>
              <input
                type="text"
                placeholder="Optional note for the payer"
                value={form.memo}
                onChange={(e) => handleFormChange('memo', e.target.value)}
                className="input"
              />
            </div>

            {createError && (
              <div className="sm:col-span-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {createError}
              </div>
            )}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={isPending}
                className="btn-primary w-full justify-center"
              >
                {isPending ? 'Creating…' : 'Create Pay Link'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Links list */}
      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {loadError}
        </div>
      )}

      {!creatorFilter.trim() ? (
        <div className="card py-12 text-center text-sm text-neutral-600">
          Enter a creator address above to view their pay links
        </div>
      ) : links.length === 0 && !loadError ? (
        <div className="card py-12 text-center text-sm text-neutral-600">
          No pay links found for this creator
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="px-5 py-3 text-left table-header">Title</th>
                <th className="px-5 py-3 text-left table-header">Amount</th>
                <th className="px-5 py-3 text-left table-header">Status</th>
                <th className="px-5 py-3 text-left table-header">Views</th>
                <th className="px-5 py-3 text-left table-header">Created</th>
                <th className="px-5 py-3 text-left table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {links.map((link) => (
                <tr key={link.id} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="px-5 py-3 text-sm">
                    <div className="font-medium text-neutral-200">{link.title || 'Untitled'}</div>
                    <div className="text-xs text-neutral-600 font-mono">{link.slug}</div>
                  </td>
                  <td className="px-5 py-3 text-sm font-mono">
                    {link.openAmount ? (
                      <span className="text-neutral-500 italic">open</span>
                    ) : (
                      <span className="text-emerald-400">
                        {(link.amount / 1_000_000).toFixed(2)} {link.token}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={[
                        'rounded-full px-2 py-0.5 text-xs font-semibold',
                        STATUS_COLORS[link.status as keyof StatusColor] ?? 'bg-neutral-800 text-neutral-400',
                      ].join(' ')}
                    >
                      {link.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-400">{link.views}</td>
                  <td className="px-5 py-3 text-sm text-neutral-500 whitespace-nowrap">
                    {formatDate(link.createdAt)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {link.payUrl && (
                        <a
                          href={link.payUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-400 hover:text-brand-300 hover:underline"
                        >
                          Open
                        </a>
                      )}
                      {(link.status === 'pending' || link.status === 'partial') && (
                        <button
                          onClick={() => handleCancel(link)}
                          className="text-xs text-red-500 hover:text-red-400"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
