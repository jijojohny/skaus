'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { Connection, PublicKey } from '@solana/web3.js';
import { createPrivySolanaSigner } from '@/lib/privy-solana-signer';
import { DEPOSIT_TIERS_USDC, DEPOSIT_TIERS_SOL, splitIntoTiers } from '@skaus/types';
import type { StealthMetaAddress } from '@skaus/crypto';
import { DepositForm } from '@/components/DepositForm';
import { TransactionStatus } from '@/components/TransactionStatus';
import { resolvePayLink, type PayLinkData } from '@/lib/gateway';
import { executeDeposit } from '@/lib/deposit';
import Link from 'next/link';

interface PayPageProps {
  params: { username: string };
}

function SkausMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="10" className="fill-skaus-primary" />
      <path
        d="M10 12c0-1.5 1.2-2.5 3-2.5 1.4 0 2.5.6 3.2 1.6.7-1 1.8-1.6 3.2-1.6 1.8 0 3 1 3 2.5 0 2.2-2.5 4-6 6.8-3.5-2.8-6-4.6-6-6.8z"
        className="fill-white"
      />
      <circle cx="13" cy="12" r="1.1" className="fill-skaus-primary" />
      <circle cx="19" cy="12" r="1.1" className="fill-skaus-primary" />
    </svg>
  );
}

function shortWallet(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)} … ${addr.slice(-4)}`;
}

export default function PayPage({ params }: PayPageProps) {
  const { username } = params;
  const { authenticated, user, login } = usePrivy();
  const { wallets } = useWallets();
  const solWallet = wallets[0];
  const { signTransaction: privySignTransaction } = useSignTransaction();

  const walletAddress = user?.wallet?.address || solWallet?.address;

  const signTransaction = useMemo(
    () => createPrivySolanaSigner(solWallet, privySignTransaction),
    [solWallet, privySignTransaction],
  );
  const connection = new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  );

  const [txStatus, setTxStatus] = useState<'idle' | 'resolving' | 'preparing' | 'signing' | 'confirming' | 'done' | 'error'>('idle');
  const [txSignatures, setTxSignatures] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [payLinkData, setPayLinkData] = useState<PayLinkData | null>(null);
  const [progressText, setProgressText] = useState('');
  const [claimDismissed, setClaimDismissed] = useState(false);

  useEffect(() => {
    resolvePayLink(username)
      .then(setPayLinkData)
      .catch(() => {});
  }, [username]);

  const handleDeposit = useCallback(async (amount: bigint, token: string) => {
    if (!walletAddress || !solWallet) return;

    setTxStatus('resolving');
    setError(null);

    try {
      const tiers = token === 'USDC'
        ? splitIntoTiers(amount, [...DEPOSIT_TIERS_USDC])
        : splitIntoTiers(amount, [...DEPOSIT_TIERS_SOL]);

      setProgressText(`Splitting into ${tiers.length} tier deposit${tiers.length > 1 ? 's' : ''}`);

      const { decodePubkey, isMockPubkey } = await import('@/lib/keys');

      const meta = payLinkData?.recipientMetaAddress;
      if (!meta || isMockPubkey(meta.scanPubkey) || isMockPubkey(meta.spendPubkey)) {
        throw new Error(
          `@${username} hasn't set up their stealth keys yet. ` +
          'Ask them to complete onboarding at skaus.me first.'
        );
      }

      const recipientMeta: StealthMetaAddress = {
        scanPubkey: decodePubkey(meta.scanPubkey),
        spendPubkey: decodePubkey(meta.spendPubkey),
        version: meta.version || 1,
      };

      const publicKey = new PublicKey(walletAddress);

      const result = await executeDeposit(
        connection,
        publicKey,
        signTransaction,
        amount,
        token as 'USDC' | 'SOL',
        recipientMeta,
        (step, current, total) => {
          setTxStatus(step as any);
          setProgressText(`Tier ${current}/${total}: ${step}`);
        },
      );

      setTxSignatures(result.signatures);
      setTxStatus('done');
    } catch (err: any) {
      console.error('Deposit failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('error');
    }
  }, [walletAddress, connection, payLinkData, signTransaction, solWallet]);

  const showForm = authenticated && (txStatus === 'idle' || txStatus === 'error');
  const showProgress = authenticated && !showForm;

  return (
    <main className="pay-link-page flex flex-col items-center min-h-[100dvh] overflow-x-clip px-4 pt-8 sm:pt-10 pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
      <header className="relative z-10 mb-8 flex w-full max-w-lg items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 text-neutral-900 no-underline">
          <SkausMark className="h-9 w-9 shrink-0 rounded-[10px] shadow-sm" />
          <span className="text-xl font-extrabold lowercase tracking-tight">skaus</span>
        </Link>
        {authenticated && walletAddress ? (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="hidden sm:inline">Connected</span>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-skaus-primary/40 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-skaus-primary" />
            </span>
            <div className="flex items-center gap-1 rounded-full border-2 border-neutral-200 bg-white py-1.5 pl-2.5 pr-2 font-mono text-[11px] text-neutral-700">
              {shortWallet(walletAddress)}
              <span className="text-neutral-400" aria-hidden>
                ▾
              </span>
            </div>
          </div>
        ) : (
          <span className="w-20 sm:w-32" aria-hidden />
        )}
      </header>

      <div className="relative z-10 w-full max-w-lg">
        <div className="rounded-[28px] border-[5px] border-skaus-primary bg-white p-3 shadow-[0_4px_24px_rgba(0,0,0,0.06)] sm:p-4">
          <div className="pay-link-dot-panel rounded-[22px] p-3 sm:p-5">
            <div className="rounded-[20px] border-[3px] border-skaus-primary bg-white px-5 py-8 shadow-sm sm:px-8 sm:py-10">
              <div className="text-center">
                <p className="text-base font-medium text-neutral-800">Send funds to</p>
                <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50/90 px-3 py-2 pr-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-200/80 text-sm font-bold text-red-800">
                    {username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-[15px] font-semibold text-red-900">@{username}</span>
                </div>
              </div>

              <div className="mt-8">
                {!authenticated ? (
                  <div className="space-y-5">
                    <button
                      type="button"
                      onClick={() => login()}
                      className="w-full rounded-2xl bg-skaus-primary py-4 text-base font-bold text-white shadow-sm transition-all hover:bg-skaus-primary-hover active:scale-[0.99]"
                    >
                      Connect wallet to start
                    </button>
                    <p className="text-center text-xs text-neutral-400">or</p>
                    <button
                      type="button"
                      disabled
                      title="Coming soon"
                      className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-neutral-100 bg-neutral-100 py-3.5 text-[15px] font-semibold text-neutral-800 opacity-60 cursor-not-allowed"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2563eb] text-lg font-bold text-white">
                        $
                      </span>
                      Pay from EVM chains
                    </button>
                  </div>
                ) : showForm ? (
                  <>
                    <DepositForm onSubmit={handleDeposit} variant="paymentLink" />
                    {error && (
                      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-800">
                        {error}
                      </div>
                    )}
                  </>
                ) : (
                  <TransactionStatus
                    tone="light"
                    status={
                      (txStatus === 'resolving' ? 'preparing' : txStatus) as
                        | 'preparing'
                        | 'signing'
                        | 'confirming'
                        | 'done'
                        | 'error'
                    }
                    signature={txSignatures[0] || null}
                    progressText={progressText}
                    allSignatures={txSignatures}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {payLinkData && (
          <p className="mt-4 text-center text-[11px] text-neutral-400 font-mono">
            Pool {payLinkData.pool.slice(0, 8)}… · {payLinkData.network}
          </p>
        )}

        {!claimDismissed ? (
          <div className="relative mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white py-3.5 pl-4 pr-10 shadow-sm">
            <span className="pointer-events-none absolute left-[12%] top-2 text-lg text-red-400/25" aria-hidden>
              ✦
            </span>
            <span className="pointer-events-none absolute bottom-1 right-[20%] text-sm text-red-400/20" aria-hidden>
              ✦
            </span>
            <span className="pointer-events-none absolute right-[8%] top-3 text-xs text-red-400/20" aria-hidden>
              ✦
            </span>
            <button
              type="button"
              onClick={() => setClaimDismissed(true)}
              className="absolute right-2 top-1/2 z-[1] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-lg leading-none text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
              aria-label="Dismiss"
            >
              ×
            </button>
            <Link href="/" className="relative flex items-center gap-3 pr-2 no-underline">
              <SkausMark className="h-10 w-10 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-neutral-900">Claim your SKAUS</span>
                <span className="block text-xs text-neutral-500">Private & fast</span>
              </span>
              <span className="shrink-0 text-xl text-neutral-300" aria-hidden>
                ›
              </span>
            </Link>
          </div>
        ) : null}

        <p className="mt-8 text-center text-xs text-neutral-500">
          Powered by{' '}
          <Link href="/" className="font-semibold text-skaus-primary hover:underline">
            SKAUS
          </Link>{' '}
          on Solana
        </p>
      </div>
    </main>
  );
}
