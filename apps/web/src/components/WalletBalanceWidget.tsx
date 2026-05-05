'use client';

import { useEffect, useState } from 'react';
import { fetchWalletBalances, type WalletTokenBalance } from '@/lib/gateway';

interface Props {
  address: string;
  /** Optional subset of symbols to highlight (e.g. what a creator accepts). */
  highlight?: string[];
  /** Compact single-line mode for use inside payment forms. */
  compact?: boolean;
}

function formatAmount(balance: string, decimals: number): string {
  const n = BigInt(balance);
  if (n === 0n) return '0';
  const factor = BigInt(10 ** decimals);
  const whole = n / factor;
  const frac = n % factor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

function formatUsd(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.01) return '<$0.01';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function WalletBalanceWidget({ address, highlight, compact = false }: Props) {
  const [balances, setBalances] = useState<WalletTokenBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchWalletBalances(address)
      .then(data => {
        setBalances(data.filter(b => parseFloat(formatAmount(b.balance, b.decimals)) > 0));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [address]);

  if (compact) {
    if (loading) {
      return (
        <p className="text-[10px] text-neutral-500 font-mono animate-pulse">
          Fetching balance…
        </p>
      );
    }
    if (error || balances.length === 0) return null;

    const relevant = highlight
      ? balances.filter(b => highlight.includes(b.symbol))
      : balances.slice(0, 3);

    return (
      <div className="flex flex-wrap gap-3">
        {relevant.map(b => (
          <span key={b.symbol} className="text-[10px] font-mono text-neutral-400">
            <span className="text-white">{formatAmount(b.balance, b.decimals)}</span>
            {' '}{b.symbol}
            {b.usdValue > 0 && (
              <span className="text-neutral-600"> · {formatUsd(b.usdValue)}</span>
            )}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="border border-neutral-800 bg-[#0a0a0a]">
      <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-skaus-primary">ON-CHAIN_HOLDINGS</p>
          <p className="mt-0.5 text-[10px] text-neutral-600">Mainnet wallet balance · powered by GoldRush</p>
        </div>
        {loading && (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-skaus-primary border-t-transparent" />
        )}
      </div>

      {loading ? (
        <div className="space-y-3 px-5 py-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex justify-between animate-pulse">
              <div className="h-3 w-16 bg-neutral-800 rounded" />
              <div className="h-3 w-20 bg-neutral-800 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="px-5 py-4 text-[10px] text-neutral-600">Could not load balance data.</p>
      ) : balances.length === 0 ? (
        <p className="px-5 py-4 text-[10px] text-neutral-600">No mainnet token balances found.</p>
      ) : (
        <div className="divide-y divide-neutral-800/60">
          {balances.map(b => {
            const humanAmount = formatAmount(b.balance, b.decimals);
            const isHighlighted = highlight?.includes(b.symbol);
            return (
              <div
                key={b.symbol}
                className={`flex items-center justify-between px-5 py-3 ${isHighlighted ? 'bg-skaus-primary/5' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  {b.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logoUrl} alt={b.symbol} className="h-5 w-5 rounded-full" />
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 text-[8px] font-bold text-neutral-400">
                      {b.symbol.slice(0, 2)}
                    </div>
                  )}
                  <div>
                    <p className={`text-[11px] font-bold tracking-wide ${isHighlighted ? 'text-skaus-primary' : 'text-white'}`}>
                      {b.symbol}
                    </p>
                    {b.usdRate > 0 && (
                      <p className="text-[9px] text-neutral-600">{formatUsd(b.usdRate)} / token</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[11px] font-bold text-white">{humanAmount}</p>
                  {b.usdValue > 0 && (
                    <p className="text-[9px] text-neutral-500">{formatUsd(b.usdValue)}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && balances.length > 0 && (
        <div className="border-t border-neutral-800 px-5 py-3">
          <div className="flex justify-between">
            <span className="text-[9px] font-bold tracking-[0.15em] text-neutral-600">TOTAL_USD_VALUE</span>
            <span className="font-mono text-[11px] font-bold text-white">
              {formatUsd(balances.reduce((s, b) => s + b.usdValue, 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
