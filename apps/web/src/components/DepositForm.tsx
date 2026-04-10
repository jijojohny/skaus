'use client';

import { useState } from 'react';

interface DepositFormProps {
  onSubmit: (amount: bigint, token: string) => Promise<void>;
  defaultToken?: 'USDC' | 'SOL';
}

const QUICK_AMOUNTS = [
  { label: '$10', value: 10_000_000n },
  { label: '$50', value: 50_000_000n },
  { label: '$100', value: 100_000_000n },
  { label: '$500', value: 500_000_000n },
];

export function DepositForm({ onSubmit, defaultToken = 'USDC' }: DepositFormProps) {
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState<'USDC' | 'SOL'>(defaultToken);
  const [loading, setLoading] = useState(false);

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
        Your payment will be split into fixed-tier deposits for maximum privacy.
      </p>
    </form>
  );
}
