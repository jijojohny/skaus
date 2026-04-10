'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { DashboardShell } from '@/components/DashboardShell';
import { createPaymentRequest, lookupByAuthority } from '@/lib/gateway';

type Step = 'template' | 'form';

const COMING_SOON = [
  {
    title: 'Digital product',
    quote: 'Buy my pack — $25',
    desc: 'Sell digital files with instant delivery.',
    color: 'bg-violet-500/20 text-violet-300',
  },
  {
    title: 'Payment request',
    quote: 'You owe me $50',
    desc: 'Ask someone specific to pay you.',
    color: 'bg-sky-500/20 text-sky-300',
  },
  {
    title: 'Fundraiser',
    quote: 'Help me reach $1,000!',
    desc: 'Collect toward a goal with a progress bar.',
    color: 'bg-amber-500/20 text-amber-200',
  },
];

export default function CreateLinkPage() {
  const router = useRouter();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const walletAddress = wallet?.address || '';
  const [step, setStep] = useState<Step>('template');
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amountMode, setAmountMode] = useState<'open' | 'fixed'>('open');
  const [fixedAmount, setFixedAmount] = useState('');
  const [token, setToken] = useState<'USDC' | 'SOL'>('USDC');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleCreate = async () => {
    if (!walletAddress || !registeredName) {
      setError('Username required. Finish onboarding first.');
      return;
    }
    const t = title.trim() || 'Payment link';
    setError(null);
    setSubmitting(true);
    try {
      const openAmount = amountMode === 'open';
      let amountNum = 0;
      if (!openAmount) {
        const n = parseFloat(fixedAmount);
        if (Number.isNaN(n) || n <= 0) {
          setError('Enter a valid fixed amount.');
          setSubmitting(false);
          return;
        }
        amountNum = n;
      }
      const data = await createPaymentRequest({
        creator: walletAddress,
        username: registeredName,
        amount: amountNum,
        token,
        memo: description.trim(),
        title: t,
        openAmount,
        depositPathIndex: 0,
        maxPayments: 1000,
      });
      router.push(`/dashboard/links/${data.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed to create link');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardShell
      title={step === 'template' ? 'Create link' : 'Create link'}
      headerRight={
        step === 'form' ? (
          <button
            type="button"
            onClick={() => setStep('template')}
            className="text-xs text-skaus-muted hover:text-white font-semibold"
          >
            ← Templates
          </button>
        ) : (
          <Link href="/dashboard/links" className="text-xs text-skaus-muted hover:text-white font-semibold">
            Cancel
          </Link>
        )
      }
    >
      <div className="px-6 lg:px-10 py-8 max-w-xl mx-auto">
        {step === 'template' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-bold text-white">Choose a template</h2>
              <p className="text-sm text-skaus-muted mt-1">Pick the template for your payment link.</p>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-skaus-muted mb-3">Popular</p>
              <button
                type="button"
                onClick={() => setStep('form')}
                className="w-full text-left rounded-2xl border border-skaus-primary/40 bg-skaus-primary/5 p-4 mb-3 hover:bg-skaus-primary/10 transition-colors flex gap-4"
              >
                <span className="w-12 h-12 rounded-full bg-skaus-primary/25 flex items-center justify-center shrink-0 text-xl">
                  ◎
                </span>
                <div>
                  <p className="font-bold text-white">Simple payment</p>
                  <p className="text-sm text-skaus-muted italic">&quot;Just send me money!&quot;</p>
                  <p className="text-xs text-skaus-muted mt-1">
                    Basic link — share it, get paid. Works with SKAUS stealth pool on Solana.
                  </p>
                </div>
              </button>

              {COMING_SOON.map(item => (
                <div
                  key={item.title}
                  className="w-full rounded-2xl border border-skaus-border bg-skaus-surface/40 p-4 mb-3 flex gap-4 opacity-60"
                >
                  <span className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${item.color}`}>
                    ·
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white">{item.title}</p>
                      <span className="text-[9px] font-bold uppercase bg-skaus-border px-2 py-0.5 rounded text-skaus-muted">
                        Coming soon
                      </span>
                    </div>
                    <p className="text-sm text-skaus-muted italic">&quot;{item.quote}&quot;</p>
                    <p className="text-xs text-skaus-muted mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'form' && (
          <div className="space-y-6">
            <div>
              <label className="section-label">Link name</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Coffee tips"
                className="input-field mt-1.5"
              />
            </div>

            <div>
              <label className="section-label">Description (optional)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Tell people what this payment is for…"
                rows={3}
                className="input-field mt-1.5 resize-none"
              />
            </div>

            <div>
              <label className="section-label">Amount</label>
              <div className="flex rounded-xl border border-skaus-border overflow-hidden mt-1.5">
                <button
                  type="button"
                  onClick={() => setAmountMode('fixed')}
                  className={`flex-1 py-3 text-sm font-bold transition-colors ${
                    amountMode === 'fixed' ? 'bg-skaus-primary text-white' : 'bg-skaus-darker text-skaus-muted'
                  }`}
                >
                  Fixed amount
                </button>
                <button
                  type="button"
                  onClick={() => setAmountMode('open')}
                  className={`flex-1 py-3 text-sm font-bold transition-colors ${
                    amountMode === 'open' ? 'bg-skaus-primary text-white' : 'bg-skaus-darker text-skaus-muted'
                  }`}
                >
                  Open amount
                </button>
              </div>
              <p className="text-xs text-skaus-muted mt-2">
                {amountMode === 'open'
                  ? 'Payers choose how much to send — great for tips and donations.'
                  : 'Set one amount in USDC or SOL for this link.'}
              </p>
            </div>

            {amountMode === 'fixed' && (
              <div className="flex gap-3">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fixedAmount}
                  onChange={e => setFixedAmount(e.target.value)}
                  placeholder="0.00"
                  className="input-field flex-1 font-mono"
                />
                <select
                  value={token}
                  onChange={e => setToken(e.target.value as 'USDC' | 'SOL')}
                  className="input-field w-28 font-bold"
                >
                  <option value="USDC">USDC</option>
                  <option value="SOL">SOL</option>
                </select>
              </div>
            )}

            {amountMode === 'open' && (
              <div>
                <label className="section-label">Token</label>
                <select
                  value={token}
                  onChange={e => setToken(e.target.value as 'USDC' | 'SOL')}
                  className="input-field mt-1.5 font-bold"
                >
                  <option value="USDC">USDC</option>
                  <option value="SOL">SOL</option>
                </select>
              </div>
            )}

            <div className="border border-skaus-border rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-white hover:bg-white/5"
              >
                <span>Advanced</span>
                <svg
                  className={`w-4 h-4 text-skaus-muted transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {advancedOpen && (
                <div className="px-4 pb-4 text-xs text-skaus-muted border-t border-skaus-border pt-3">
                  Optional payer info and custom tokens will arrive in a later release.
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-skaus-error/10 border border-skaus-error/30 text-sm text-skaus-error">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={submitting || !registeredName}
              className="w-full btn-primary py-3.5 rounded-xl font-bold disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create payment link'}
            </button>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
