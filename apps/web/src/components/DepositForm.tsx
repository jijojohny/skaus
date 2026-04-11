'use client';

import { useState, useMemo } from 'react';
import { previewDeposit } from '@/lib/deposit';

interface DepositFormProps {
  onSubmit: (amount: bigint, token: string) => Promise<void>;
  defaultToken?: 'USDC' | 'SOL';
  /** Light card layout for /pay/[username] public links */
  variant?: 'default' | 'paymentLink';
}

const QUICK_AMOUNTS = [
  { label: '$10', value: 10_000_000n },
  { label: '$50', value: 50_000_000n },
  { label: '$100', value: 100_000_000n },
  { label: '$500', value: 500_000_000n },
];

export function DepositForm({ onSubmit, defaultToken = 'USDC', variant = 'default' }: DepositFormProps) {
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState<'USDC' | 'SOL'>(defaultToken);
  const [loading, setLoading] = useState(false);
  const isPaymentLink = variant === 'paymentLink';

  const depositPreview = useMemo(() => {
    if (!amount || parseFloat(amount) <= 0) return null;
    try {
      const decimals = token === 'USDC' ? 6 : 9;
      const rawAmount = BigInt(Math.floor(parseFloat(amount) * 10 ** decimals));
      return previewDeposit(rawAmount, token);
    } catch {
      return null;
    }
  }, [amount, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || loading) return;

    setLoading(true);
    try {
      const decimals = token === 'USDC' ? 6 : 9;
      const rawAmount = BigInt(Math.floor(parseFloat(amount) * 10 ** decimals));
      await onSubmit(rawAmount, token);
    } finally {
      setLoading(false);
    }
  };

  const selectQuickAmount = (val: bigint) => {
    setAmount((Number(val) / 1_000_000).toString());
  };

  if (isPaymentLink) {
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="text-center pt-1">
          <label htmlFor="pay-link-amount" className="sr-only">
            Amount in {token}
          </label>
          <input
            id="pay-link-amount"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            min="0"
            step="any"
            className="w-full max-w-full bg-transparent text-center text-5xl sm:text-6xl font-semibold tracking-tight text-neutral-800 outline-none placeholder:text-neutral-300 tabular-nums leading-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <p className="mt-1 text-lg font-bold text-neutral-700 tracking-wide">{token}</p>
        </div>

        <div className="flex gap-2 items-stretch">
          <div className="flex-1 flex rounded-2xl border-2 border-neutral-200 bg-neutral-100/80 overflow-hidden">
            {(['USDC', 'SOL'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setToken(t)}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${
                  token === t
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div
            className="shrink-0 flex items-center gap-1.5 rounded-full border-2 border-neutral-200 bg-white px-3 py-2"
            title="Network"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#14F195] text-[#0a0a0a] text-xs font-black">
              S
            </span>
            <span className="pr-1 text-sm font-semibold text-neutral-800">Solana</span>
          </div>
        </div>

        <div className="flex gap-2">
          {QUICK_AMOUNTS.map(({ label, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => selectQuickAmount(value)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-neutral-600 bg-neutral-100 border border-neutral-200 hover:bg-neutral-200/80 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={!amount || loading}
          className="w-full rounded-2xl bg-skaus-primary hover:bg-skaus-primary-hover py-4 text-base font-bold text-white shadow-sm transition-all disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.99]"
        >
          {loading ? 'Processing…' : 'Pay'}
        </button>

        {depositPreview && depositPreview.depositCount > 0 && (
          <p className="text-center text-xs text-neutral-400">
            {depositPreview.remainder > 0n
              ? `Amount must be a multiple of ${depositPreview.minUnit}`
              : `Will create ${depositPreview.depositCount} private deposit${depositPreview.depositCount > 1 ? 's' : ''}`}
          </p>
        )}

        <p className="flex items-center justify-center gap-1.5 text-xs text-neutral-400">
          <span>Secured by SKAUS</span>
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-neutral-300 text-[10px] text-neutral-500" title="Private tiered deposit">
            i
          </span>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label className="section-label">Token</label>
        <div className="flex gap-2">
          {(['USDC', 'SOL'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setToken(t)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
                token === t
                  ? 'bg-skaus-primary text-white'
                  : 'bg-skaus-darker text-skaus-muted hover:text-white border border-skaus-border'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="section-label">Amount</label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            className="input-field text-2xl font-mono pr-16"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-skaus-muted font-bold text-sm uppercase">
            {token}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        {QUICK_AMOUNTS.map(({ label, value }) => (
          <button
            key={label}
            type="button"
            onClick={() => selectQuickAmount(value)}
            className="flex-1 py-2 bg-skaus-darker rounded-lg text-sm text-skaus-muted hover:text-white hover:bg-skaus-border transition-all border border-skaus-border font-semibold"
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="submit"
        disabled={!amount || loading}
        className="w-full btn-primary py-3.5 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {loading ? 'PROCESSING...' : `SEND ${amount || '0'} ${token}`}
      </button>

      <p className="text-xs text-skaus-muted text-center leading-relaxed">
        {depositPreview && depositPreview.depositCount > 0 && depositPreview.remainder === 0n
          ? `Your payment will be privately split into ${depositPreview.depositCount} deposit${depositPreview.depositCount > 1 ? 's' : ''}.`
          : depositPreview && depositPreview.remainder > 0n
            ? `Amount must be a multiple of ${depositPreview.minUnit}.`
            : 'Your payment will be split into tiered deposits for maximum privacy.'}
      </p>
    </form>
  );
}
