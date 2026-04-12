'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { Connection, PublicKey } from '@solana/web3.js';
import { createPrivySolanaSigner } from '@/lib/privy-solana-signer';
import { getPaymentRequestBySlug, lookupName, type PaymentRequestData } from '@/lib/gateway';
import { executeDeposit } from '@/lib/deposit';
import { TransactionStatus } from '@/components/TransactionStatus';
import { DepositForm } from '@/components/DepositForm';
import { decodePubkey, isMockPubkey } from '@/lib/keys';
import { config } from '@/lib/config';
import { DEPOSIT_TIERS_USDC, DEPOSIT_TIERS_SOL, splitIntoTiers } from '@skaus/types';
import type { StealthMetaAddress } from '@skaus/crypto';
import Link from 'next/link';

interface SlugPageProps {
  params: { username: string; slug: string };
}

export default function PaymentRequestSlugPage({ params }: SlugPageProps) {
  const { username, slug } = params;
  const { authenticated, user, login } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const { signTransaction: privySignTransaction } = useSignTransaction();

  const walletAddress = user?.wallet?.address || wallet?.address;
  const connection = new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  );

  const [request, setRequest] = useState<PaymentRequestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<'idle' | 'preparing' | 'signing' | 'confirming' | 'done' | 'error'>('idle');
  const [txSignatures, setTxSignatures] = useState<string[]>([]);
  const [progressText, setProgressText] = useState('');
  const recordedView = useRef(false);

  useEffect(() => {
    setLoading(true);
    getPaymentRequestBySlug(username, slug, { recordView: !recordedView.current })
      .then(data => {
        recordedView.current = true;
        setRequest(data);
      })
      .catch(() => setError('Payment request not found'))
      .finally(() => setLoading(false));
  }, [username, slug]);

  const makeSignTransaction = useMemo(
    () => createPrivySolanaSigner(wallet, privySignTransaction),
    [wallet, privySignTransaction],
  );

  const runDeposit = useCallback(
    async (rawAmount: bigint, payToken: 'USDC' | 'SOL') => {
      if (!walletAddress || !wallet || !request) return;

      setTxStatus('preparing');
      setError(null);

      const tiers =
        payToken === 'SOL'
          ? splitIntoTiers(rawAmount, [...DEPOSIT_TIERS_SOL])
          : splitIntoTiers(rawAmount, [...DEPOSIT_TIERS_USDC]);

      setProgressText(`Splitting into ${tiers.length} deposit${tiers.length > 1 ? 's' : ''}`);

      const nameData = await lookupName(username).catch(() => null);
      const meta = nameData?.stealthMetaAddress;
      let recipientMeta: StealthMetaAddress;
      if (meta && !isMockPubkey(meta.scanPubkey) && !isMockPubkey(meta.spendPubkey)) {
        recipientMeta = {
          scanPubkey: decodePubkey(meta.scanPubkey),
          spendPubkey: decodePubkey(meta.spendPubkey),
          version: meta.version || 1,
        };
      } else {
        throw new Error(
          `@${username} hasn't set up their stealth keys yet. ` +
          'Ask them to complete onboarding at skaus.me first.',
        );
      }

      const publicKey = new PublicKey(walletAddress);

      const result = await executeDeposit(
        connection,
        publicKey,
        makeSignTransaction,
        rawAmount,
        payToken,
        recipientMeta,
        (step, current, total) => {
          setTxStatus(step as 'preparing' | 'signing' | 'confirming');
          setProgressText(`Tier ${current}/${total}: ${step}`);
        },
      );

      const paidUsd =
        payToken === 'USDC' ? Number(rawAmount) / 1e6 : Number(rawAmount) / 1e9;

      try {
        await fetch(`${config.gatewayUrl}/requests/${request.id}/payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txSignature: result.signatures[0], amount: paidUsd }),
        });
      } catch {
        /* non-critical */
      }

      setTxSignatures(result.signatures);
      setTxStatus('done');
    },
    [walletAddress, wallet, request, username, connection, makeSignTransaction],
  );

  const handlePayFixed = useCallback(async () => {
    if (!request) return;
    try {
      const decimals = request.token === 'SOL' ? 9 : 6;
      const rawAmount = BigInt(Math.floor(request.amount * 10 ** decimals));
      await runDeposit(rawAmount, request.token as 'USDC' | 'SOL');
    } catch (err: any) {
      setError(err.message || 'Payment failed');
      setTxStatus('error');
    }
  }, [request, runDeposit]);

  const handlePayOpen = useCallback(
    async (amount: bigint, token: string) => {
      try {
        await runDeposit(amount, token as 'USDC' | 'SOL');
      } catch (err: any) {
        setError(err.message || 'Payment failed');
        setTxStatus('error');
      }
    },
    [runDeposit],
  );

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen min-h-[100dvh] overflow-x-clip px-4">
        <div className="w-8 h-8 border-2 border-skaus-primary border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (!request) {
    return (
      <main className="relative flex flex-col items-center justify-center min-h-screen min-h-[100dvh] overflow-x-clip px-4 sm:px-6">
        <div className="absolute inset-0 grid-bg" />
        <div className="relative z-10 text-center space-y-4">
          <h1 className="text-display-sm text-white">Request Not Found</h1>
          <p className="text-skaus-muted">{error || 'This payment request does not exist.'}</p>
          <Link href={`/pay/${username}`} className="text-skaus-primary hover:underline text-sm font-semibold">
            Pay @{username} directly
          </Link>
        </div>
      </main>
    );
  }

  const isExpired = request.status === 'expired' || (request.expiresAt && Date.now() > request.expiresAt);
  const isPaid = request.status === 'paid';
  const isCancelled = request.status === 'cancelled';
  const canPay = !isExpired && !isPaid && !isCancelled;

  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen min-h-[100dvh] overflow-x-clip px-4 sm:px-6">
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[min(37.5rem,calc(100vw-1.5rem))] h-[min(25rem,45vh)] bg-skaus-primary/5 blur-[150px] rounded-full" />

      <div className="relative z-10 w-full max-w-md min-w-0 space-y-6">
        <div className="text-center space-y-2">
          <p className="section-label">Payment request</p>
          <h1 className="text-xl font-bold text-white">{request.title || slug}</h1>
          <h2 className="text-display-md">
            <span className="gradient-text">@{username}</span>
          </h2>
        </div>

        <div className="glass-card p-6 space-y-5">
          <div className="text-center">
            {request.openAmount ? (
              <>
                <p className="text-lg font-bold text-white">Choose your amount</p>
                <p className="text-sm text-skaus-muted mt-1">{request.token}</p>
              </>
            ) : (
              <>
                <p className="text-display-md font-black text-white">
                  {request.token === 'SOL' ? '◎' : '$'}
                  {request.amount}
                </p>
                <p className="text-sm text-skaus-muted mt-1">{request.token}</p>
              </>
            )}
          </div>

          {request.memo && (
            <div className="p-3 bg-skaus-darker rounded-lg border border-skaus-border">
              <p className="section-label mb-1">Note</p>
              <p className="text-sm text-white">{request.memo}</p>
            </div>
          )}

          <div className="flex justify-center">
            <StatusBadge status={request.status} />
          </div>

          {request.expiresAt && (
            <p className="text-xs text-skaus-muted text-center">
              {isExpired
                ? 'This request has expired'
                : `Expires: ${new Date(request.expiresAt).toLocaleDateString()}`}
            </p>
          )}

          {canPay && (
            <>
              {!authenticated ? (
                <div className="flex flex-col items-center space-y-4">
                  <p className="text-skaus-muted text-sm">Connect your wallet to pay</p>
                  <button type="button" onClick={() => login()} className="btn-primary text-xs py-2.5 px-6">
                    Login to pay
                  </button>
                </div>
              ) : txStatus === 'idle' || txStatus === 'error' ? (
                <>
                  {request.openAmount ? (
                    <DepositForm
                      defaultToken={request.token as 'USDC' | 'SOL'}
                      onSubmit={async (amt, tok) => { await handlePayOpen(amt, tok); }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handlePayFixed()}
                      className="w-full btn-primary py-3.5 rounded-xl"
                    >
                      Pay {request.token === 'SOL' ? '◎' : '$'}
                      {request.amount} {request.token}
                    </button>
                  )}
                  {error && (
                    <div className="p-3 bg-skaus-error/10 border border-skaus-error/30 rounded-lg text-sm text-skaus-error">
                      {error}
                    </div>
                  )}
                </>
              ) : (
                <TransactionStatus
                  status={txStatus}
                  signature={txSignatures[0] || null}
                  progressText={progressText}
                  allSignatures={txSignatures}
                />
              )}
            </>
          )}
        </div>

        <div className="text-center">
          <p className="text-xs text-skaus-muted">
            Powered by{' '}
            <Link href="/" className="text-skaus-primary hover:underline font-semibold">
              SKAUS
            </Link>{' '}
            — private payments on Solana
          </p>
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-skaus-warning/10 text-skaus-warning border-skaus-warning/30',
    partial: 'bg-skaus-primary/10 text-skaus-primary border-skaus-primary/30',
    paid: 'bg-skaus-success/10 text-skaus-success border-skaus-success/30',
    expired: 'bg-skaus-muted/10 text-skaus-muted border-skaus-muted/30',
    cancelled: 'bg-skaus-error/10 text-skaus-error border-skaus-error/30',
  };
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${styles[status] || styles.pending}`}
    >
      {status}
    </span>
  );
}
